import { SCENES } from '../../config';
import Phaser from 'phaser';
import { content } from '../../core/content';
import { isEarlyClosure } from '../../core/systems/narrative';
import { officeHero } from '../../core/systems/office';
import { key, starArt } from '../../render/assets';
import { L, slotX, actionX, ACTION_W } from '../../ui/layout';
import { Button } from '../../ui/Button';
import { onboard } from '../../ui/Onboarding';
import { playBgm } from '../../audio/Sfx';
import { PhaseScene } from './PhaseScene';
import type { Contract, GameState, ItemDef } from '../../core/types';

/**
 * M05 편성실 — **상점 화면** (v3.1 레퍼런스 정본, 04-UI-KIT §1 · 00-OVERVIEW §8-2).
 *
 *   좌(L.guest)    방문자 / 오늘의 출연자 전신
 *   좌하(L.dialogue) 대사 한 줄 + ▼
 *   우(L.bench)    작업대 — 진열 3칸 · 램프 · 장부
 *   우하(L.actions) 蘇生 販売 交渉 出撃 4택
 *
 * 하단 4택이 「방」을 바꾸는 게 아니라 **작업대 위에 무엇을 올릴지**를 바꾼다.
 * 계약서의 honesty 는 절대 그리지 않는다 (02-DATA-SCHEMA §2-b).
 */
type BenchMode = 'CONTRACT' | 'SHELF';

const SLOT_NAMES = ['무기', '방어구', '기타'] as const;
const INVENTORY_COLUMNS = 7;

export class OfficePhase extends PhaseScene {
  private mode: BenchMode = 'SHELF';
  /** 계약서가 2장 올 수 있다 (M05). 지금 보고 있는 장 */
  private contractIndex = 0;
  /** 하단 「진열」을 눌렀을 때만 여는 장비 서랍 */
  private inventoryOpen = false;
  /** 서랍에서 클릭해 집은 장비. 맞는 진열대를 누르면 놓인다. */
  private selectedItemId: string | null = null;

  constructor() {
    super(SCENES.PHASE_OFFICE);
  }

  override create(): void {
  /**
   * ★ Phaser 씬 인스턴스는 stop/launch 를 거쳐도 **살아남는다.**
   * 어제 남긴 필드를 지우지 않으면 다음 날 화면이 어제 상태로 시작한다.
   */
    this.contractIndex = 0;
    this.mode = 'SHELF';
    this.inventoryOpen = false;
    this.selectedItemId = null;
    super.create();
    playBgm(this, 'bgm.shop');
  }

  protected build(s: Readonly<GameState>): void {
    // 심사할 계약서가 없으면 계약 모드에 머무를 이유가 없다.
    // 여기 갇히면 「오늘의 출연자」를 고를 수 없어 하루가 넘어가지 않는다.
    if (this.mode === 'CONTRACT' && s.visitors.length === 0) this.mode = 'SHELF';

    this.stageBackdrop();
    this.buildGuest(s);
    this.buildBenchBackdrop();
    if (this.mode === 'CONTRACT') this.buildContract(s);
    else {
      this.buildShelf(s);
      if (this.inventoryOpen) this.buildInventory(s);
    }
    this.buildActions(s);
    onboard(this, s.day, this.mode === 'CONTRACT' ? 'OFFICE_CONTRACT' : 'OFFICE_SHELF',
      { x: L.pad, y: L.actionsFull.y - 52, w: L.W - L.pad * 2 });
  }

  /* ── 좌 · 방문자 / 출연자 ─────────────────────────────── */

