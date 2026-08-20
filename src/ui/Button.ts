import Phaser from 'phaser';
import { PALETTE, css } from '../render/palette';
import { FONT } from '../render/font';

export type ButtonVariant = 'default' | 'danger' | 'ghost';

export interface ButtonOpts {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  variant?: ButtonVariant;
  onClick: () => void;
  /** 숫자 핫키 — 모든 주요 선택지에 붙인다 (04-UI-KIT §2-1, 심사자 조작 편의) */
  hotkey?: string;
  enabled?: boolean;
}

/**
 * 04-UI-KIT §2-1.
 * 라운딩 0 · 1px 하드 엣지 · hover/press/disabled 3상태.
 */
export class Button extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Graphics;
  private txt: Phaser.GameObjects.Text;
  private readonly opts: Required<Pick<ButtonOpts, 'w' | 'h' | 'variant'>> & ButtonOpts;
  private visual: 'idle' | 'hover' | 'press' | 'disabled' = 'idle';

  constructor(scene: Phaser.Scene, opts: ButtonOpts) {
    super(scene, Math.round(opts.x), Math.round(opts.y));
    this.opts = { variant: 'default', ...opts, w: opts.w, h: opts.h };

    this.bg = scene.add.graphics();
    const text = opts.hotkey ? `${opts.hotkey}. ${opts.label}` : opts.label;
    this.txt = scene.add
      .text(Math.round(opts.w / 2), Math.round(opts.h / 2), text, { ...FONT, color: css('bone') })
      .setOrigin(0.5);

    this.add([this.bg, this.txt]);
    scene.add.existing(this);

    this.visual = opts.enabled === false ? 'disabled' : 'idle';
    this.redraw();

    if (this.visual !== 'disabled') {
      this.setSize(opts.w, opts.h);
      this.setInteractive(
        new Phaser.Geom.Rectangle(opts.w / 2, opts.h / 2, opts.w, opts.h),
        Phaser.Geom.Rectangle.Contains,
      );
      this.on('pointerover', () => this.setVisualState('hover'));
      this.on('pointerout', () => this.setVisualState('idle'));
      this.on('pointerdown', () => this.setVisualState('press'));
      this.on('pointerup', () => {
        this.setVisualState('hover');
        opts.onClick();
      });

      if (opts.hotkey) {
        scene.input.keyboard?.on(`keydown-${keyCodeFor(opts.hotkey)}`, () => {
          if (this.visual !== 'disabled' && this.active) opts.onClick();
        });
      }
    }
  }

  private setVisualState(s: 'idle' | 'hover' | 'press'): void {
    if (this.visual === 'disabled') return;
    this.visual = s;
    this.redraw();
  }

  private redraw(): void {
    const { w, h, variant } = this.opts;
    const g = this.bg;
    g.clear();

    if (this.visual === 'disabled') {
      g.fillStyle(PALETTE.ash, 1);
      g.fillRect(0, 0, w, h);
      g.fillStyle(PALETTE.line, 1);
      strokeRect(g, 0, 0, w, h);
      this.txt.setColor(css('dust'));
      return;
    }

    const ghost = variant === 'ghost';
    const fill = this.visual === 'press' ? PALETTE.ash : ghost ? PALETTE.soot : PALETTE.clay;
    const border =
      variant === 'danger' ? PALETTE.wax : this.visual === 'hover' ? PALETTE.bone : PALETTE.line;

    g.fillStyle(fill, 1);
    g.fillRect(0, 0, w, h);
    g.fillStyle(border, 1);
    strokeRect(g, 0, 0, w, h);

    // press 시 1px 내려앉는다 — 그림자 없이 눌린 느낌을 만드는 방법
    this.txt.setY(Math.round(h / 2) + (this.visual === 'press' ? 1 : 0));
    this.txt.setColor(css(this.visual === 'hover' ? 'bone' : variant === 'danger' ? 'wax' : 'bone'));
  }
}

function strokeRect(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  g.fillRect(x, y, w, 1);
  g.fillRect(x, y + h - 1, w, 1);
  g.fillRect(x, y, 1, h);
  g.fillRect(x + w - 1, y, 1, h);
}

/** '1' → 'ONE' 등 Phaser 키 이벤트 이름으로 변환 */
function keyCodeFor(hotkey: string): string {
  const digits: Record<string, string> = {
    '1': 'ONE',
    '2': 'TWO',
    '3': 'THREE',
    '4': 'FOUR',
    '5': 'FIVE',
  };
  return digits[hotkey] ?? hotkey.toUpperCase();
}
