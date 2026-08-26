import Phaser from 'phaser';
import { SCENES } from '../../config';
import { content } from '../../core/content';
import { pickDialogue, totalRevivals } from '../../core/systems/dialogue';
import { reviveQuote } from '../../core/systems/economy';
import { starVoice } from '../../audio/Voice';
import { key, starArt, starExpression } from '../../render/assets';
import { L, actionX, ACTION_W } from '../../ui/layout';
import { Button } from '../../ui/Button';
import { Dialogue } from '../../ui/Dialogue';
import { reducedMotion } from '../../ui/options';
import { sealStamp } from '../../ui/SealStamp';
import { degradeOverlay, portrait } from '../../ui/Portrait';
import { onboard } from '../../ui/Onboarding';
import { playBgm, playSfx } from '../../audio/Sfx';
import { PhaseScene } from './PhaseScene';
import type { Corpse, GameState, ItemDef, Persona, Star } from '../../core/types';

/**
 * M04 ① 소생실 — 이 게임의 유일한 지출.
 * v3.1 부터 편성실과 같은 **상점 화면 구성**을 쓴다 (좌 인물 / 우 작업대 / 하단 4택).
 *
 * ★ 비용 산식은 `core/systems/economy.ts` 의 `reviveQuote` 가 전부 계산한다.
 *   이 씬은 숫자를 만들지 않는다. 받아서 그린다.
 * ★ v3(CCR-001) 에는 제한시간이 없다. M04 문서의 10초 타이머 항목은 폐기됐다.
 */
/** 편성실 인벤토리 창과 같은 칸 규격 — 두 화면이 같은 창처럼 보여야 한다 */
const CARRIED_PANEL = { w: 736, h: 420 };
// 진열대가 3칸이라 소지품도 최대 3점이다. 4칸으로 나누면 글자가 옆 칸에 붙는다
const CARRIED_COLUMNS = 3;

export class RevivePhase extends PhaseScene {
  private index = 0;
  /** 도장이 찍히는 동안 다시 누르지 못하게 */
  private discarding = false;
  /** 페르소나 승계 화면을 열어 둔 상태 */
  private inheriting = false;
  /** 씌울 대상이 여럿일 때 보고 있는 사람 */
  private heirIndex = 0;
  /** 시체가 지니고 있던 장비를 펼쳐 놓은 상태 (CCR-006) */
  private carriedOpen = false;
  /** 빈 소생실에서 한 번만 울리는 편성실 쪽 노크 */
  private emptyKnockTimer: Phaser.Time.TimerEvent | null = null;
  private emptyKnockPlayed = false;

  constructor() {
    super(SCENES.PHASE_REVIVE);
  }

  override create(): void {
  /**
   * ★ Phaser 씬 인스턴스는 stop/launch 를 거쳐도 **살아남는다.**
   * 어제 남긴 필드를 지우지 않으면 다음 날 화면이 어제 상태로 시작한다.
   */
    this.index = 0;
    this.discarding = false;
    this.inheriting = false;
    this.heirIndex = 0;
    this.carriedOpen = false;
    this.emptyKnockTimer = null;
    this.emptyKnockPlayed = false;
    super.create();
    playBgm(this, 'bgm.shop');
  }

