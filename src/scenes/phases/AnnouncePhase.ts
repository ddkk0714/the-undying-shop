import { SCENES } from '../../config';
import { L, slotX } from '../../ui/layout';
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
    this.heading('발표');

    const corpse = s.corpses.find((c) => c.starId === s.today?.starId && c.diedDay === s.day) ?? s.corpses.at(-1);
    const persona = s.personas.find((p) => p.id === s.today?.personaId);

    this.text(L.pad + 2, L.stage.y + 24, `${persona?.displayName ?? '무명'} · ${corpse?.diedFloor ?? 0}F 에서 끊겼다`);
    this.text(L.pad + 2, L.stage.y + 42, '팬들은 아직 아무것도 모른다.', 'dust');

    const options: { title: string; body: string; as: 'SUCCESS' | 'FAILURE'; hotkey: string }[] = [
      { title: '성공했다', body: '무사히 돌아왔다', as: 'SUCCESS', hotkey: '1' },
      { title: '실패했다', body: '있는 그대로', as: 'FAILURE', hotkey: '2' },
    ];
    options.forEach((opt, i) => {
      const x = slotX(i);
      const y = L.slot3.y + 20;
      const h = L.slot3.h - 20;
      this.rect(x, y, L.slot3.w, h, 'ash');
      this.frame(x, y, L.slot3.w, h);
      this.text(x + 8, y + 8, opt.title, opt.as === 'SUCCESS' ? 'tallow' : 'bone');
      this.text(x + 8, y + 28, this.clip(opt.body, L.slot3.w - 16), 'dust');

      new Button(this, {
        x: x + 8, y: y + h - 28, w: L.slot3.w - 16, h: 22,
        label: '공표한다', hotkey: opt.hotkey,
        variant: opt.as === 'SUCCESS' ? 'danger' : 'default',
        onClick: () => this.store.dispatch({ type: 'ANNOUNCE/DECLARE', as: opt.as }),
      });
    });

    this.text(L.pad + 2, L.actions.y + 16, `유출도는 수치로 보이지 않는다 · 거짓 공표 ${s.stats.falseAnnouncements}회`, 'dust');
  }
}
