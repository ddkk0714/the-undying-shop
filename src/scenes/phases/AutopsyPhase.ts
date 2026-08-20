import { SCENES } from '../../config';
import { L, slotX } from '../../ui/layout';
import { Button } from '../../ui/Button';
import { PhaseScene } from './PhaseScene';
import type { GameState } from '../../core/types';

/**
 * M09 검시실 — 화면 골격. 2택이 이 게임의 딜레마다.
 * 봉랍 도장 연출(`ui/SealStamp.ts`)은 M09 본구현에서 붙인다.
 */
export class AutopsyPhase extends PhaseScene {
  constructor() {
    super(SCENES.PHASE_AUTOPSY);
  }

  protected build(s: Readonly<GameState>): void {
    this.stageBackdrop();
    this.heading('검시실');

    const corpse = s.corpses.find((c) => c.starId === s.today?.starId && c.diedDay === s.day) ?? s.corpses.at(-1);
    const star = s.stars.find((x) => x.id === corpse?.starId);

    if (corpse === undefined) {
      this.text(L.pad + 2, L.stage.y + 24, '검시할 시체가 없다.', 'dust');
    } else {
      this.text(L.pad + 2, L.stage.y + 24, `${star?.bodyName ?? corpse.starId} · ${corpse.diedFloor}F · ${corpse.diedDay}일차`);
      this.text(L.pad + 2, L.stage.y + 42, '판정은 공개되지 않는다.', 'dust');
    }

    const options: { title: string; body: string; grade: 'INTACT' | 'DAMAGED'; hotkey: string }[] = [
      { title: '온전', body: '그대로 소생', grade: 'INTACT', hotkey: '1' },
      { title: '훼손', body: '유품을 챙긴다', grade: 'DAMAGED', hotkey: '2' },
    ];
    options.forEach((opt, i) => {
      const x = slotX(i);
      const y = L.slot3.y + 20;
      const h = L.slot3.h - 20;
      this.rect(x, y, L.slot3.w, h, 'ash');
      this.frame(x, y, L.slot3.w, h);
      this.text(x + 8, y + 8, opt.title, opt.grade === 'INTACT' ? 'spirit' : 'wax');
      this.text(x + 8, y + 28, opt.body, 'dust');

      new Button(this, {
        x: x + 8, y: y + h - 28, w: L.slot3.w - 16, h: 22,
        label: '봉인한다', hotkey: opt.hotkey,
        variant: opt.grade === 'DAMAGED' ? 'danger' : 'default',
        enabled: corpse !== undefined,
        onClick: () => this.store.dispatch({ type: 'AUTOPSY/DECIDE', grade: opt.grade }),
      });
    });

    if (corpse === undefined) {
      new Button(this, {
        x: L.W / 2 - 66, y: L.actions.y + 10, w: 132, h: 24,
        label: '발표로', hotkey: '3',
        onClick: () => this.store.dispatch({ type: 'PHASE/ADVANCE' }),
      });
    }
  }
}