  protected build(s: Readonly<GameState>): void {
    this.stageBackdrop();

    // 「한 화면에 끝낸다」 (M03 §승계 UI). 덮기만 하면 아래 버튼이 그대로 눌리므로
    // 아예 다른 것을 그리지 않는다.
    if (this.inheriting) {
      this.buildInherit(s);
      return;
    }

    // 소생 대상 = 아직 살아 있지 않은 몸의 시체. 살릴 수 있는지 판정은 리듀서가 한다.
    const waiting = s.corpses.filter((c) =>
      s.stars.some((st) => st.id === c.starId && (st.status === 'DEAD' || st.status === 'HIDDEN')),
    );
    if (waiting.length === 0) this.scheduleEmptyKnock();
    else this.cancelEmptyKnock();
    if (this.index >= waiting.length) this.index = 0;

    const corpse = waiting[this.index];
    const star = corpse === undefined ? undefined : s.stars.find((st) => st.id === corpse.starId);

    this.buildGuest(s, star, waiting.length);
    this.buildBench(s, corpse, star);
    this.buildPager(waiting.length);
    this.buildCarriedButton(corpse);
    this.buildInheritButton(s);
    this.buildActions(s, corpse, star);
    if (this.carriedOpen && corpse !== undefined) this.buildCarried(corpse);
    onboard(this, s.day, 'REVIVE', { x: L.pad, y: L.actionsFull.y - 52, w: L.W - L.pad * 2 });
  }

  /** 빈 화면이 유지된 경우에만 2초 뒤 한 번 울린다. 별도 안내 문구는 추가하지 않는다. */
  private scheduleEmptyKnock(): void {
    if (this.emptyKnockPlayed || this.emptyKnockTimer !== null) return;
    this.emptyKnockTimer = this.time.delayedCall(2000, () => {
      this.emptyKnockTimer = null;
      this.emptyKnockPlayed = true;
      playSfx(this, 'sfx.revive.knock', 0.75);
    });
  }

  private cancelEmptyKnock(): void {
    this.emptyKnockTimer?.remove(false);
    this.emptyKnockTimer = null;
  }

  /* ── 좌 · 소생 수조의 몸 ──────────────────────────────── */

  private buildGuest(s: Readonly<GameState>, star: Star | undefined, count: number): void {
    const g = L.guest;
    this.rect(g.x, g.y, g.w, g.h, 'ink');
    // 소생실 전용 배경이 오면 그걸 쓰고, 없으면 상점 방을 그대로 쓴다
    this.spriteCover(g, ['bg.revive.room', 'bg.shop.room']);
    this.frame(g.x, g.y, g.w, g.h, 'dust');

    const d = L.dialogue;
    this.rect(d.x, d.y, d.w, d.h, 'ink');

    if (star === undefined) {
      this.buildRoomLabel(count);
      this.scrimBlock(g.x + L.line, g.y + 184, 560, 56);
      this.text(g.x + L.pad, g.y + 200, '소생 수조가 비어 있다.', 'dust');
      this.title(d.x + L.pad, d.y + 40, '...오늘은 아무도 없다', 'dust');
      return;
    }

    // 전신 CG 자리 — star.body.* 가 오면 칸을 그대로 채우고, 없으면 초상/실루엣으로 내려간다
    const art = starArt(star.id);
    const w = 384;
    const h = 480;
    const x = g.x + Math.round((g.w - w) / 2);
    const y = g.y + g.h - h - 24;
    // 전신은 좌측 칸과 1:1 이다 (752x792). 이름 글자는 그 위에 얹는다
    const full = { x: g.x, y: g.y, w: g.w, h: g.h };
    const reduced = reducedMotion(this.registry);
    const reviveLine = pickDialogue(star.id, 'REVIVE', {
      revives: totalRevivals(star.id, star.reviveCount),
      deaths: s.stats.totalDiscarded,
    }, (s.day % 10) / 10);
    // 열화는 숫자가 아니라 몸으로 보여준다 (M03 §열화)
    const bodyKeys = reviveLine === null ? [art.body] : [starExpression(star.id, reviveLine.expression), art.body];
    if (this.spriteFit(full, bodyKeys)) {
      degradeOverlay(this, full, star.reviveCount, reduced);
    } else {
      portrait(this, { x, y, w, h }, star, { reduced });
    }

    // 방 이름은 전신 CG 위에 얹는다 — 먼저 그리면 몸에 가려진다
    this.buildRoomLabel(count);

    const persona = s.personas.find((p) => p.id === star.personaId);
    this.title(d.x + L.pad, d.y + 12, this.clip(persona?.displayName ?? '무명', d.w - 96, 'title')).setScale(0.65);
    if (reviveLine !== null) {
      new Dialogue(this, {
        x: d.x + L.pad,
        y: d.y + 58,
        w: d.w - 96,
        line: this.clip(reviveLine.text, d.w - 96, 'title'),
        scale: 0.68,
        effects: reviveLine.effects,
        voice: starVoice(star?.id),
      });
    }
  }