  private buildGuest(s: Readonly<GameState>): void {
    const g = L.guest;
    this.rect(g.x, g.y, g.w, g.h, 'ink');
    this.spriteCover(g, ['bg.shop.room']);
    this.frame(g.x, g.y, g.w, g.h, 'dust');

    // 계약 모드에서 좌측에 서 있는 사람은 **방문자**다. 아직 계약 전이라 recruitPool 에 있다.
    // 이름만 방문자로 바꾸고 그림은 기존 출연자를 쓰면, 이름과 얼굴이 어긋난다
    const visitor = s.visitors[this.contractIndex] ?? s.visitors[0];
    const contracting = this.mode === 'CONTRACT' && visitor !== undefined;
    const guest = contracting ? s.recruitPool.find((x) => x.id === visitor.starId) : undefined;
    const star = guest
      ?? s.stars.find((x) => x.id === s.today?.starId)
      ?? s.stars.find((x) => x.status === 'ALIVE');
    const name = contracting
      ? visitor.displayName
      : s.personas.find((p) => p.id === star?.personaId)?.displayName ?? '무명';

    // 전신 CG 자리 — star.body.* → star.portrait.* → 실루엣 순으로 내려간다
    const art = star === undefined ? null : starArt(star.id);
    const w = 384;
    const h = 480;
    const x = g.x + Math.round((g.w - w) / 2);
    const y = g.y + g.h - h - 24;
    // 전신은 좌측 칸과 1:1 이다 (752x792). 이름 글자는 그 위에 얹는다
    const full = { x: g.x, y: g.y, w: g.w, h: g.h };
    const body = art === null ? false : this.spriteFit(full, [art.body]);
    if (!body && !this.spriteFit({ x, y, w, h }, [...(art === null ? [] : [art.portrait]), 'star.silhouette'])) {
      this.rect(x, y, w, h, 'mid');
    }

    // 배경이 밝은 곳(문·벽)에 이름이 걸리면 안 읽힌다. 이름이 앉는 자리만 덮는다
    this.scrimBlock(g.x + L.line, g.y + L.line, 560, 96);
    this.title(g.x + L.pad, g.y + L.pad, this.clip(name, g.w - L.pad * 2, 'title'));

    // 대사 — 좌하단 한 줄 + ▼ (말풍선을 쓰지 않는다)
    const d = L.dialogue;
    this.rect(d.x, d.y, d.w, d.h, 'ink');
    const line = this.mode === 'CONTRACT' ? '...일할 자리 있나요?' : '...강한 무기 있나요?';
    this.title(d.x + L.pad, d.y + 40, this.clip(line, d.w - 96, 'title'), 'bone');
    this.text(d.x + d.w - 48, d.y + 52, '▼', 'dust');
  }

  /* ── 우 · 작업대 배경 ─────────────────────────────────── */

  private buildBenchBackdrop(): void {
    const b = L.bench;
    this.rect(b.x, b.y, b.w, b.h, 'ink');
    this.spriteCover(b, ['bg.shop.bench']);
    // 소품 — 작업대를 세 구역으로 나눠 놓는다.
    //   좌: 램프(진열 왼쪽) · 장부(아래)   우: 도장·두루마리(진열 오른쪽 세로 띠)
    //   가운데 아래(local 380~1130 / 400~570)는 출연자 줄이 쓰므로 비워 둔다.
    this.frame(b.x, b.y, b.w, b.h, 'dust');
  }

  /* ── 작업대 A · 계약서 심사 ───────────────────────────── */

  private buildContract(s: Readonly<GameState>): void {
    const p = L.office.paper;
    if (this.contractIndex >= s.visitors.length) this.contractIndex = 0;
    const visitor: Contract | undefined = s.visitors[this.contractIndex];

    this.rect(p.x + L.pad * 2, p.y + L.pad * 2, p.w - L.pad * 4, p.h - L.pad * 4, 'mid');
    this.frame(p.x + L.pad * 2, p.y + L.pad * 2, p.w - L.pad * 4, p.h - L.pad * 4, 'bone');
    const ox = p.x + L.pad * 4;
    let oy = p.y + L.pad * 4;

    this.title(ox, oy, '계 약 서');
    if (visitor === undefined) {
      this.text(ox, oy + 96, '오늘은 문 앞이 조용하다.', 'dust');
      this.text(ox, oy + 144, '심사할 계약서가 없다.', 'dust');
      return;
    }

    this.textRight(p.x + p.w - L.pad * 4, oy + 12, `계약금 ${visitor.fee.toLocaleString('en-US')} G`);
    oy += 88;
    this.text(ox, oy, '시체는 반드시 회수한다.', 'dust');
    this.text(ox, oy + 40, '대신 방송 중 갑의 프로듀스를 따른다.', 'dust');

    oy += 120;
    this.label(ox, oy, '자기 신고 공략률', 'dust');
    visitor.claimedTiers.slice(0, 5).forEach((tier, i) => {
      const ty = oy + 32 + i * 44;
      this.text(ox, ty, `${tier.floor}F 까지`);
      this.textRight(p.x + p.w - L.pad * 4, ty, `${Math.round(tier.rate * 100)}%`, 'dust');
    });

    this.text(ox, p.y + p.h - L.pad * 4 - 40, `인지도 ${visitor.recognition} · 팬덤 ${visitor.fandom.toLocaleString('en-US')}`, 'dust');

    // 계약금을 낼 수 없으면 그렇다고 말한다. 눌리는데 아무 일도 안 일어나는 버튼이 제일 나쁘다
    if (s.gold < visitor.fee) {
      this.textRight(p.x + p.w - L.pad * 4, oy - 40, `자금 부족 · 보유 ${s.gold.toLocaleString('en-US')} G`, 'wax');
    }
    if (s.visitors.length > 1) {
      this.label(ox, p.y + L.pad * 4 + 56, `${this.contractIndex + 1} / ${s.visitors.length} 장`, 'dust');
    }
    this.buildContractStamp(s, visitor, p);
  }

