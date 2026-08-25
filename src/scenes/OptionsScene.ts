import Phaser from 'phaser';
import { BASE_W, BASE_H, SCENES } from '../config';
import { PALETTE, css } from '../render/palette';
import { FONT, FONT_TITLE } from '../render/font';
import { Button } from '../ui/Button';
import { panel } from '../ui/Panel';
import { reducedMotion, speedMul } from '../ui/options';
import { muted, setMuted } from '../audio/Sfx';

/**
 * 05-PRIORITY P0 #16 — 옵션(타이머 끄기, 속도).
 * 심사자가 타이머 때문에 막히면 안 된다.
 *
 * 값은 registry 에만 둔다. 게임 규칙에 반영하는 것은 core 몫이라
 * 실제 소비는 OPTION/SET 액션으로 넘긴다 (M02 §2).
 */
export class OptionsScene extends Phaser.Scene {
  private returnTo: string | null = null;

  constructor() {
    super(SCENES.OPTIONS);
  }

  init(data: { returnTo?: string }): void {
    this.returnTo = data.returnTo ?? null;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PALETTE.ink);
    panel(this, 24, 16, BASE_W - 48, BASE_H - 62, 'sunken');
    this.add.text(160, 104, '옵션', { ...FONT_TITLE, color: css('bone') });

    const reduced = reducedMotion(this.registry);
    const speed = speedMul(this.registry);

    this.add.text(160, 264, '연출 감소', { ...FONT, color: css('dust') });
    new Button(this, {
      x: 960, y: 248, w: 400, h: 96,
      label: reduced ? '켜짐' : '꺼짐', hotkey: '1',
      onClick: () => {
        this.registry.set('opt.reducedMotion', !reduced);
        this.scene.restart({ returnTo: this.returnTo ?? undefined });
      },
    });

    this.add.text(160, 416, '진행 속도', { ...FONT, color: css('dust') });
    new Button(this, {
      x: 960, y: 400, w: 400, h: 96,
      label: `x${speed}`, hotkey: '2',
      onClick: () => {
        const next = speed >= 3 ? 1 : speed + 1;
        this.registry.set('opt.speed', next);
        this.scene.restart({ returnTo: this.returnTo ?? undefined });
      },
    });

    // 소리 — 심사자가 조용히 보고 싶을 수 있다
    const off = muted(this.registry);
    this.add.text(160, 568, '소리', { ...FONT, color: css('dust') });
    new Button(this, {
      x: 960, y: 552, w: 400, h: 96,
      label: off ? '꺼짐' : '켜짐', hotkey: '3',
      onClick: () => {
        setMuted(this, !off);
        this.scene.restart({ returnTo: this.returnTo ?? undefined });
      },
    });

    this.add.text(160, 700, 'v3 에는 제한시간이 없다.', { ...FONT, color: css('dust') });
    this.add.text(160, 748, '연출 감소를 켜면 화면 흔들림·노이즈가 꺼진다.', { ...FONT, color: css('dust') });

    new Button(this, {
      x: BASE_W / 2 - 264, y: BASE_H - 136, w: 528, h: 96,
      label: '돌아가기', hotkey: '4',
      onClick: () => this.close(),
    });
    this.input.keyboard?.once('keydown-ESC', () => this.close());
  }

  private close(): void {
    if (this.returnTo === null) this.scene.start(SCENES.TITLE);
    else {
      this.scene.stop();
      this.scene.resume(this.returnTo);
    }
  }
}
