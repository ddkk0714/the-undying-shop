import { SCENES } from '../../config';
import Phaser from 'phaser';
import { content } from '../../core/content';
import { isEarlyClosure } from '../../core/systems/narrative';
import { pickDialogue, totalRevivals } from '../../core/systems/dialogue';
import { key, starArt, starExpression } from '../../render/assets';
import { L, actionX, ACTION_W } from '../../ui/layout';
import { Button } from '../../ui/Button';
import { Dialogue } from '../../ui/Dialogue';
import { onboard } from '../../ui/Onboarding';
import { reducedMotion } from '../../ui/options';
import { playBgm, playSfx } from '../../audio/Sfx';
import { PhaseScene } from './PhaseScene';
import type { GameState, ItemDef, Persona } from '../../core/types';

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
const SLOT_NAMES = ['무기', '방어구', '기타'] as const;
const INVENTORY_COLUMNS = 4;
const INVENTORY_VISIBLE_ROWS = 2;
// 원화의 아래만 잘라 작업대 비율로 맞춘 뒤, 세 사각 홈을 옮긴 값.
const SHELF_SLOTS = [
  { x: 1016, y: 249, w: 223, h: 266 },
  { x: 1248, y: 249, w: 214, h: 266 },
  { x: 1473, y: 249, w: 214, h: 266 },
] as const;

export class OfficePhase extends PhaseScene {
  /** 계약서가 2장 올 수 있다 (M05). 지금 보고 있는 장 */
  private contractIndex = 0;
  /** 하단 「진열」을 눌렀을 때만 여는 장비 서랍 */
  private inventoryOpen = false;
  /** 서랍에서 클릭해 집은 장비. 맞는 진열대를 누르면 놓인다. */
  private selectedItemId: string | null = null;
  /** 4칸 한 줄 인벤토리의 현재 첫 번째 행. */
  private inventoryScrollRow = 0;
  /** 아이콘 hover 중에만 살아 있는 장비 상세 정보창 오브젝트. */
  private itemDetail: Phaser.GameObjects.GameObject[] = [];
  /** 드래그 중에는 hover 상세창을 다시 열지 않는다. */
  private draggingInventoryItem = false;
  /** 작업대에 놓인 계약서 축소본을 왼쪽 클릭하면, 같은 종이를 읽기 크기로 펼친다. */
  private contractReaderOpen = false;
  /** 첫날에는 배경의 문을 직접 열기 전까지 손님을 맞지 않는다. */
  private shopOpened = false;
  /** 첫 영업의 빈 편성실에서 문을 열 때까지 반복되는 노크 */
  private officeKnockTimer: Phaser.Time.TimerEvent | null = null;
  /** 전신을 누를 때 SHOP_TOUCH 대사를 순서대로 넘긴다. */
  private guestTouchCount = 0;

  constructor() {
    super(SCENES.PHASE_OFFICE);
  }

  override create(): void {
  /**
   * ★ Phaser 씬 인스턴스는 stop/launch 를 거쳐도 **살아남는다.**
   * 어제 남긴 필드를 지우지 않으면 다음 날 화면이 어제 상태로 시작한다.
   */
    this.contractIndex = 0;
    this.inventoryOpen = false;
    this.selectedItemId = null;
    this.inventoryScrollRow = 0;
    this.itemDetail = [];
    this.draggingInventoryItem = false;
    this.contractReaderOpen = false;
    this.shopOpened = false;
    this.officeKnockTimer = null;
    this.guestTouchCount = 0;
    super.create();
    playBgm(this, 'bgm.shop');
  }

  protected build(s: Readonly<GameState>): void {
    // redraw()가 이전 동적 오브젝트를 정리한 뒤 새 화면을 만든다.
    this.itemDetail = [];
    this.draggingInventoryItem = false;
    this.stageBackdrop();
    if (s.day === 1 && !this.shopOpened) {
      this.scheduleOfficeKnock();
      this.buildShopStart();
      return;
    }
    this.cancelOfficeKnock();
    this.buildGuest(s);
    this.buildBenchBackdrop();
    this.buildShelf(s);
    this.buildSubmittedContracts(s);
    if (this.inventoryOpen) this.buildInventory(s);
    // 확대는 별도 장면이 아니라, 이미 그린 작업대 위에 원본 종이를 얹는다.
    if (this.contractReaderOpen) this.buildContract(s);
    this.buildActions(s);
    onboard(this, s.day, 'OFFICE_SHELF',
      { x: L.dialogue.x, y: L.dialogue.y + 44, w: L.dialogue.w });
  }