  /** 계약서는 버튼보다 도장으로 처리한다. Papers, Please처럼 종이 위에서 직접 결재한다. */
  private buildContractStamp(s: Readonly<GameState>, visitor: Contract, paper: { x: number; y: number; w: number; h: number }): void {
    if (!this.hasArt('prop.stamp')) return;
    const stamp = this.add.image(paper.x + paper.w - 88, paper.y + paper.h - 116, key('prop.stamp'))
      .setDisplaySize(64, 104);
    this.label(paper.x + paper.w - 220, paper.y + paper.h - 24, '도장을 눌러 수락', 'dust');
    if (s.gold < visitor.fee) {
      stamp.setAlpha(0.32);
      return;
    }

    let stamped = false;
    const accept = () => {
      if (stamped) return;
      stamped = true;
      stamp.setY(stamp.y + 12).setAngle(8);
      this.time.delayedCall(100, () => this.store.dispatch({ type: 'OFFICE/CONTRACT_ACCEPT', starId: visitor.starId }));
    };
    stamp.setInteractive({ cursor: 'pointer' });
    stamp.on('pointerdown', accept);
    this.input.keyboard?.on('keydown-FIVE', accept);
  }

  /* ── 작업대 B · 장비 진열 ─────────────────────────────── */

  private buildShelf(s: Readonly<GameState>): void {
    const alive = s.stars.filter((star) => star.status === 'ALIVE');

    this.label(
      L.slot3.x,
      L.slot3.y - 28,
      this.inventoryOpen ? '장비를 끌거나 선택한 뒤, 맞는 진열대를 누르세요.' : '하단 진열을 눌러 인벤토리를 여세요.',
      'dust',
    );
    for (let i = 0; i < 3; i += 1) {
      const x = slotX(i);
      const y = L.slot3.y;
      const itemId = s.shelf[i] ?? null;
      const def = itemId === null ? undefined : content.items.find((item) => item.id === itemId);

      // 카드가 아니라 작업대 위의 실제 놓는 자리다. 배경 그림을 가리지 않고 테두리만 남긴다.
      const selected = this.selectedItemId === null ? undefined : content.items.find((item) => item.id === this.selectedItemId);
      const acceptsSelected = selected !== undefined && content.balance.equipment.slotByItem[selected.id] === i;
      this.frame(x + 10, y + 28, L.slot3.w - 20, L.slot3.h - 40, acceptsSelected ? 'wax' : def === undefined ? 'dust' : 'bone');
      const dropZone = this.add.zone(x + 10, y + 28, L.slot3.w - 20, L.slot3.h - 40).setOrigin(0, 0);
      dropZone.setInteractive({ cursor: acceptsSelected ? 'pointer' : 'default' });
      dropZone.on('pointerup', () => this.placeSelected(i));
      this.label(x + L.pad, y + 4, SLOT_NAMES[i]!);
      if (def === undefined) {
        this.label(x + L.pad, y + 56, '여기로 끌기', 'dust');
        this.label(x + L.pad, y + 80, i === 0 ? '무기' : i === 1 ? '방어구' : '물약·유물', 'dust');
        continue;
      }

      const art = this.itemArt(def, { x: x + 26, y: y + 50, w: L.slot3.w - 52, h: 132 });
      if (art !== null) this.wireShelfDrag(art, i, { x: art.x, y: art.y });
      this.label(x + L.pad, y + 190, this.clip(def.name, L.slot3.w - L.pad * 2, 'label'), def.isRelic ? 'wax' : 'bone');
      this.label(x + L.pad, y + 216, this.itemStats(def), 'dust');
      this.label(x + L.pad, y + 240, '인벤토리로 끌어 회수', 'dust');
    }

    // 오늘의 출연자 — 램프와 장부 사이. 소품 자리를 침범하지 않는다
    const by = L.slot3.y + L.slot3.h + 40;
    const colW = 240;
    // 판은 실제로 쓰는 칸만큼만 깐다. 출연자가 없는 날 빈 검은 상자가 남으면 안 된다
    const cols = Math.min(3, alive.length);
    this.scrimBlock(L.bench.x + 356, by - 20, cols > 0 ? colW * cols + 16 * (cols - 1) + 48 : 700, 216);
    this.label(L.bench.x + 380, by, '오늘의 출연자', 'dust');
    // 빈 칸을 그냥 두면 왜 출격이 잠겼는지 알 길이 없다
    if (cols === 0) {
      this.text(L.bench.x + 380, by + 40, '세울 사람이 없다.', 'wax');
      this.text(L.bench.x + 380, by + 84, '소생으로 되살리기 · 계약으로 새 출연자 맞이 · 돈이 없으면 판매한다.', 'dust');
    }
    alive.slice(0, 3).forEach((star, i) => {
      const picked = s.today?.starId === star.id;
      const x = L.bench.x + 380 + i * (colW + 16);
      const persona = s.personas.find((p) => p.id === star.personaId);
      this.text(x, by + 28, this.clip(persona?.displayName ?? '무명', colW), picked ? 'wax' : 'bone');
      this.text(x, by + 68, this.clip(`${star.bodyName} · ${star.reviveCount}회`, colW), 'dust');
      new Button(this, {
        x, y: by + 112, w: colW, h: 56,
        label: picked ? '출연 확정' : '이 사람으로',
        variant: picked ? 'ghost' : 'default',
        enabled: !picked,
        onClick: () => this.store.dispatch({ type: 'OFFICE/PICK_STAR', starId: star.id }),
      });
    });
  }