  /** 좌측 칸 좌상단의 방 이름 — 배경이 밝은 곳에 걸려도 읽히게 판을 깐다 */
  private buildRoomLabel(count: number): void {
    const g = L.guest;
    this.scrimBlock(g.x + L.line, g.y + L.line, 460, 136);
    this.title(g.x + L.pad, g.y + L.pad, '소생실');
    this.text(g.x + L.pad, g.y + 96, `대기 ${count}구`, 'dust');
  }

  /* ── 우 · 작업대에 올린 시체 기록 ─────────────────────── */

  private buildBench(s: Readonly<GameState>, corpse: Corpse | undefined, star: Star | undefined): void {
    const b = L.bench;
    this.rect(b.x, b.y, b.w, b.h, 'ink');
    this.spriteCover(b, ['bg.revive.bench', 'bg.shop.bench']);
    // 소생실에서는 작업대에 장부와 도장만 올려 둔다 (진열은 편성실 몫)
    this.frame(b.x, b.y, b.w, b.h, 'dust');

    if (corpse === undefined || star === undefined) return;

    const ox = b.x + L.pad * 3;
    let oy = b.y + L.pad * 3;
    const quote = reviveQuote(s, corpse, star);
    const when = s.day - corpse.diedDay === 1 ? '어제' : `${corpse.diedDay}일차`;

    // 작업대 배경이 고주파 디더라 그 위의 본문이 읽히지 않는다. 기록이 놓이는 만큼만 덮는다
    const rows = 96 + 132 + (quote.witnessWarning ? 160 : 0);
    this.scrimBlock(b.x + L.pad, oy - L.pad, b.w - L.pad * 2, rows + L.pad * 2);

    this.title(ox, oy, `${when}, ${corpse.diedFloor}F에서 죽었습니다.`);
    oy += 96;
    this.text(ox, oy, `시체 상태 : ${corpse.grade === 'INTACT' ? '온전' : '훼손'}`, 'dust');
    this.text(ox, oy + 44, `부활 횟수 : ${star.reviveCount}회`, 'dust');
    if (star.witnessed.length > 0) {
      this.text(ox, oy + 88, `그가 본 것 : ${star.witnessed.map((f) => `${f}F`).join(' ')}`, 'dust');
    }

    if (quote.witnessWarning) {
      oy += 168;
      this.text(ox, oy, '이 사람은 아래에서 무언가를 봤다.', 'wax');
      this.text(ox, oy + 44, '되살리면 방송에서 말할 것이다.', 'wax');
    }

    // 비용 — 작업대 아래쪽 가격표 자리
    const py = b.y + b.h - 160;
    this.scrimRow(b.x + L.pad, py - 56, b.w - L.pad * 2, 176);
    this.label(ox, py, '소생 비용', 'dust');
    this.title(ox, py + 28, `${fmtGold(quote.cost)} G`);
    this.label(b.x + b.w - L.pad * 3 - 200, py, '보유', 'dust');
    this.textRight(b.x + b.w - L.pad * 3, py + 32, `${fmtGold(s.gold)} G`, 'dust');
    if (!quote.affordable) this.text(ox + 320, py + 32, '자금이 부족합니다', 'wax');
  }

  /* ── 우 · 시체가 지니고 있던 것 (CCR-006) ─────────────── */

