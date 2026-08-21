import { SCENES } from '../../config';
import { L } from '../../ui/layout';
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
    this.spriteCover(L.stage, ['bg.autopsy']);
    this.heading('검시실');

    const corpse = s.corpses.find((c) => c.starId === s.today?.starId && c.diedDay === s.day) ?? s.corpses.at(-1);
    const star = s.stars.find((x) => x.id === corpse?.starId);

    const ox = L.pad * 4;
    if (corpse === undefined) {
      this.text(ox, L.stage.y + 120, '검시할 시체가 없다.', 'dust');
    } else {
      this.text(ox, L.stage.y + 120, `${star?.bodyName ?? corpse.starId} · ${corpse.diedFloor}F · ${corpse.diedDay}일차`);
      this.text(ox, L.stage.y + 168, '판정은 공개되지 않는다.', 'dust');
    }

    // 2택 카드 — 화면 중앙에 나란히
    const cardW = 560;
    const cardH = 360;
    const cardY = L.stage.y + 260;
    const options: { title: string; body: string; grade: 'INTACT' | 'DAMAGED'; hotkey: string }[] = [
      { title: '온전', body: '그대로 소생시킨다', grade: 'INTACT', hotkey: '1' },
      { title: '훼손', body: '유품을 챙긴다', grade: 'DAMAGED', hotkey: '2' },
    ];
    options.forEach((opt, i) => {
      const x = 240 + i * (cardW + 80);
      this.rect(x, cardY, cardW, cardH, 'ink');
      this.frame(x, cardY, cardW, cardH, opt.grade === 'DAMAGED' ? 'wax' : 'bone');
      this.title(x + L.pad * 2, cardY + L.pad * 2, opt.title, opt.grade === 'DAMAGED' ? 'wax' : 'bone');
      this.text(x + L.pad * 2, cardY + 120, opt.body, 'dust');

      new Button(this, {
        x: x + L.pad * 2, y: cardY + cardH - 112, w: cardW - L.pad * 4, h: 88,
        label: '봉인한다', hotkey: opt.hotkey,
        variant: opt.grade === 'DAMAGED' ? 'danger' : 'default',
        enabled: corpse !== undefined,
        onClick: () => this.store.dispatch({ type: 'AUTOPSY/DECIDE', grade: opt.grade }),
      });
    });

    if (corpse === undefined) {
      new Button(this, {
        x: L.W / 2 - 264, y: L.actionsFull.y + L.pad, w: 528, h: 96,
        label: '발표로', hotkey: '3',
        onClick: () => this.store.dispatch({ type: 'PHASE/ADVANCE' }),
      });
    }
  }
}