  /* ── 작업대 B · 인벤토리 ───────────────────────────────── */

  private buildInventory(s: Readonly<GameState>): void {
    const panel = this.inventoryRect();
    const ix = panel.x + 28;
    // 받은 장비창 원본(1452×831)의 비율을 보존한다. 진열대 바로 아래에서만
    // 열리므로 실제 장비를 놓는 상단 작업대는 가리지 않는다.
    if (!this.spriteFit(panel, ['ui.inventory.window'])) {
      this.rect(panel.x, panel.y, panel.w, panel.h, 'ink');
      this.frame(panel.x, panel.y, panel.w, panel.h, 'bone');
    }

    const stacks = s.inventory.filter((stack) => stack.qty > 0);
    this.text(ix, panel.y + 16, `인벤토리  ${stacks.length}종`, 'ink');
    const hint = this.label(ix, panel.y + 70, '장비를 끌거나 클릭해 고른 뒤, 맞는 진열대를 누르세요.', 'dust');
    new Button(this, {
      x: panel.x + panel.w - 156, y: panel.y + 62, w: 128, h: 52,
      label: '닫기',
      onClick: () => {
        this.inventoryOpen = false;
        this.selectedItemId = null;
        this.redraw();
      },
    });

    // 진열의 결과를 숫자로 보여준다 — 「진열 확정 시 출연자 스탯이 갱신된다」(M05 §8)
    const totals = s.shelf.reduce(
      (sum, id) => {
        const item = id === null ? undefined : content.items.find((candidate) => candidate.id === id);
        return item === undefined ? sum : { hp: sum.hp + item.hp, atk: sum.atk + item.atk, def: sum.def + item.def };
      },
      { hp: 0, atk: 0, def: 0 },
    );
    const star = s.stars.find((candidate) => candidate.status === 'ALIVE');
    if (star !== undefined) {
      const hero = officeHero(s, star);
      this.label(ix + 330, panel.y + 104,
        `장비 HP+${totals.hp} 공+${totals.atk} 방+${totals.def} → 출연자 ${hero.maxHp}·공${hero.atk}·방${hero.def}`,
        'dust');
    }

    if (stacks.length === 0) {
      this.text(ix, panel.y + 150, '팔 것도 올릴 것도 없다.', 'dust');
      this.text(ix, panel.y + 198, '시체를 훼손하면 유품이 들어온다.', 'dust');
      return;
    }

    const cellW = Math.floor((panel.w - 56) / INVENTORY_COLUMNS);
    stacks.slice(0, INVENTORY_COLUMNS * 2).forEach((stack, index) => {
      const def = content.items.find((item) => item.id === stack.id);
      if (def === undefined) return;
      const col = index % INVENTORY_COLUMNS;
      const row = Math.floor(index / INVENTORY_COLUMNS);
      const cellX = ix + col * cellW;
      const cellY = panel.y + 142 + row * 124;
      const equipped = s.shelf.includes(def.id);
      const selected = this.selectedItemId === def.id;
      if (selected) this.sprite(cellX - 4, cellY - 6, 'ui.inventory.selected', 88, 93);
      const art = this.itemArt(def, { x: cellX + 4, y: cellY + 8, w: cellW - 12, h: 54 });
      if (art !== null) {
        if (equipped) art.setAlpha(0.38);
        else this.wireInventoryDrag(art, def, { x: art.x, y: art.y });
        this.wireItemHint(art, def, hint);
      }
      this.label(cellX, cellY + 68, this.clip(def.name, cellW - 10, 'label'), equipped ? 'wax' : 'bone');
      this.label(cellX, cellY + 86, equipped ? '진열 중' : `${this.itemStats(def)}${stack.qty > 1 ? ` ×${stack.qty}` : ''}`, 'dust');
    });
  }

