import { SCENES } from '../../config';
import { L } from '../../ui/layout';
import { Button } from '../../ui/Button';
import { PhaseScene } from './PhaseScene';
import type { DayScene } from '../DayScene';
import type { GameState } from '../../core/types';

/**
 * 하루 종료 · 다음 날 시작 (사용자 확정).
 *
 * 검시실·발표 창을 뺀 자리에 넣는다. `DayScene` 이 정산(DEATH) 다음의
 * AUTOPSY/ANNOUNCE 를 화면 없이 기본값으로 자동 통과시킨 뒤, 실제로는 이미
 * 다음 날(REVIVE)에 가 있는 상태를 이 화면이 붙잡아 둔다 — 그래서 여기서
 * dispatch 할 게 없다. 「다음 날 시작」은 `DayScene.advanceFromDayEnd()` 를
 * 불러 화면만 넘긴다.
 *
 * 신문(정보 얻기)은 아직 아트가 없다 — 자리만 잡아 둔다.
 */
export class DayEndPhase extends PhaseScene {
  constructor() {
    super(SCENES.PHASE_DAYEND);
  }

  protected build(s: Readonly<GameState>): void {
    this.stageBackdrop();
    this.heading('하루 종료');

    const prevDay = Math.max(1, s.day - 1);
    this.text(L.pad, L.stage.y + L.pad + 64, `${prevDay}일차가 끝났다 · ${s.day}일차를 시작한다`, 'dust');

    // 신문 — 정보를 얻는 자리. 아트가 오기 전까지는 자리만 잡아 둔다
    const paper = { x: L.pad, y: L.stage.y + 180, w: L.W - L.pad * 2, h: 560 };
    this.rect(paper.x, paper.y, paper.w, paper.h, 'mid');
    this.frame(paper.x, paper.y, paper.w, paper.h, 'bone');
    this.title(paper.x + L.pad * 2, paper.y + L.pad * 2, '신문', 'bone');
    this.text(paper.x + L.pad * 2, paper.y + 96, '아트 추가 예정', 'dust');

    new Button(this, {
      x: L.W / 2 - 264, y: L.actionsFull.y + L.pad, w: 528, h: 96,
      label: '다음 날 시작', hotkey: '1',
      onClick: () => (this.scene.get(SCENES.DAY) as DayScene).advanceFromDayEnd(),
    });
  }
}