  /**
   * 방송이 끝나도 장비는 저절로 돌아오지 않는다. **몸에 남는다.**
   * 소생실에서 그 몸을 살피고 한 점씩 회수하는 것이 이 버튼이 여는 화면이다.
   */
  private buildCarriedButton(corpse: Corpse | undefined): void {
    if (corpse === undefined || this.carriedOpen) return;
    const carried = corpse.carried ?? [];
    if (carried.length === 0) return;
    const b = L.bench;
    // 시체 기록(최대 y 631)과 소생 비용 띠(723 부터) 사이의 빈 칸.
    // 비용 위에 겹치면 금액을 가린다 — 실제로 가렸었다
    const x = b.x + L.pad * 3;
    const y = b.y + 500;
    // 작업대 배경이 고주파 디더라 투명한 버튼 위의 글자가 뭉개진다. 깔고 그린다
    this.scrimBlock(x - 16, y - 12, 332, 88);
    new Button(this, {
      x, y, w: 300, h: 64,
      label: `소지품 ${carried.length}점`, hotkey: '5',
      onClick: () => {
        this.carriedOpen = true;
        this.redraw();
      },
    });
  }

  /** 편성실 인벤토리 창과 같은 그림·같은 칸 규격을 쓴다 — 플레이어가 두 번 배우지 않게. */
  private buildCarried(corpse: Corpse): void {
    const b = L.bench;
    const panel = {
      x: b.x + Math.round((b.w - CARRIED_PANEL.w) / 2),
      y: b.y + b.h - CARRIED_PANEL.h,
      w: CARRIED_PANEL.w,
      h: CARRIED_PANEL.h,
    };
    const ix = panel.x + 28;
    if (!this.spriteFit(panel, ['ui.inventory.window'])) {
      this.rect(panel.x, panel.y, panel.w, panel.h, 'ink');
      this.frame(panel.x, panel.y, panel.w, panel.h, 'bone');
    }

    const carried = corpse.carried ?? [];
    this.text(ix, panel.y + 16, `소지품  ${carried.length}점`, 'ink');
    this.label(ix, panel.y + 70, '장비를 눌러 회수합니다. 두고 가도 몸과 함께 돌아옵니다.', 'dust').setScale(1.3);
    new Button(this, {
      x: panel.x + panel.w + 12, y: panel.y + 8, w: 128, h: 52,
      label: '닫기',
      onClick: () => {
        this.carriedOpen = false;
        this.redraw();
      },
    });

    if (carried.length === 0) {
      this.text(ix, panel.y + 150, '맨몸으로 내려갔다.', 'dust');
      return;
    }

    const cellW = Math.floor((panel.w - 56) / CARRIED_COLUMNS);
    const cellTop = panel.y + 144;
    carried.forEach((itemId, index) => {
      const def = content.items.find((item) => item.id === itemId);
      if (def === undefined) return;
      const cellX = ix + (index % CARRIED_COLUMNS) * cellW;
      const cellY = cellTop + Math.floor(index / CARRIED_COLUMNS) * 128;
      const art = this.itemArt(def, { x: cellX + 3, y: cellY + 5, w: cellW - 6, h: 84 });
      if (art !== null) {
        // 원화의 도트 무게 보정 — 편성실 인벤토리와 같은 값이라야 두 창이 같아 보인다
        art.setX(Math.round(cellX + cellW / 2 - 14));
        art.setInteractive({ cursor: 'pointer' });
        art.on('pointerup', () => this.store.dispatch({ type: 'REVIVE/LOOT', starId: corpse.starId, itemId }));
      }
      const textPx = Math.floor((cellW - 20) / 0.75);
      this.text(cellX, cellY + 86, this.clip(def.name, textPx, 'body'), 'bone').setScale(0.75);
      this.text(cellX, cellY + 112, this.clip(this.itemStats(def), textPx, 'body'), 'dust').setScale(0.75);
    });
  }

  /** 편성실과 같은 규칙 — 원본 비율을 지켜 칸 안에 넣는다. */
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