  /* ── 좌 · 방문자 / 출연자 ─────────────────────────────── */

  /** 첫 영업은 버튼이 아니라, shop_room 원화의 오른쪽 문을 눌러 시작한다. */
  private buildShopStart(): void {
    const g = L.guest;
    this.rect(g.x, g.y, g.w, g.h, 'ink');
    this.spriteCover(g, ['bg.shop.room']);
    this.frame(g.x, g.y, g.w, g.h, 'dust');
    this.buildBenchBackdrop();

    // 원화의 문(약 x=500~640, y=180~510)에 맞춘 클릭 영역이다.
    const door = { x: g.x + 520, y: g.y + 326, w: 170, h: 326 };
    const handle = this.add.zone(door.x, door.y, door.w, door.h).setOrigin(0, 0).setInteractive({ cursor: 'pointer' });
    handle.on('pointerup', () => {
      this.shopOpened = true;
      this.cancelOfficeKnock();
      playSfx(this, 'sfx.title.door', 0.28);
      this.redraw();
    });
    // 안내 묶음을 패널 좌상단에 붙인다. 용사 이름과 같은 ink→디더 가리개라
    // 밝은 문 그림 위에서도 읽힌다.
    const prompt = { x: g.x + L.line, y: g.y + L.line, w: 620, h: 104 };
    this.scrimBlock(prompt.x, prompt.y, prompt.w, prompt.h);
    this.label(prompt.x + 28, prompt.y + 18, '첫 영업', 'bone').setScale(1.25);
    this.text(prompt.x + 28, prompt.y + 58, '문을 눌러 장사를 시작하세요.', 'bone').setScale(0.78);
    this.label(L.bench.x + 70, L.bench.y + 70, '문이 열리면 첫 손님이 계약서를 들고 옵니다.', 'dust').setScale(0.86);
  }

  /** 진입 2초 뒤 한 번, 이후 문을 열 때까지 3초마다 노크한다. */
  private scheduleOfficeKnock(): void {
    if (this.officeKnockTimer !== null) return;
    this.officeKnockTimer = this.time.delayedCall(2000, () => {
      if (this.shopOpened) return;
      playSfx(this, 'sfx.revive.knock', 0.75);
      this.officeKnockTimer = this.time.addEvent({
        delay: 3000,
        loop: true,
        callback: () => {
          if (this.shopOpened) {
            this.cancelOfficeKnock();
            return;
          }
          playSfx(this, 'sfx.revive.knock', 0.75);
        },
      });
    });
  }

  private cancelOfficeKnock(): void {
    this.officeKnockTimer?.remove(false);
    this.officeKnockTimer = null;
  }

