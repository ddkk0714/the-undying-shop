import { SCENES } from '../../config';
import { L } from '../../ui/layout';
import { Button } from '../../ui/Button';
import { PhaseScene } from './PhaseScene';
import type { GameState } from '../../core/types';

/**
 * M09 발표 — 화면 골격. 진실과 다르게 말할 수 있다는 것이 이 게임의 주제다.
 */
export class AnnouncePhase extends PhaseScene {
  constructor() {
    super(SCENES.PHASE_ANNOUNCE);
  }

  protected build(s: Readonly<GameState>): void {
    this.stageBackdrop();
    this.spriteCover(L.stage, ['bg.studio']);
    this.heading('발표');

    const corpse = s.corpses.find((c) => c.starId === s.today?.starId && c.diedDay === s.day) ?? s.corpses.at(-1);
    const persona = s.personas.find((p) => p.id === s.today?.personaId);

    const ox = L.pad * 4;
    this.text(ox, L.stage.y + 120, `${persona?.displayName ?? '무명'} · ${corpse?.diedFloor ?? 0}F 에서 끊겼다`);
    this.text(ox, L.stage.y + 168, '팬들은 아직 아무것도 모른다.', 'dust');

    const cardW = 560;
    const cardH = 360;
    const cardY = L.stage.y + 260;
    const options: { title: string; body: string; as: 'SUCCESS' | 'FAILURE'; hotkey: string }[] = [
      { title: '성공했다', body: '무사히 돌아왔다', as: 'SUCCESS', hotkey: '1' },
      { title: '실패했다', body: '있는 그대로', as: 'FAILURE', hotkey: '2' },
    ];
    options.forEach((opt, i) => {
      const x = 240 + i * (cardW + 80);
      this.rect(x, cardY, cardW, cardH, 'ink');
      this.frame(x, cardY, cardW, cardH, opt.as === 'SUCCESS' ? 'wax' : 'bone');
      this.title(x + L.pad * 2, cardY + L.pad * 2, opt.title, opt.as === 'SUCCESS' ? 'wax' : 'bone');
      this.text(x + L.pad * 2, cardY + 120, opt.body, 'dust');

      new Button(this, {
        x: x + L.pad * 2, y: cardY + cardH - 112, w: cardW - L.pad * 4, h: 88,
        label: '공표한다', hotkey: opt.hotkey,
        variant: opt.as === 'SUCCESS' ? 'danger' : 'default',
        onClick: () => this.store.dispatch({ type: 'ANNOUNCE/DECLARE', as: opt.as }),
      });
    });

    this.text(ox, L.actionsFull.y + 48, `유출도는 수치로 보이지 않는다 · 거짓 공표 ${s.stats.falseAnnouncements}회`, 'dust');
  }
}