  /* ── 페르소나 승계 (M03) ─────────────────────────────── */

  /**
   * 씌울 수 있는 조합. core 의 `inherit()` 가드를 그대로 읽는다 —
   * 이름이 붙어 있던 몸이 더는 살아 있지 않고 시체가 남아 있을 때,
   * 이름 없는 산 몸에 옮겨 씌울 수 있다.
   */
  /**
   * 의심도 — 눈이 떠지는 5단.
   *
   * 「팬들은 대부분 모른다」 옆에 두는 그림이다. 대부분은 모르지만 **눈 하나는 떠 있고,**
   * 이름을 갈아 끼울 때마다 조금 더 떠진다. 승계가 공짜가 아니라는 걸 숫자 말고 그림으로 말한다.
   *
   * 아트 5장이 다 있을 때만 그린다 — 한 칸이라도 비면 게이지가 거짓말을 한다.
   * 증가량은 `balance.roster.inheritSuspicion` 을 읽는다 (씬에 숫자를 두지 않는다).
   */
  private suspicionRow(x: number, y: number, persona: Persona): void {
    const before = persona.suspicion;
    const after = Math.min(100, before + content.balance.roster.inheritSuspicion);
    if (!this.suspicionEye(x, y, before)) return;
    this.title(x + 108, y + 6, '→', 'wax');
    this.suspicionEye(x + 160, y, after);
    this.label(x, y + 76, `의심  ${before} → ${after}`, 'dust');
  }

  /** 0..100 을 눈 5칸으로 본다. 표시 단계일 뿐 규칙이 아니다 — 규칙은 core 가 가진다 */
  private suspicionEye(x: number, y: number, value: number): boolean {
    const step = Math.max(1, Math.min(5, 1 + Math.floor(value / 25)));
    const artKey = `ui.suspicion${step}`;
    if (!this.hasArt('ui.suspicion1') || !this.hasArt('ui.suspicion5') || !this.hasArt(artKey)) return false;
    this.sprite(x, y, artKey, 96, 64);   // 192x128 의 정확히 1/2
    return true;
  }

  private inheritable(s: Readonly<GameState>): { persona: Persona; from: Star; heirs: Star[] } | null {
    for (const persona of s.personas) {
      const from = s.stars.find((x) => x.personaId === persona.id && x.status !== 'ALIVE');
      if (from === undefined) continue;
      if (!s.corpses.some((c) => c.starId === from.id)) continue;
      const heirs = s.stars.filter((x) => x.status === 'ALIVE' && x.personaId === null);
      if (heirs.length === 0) continue;
      return { persona, from, heirs };
    }
    return null;
  }

  private buildInheritButton(s: Readonly<GameState>): void {
    const ready = this.inheritable(s);
    if (ready === null || this.inheriting) return;
    const b = L.bench;
    new Button(this, {
      x: b.x + b.w - 300, y: b.y + b.h - 96, w: 260, h: 64,
      label: '승계', hotkey: '6', variant: 'danger',
      onClick: () => {
        this.inheriting = true;
        this.heirIndex = 0;
        this.redraw();
      },
    });
  }