  /** 장비 원본 비율을 유지한다. 크기가 제각각인 도트도 찌그러지지 않는다. */
  private itemArt(item: ItemDef, box: { x: number; y: number; w: number; h: number }): Phaser.GameObjects.Image | null {
    if (!this.hasArt(item.iconKey)) return null;
    const texture = key(item.iconKey);
    const source = this.textures.get(texture).getSourceImage() as { width: number; height: number };
    const scale = Math.min(box.w / source.width, box.h / source.height);
    return this.add.image(Math.round(box.x + box.w / 2), Math.round(box.y + box.h / 2), texture)
      .setDisplaySize(Math.max(1, Math.round(source.width * scale)), Math.max(1, Math.round(source.height * scale)));
  }

  private itemStats(item: ItemDef): string {
    return item.kind === 'POTION' ? `회복 +${item.healing}` : `HP+${item.hp} 공+${item.atk} 방+${item.def}`;
  }

  private wireItemHint(image: Phaser.GameObjects.Image, item: ItemDef, hint: Phaser.GameObjects.Text): void {
    image.on('pointerover', () => hint.setText(`${item.name} · ${this.itemStats(item)} · ${item.price.toLocaleString('en-US')} G`));
    image.on('pointerout', () => hint.setText('장비 도트를 끌어 맞는 진열대에 놓으세요.'));
  }

