import Phaser from 'phaser';
import { css, type PaletteName } from '../render/palette';
import { FONT, FONT_TITLE } from '../render/font';
import { reducedMotion, speedMul } from './options';

export interface DialogueOpts {
  x: number;
  y: number;
  w: number;
  line: string;
  color?: PaletteName;
  scale?: number;
  charMs?: number;
  /** LIVE_STOCK 대사집의 연출 코드. 지원하지 않는 코드는 데이터로만 보존한다. */
  effects?: readonly string[];
  /** 전부 출력된 뒤 대사 상태를 정리한다. */
  onComplete?: () => void;
  /**
   * 한 글자 나올 때마다 부른다 — 타자 소리를 부르는 자리 (생방송 무전).
   * `silent` 연출이 붙은 줄에서는 부르는 쪽이 이걸 넘기지 않으면 된다.
   */
  onChar?: () => void;
  /**
   * 글자 크기. 기본은 대사창의 48px 이고, 생방송 무전 배너처럼 좁은 자리는 32px 을 쓴다.
   * (04-UI-KIT §3 — 16 / 32 / 48 셋뿐이다. 소수배로 줄이면 도트가 뭉갠다)
   */
  size?: 'body' | 'title';
}

/** 한 줄 타이핑 → 완료 뒤 통통 뛰는 ▼까지 한 수명으로 관리한다. */
export class Dialogue extends Phaser.GameObjects.Container {
  private readonly lineObject: Phaser.GameObjects.Text;
  private readonly arrow: Phaser.GameObjects.Text;
  private readonly chars: string[];
  private readonly opts: DialogueOpts;
  private revealEvent: Phaser.Time.TimerEvent | null = null;
  private bounce: Phaser.Tweens.Tween | null = null;
  private index = 0;

  constructor(scene: Phaser.Scene, opts: DialogueOpts) {
    super(scene, Math.round(opts.x), Math.round(opts.y));
    this.opts = opts;
    this.chars = Array.from(opts.line);
    const effects = new Set(opts.effects ?? []);
    const emphasis = effects.has('big') ? 1.6 : effects.has('bold') ? 1.3 : 1;
    // 글자는 `w` 안에서 접는다. 예전에는 한 줄로 흘려서, 부르는 쪽이 미리 잘라 넘기지
    // 않으면 상자 밖으로 삐져나갔다 (생방송 무전에서 「…·」로 잘리던 원인).
    // 접는 폭은 **확대 전** 기준이라 배율로 나눠 준다
    const zoom = (opts.scale ?? 1) * emphasis;
    const wrapPx = Math.max(64, Math.round(opts.w / zoom));
    this.lineObject = scene.add
      .text(0, 0, '', {
        ...(opts.size === 'body' ? FONT : FONT_TITLE),
        color: css(opts.color ?? 'bone'),
        wordWrap: { width: wrapPx, useAdvancedWrap: true },
        ...(effects.has('bold') ? { fontStyle: 'bold' } : {}),
      })
      .setScale(zoom);
    this.arrow = scene.add
      .text(Math.max(0, Math.round(opts.w - 48)), 12, '▼', { ...FONT, color: css('dust') })
      .setVisible(false);
    this.add([this.lineObject, this.arrow]);
    scene.add.existing(this);

    if (reducedMotion(scene.registry) || this.chars.length === 0) {
      this.lineObject.setText(opts.line);
      this.index = this.chars.length;
      this.finish(false);
      return;
    }

    const effectSpeed = effects.has('slow') ? 2 : effects.has('fast') ? 0.5 : 1;
    const delay = Math.max(16, Math.round((opts.charMs ?? 42) * effectSpeed / speedMul(scene.registry)));
    this.revealEvent = scene.time.addEvent({ delay, loop: true, callback: () => this.revealNext() });

    if (effects.has('tremble')) {
      scene.tweens.add({ targets: this.lineObject, x: 2, y: -1, duration: 45, yoyo: true, repeat: -1 });
    } else if (effects.has('shake')) {
      scene.tweens.add({ targets: this, x: this.x + 6, duration: 60, yoyo: true, repeat: 5 });
    }
  }

  private revealNext(): void {
    if (!this.active) {
      this.revealEvent?.remove(false);
      this.revealEvent = null;
      return;
    }
    this.index += 1;
    this.lineObject.setText(this.chars.slice(0, this.index).join(''));
    // 공백에서는 소리를 내지 않는다 — 띄어쓰기마다 딸깍거리면 귀에 거슬린다
    if (this.chars[this.index - 1] !== ' ') this.opts.onChar?.();
    if (this.index >= this.chars.length) this.finish(true);
  }

  private finish(animate: boolean): void {
    this.revealEvent?.remove(false);
    this.revealEvent = null;
    this.arrow.setVisible(true);
    this.opts.onComplete?.();
    if (!animate) return;
    const homeY = this.arrow.y;
    this.bounce = this.scene.tweens.add({
      targets: this.arrow,
      y: homeY - 8,
      duration: 320,
      ease: 'Quad.Out',
      yoyo: true,
      repeat: -1,
    });
  }

  override destroy(fromScene?: boolean): void {
    this.revealEvent?.remove(false);
    this.revealEvent = null;
    this.bounce?.stop();
    this.bounce = null;
    super.destroy(fromScene);
  }
}
