import { SCENES } from '../../config';
import { reviveQuote } from '../../core/systems/economy';
import { key, MISSING_TEXTURE } from '../../render/assets';
import { L } from '../../ui/layout';
import { Button } from '../../ui/Button';
import { PhaseScene } from './PhaseScene';
import type { Corpse, GameState, Star } from '../../core/types';

/**
 * M04 ① 소생실 — 이 게임의 유일한 지출.
 *
 * ★ 비용 산식은 `core/systems/economy.ts` 의 `reviveQuote` 가 전부 계산한다.
 *   이 씬은 숫자를 만들지 않는다. 받아서 그린다.
 * ★ `spirit` 색을 쓰는 유일한 화면이다 (04-UI-KIT §3).
 * ★ v3(CCR-001) 에는 제한시간이 없다. M04 문서의 10초 타이머 항목은 폐기됐다.
 */
export class RevivePhase extends PhaseScene {
  private index = 0;

  constructor() {
    super(SCENES.PHASE_REVIVE);
  }

  protected build(s: Readonly<GameState>): void {
    this.stageBackdrop();
    this.heading('소생실', 'spirit');

    // 소생 대상 = 아직 살아 있지 않은 몸의 시체. 살릴 수 있는지 판정은 리듀서가 한다.
    const waiting = s.corpses.filter((c) =>
      s.stars.some((st) => st.id === c.starId && (st.status === 'DEAD' || st.status === 'HIDDEN')),
    );
    this.textRight(L.W - L.pad - 2, L.stage.y + L.pad, `대기 ${waiting.length}구`, 'dust');

    if (waiting.length === 0) {
      this.text(L.pad + 6, L.stage.y + 54, '소생 수조가 비어 있다.', 'dust');
      this.text(L.pad + 6, L.stage.y + 74, '오늘은 되살릴 것이 없다.', 'dust');
      this.nextPhaseButton();
      return;
    }

    if (this.index >= waiting.length) this.index = 0;
    const corpse = waiting[this.index]!;
    const star = s.stars.find((st) => st.id === corpse.starId);
    if (star === undefined) return;

    this.buildPortrait(s, star, waiting.length);
    const bottom = this.buildDetail(s, corpse, star);
    this.buildPrice(s, corpse, star, bottom);
    this.buildActions(corpse, star, s);
  }

  /* ── 초상 96×120 — M03 `ui/Portrait.ts` 가 오면 통째로 교체된다 ── */
  private buildPortrait(s: Readonly<GameState>, star: Star, count: number): void {
    const x = L.pad + 6;
    const y = L.stage.y + 28; // 제목줄(32~52) 아래
    const w = 96;
    const h = 120;

    // 전용 초상이 없는 몸은 공용 실루엣으로 대신한다. 둘 다 없으면 빈 칸.
    const portrait = key(star.portraitKey);
    const textureKey = portrait === MISSING_TEXTURE ? key('star.silhouette') : portrait;
    this.rect(x, y, w, h, 'ash');
    if (textureKey !== MISSING_TEXTURE) {
      this.add.image(x, y, textureKey, 0).setOrigin(0, 0).setDisplaySize(w, h);
    }
    this.frame(x, y, w, h);

    // 열화 균열 — 소생 횟수만큼 세로로 간다. 진짜 오버레이는 M03.
    for (let i = 0; i < Math.min(star.reviveCount, 5); i += 1) {
      this.rect(x + 14 + i * 16, y + 16 + i * 6, 1, h - 40, 'soot');
    }

    const persona = s.personas.find((p) => p.id === star.personaId);
    this.text(x, y + h + 4, this.clip(persona?.displayName ?? '무명', w + 40), 'bone');

    // 시체가 둘 이상이면 여기서 넘긴다. 액션 바는 3택으로 꽉 찬다.
    if (count > 1) {
      new Button(this, {
        x, y: y + h + 26, w, h: 20,
        label: `다음 ${this.index + 1}/${count}`, variant: 'ghost',
        onClick: () => {
          this.index = (this.index + 1) % count;
          this.redraw();
        },
      });
    }
  }

  /* ── 시체 정보 · 목격 경고 ─────────────────────────────── */
  private buildDetail(s: Readonly<GameState>, corpse: Corpse, star: Star): number {
    const x = L.pad + 114;
    const when = s.day - corpse.diedDay === 1 ? '어제' : `${corpse.diedDay}일차`;
    this.text(x, L.stage.y + 24, `${when}, ${corpse.diedFloor}F에서 죽었습니다.`);
    this.text(x, L.stage.y + 46, `시체 상태 : ${corpse.grade === 'INTACT' ? '온전' : '훼손'}`, 'dust');
    this.text(x, L.stage.y + 64, `부활 횟수 : ${star.reviveCount}회`, 'dust');

    let y = L.stage.y + 82;
    if (star.witnessed.length > 0) {
      this.text(x, y, `그가 본 것 : ${star.witnessed.map((f) => `${f}F`).join(' ')}`, 'dust');
      y += 18;
    }

    // 경고를 띄울지 말지도 core 가 정한다 (economy.reviveQuote.witnessWarning)
    if (reviveQuote(s, corpse, star).witnessWarning) {
      y += 8;
      this.text(x, y, '이 사람은 아래에서 무언가를 봤다.', 'wax');
      this.text(x, y + 18, '되살리면 방송에서 말할 것이다.', 'wax');
      y += 36;
    }
    return y;
  }

  /* ── 비용 ──────────────────────────────────────────────── */
  private buildPrice(s: Readonly<GameState>, corpse: Corpse, star: Star, afterY: number): void {
    const quote = reviveQuote(s, corpse, star);
    const y = Math.max(afterY + 10, L.stage.y + 156);
    this.text(L.pad + 114, y, '소생 비용', 'dust');
    this.text(L.pad + 196, y, `${fmtGold(quote.cost)} G`, 'tallow');
    this.textRight(L.W - L.pad - 2, y, `보유 ${fmtGold(s.gold)} G`, 'dust');
    if (!quote.affordable) this.text(L.pad + 114, y + 18, '자금이 부족합니다', 'wax');
  }

  /* ── 3택 중 2택 — 「폐기」는 계약에 액션이 없다 (HO-003) ── */
  private buildActions(corpse: Corpse, star: Star, s: Readonly<GameState>): void {
    const quote = reviveQuote(s, corpse, star);
    const y = L.actions.y + 10;

    new Button(this, {
      x: L.pad, y, w: 168, h: 24,
      label: `되살린다 ${fmtGold(quote.cost)}G`, hotkey: '1',
      enabled: quote.affordable,
      onClick: () => this.store.dispatch({ type: 'REVIVE/PAY', starId: corpse.starId }),
    });
    new Button(this, {
      x: L.pad + 174, y, w: 108, h: 24,
      label: '그대로 둔다', hotkey: '2', variant: 'ghost',
      onClick: () => {
        this.store.dispatch({ type: 'REVIVE/SKIP', starId: corpse.starId });
        this.index += 1; // 보관하고 다음 시체를 본다. 미루면 내일 비용이 오른다.
        this.redraw();
      },
    });
    this.nextPhaseButton();
  }

  private nextPhaseButton(): void {
    new Button(this, {
      x: L.W - L.pad - 102, y: L.actions.y + 10, w: 102, h: 24,
      label: '편성실로', hotkey: '3',
      onClick: () => this.store.dispatch({ type: 'PHASE/ADVANCE' }),
    });
  }
}

function fmtGold(n: number): string {
  return n.toLocaleString('en-US');
}