  private buildGuest(s: Readonly<GameState>): void {
    const g = L.guest;
    this.rect(g.x, g.y, g.w, g.h, 'ink');
    this.spriteCover(g, ['bg.shop.room']);
    this.frame(g.x, g.y, g.w, g.h, 'dust');

    // 계약 모드에서 좌측에 서 있는 사람은 **방문자**다. 아직 계약 전이라 recruitPool 에 있다.
    // 이름만 방문자로 바꾸고 그림은 기존 출연자를 쓰면, 이름과 얼굴이 어긋난다
    const visitor = s.visitors[this.contractIndex] ?? s.visitors[0];
    const contracting = visitor !== undefined;
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
    const body = art === null ? null : this.spriteFitObject(full, [art.body]);
    if (body === null && !this.spriteFit({ x, y, w, h }, [...(art === null ? [] : [art.portrait]), 'star.silhouette'])) {
      this.rect(x, y, w, h, 'mid');
    }

    // 배경이 밝은 곳(문·벽)에 이름이 걸리면 안 읽힌다. 이름이 앉는 자리만 덮는다
    this.scrimBlock(g.x + L.line, g.y + L.line, 460, 76);
    this.title(g.x + L.pad, g.y + 18, this.clip(name, g.w - L.pad * 2, 'title')).setScale(0.8);

    // 캐릭터보다 앞에 가리개를 얹고 그 안에 대사를 둔다.
    const coverW = g.w;
    const coverH = Math.round(258 * (coverW / 1087));
    const coverX = g.x;
    const coverY = g.y + g.h - coverH;
    this.sprite(coverX, coverY, 'ui.guest.cover', coverW, coverH);
    const d = L.dialogue;
    this.rect(d.x, d.y, d.w, d.h, 'ink');
    const profile = star === undefined ? undefined : content.starProfiles[star.id];
    const situation = this.guestTouchCount > 0
      ? 'SHOP_TOUCH'
      : contracting ? 'SHOP_FIRST' : 'SHOP_GREET';
    const speechLine = star === undefined ? null : pickDialogue(star.id, situation, {
      floor: profile?.targetFloor,
      revives: totalRevivals(star.id, star.reviveCount),
      viewers: profile?.fans,
      deaths: s.stats.totalDiscarded,
      generation: s.personas.find((persona) => persona.id === star.personaId)?.generation,
    }, ((s.day * 17 + this.contractIndex * 7 + this.guestTouchCount) % 100) / 100);
    const speech: { line: string; expressionAsset?: string; effects?: readonly string[] } = {
      line: speechLine?.text ?? (contracting ? '...일할 자리 있나요?' : '...강한 무기 있나요?'),
      expressionAsset: star === undefined || speechLine === null ? undefined : starExpression(star.id, speechLine.expression),
      effects: speechLine?.effects,
    };
    const bodyGeometry = body === null ? null : {
      x: body.x,
      y: body.y,
      w: body.displayWidth,
      h: body.displayHeight,
    };
    const setCharacterFrame = (asset: string | undefined): void => {
      if (body === null || bodyGeometry === null || art === null || asset === undefined || !this.hasArt(asset)) return;
      body
        .setTexture(key(asset))
        // setTexture가 프레임의 내부 크기를 다시 읽어도 화면 기하가 바뀌지 않게 고정한다.
        .setPosition(bodyGeometry.x, bodyGeometry.y)
        .setDisplaySize(bodyGeometry.w, bodyGeometry.h);
    };
    if (art !== null) setCharacterFrame(speech.expressionAsset ?? art.dialogue);
    if (body !== null && star !== undefined) {
      body.setInteractive({ cursor: 'pointer' });
      body.on('pointerup', () => {
        this.guestTouchCount += 1;
        this.redraw();
      });
    }
    new Dialogue(this, {
      x: coverX + L.pad,
      y: coverY + 52,
      w: coverW - L.pad,
      line: this.clip(speech.line, coverW - 96, 'title'),
      scale: 0.78,
      effects: speech.effects,
    });
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

  /** 축소 계약서에서 열리는 유일한 확대 상태. 다른 팝업/계약서 경로는 만들지 않는다. */
  private buildContract(s: Readonly<GameState>): void {
    const visitor = s.visitors[this.contractIndex];
    if (visitor === undefined) {
      this.contractReaderOpen = false;
      return;
    }
    const body = s.recruitPool.find((candidate) => candidate.id === visitor.starId);
    const profile = content.starProfiles[visitor.starId];
    // 원본 비율(700×914)을 유지한다. 읽기 상태에서는 HUD까지 쓰는 1.43배 크기로
    // 올려, 서류의 표기와 실제 입력값을 한눈에 읽을 수 있게 한다.
    const paper = { x: 900, y: 18, w: 800, h: 1045 };
    const asset = this.contractSheetAsset();
    if (asset === null) return;
    const paperDepth = 800;
    const scale = paper.w / 700;
    const textScale = paper.w / 560;
    const at = (x: number, y: number, value: string, textScale = 0.72) =>
      this.text(paper.x + x * scale, paper.y + y * scale, value, 'ink').setScale(textScale * (paper.w / 560)).setDepth(paperDepth + 2);

    // 종이를 별도 팝업처럼 검게 가리지 않는다. 원래 진열대 위에서 집어 든 서류처럼
    // 작업대 배경을 그대로 남긴다. 입력은 build()의 모달 분기로 이미 차단되어 있다.
    this.add.image(paper.x, paper.y, key(asset)).setOrigin(0, 0).setDisplaySize(paper.w, paper.h).setDepth(paperDepth);

    // 펼침을 만든 첫 클릭과 충돌하지 않도록, 다음 프레임부터만 접기 입력을 받는다.
    const page = this.add.zone(paper.x, paper.y, paper.w, paper.h).setOrigin(0, 0).setDepth(paperDepth + 1);
    this.time.delayedCall(0, () => {
      if (!page.active) return;
      page.setInteractive({ cursor: 'pointer' });
      page.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (!pointer.leftButtonDown()) return;
        this.contractReaderOpen = false;
        this.redraw();
      });
    });

