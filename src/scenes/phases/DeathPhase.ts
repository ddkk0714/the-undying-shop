import { SCENES } from '../../config';
import { content } from '../../core/content';
import { L } from '../../ui/layout';
import { Button } from '../../ui/Button';
import { PhaseScene } from './PhaseScene';
import type { GameState } from '../../core/types';

/**
 * M08 사망 — 화면 골격.
 * 노이즈·기록 갱신 연출(`ui/Noise.ts`, RECORD_BREAK)은 M08 본구현에서 붙인다.
 */
export class DeathPhase extends PhaseScene {
  constructor() {
    super(SCENES.PHASE_DEATH);
  }

  protected build(s: Readonly<GameState>): void {
    this.stageBackdrop();
    this.heading('신호 두절', 'wax');

    const run = s.today;
    const star = s.stars.find((x) => x.id === run?.starId);
    const persona = s.personas.find((p) => p.id === run?.personaId);
    const floor = run?.diedFloor ?? run?.currentFloor ?? 0;

    // 지지직 — 가로줄 디더. 8프레임 애니메이션은 M08 에서.
    for (let i = 0; i < 6; i += 1) {
      this.rect(L.pad, L.stage.y + 30 + i * 7, L.W - L.pad * 2, 1, i % 2 === 0 ? 'line' : 'ash');
    }

    this.text(L.pad + 2, L.stage.y + 84, `${persona?.displayName ?? '무명'} · ${star?.bodyName ?? '-'}`);
    this.text(L.pad + 2, L.stage.y + 104, `${floor}F 에서 끊겼다`, 'wax');
    this.text(L.pad + 2, L.stage.y + 124, run?.deathCause ?? '원인 불명', 'dust');

    const record = floor >= s.maxFloor;
    this.text(L.pad + 2, L.stage.y + 150, `최고 기록 ${s.maxFloor} / ${content.balance.start.targetFloor}F`, record ? 'tallow' : 'dust');
    if (record) this.text(L.pad + 2, L.stage.y + 170, '기록 갱신', 'tallow');

    new Button(this, {
      x: L.W / 2 - 66, y: L.actions.y + 10, w: 132, h: 24,
      label: '검시실로', hotkey: '1',
      onClick: () => this.store.dispatch({ type: 'PHASE/ADVANCE' }),
    });
  }
}
