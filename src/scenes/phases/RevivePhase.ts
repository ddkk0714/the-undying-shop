import { SCENES } from '../../config';
import { L } from '../../ui/layout';
import { Button } from '../../ui/Button';
import { PhaseScene } from './PhaseScene';
import type { GameState } from '../../core/types';

/**
 * M04 소생실 — 화면 골격.
 * 비용 산식은 `core/systems/economy.ts` (Codex) 몫이라 아직 금액을 표시하지 않는다.
 * 색은 `spirit` 이 허용되는 유일한 화면이다 (04-UI-KIT §3).
 */
export class RevivePhase extends PhaseScene {
  constructor() {
    super(SCENES.PHASE_REVIVE);
  }

  protected build(s: Readonly<GameState>): void {
    this.stageBackdrop();
    this.heading('소생실', 'spirit');

    // 소생 대상 = 아직 살아 있지 않은 몸의 시체. 누구를 살릴 수 있는지 판정은 리듀서가 한다.
    const waiting = s.corpses.filter((c) =>
      s.stars.some((st) => st.id === c.starId && (st.status === 'DEAD' || st.status === 'HIDDEN')),
    );
    this.textRight(L.W - L.pad - 2, L.stage.y + L.pad, `대기 ${waiting.length}구`, 'dust');

    if (waiting.length === 0) {
      this.text(L.pad + 2, L.stage.y + 40, '소생 수조가 비어 있다.', 'dust');
      this.text(L.pad + 2, L.stage.y + 58, '오늘은 아무도 되살릴 것이 없다.', 'dust');
    }

    waiting.slice(0, 3).forEach((corpse, i) => {
      const y = L.stage.y + 34 + i * 38;
      const star = s.stars.find((st) => st.id === corpse.starId);
      this.rect(L.pad, y, L.W - L.pad * 2, 32, 'ash');
      this.frame(L.pad, y, L.W - L.pad * 2, 32);
      this.text(L.pad + 6, y + 8, `${star?.bodyName ?? corpse.starId} · ${corpse.diedFloor}F`);
      this.text(L.pad + 150, y + 8, corpse.grade === 'INTACT' ? '온전' : '훼손', corpse.grade === 'INTACT' ? 'spirit' : 'wax');
      this.text(L.pad + 200, y + 8, `소생 ${star?.reviveCount ?? 0}회`, 'dust');

      new Button(this, {
        x: L.W - L.pad - 152, y: y + 6, w: 72, h: 20,
        label: '살린다',
        onClick: () => this.store.dispatch({ type: 'REVIVE/PAY', starId: corpse.starId }),
      });
      new Button(this, {
        x: L.W - L.pad - 76, y: y + 6, w: 70, h: 20,
        label: '보낸다', variant: 'ghost',
        onClick: () => this.store.dispatch({ type: 'REVIVE/SKIP', starId: corpse.starId }),
      });
    });

    new Button(this, {
      x: L.W / 2 - 66, y: L.actions.y + 10, w: 132, h: 24,
      label: '편성실로', hotkey: '1',
      onClick: () => this.store.dispatch({ type: 'PHASE/ADVANCE' }),
    });
  }
}
