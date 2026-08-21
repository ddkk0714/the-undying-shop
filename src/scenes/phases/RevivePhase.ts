import { SCENES } from '../../config';
import { reviveQuote } from '../../core/systems/economy';
import { starArt } from '../../render/assets';
import { L, actionX, ACTION_W } from '../../ui/layout';
import { Button } from '../../ui/Button';
import { reducedMotion } from '../../ui/options';
import { sealStamp } from '../../ui/SealStamp';
import { PhaseScene } from './PhaseScene';
import type { Corpse, GameState, Star } from '../../core/types';

/**
 * M04 ① 소생실 — 이 게임의 유일한 지출.
 * v3.1 부터 편성실과 같은 **상점 화면 구성**을 쓴다 (좌 인물 / 우 작업대 / 하단 4택).
 *
 * ★ 비용 산식은 `core/systems/economy.ts` 의 `reviveQuote` 가 전부 계산한다.
 *   이 씬은 숫자를 만들지 않는다. 받아서 그린다.
 * ★ v3(CCR-001) 에는 제한시간이 없다. M04 문서의 10초 타이머 항목은 폐기됐다.
 */
export class RevivePhase extends PhaseScene {
  private index = 0;
  /** 도장이 찍히는 동안 다시 누르지 못하게 */
  private discarding = false;

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
    super.create();
  }

  protected build(s: Readonly<GameState>): void {
    this.stageBackdrop();

    // 소생 대상 = 아직 살아 있지 않은 몸의 시체. 살릴 수 있는지 판정은 리듀서가 한다.
    const waiting = s.corpses.filter((c) =>
      s.stars.some((st) => st.id === c.starId && (st.status === 'DEAD' || st.status === 'HIDDEN')),
    );
    if (this.index >= waiting.length) this.index = 0;

    const corpse = waiting[this.index];
    const star = corpse === undefined ? undefined : s.stars.find((st) => st.id === corpse.starId);

    this.buildGuest(s, star, waiting.length);
    this.buildBench(s, corpse, star);
    this.buildPager(waiting.length);
    this.buildActions(s, corpse, star);
  }

  /* ── 좌 · 소생 수조의 몸 ──────────────────────────────── */

  private buildGuest(s: Readonly<GameState>, star: Star | undefined, count: number): void {
    const g = L.guest;
    this.rect(g.x, g.y, g.w, g.h, 'ink');
    // 소생실 전용 배경이 오면 그걸 쓰고, 없으면 상점 방을 그대로 쓴다
    this.spriteCover(g, ['bg.revive.room', 'bg.shop.room']);
    this.frame(g.x, g.y, g.w, g.h, 'dust');

    this.title(g.x + L.pad, g.y + L.pad, '소생실');
    this.text(g.x + L.pad, g.y + 96, `대기 ${count}구`, 'dust');

    const d = L.dialogue;
    this.rect(d.x, d.y, d.w, d.h, 'ink');

    if (star === undefined) {
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
    if (!this.spriteFit(full, [art.body]) && !this.spriteFit({ x, y, w, h }, [art.portrait, 'star.silhouette'])) {
      this.rect(x, y, w, h, 'mid');
    }
    // 열화 균열 — 소생 횟수만큼. 진짜 오버레이는 M03
    for (let i = 0; i < Math.min(star.reviveCount, 5); i += 1) {
      this.rect(x + 56 + i * 64, y + 64 + i * 24, L.line, h - 160, 'ink');
    }

    const persona = s.personas.find((p) => p.id === star.personaId);
    this.title(d.x + L.pad, d.y + 40, this.clip(persona?.displayName ?? '무명', d.w - 96, 'title'));
  }

  /* ── 우 · 작업대에 올린 시체 기록 ─────────────────────── */

  private buildBench(s: Readonly<GameState>, corpse: Corpse | undefined, star: Star | undefined): void {
    const b = L.bench;
    this.rect(b.x, b.y, b.w, b.h, 'ink');
    this.spriteCover(b, ['bg.revive.bench', 'bg.shop.bench']);
    // 소생실에서는 작업대에 장부와 도장만 올려 둔다 (진열은 편성실 몫)
    this.sprite(b.x + 24, b.y + 470, 'prop.ledger', 336, 264);
    this.sprite(b.x + 980, b.y + 120, 'prop.stamp', 128, 208);
    this.frame(b.x, b.y, b.w, b.h, 'dust');

    if (corpse === undefined || star === undefined) return;

    const ox = b.x + L.pad * 3;
    let oy = b.y + L.pad * 3;
    const quote = reviveQuote(s, corpse, star);
    const when = s.day - corpse.diedDay === 1 ? '어제' : `${corpse.diedDay}일차`;

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
    this.label(ox, py, '소생 비용', 'dust');
    this.title(ox, py + 28, `${fmtGold(quote.cost)} G`);
    this.label(b.x + b.w - L.pad * 3 - 200, py, '보유', 'dust');
    this.textRight(b.x + b.w - L.pad * 3, py + 32, `${fmtGold(s.gold)} G`, 'dust');
    if (!quote.affordable) this.text(ox + 320, py + 32, '자금이 부족합니다', 'wax');
  }

  /** 대기 중인 시체가 여럿이면 작업대 위에서 넘긴다. 하단 네 자리는 3택 + 편성실이 쓴다 */
  private buildPager(count: number): void {
    if (count <= 1) return;
    const b = L.bench;
    this.label(b.x + b.w - 300, b.y + L.pad * 3, `대기 ${count}구`, 'dust');
    new Button(this, {
      x: b.x + b.w - 300, y: b.y + L.pad * 3 + 28, w: 220, h: 56,
      label: `次 ${this.index + 1}/${count}`, hotkey: '5', variant: 'ghost',
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
      label: quote === null ? '蘇生 소생' : `蘇生 ${fmtGold(quote.cost)}G`,
      hotkey: '1', variant: 'danger',
      enabled: quote?.affordable === true,
      onClick: () => corpse && this.store.dispatch({ type: 'REVIVE/PAY', starId: corpse.starId }),
    });
    new Button(this, {
      x: actionX(1), y, w: ACTION_W, h,
      label: '保管 그대로', hotkey: '2',
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
      label: '廢棄 폐기', hotkey: '3', variant: 'danger',
      enabled: corpse !== undefined && !this.discarding,
      onClick: () => corpse && this.discard(corpse.starId),
    });
    new Button(this, {
      x: actionX(3), y, w: ACTION_W, h,
      label: '編成 편성실', hotkey: '4',
      onClick: () => this.store.dispatch({ type: 'PHASE/ADVANCE' }),
    });
  }
}

function fmtGold(n: number): string {
  return n.toLocaleString('en-US');
}
