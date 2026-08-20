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
    for (let i = 0; i < 8; i += 1) {
      this.rect(L.pad, L.stage.y + 120 + i * 28, L.W - L.pad * 2, L.line, i % 2 === 0 ? 'dust' : 'mid');
    }

    const ox = L.pad * 4;
    let oy = L.stage.y + 400;
    this.title(ox, oy, `${persona?.displayName ?? '무명'} · ${star?.bodyName ?? '-'}`);
    oy += 88;
    this.title(ox, oy, `${floor}F 에서 끊겼다`, 'wax');
    oy += 80;
    this.text(ox, oy, run?.deathCause ?? '원인 불명', 'dust');

    const record = floor >= s.maxFloor;
    oy += 80;
    this.text(ox, oy, `최고 기록 ${s.maxFloor} / ${content.balance.start.targetFloor}F`, record ? 'bone' : 'dust');
    if (record) this.title(ox, oy + 48, '기록 갱신', 'wax');

    new Button(this, {
      x: L.W / 2 - 264, y: L.actionsFull.y + L.pad, w: 528, h: 96,
      label: '검시실로', hotkey: '1',
      onClick: () => this.store.dispatch({ type: 'PHASE/ADVANCE' }),
    });
  }
}