  /**
   * M03 §승계 UI — 「한 화면에 끝낸다」.
   * 마지막 줄 **「팬들은 대부분 모른다.」** 이 한 문장이 이 화면의 전부다.
   */
  private buildInherit(s: Readonly<GameState>): void {
    const ready = this.inheritable(s);
    if (ready === null) {
      this.inheriting = false;
      return;
    }
    const { persona, from, heirs } = ready;
    if (this.heirIndex >= heirs.length) this.heirIndex = 0;
    const heir = heirs[this.heirIndex]!;

    const w = 1280;
    const h = 700;
    const x = Math.round((L.W - w) / 2);
    const y = L.stage.y + 56;
    this.rect(x, y, w, h, 'ink');
    this.frame(x, y, w, h, 'bone');

    this.label(x + L.pad * 2, y + L.pad, '페르소나 승계', 'dust');
    this.title(x + L.pad * 2, y + 44, `「${persona.displayName}」  ${persona.generation}대 → ${persona.generation + 1}대`);

    // 왼쪽 · 이름을 잃는 몸  →  오른쪽 · 이름을 받는 몸
    // 세로 예산: 초상 310..650 · 이름 666 · 계보 706 · 문장 740 · 버튼 812..884 (카드 900 끝)
    const slot = { w: 300, h: 340 };
    const ly = y + 110;
    const lx = x + 96;
    const rx = x + w - 96 - slot.w;
    const reduced = reducedMotion(this.registry);
    portrait(this, { x: lx, y: ly, w: slot.w, h: slot.h }, from, { reduced });
    this.frame(lx, ly, slot.w, slot.h, 'dust');
    portrait(this, { x: rx, y: ly, w: slot.w, h: slot.h }, heir, { reduced });
    this.frame(rx, ly, slot.w, slot.h, 'bone');

    this.text(lx, ly + slot.h + 16, this.clip(from.bodyName, slot.w), 'dust');
    // 아직 죽지 않은 대는 0F 로 들어 있다. 계보에 0F 를 적지 않는다
    const line = persona.lineage.filter((entry) => entry.diedFloor > 0).map((entry) => `${entry.diedFloor}F`).join(' · ');
    this.label(lx, ly + slot.h + 56, line === '' ? '계보 없음' : line, 'dust');

    this.text(rx, ly + slot.h + 16, this.clip(heir.bodyName, slot.w));
    const heirProfile = content.starProfiles[heir.id];
    this.label(
      rx,
      ly + slot.h + 56,
      heirProfile === undefined
        ? `grit ${heir.stats.grit}  cha ${heir.stats.charisma}  luck ${heir.stats.luck}`
        : `HP ${heirProfile.hp}  ATK ${heirProfile.atk}  DEF ${heirProfile.def}  WILL ${heirProfile.will}`,
      'dust',
    );

    // 가운데 — 이름이 건너가는 자리. 팬덤이 얼마나 떨어져 나가는지 여기서 말한다
    const mx = lx + slot.w + 24;
    const mw = rx - mx - 24;
    this.title(mx + Math.round(mw / 2) - 24, ly + 130, '→', 'wax');

    const loss = content.balance.roster.inheritFandomLoss;
    const after = Math.floor(persona.fandom * (1 - loss));
    this.text(mx, ly + 210, `팬덤 ${fmtGold(persona.fandom)}`, 'dust');
    this.text(mx, ly + 250, `  → ${fmtGold(after)}  (-${Math.round(loss * 100)}%)`, 'wax');

    // 팬덤 바로 아래 — 이름을 갈아 끼우면 의심이 올라간다. 같은 문법으로 이어 붙인다
    this.suspicionRow(mx, ly + 300, persona);

    // 이 한 문장이 이 화면의 전부다 (M03). 이름·계보 아래, 버튼 위에 혼자 놓는다
    this.title(x + L.pad * 2, ly + slot.h + 100, '팬들은 대부분 모른다.', 'bone');

    const by = y + h - 88;
    new Button(this, {
      x: x + L.pad * 2, y: by, w: 320, h: 72,
      label: '씌운다', hotkey: '1', variant: 'danger',
      onClick: () => {
        this.inheriting = false;
        this.store.dispatch({ type: 'REVIVE/INHERIT', personaId: persona.id, toStarId: heir.id });
      },
    });
    new Button(this, {
      x: x + L.pad * 2 + 344, y: by, w: 320, h: 72,
      label: '그만둔다', hotkey: '2', variant: 'ghost',
      onClick: () => {
        this.inheriting = false;
        this.redraw();
      },
    });
    if (heirs.length > 1) {
      new Button(this, {
        x: x + w - L.pad * 2 - 260, y: by, w: 260, h: 72,
        label: `다음 ${this.heirIndex + 1}/${heirs.length}`, hotkey: '3', variant: 'ghost',
        onClick: () => {
          this.heirIndex = (this.heirIndex + 1) % heirs.length;
          this.redraw();
        },
      });
    }
  }

