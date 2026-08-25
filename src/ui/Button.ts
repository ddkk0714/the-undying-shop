import Phaser from 'phaser';
import { PALETTE, css } from '../render/palette';
import { FONT } from '../render/font';
import { firstTexture, slice } from '../render/assets';
import { playSfx } from '../audio/Sfx';
import { L } from './layout';

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
/**
 * 상태 → 버튼 스킨 키.
 * 그 상태 전용 그림이 없으면 평상 스킨 위에 상태 테두리만 얹는다 —
 * 아트를 한 장만 줘도 hover/press/danger 가 구분된다.
 */
function skinKeyFor(visual: string, variant: ButtonVariant): string {
  // There is no final ghost skin yet. Use the final default button rather than
  // inheriting the placeholder texture, which otherwise reintroduces labeled boxes.
  if (visual === 'disabled' || variant === 'ghost') return 'ui.button.9s';
  if (variant === 'danger') return 'ui.button.danger.9s';
  if (visual === 'hover') return 'ui.button.hover.9s';
  return 'ui.button.9s';
}

export class Button extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Graphics;
  private txt: Phaser.GameObjects.Text;
  /** 본 아트 버튼이 도착하면 여기에 들어온다. 없으면 null 이고 Graphics 로 그린다 */
  private skin: Phaser.GameObjects.NineSlice | null = null;
  private readonly opts: Required<Pick<ButtonOpts, 'w' | 'h' | 'variant'>> & ButtonOpts;
  private visual: 'idle' | 'hover' | 'press' | 'disabled' = 'idle';

  constructor(scene: Phaser.Scene, opts: ButtonOpts) {
    super(scene, Math.round(opts.x), Math.round(opts.y));
    this.opts = { variant: 'default', ...opts, w: opts.w, h: opts.h };

    this.bg = scene.add.graphics();

    // 03-ASSET-MODULES §2 — 버튼 CG 가 있으면 9-slice 로 늘려 쓴다 (모서리가 뭉개지지 않는다)
    const base = firstTexture(scene, 'ui.button.9s');
    if (base !== null) {
      const [left, right, top, bottom] = slice('ui.button.9s');
      this.skin = scene.add
        .nineslice(0, 0, base, undefined, opts.w, opts.h, left, right, top, bottom)
        .setOrigin(0, 0);
    }

    const text = opts.hotkey ? `${opts.hotkey}. ${opts.label}` : opts.label;
    this.txt = scene.add
      .text(Math.round(opts.w / 2), Math.round(opts.h / 2), text, { ...FONT, color: css('bone') })
      .setOrigin(0.5);

    this.add([...(this.skin === null ? [] : [this.skin]), this.bg, this.txt]);
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
        playSfx(scene, 'sfx.click', 0.35);
        opts.onClick();
      });

      if (opts.hotkey) {
        scene.input.keyboard?.on(`keydown-${keyCodeFor(opts.hotkey)}`, () => {
          if (this.visual === 'disabled' || !this.active) return;
          playSfx(scene, 'sfx.click', 0.35);
          opts.onClick();
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

    if (this.skin !== null) {
      const want = skinKeyFor(this.visual, variant);
      const exact = firstTexture(this.scene, want);
      const tex = exact ?? firstTexture(this.scene, 'ui.button.9s');
      if (tex !== null) this.skin.setTexture(tex);

      // 이 상태 전용 그림이 없으면 테두리로만 상태를 말한다
      if (exact === null) {
        g.fillStyle(
          variant === 'danger' ? PALETTE.wax : this.visual === 'hover' ? PALETTE.bone : PALETTE.dust,
          1,
        );
        strokeRect(g, 0, 0, w, h);
      }
      this.txt.setY(Math.round(h / 2) + (this.visual === 'press' ? 2 : 0));
      this.txt.setColor(
        css(this.visual === 'disabled' ? 'dust' : variant === 'danger' ? 'wax' : this.visual === 'hover' ? 'bone' : 'bone'),
      );
      return;
    }

    if (this.visual === 'disabled') {
      g.fillStyle(PALETTE.ink, 1);
      g.fillRect(0, 0, w, h);
      g.fillStyle(PALETTE.dust, 1);
      strokeRect(g, 0, 0, w, h);
      this.txt.setColor(css('dust'));
      return;
    }

    const ghost = variant === 'ghost';
    const fill = this.visual === 'press' ? PALETTE.ink : ghost ? PALETTE.ink : PALETTE.mid;
    const border =
      variant === 'danger' ? PALETTE.wax : this.visual === 'hover' ? PALETTE.bone : PALETTE.dust;

    g.fillStyle(fill, 1);
    g.fillRect(0, 0, w, h);
    g.fillStyle(border, 1);
    strokeRect(g, 0, 0, w, h);

    // press 시 2px 내려앉는다 — 그림자 없이 눌린 느낌을 만드는 방법
    this.txt.setY(Math.round(h / 2) + (this.visual === 'press' ? 2 : 0));
    this.txt.setColor(css(this.visual === 'hover' ? 'bone' : variant === 'danger' ? 'wax' : 'bone'));
  }
}

/** 04-UI-KIT §2-2 (v3.1) — 테두리는 2px */
function strokeRect(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  const t = L.line;
  g.fillRect(x, y, w, t);
  g.fillRect(x, y + h - t, w, t);
  g.fillRect(x, y, t, h);
  g.fillRect(x + w - t, y, t, h);
}

/** '1' → 'ONE' 등 Phaser 키 이벤트 이름으로 변환 */
function keyCodeFor(hotkey: string): string {
  const digits: Record<string, string> = {
    '1': 'ONE',
    '2': 'TWO',
    '3': 'THREE',
    '4': 'FOUR',
    '5': 'FIVE',
    '6': 'SIX',
    '7': 'SEVEN',
    '8': 'EIGHT',
    '9': 'NINE',
  };
  return digits[hotkey] ?? hotkey.toUpperCase();
}
