import Phaser from 'phaser';
import { BASE_W, BASE_H, SCENES } from '../config';
import { PALETTE, css } from '../render/palette';
import { FONT } from '../render/font';
import { Button } from '../ui/Button';
import { panel } from '../ui/Panel';

/**
 * 05-PRIORITY P0 #16 — 옵션(타이머 끄기, 속도).
 * 심사자가 타이머 때문에 막히면 안 된다.
 *
 * 값은 registry 에만 둔다. 게임 규칙에 반영하는 것은 core 몫이라
 * 실제 소비는 OPTION/SET 액션으로 넘긴다 (M02 §2).
 */
export const OPTION_DEFAULTS = { softTimer: true, speed: 1 } as const;

export class OptionsScene extends Phaser.Scene {
  constructor() {
    super(SCENES.OPTIONS);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PALETTE.soot);
    panel(this, 24, 16, BASE_W - 48, BASE_H - 62, 'sunken');
    this.add.text(40, 26, '옵션', { ...FONT, color: css('bone') });

    const timerOn = (this.registry.get('opt.softTimer') as boolean | undefined) ?? OPTION_DEFAULTS.softTimer;
    const speed = (this.registry.get('opt.speed') as number | undefined) ?? OPTION_DEFAULTS.speed;

    this.add.text(40, 66, '소프트 타이머', { ...FONT, color: css('dust') });
    new Button(this, {
      x: 240, y: 62, w: 100, h: 24,
      label: timerOn ? '켜짐' : '꺼짐', hotkey: '1',
      onClick: () => {
        this.registry.set('opt.softTimer', !timerOn);
        this.scene.restart();
      },
    });

    this.add.text(40, 104, '진행 속도', { ...FONT, color: css('dust') });
    new Button(this, {
      x: 240, y: 100, w: 100, h: 24,
      label: `x${speed}`, hotkey: '2',
      onClick: () => {
        const next = speed >= 3 ? 1 : speed + 1;
        this.registry.set('opt.speed', next);
        this.scene.restart();
      },
    });

    this.add.text(40, 146, '타이머를 끄면 시간 제한 없이', { ...FONT, color: css('dust') });
    this.add.text(40, 166, '원하는 만큼 보고 고를 수 있다.', { ...FONT, color: css('dust') });

    new Button(this, {
      x: BASE_W / 2 - 66, y: BASE_H - 34, w: 132, h: 24,
      label: '돌아가기', hotkey: '3',
      onClick: () => this.scene.start(SCENES.TITLE),
    });
    this.input.keyboard?.once('keydown-ESC', () => this.scene.start(SCENES.TITLE));
  }
}