  /** 대기 중인 시체가 여럿이면 작업대 위에서 넘긴다. 하단 네 자리는 3택 + 편성실이 쓴다 */
  private buildPager(count: number): void {
    if (count <= 1) return;
    const b = L.bench;
    this.label(b.x + b.w - 300, b.y + L.pad * 3, `대기 ${count}구`, 'dust');
    new Button(this, {
      x: b.x + b.w - 300, y: b.y + L.pad * 3 + 28, w: 220, h: 56,
      label: `다음 ${this.index + 1}/${count}`, hotkey: '5', variant: 'ghost',
      onClick: () => {
        this.index = (this.index + 1) % Math.max(1, count);
        this.redraw();
      },
    });
  }

  /* ── 하단 4택 — 蘇生 / 保管 / 廢棄 (M04 §화면의 3택) + 編成 ── */

  /**
   * M04 §81 — 폐기 확정 시 봉랍 도장이 먼저 찍힌다.
   * 누르는 즉시 dispatch 하면 시체가 목록에서 사라져 도장이 보일 새가 없다.
   */
  private discard(starId: string): void {
    if (this.discarding) return;
    this.discarding = true;
    this.redraw();
    sealStamp(this, {
      x: L.guest.x + L.guest.w / 2,
      y: L.guest.y + L.guest.h / 2,
      reduced: reducedMotion(this.registry),
      onDone: () => {
        this.discarding = false;
        this.index = 0;
        this.store.dispatch({ type: 'REVIVE/DISCARD', starId });
      },
    });
  }

  private buildActions(s: Readonly<GameState>, corpse: Corpse | undefined, star: Star | undefined): void {
    const a = L.actions;
    this.rect(a.x, a.y, a.w, a.h, 'ink');
    const y = a.y + L.pad;
    const h = a.h - L.pad * 2;
    const quote = corpse !== undefined && star !== undefined ? reviveQuote(s, corpse, star) : null;

    new Button(this, {
      x: actionX(0), y, w: ACTION_W, h,
      label: quote === null ? '소생' : `소생 ${fmtGold(quote.cost)}G`,
      hotkey: '1', variant: 'danger',
      enabled: quote?.affordable === true,
      onClick: () => {
        if (corpse === undefined) return;
        playSfx(this, 'sfx.revive', 0.8);
        this.store.dispatch({ type: 'REVIVE/PAY', starId: corpse.starId });
      },
    });
    new Button(this, {
      x: actionX(1), y, w: ACTION_W, h,
      label: '그대로', hotkey: '2',
      enabled: corpse !== undefined,
      onClick: () => {
        if (corpse === undefined) return;
        this.store.dispatch({ type: 'REVIVE/SKIP', starId: corpse.starId });
        this.index += 1; // 보관하고 다음 시체를 본다. 미루면 내일 비용이 오른다.
        this.redraw();
      },
    });
    // 廢棄 — 몸이 사라지고 유품이 남는다. 되돌릴 수 없다 (M04 §결과표)
    new Button(this, {
      x: actionX(2), y, w: ACTION_W, h,
      label: '폐기', hotkey: '3', variant: 'danger',
      enabled: corpse !== undefined && !this.discarding,
      onClick: () => corpse && this.discard(corpse.starId),
    });
    new Button(this, {
      x: actionX(3), y, w: ACTION_W, h,
      label: '편성실', hotkey: '4',
      onClick: () => this.store.dispatch({ type: 'PHASE/ADVANCE' }),
    });
  }
}

function fmtGold(n: number): string {
  return n.toLocaleString('en-US');
}