    // 상단 개인정보 칸
    // 초상칸 오른쪽의 기입선에 맞춘 개인정보 블록.
    const identityX = 325;
    at(identityX, 130, '예명', 0.50);
    at(identityX, 150, this.clip(profile?.stageName ?? visitor.displayName, 240, 'title'), 0.82);
    at(identityX, 190, '본명', 0.50);
    at(identityX, 210, body?.bodyName ?? '미상', 0.82);
    at(identityX, 250, '출신', 0.50);
    at(identityX, 270, profile?.origin ?? '미등록 구역', 0.64);
    at(identityX, 300, '직종', 0.50);
    at(identityX, 320, profile?.role ?? '하강 용병', 0.64);
    at(326, 350, visitor.recognition, 0.88);
    at(525, 350, visitor.fandom.toLocaleString('en-US'), 0.82);

    // 하단 계약 조건 칸. honesty는 의도적으로 어느 곳에도 적지 않는다.
    const target = visitor.claimedTiers.at(-1)?.floor ?? 0;
    at(90, 526, '계약금', 0.46);
    at(300, 552, `${visitor.fee.toLocaleString('en-US')} G`, 0.82);
    at(90, 582, '목표층', 0.46);
    at(300, 607, `${target} F`, 0.92);
    if (profile !== undefined) {
      at(90, 650, `HP ${profile.hp} · ATK ${profile.atk} · DEF ${profile.def} · WILL ${profile.will}`, 0.46);
    }
    const rates = visitor.claimedTiers.map((tier) => `${tier.floor}F ${Math.round(tier.rate * 100)}%`).join(' · ');
    at(90, 694, this.clip(rates, 500, 'body'), 0.46);
    this.label(paper.x + 72, paper.y + paper.h - 62, '종이를 누르면 접기 · 하단 계약을 누르면 수락', 'ink').setScale(0.62 * textScale).setDepth(paperDepth + 2);
  }

  /* ── 작업대 B · 장비 진열 ─────────────────────────────── */

  private buildShelf(s: Readonly<GameState>): void {
    // 장비를 고른 순간부터는 이 줄 대신 **화살표**가 어느 칸인지 말한다.
    // 둘을 같이 두면 화살표 자리(진열대 위 여백)와 글자가 겹친다.
    if (this.selectedItemId === null) {
      this.label(
        SHELF_SLOTS[0].x,
        SHELF_SLOTS[0].y - 28,
        this.inventoryOpen ? '장비를 끌거나 선택한 뒤, 맞는 진열대를 누르세요.' : '하단 진열을 눌러 인벤토리를 여세요.',
        'dust',
      );
    }
    for (let i = 0; i < 3; i += 1) {
      const slot = SHELF_SLOTS[i]!;
      const { x, y, w, h } = slot;
      const itemId = s.shelf[i] ?? null;
      const def = itemId === null ? undefined : content.items.find((item) => item.id === itemId);

      // 원화에 그려진 사각 홈이 곧 놓는 자리다. 별도의 카드·배경은 덮지 않는다.
      const selected = this.selectedItemId === null ? undefined : content.items.find((item) => item.id === this.selectedItemId);
      const acceptsSelected = selected !== undefined && content.balance.equipment.slotByItem[selected.id] === i;
      const dropZone = this.add.zone(x, y, w, h).setOrigin(0, 0);
      dropZone.setInteractive({ cursor: acceptsSelected ? 'pointer' : 'default' });
      dropZone.on('pointerup', () => this.placeSelected(i));
      if (acceptsSelected) this.shelfArrow(slot);
      this.text(x + 12, y + 10, SLOT_NAMES[i]!, 'bone').setScale(0.75);
      if (def === undefined) {
        this.text(x + 12, y + 72, '여기로 끌기', 'bone').setScale(0.75);
        this.text(x + 12, y + 98, i === 0 ? '무기' : i === 1 ? '방어구' : '물약·유물', 'bone').setScale(0.75);
        continue;
      }

      const art = this.itemArt(def, { x: x + 14, y: y + 34, w: w - 28, h: 100 });
      if (art !== null) this.wireShelfDrag(art, i, { x: art.x, y: art.y });
      this.text(x + 12, y + 142, this.clip(def.name, Math.floor((w - 24) / 0.75), 'body'), 'bone').setScale(0.75);
      this.text(x + 12, y + 168, this.clip(this.itemStats(def), Math.floor((w - 24) / 0.75), 'body'), 'bone').setScale(0.75);
    }

  }

  /**
   * 고른 장비가 들어갈 칸을 진열대 **위**에서 가리키는 화살표.
   * 원화 154x161 을 정확히 1/2 로 놓는다 (소수배는 도트가 지글거린다).
   */
  private shelfArrow(slot: { x: number; y: number; w: number; h: number }): void {
    const w = 77;
    const h = 80;
    const x = slot.x + Math.round((slot.w - w) / 2);
    const y = slot.y - h - 12;
    const arrow = this.spriteObject(x, y, 'ui.shelf.arrow', w, h);
    if (arrow === null) return;
    arrow.setDepth(60);
    if (reducedMotion(this.registry)) return;
    // 위아래로 얕게 까딱인다 — 「여기」를 글자 없이 말하는 유일한 수단이다
    this.tweens.add({ targets: arrow, y: y + 10, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  /* ── 작업대 B · 인벤토리 ───────────────────────────────── */

  /** 방문자는 계약서를 버튼으로 건네지 않는다. 책상 하단에 놓고, 플레이어가 직접 집어 든다. */
  private buildSubmittedContracts(s: Readonly<GameState>): void {
    const asset = this.contractSheetAsset();
    if (asset === null) return;
    const b = L.bench;
    const paper = { w: 180, h: 235 };
    const visitor = s.visitors[0];
    if (visitor === undefined) return;
    const home = { x: b.x + b.w - 128, y: b.y + b.h - 138 };
    const index = 0;
    const sheet = this.add.image(home.x, home.y, key(asset))
      .setOrigin(0.5, 0.5)
      .setDisplaySize(paper.w, paper.h)
      .setDepth(20)
      .setInteractive({ cursor: 'pointer' });
      // 축소된 종이에도 최소한의 식별 정보가 있어, 어떤 계약서를 집는지 바로 알 수 있다.
      const left = home.x - paper.w / 2;
      const top = home.y - paper.h / 2;
    this.label(left + 18, top + 16, '하강 계약서', 'ink').setScale(0.58).setDepth(21);
    this.text(left + 18, top + 46, this.clip(visitor.displayName, 150, 'body'), 'ink').setScale(0.54).setDepth(21);
    this.label(left + 18, top + 78, `계약금 ${visitor.fee.toLocaleString('en-US')} G`, 'ink').setScale(0.52).setDepth(21);
    const target = visitor.claimedTiers.at(-1)?.floor ?? 0;
    this.label(left + 18, top + 102, `목표 ${target}F · 클릭하여 확인`, 'ink').setScale(0.46).setDepth(21);

    // 축소본은 이동할 수 없다. 좌클릭 한 번만 확대라는 유일한 입력으로 쓴다.
    sheet.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.leftButtonDown()) return;
      this.contractIndex = index;
      this.contractReaderOpen = true;
      this.redraw();
    });
  }

  /** 새 계약서 텍스처는 HMR 중 아직 프리로드되지 않을 수 있다. 그때도 기존 장부로 종이를 유지한다. */
  private contractSheetAsset(): string | null {
    if (this.hasArt('ui.contract.sheet')) return 'ui.contract.sheet';
    if (this.hasArt('prop.ledger')) return 'prop.ledger';
    return null;
  }

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
    const hint = this.label(ix, panel.y + 70, '장비를 끌거나 클릭해 고른 뒤, 맞는 진열대를 누르세요.', 'dust').setScale(1.3);
    new Button(this, {
      x: panel.x + panel.w + 12, y: panel.y + 8, w: 128, h: 52,
      label: '닫기',
      onClick: () => {
        this.inventoryOpen = false;
        this.selectedItemId = null;
        this.redraw();
      },
    });
    if (stacks.length === 0) {
      this.text(ix, panel.y + 150, '팔 것도 올릴 것도 없다.', 'dust');
      this.text(ix, panel.y + 198, '시체를 훼손하면 유품이 들어온다.', 'dust');
      return;
    }

    const cellW = Math.floor((panel.w - 56) / INVENTORY_COLUMNS);
    const totalRows = Math.ceil(stacks.length / INVENTORY_COLUMNS);
    const maxScrollRow = Math.max(0, totalRows - INVENTORY_VISIBLE_ROWS);
    this.inventoryScrollRow = Math.min(this.inventoryScrollRow, maxScrollRow);
    const cellTop = panel.y + 144;
    const cellHeight = 128;
    const scrollZone = this.add.zone(panel.x, cellTop, panel.w, panel.h - (cellTop - panel.y)).setOrigin(0, 0).setInteractive();
    scrollZone.on('wheel', (_pointer: Phaser.Input.Pointer, _dx: number, dy: number) => this.scrollInventory(Math.sign(dy), maxScrollRow));

    if (maxScrollRow > 0) {
      this.label(panel.x + panel.w - 126, panel.y + 112, `${this.inventoryScrollRow + 1}–${Math.min(totalRows, this.inventoryScrollRow + INVENTORY_VISIBLE_ROWS)} / ${totalRows}`, 'dust');
      new Button(this, {
        x: panel.x + panel.w - 128, y: panel.y + 138, w: 52, h: 40,
        label: '▲', enabled: this.inventoryScrollRow > 0,
        onClick: () => this.scrollInventory(-1, maxScrollRow),
      });
      new Button(this, {
        x: panel.x + panel.w - 68, y: panel.y + 138, w: 52, h: 40,
        label: '▼', enabled: this.inventoryScrollRow < maxScrollRow,
        onClick: () => this.scrollInventory(1, maxScrollRow),
      });
    }

    stacks.forEach((stack, index) => {
      const def = content.items.find((item) => item.id === stack.id);
      if (def === undefined) return;
      const col = index % INVENTORY_COLUMNS;
      const absoluteRow = Math.floor(index / INVENTORY_COLUMNS);
      if (absoluteRow < this.inventoryScrollRow || absoluteRow >= this.inventoryScrollRow + INVENTORY_VISIBLE_ROWS) return;
      const row = absoluteRow - this.inventoryScrollRow;
      const cellX = ix + col * cellW;
      const cellY = cellTop + row * cellHeight;
      const equipped = s.shelf.includes(def.id);
      const selected = this.selectedItemId === def.id;
      if (selected) this.sprite(cellX - 2, cellY - 2, 'ui.inventory.selected', 140, 124);
      const art = this.itemArt(def, { x: cellX + 3, y: cellY + 5, w: cellW - 6, h: 84 });
      if (art !== null) {
        // 원화의 도트 무게가 오른쪽으로 치우친 경우를 보정해 칸의 시각적 중앙에 둔다.
        art.setX(Math.round(cellX + cellW / 2 - 14));
        if (equipped) art.setAlpha(0.38);
        else {
          this.wireInventoryDrag(art, def, { x: art.x, y: art.y });
          // 아이콘 위에서도 휠이 작업대가 아니라 인벤토리 행을 넘긴다.
          art.on('wheel', (_pointer: Phaser.Input.Pointer, _dx: number, dy: number) => this.scrollInventory(Math.sign(dy), maxScrollRow));
        }
        this.wireItemHint(art, def, hint, s);
      }
      this.text(cellX, cellY + 86, this.clip(def.name, Math.floor(cellW / 0.75), 'body'), equipped ? 'wax' : 'bone').setScale(0.75);
      this.text(cellX, cellY + 112, this.clip(equipped ? '진열 중' : `${this.itemStats(def)}${stack.qty > 1 ? ` ×${stack.qty}` : ''}`, Math.floor(cellW / 0.75), 'body'), 'dust').setScale(0.75);
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

  private wireItemHint(image: Phaser.GameObjects.Image, item: ItemDef, hint: Phaser.GameObjects.Text, state: Readonly<GameState>): void {
    image.on('pointerover', (pointer: Phaser.Input.Pointer) => {
      hint.setText(`${item.name} · ${this.itemStats(item)} · ${item.price.toLocaleString('en-US')} G`);
      if (!this.draggingInventoryItem) this.showItemDetail(item, pointer, this.featuredPersona(state));
    });
    image.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.draggingInventoryItem) this.showItemDetail(item, pointer, this.featuredPersona(state));
    });
    image.on('pointerout', () => {
      hint.setText('장비 도트를 끌어 맞는 진열대에 놓으세요.');
      this.hideItemDetail();
    });
  }

  /** 현재 출연 중인 페르소나의 실제 계승 기록을 장비 카드에 함께 보여 준다. */
  private featuredPersona(state: Readonly<GameState>): Persona | undefined {
    return state.personas.find((persona) => state.stars.some((star) => star.personaId === persona.id && star.status === 'ALIVE'))
      ?? state.personas.find((persona) => persona.lineage.length > 0);
  }

  /** 마우스 오른쪽 위에 원본 정보창 비율을 유지한 상세 카드를 연다. */
  private showItemDetail(item: ItemDef, pointer: Phaser.Input.Pointer, persona: Persona | undefined): void {
    this.hideItemDetail();
    const w = 450;
    const h = 948;
    const x = Math.max(8, Math.min(L.W - w - 8, pointer.x + 24 <= L.W - w - 8 ? pointer.x + 24 : pointer.x - w - 24));
    const y = Math.max(72, Math.min(L.H - h - 8, pointer.y - h - 56));
    const depth = 5000;

    if (this.hasArt('ui.inventory.info')) {
      this.itemDetail.push(this.add.image(x, y, key('ui.inventory.info')).setOrigin(0, 0).setDisplaySize(w, h).setDepth(depth));
    } else {
      this.itemDetail.push(this.add.rectangle(x, y, w, h, 0x07110b, 0.96).setOrigin(0, 0).setDepth(depth));
    }

    const addBody = (dx: number, dy: number, text: string, color: 'bone' | 'dust' | 'wax' = 'bone', scale = 0.85): void => {
      const label = this.text(x + dx, y + dy, text, color).setScale(scale).setDepth(depth + 1);
      this.itemDetail.push(label);
    };
    const addLabel = (dx: number, dy: number, text: string, color: 'bone' | 'dust' | 'wax' = 'dust', scale = 1.3): void => {
      const label = this.label(x + dx, y + dy, text, color).setScale(scale).setDepth(depth + 1);
      this.itemDetail.push(label);
    };
    const slot = content.balance.equipment.slotByItem[item.id];
    const slotName = slot === undefined ? '기타' : SLOT_NAMES[slot];
    const itemType = item.kind === 'POTION' ? 'POTION' : item.isRelic ? 'RELIC' : slot === 0 ? 'WEAPON' : slot === 1 ? 'ARMOR' : 'UTILITY';
    const signed = (value: number): string => `${value >= 0 ? '+' : ''}${value}`;
    const statRows = item.kind === 'POTION'
      ? `HEAL  +${item.healing}`
      : `HP    ${signed(item.hp)}\nATK   ${signed(item.atk)}\nDEF   ${signed(item.def)}`;
    const marks = item.kind === 'POTION'
      ? `<HEAL>\nHP +${item.healing}`
      : `<${slotName}>\n${this.itemStats(item)}`;

    // 장비정보창_예상.png의 다섯 구획: 제목 → 아이콘/가격 → 스탯 → 특성 → 계승 정보.
    addBody(29, 28, this.clip(item.name, 286, 'body'), item.isRelic ? 'wax' : 'bone', 1.1);
    addBody(344, 31, item.tier, item.isRelic ? 'wax' : 'bone', 1.1);
    const icon = this.itemArt(item, { x: x + 50, y: y + 130, w: 112, h: 112 });
    if (icon !== null) {
      icon.setDepth(depth + 2);
      this.itemDetail.push(icon);
    }
    addBody(205, 138, itemType, 'bone', 1.0);
    addBody(205, 185, `${item.price.toLocaleString('en-US')} G`, 'bone', 1.25);
    addBody(38, 286, statRows, 'bone', 0.95);
    addLabel(38, 445, '특성', 'dust', 1.45);
    addBody(38, 485, marks, item.isRelic ? 'wax' : 'bone', 1.0);
    addLabel(38, 644, '계승 정보', 'dust', 1.45);
    addBody(38, 684, this.personaLineage(persona), 'dust', 0.9);
    addBody(95, 878, '“EQUIP TO LIVE”', 'bone', 0.78);
  }

  /** 현재 몸은 빼고, 페르소나가 거쳐 간 이전 사용자의 이름과 사망 층만 남긴다. */
  private personaLineage(persona: Persona | undefined): string {
    if (persona === undefined) return '페르소나 미배정\n이전 사용자 기록 없음';
    const currentCarrier = this.store.getState().stars.find((star) => star.personaId === persona.id)?.id;
    const previous = persona.lineage
      .filter((entry) => entry.starId !== currentCarrier)
      .slice(-2)
      .map((entry, index) => {
        const name = content.stars.find((star) => star.id === entry.starId)?.bodyName ?? entry.starId;
        const floor = entry.diedFloor > 0 ? `${entry.diedFloor}F` : '기록 없음';
        return `${index + 1}대  ${name}  ${floor}`;
      });
    return previous.length > 0
      ? `${persona.displayName} · ${persona.generation}세대\n이전 사용자\n${previous.join('\n')}`
      : `${persona.displayName} · ${persona.generation}세대\n이전 사용자 기록 없음`;
  }

  private hideItemDetail(): void {
    this.itemDetail.forEach((object) => object.destroy());
    this.itemDetail = [];
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
      this.draggingInventoryItem = true;
      this.hideItemDetail();
      image.setDepth(1000).setScale(1.15);
    });
    image.on('drag', (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => image.setPosition(Math.round(dragX), Math.round(dragY)));
    image.on('dragend', () => {
      this.draggingInventoryItem = false;
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
      const slot = SHELF_SLOTS[i]!;
      if (x >= slot.x && x <= slot.x + slot.w && y >= slot.y && y <= slot.y + slot.h) return i;
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

  private scrollInventory(delta: number, maxScrollRow: number): void {
    const next = Math.max(0, Math.min(maxScrollRow, this.inventoryScrollRow + delta));
    if (next === this.inventoryScrollRow) return;
    this.inventoryScrollRow = next;
    this.redraw();
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
    const expanded = this.contractReaderOpen ? s.visitors[this.contractIndex] : undefined;
    new Button(this, {
      x: actionX(2), y, w: ACTION_W, h,
      label: '계약', hotkey: '3',
      variant: expanded !== undefined && s.gold >= expanded.fee ? 'default' : 'ghost',
      // 확대 중에는 종이 아래에 남긴다. 실제 수락은 좌측의 문서 전용 버튼으로만 한다.
      enabled: false,
      onClick: () => undefined,
    });
    const waiting = s.visitors[0];
    if (waiting !== undefined) {
      const canAccept = expanded !== undefined && s.gold >= expanded.fee;
      new Button(this, {
        x: L.dialogue.x + 24, y: L.dialogue.y + 14, w: 232, h: 50,
        label: '수락 후 방송', hotkey: '3', variant: 'default', enabled: canAccept,
        onClick: () => {
          if (expanded === undefined) return;
          this.contractReaderOpen = false;
          this.store.dispatch({ type: 'OFFICE/CONTRACT_ACCEPT', starId: expanded.starId });
        },
      });
      const returnButton = new Button(this, {
        // 대사/힌트 아래의 고정 위치: 계약서를 펼치지 않아도 언제든 돌려보낼 수 있다.
        x: L.dialogue.x + 24, y: L.dialogue.y + 76, w: 232, h: 50,
        label: '돌려보내기', hotkey: '6', variant: 'danger',
        onClick: () => {
          this.contractReaderOpen = false;
          this.store.dispatch({ type: 'OFFICE/CONTRACT_REJECT', starId: waiting.starId });
        },
      });
      returnButton.setDepth(100);
    }
    // 수동 출연자 선택은 없다. 방송을 누르면 코어가 현재 생존 용사를 자동으로 고른다.
    const closing = s.today === null && isEarlyClosure(s);
    const hasAutomaticCaster = s.stars.some((star) => star.status === 'ALIVE');
    new Button(this, {
      x: actionX(3), y, w: ACTION_W, h,
      label: closing ? '폐업' : '방송', hotkey: '4', variant: 'danger',
      enabled: hasAutomaticCaster || closing,
      onClick: () => this.store.dispatch({ type: 'OFFICE/CONFIRM' }),
    });

  }

  private openInventory(): void {
    this.inventoryOpen = true;
    this.selectedItemId = null;
    this.inventoryScrollRow = 0;
    this.contractReaderOpen = false;
    this.redraw();
  }
}