  private wireInventoryDrag(image: Phaser.GameObjects.Image, item: ItemDef, home: { x: number; y: number }): void {
    image.setInteractive({ cursor: 'grab' });
    this.input.setDraggable(image);
    let dragged = false;
    image.on('pointerup', () => {
      if (dragged) return;
      this.selectedItemId = item.id;
      this.redraw();
    });
    image.on('dragstart', () => {
      dragged = true;
      image.setDepth(1000).setScale(1.15);
    });
    image.on('drag', (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => image.setPosition(Math.round(dragX), Math.round(dragY)));
    image.on('dragend', () => {
      const slot = this.shelfSlotAt(image.x, image.y);
      if (slot === content.balance.equipment.slotByItem[item.id]) {
        this.selectedItemId = null;
        this.store.dispatch({ type: 'OFFICE/PLACE', slot, itemId: item.id });
        return;
      }
      dragged = false;
      image.setPosition(home.x, home.y).setScale(1).setDepth(0);
    });
  }

  private wireShelfDrag(image: Phaser.GameObjects.Image, slot: number, home: { x: number; y: number }): void {
    image.setInteractive({ cursor: 'grab' });
    this.input.setDraggable(image);
    image.on('dragstart', () => image.setDepth(1000).setScale(1.15));
    image.on('drag', (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => image.setPosition(Math.round(dragX), Math.round(dragY)));
    image.on('dragend', () => {
      if (this.inInventory(image.x, image.y)) {
        this.store.dispatch({ type: 'OFFICE/PLACE', slot, itemId: null });
        return;
      }
      image.setPosition(home.x, home.y).setScale(1).setDepth(0);
    });
  }

  private shelfSlotAt(x: number, y: number): number | null {
    for (let i = 0; i < 3; i += 1) {
      const left = slotX(i);
      if (x >= left && x <= left + L.slot3.w && y >= L.slot3.y && y <= L.slot3.y + L.slot3.h) return i;
    }
    return null;
  }

  private placeSelected(slot: number): void {
    if (this.selectedItemId === null) return;
    if (content.balance.equipment.slotByItem[this.selectedItemId] !== slot) return;
    this.store.dispatch({ type: 'OFFICE/PLACE', slot, itemId: this.selectedItemId });
    this.selectedItemId = null;
  }

  private inInventory(x: number, y: number): boolean {
    const panel = this.inventoryRect();
    return x >= panel.x && x <= panel.x + panel.w && y >= panel.y && y <= panel.y + panel.h;
  }

  private inventoryRect(): { x: number; y: number; w: number; h: number } {
    const b = L.bench;
    const w = 736;
    const h = 420;
    return { x: b.x + Math.round((b.w - w) / 2), y: b.y + b.h - h, w, h };
  }

  /* ── 하단 4택 ─────────────────────────────────────────── */

  private buildActions(s: Readonly<GameState>): void {
    const a = L.actions;
    this.rect(a.x, a.y, a.w, a.h, 'ink');
    const y = a.y + L.pad;
    const h = a.h - L.pad * 2;

    // 蘇生 — 소생실로 되돌아간다 (CCR-002). 되살릴 시체가 없으면 잠근다.
    const hasCorpse = s.corpses.some((c) =>
      s.stars.some((st) => st.id === c.starId && (st.status === 'DEAD' || st.status === 'HIDDEN')),
    );
    new Button(this, {
      x: actionX(0), y, w: ACTION_W, h,
      label: '소생', hotkey: '1', variant: 'danger',
      enabled: hasCorpse,
      onClick: () => this.store.dispatch({ type: 'PHASE/GOTO', phase: 'REVIVE' }),
    });
    new Button(this, {
      x: actionX(1), y, w: ACTION_W, h,
      label: '진열', hotkey: '2',
      variant: this.inventoryOpen ? 'default' : 'ghost',
      onClick: () => this.openInventory(),
    });
    new Button(this, {
      x: actionX(2), y, w: ACTION_W, h,
      label: '계약', hotkey: '3',
      variant: this.mode === 'CONTRACT' ? 'default' : 'ghost',
      onClick: () => this.switchMode('CONTRACT'),
    });
    // 세울 사람이 없으면 core 의 `startLive` 가 state 를 그대로 돌려준다 —
    // 즉 눌러도 아무 일이 안 일어난다. 그건 이 화면에서 제일 나쁜 버튼이므로 잠근다.
    // 단 「더는 세울 수도 되살릴 수도 없는」 날은 이 버튼이 가게를 닫는 유일한 출구다.
    const closing = s.today === null && isEarlyClosure(s);
    new Button(this, {
      x: actionX(3), y, w: ACTION_W, h,
      label: closing ? '폐업' : '방송', hotkey: '4', variant: 'danger',
      enabled: s.today !== null || closing,
      onClick: () => this.store.dispatch({ type: 'OFFICE/CONFIRM' }),
    });

    // 계약 모드에서는 「출격」 자리 위에 수락/거절을 겹치지 않고, 작업대 안에서 처리한다.
    // 하단 4택이 1~4 를 쓰므로 여기는 5·6·7 을 쓴다
    if (this.mode === 'CONTRACT') {
      const paper = L.office.paper;
      const sheet = s.visitors[this.contractIndex];
      const by = paper.y + paper.h - L.pad * 4 - 104;
      new Button(this, {
        x: paper.x + 48, y: by, w: 260, h: 64,
        label: '돌려보낸다', hotkey: '6', variant: 'danger',
        enabled: sheet !== undefined,
        onClick: () => sheet && this.store.dispatch({ type: 'OFFICE/CONTRACT_REJECT', starId: sheet.starId }),
      });
      if (s.visitors.length > 1) {
        new Button(this, {
          x: paper.x + paper.w - 192, y: paper.y + 32, w: 144, h: 48,
          label: '다음 장', hotkey: '7', variant: 'ghost',
          onClick: () => {
            this.contractIndex = (this.contractIndex + 1) % s.visitors.length;
            this.redraw();
          },
        });
      }
    }
  }

  private switchMode(mode: BenchMode): void {
    this.mode = mode;
    this.inventoryOpen = false;
    this.selectedItemId = null;
    this.redraw();
  }

  private openInventory(): void {
    this.mode = 'SHELF';
    this.inventoryOpen = true;
    this.selectedItemId = null;
    this.redraw();
  }
}
