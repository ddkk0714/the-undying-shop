import Phaser from 'phaser';
import { PALETTE, css } from '../render/palette';
import { FONT } from '../render/font';
import { firstTexture, slice } from '../render/assets';
import { playSfx } from '../audio/Sfx';
import { tooltipOf } from './Tooltip';
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
  /** 기본 클릭음을 바꾸거나 끈다. 생략하면 `sfx.click`, false 면 무음이다. */
  sound?: string | false;
  /** 팝업의 확정/취소처럼 마우스를 올려도 판을 바꾸지 않을 때 사용한다. */
  hover?: boolean;
  /**
   * 마우스를 올렸을 때 커서 우측 위에 뜨는 한 줄 설명 (사용자 확정).
   * 씬이 `createTooltip(this)` 를 해 두지 않았으면 조용히 무시된다.
   */
  tip?: string;
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
function skinKeyFor(visual: string): string {
  // 행동 종류와 무관하게 같은 실제 버튼 판을 쓴다. 위험 행동은 붉은 글자만으로
  // 구분하고, hover/press 때만 활성화 판으로 바꾼다.
  if (visual === 'hover' || visual === 'press') return 'ui.button.hover.9s';
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

    // 숫자키 조작은 유지하되, 아트 위에는 번호/한자 접두어를 덧씌우지 않는다.
    const text = opts.label;
    this.txt = scene.add
      .text(Math.round(opts.w / 2), Math.round(opts.h / 2), text, { ...FONT, color: css('bone') })
      .setOrigin(0.5);

    this.add([...(this.skin === null ? [] : [this.skin]), this.bg, this.txt]);
    scene.add.existing(this);

    this.visual = opts.enabled === false ? 'disabled' : 'idle';
    this.redraw();

    // 비활성 버튼도 이유를 설명하는 tip이 있으면 hover 판정은 받는다.
    // 클릭·핫키·눌림 상태는 계속 막아 두므로 게임 동작에는 영향을 주지 않는다.
    if (this.visual !== 'disabled' || opts.tip !== undefined) {
      this.setSize(opts.w, opts.h);
      this.setInteractive(
        new Phaser.Geom.Rectangle(opts.w / 2, opts.h / 2, opts.w, opts.h),
        Phaser.Geom.Rectangle.Contains,
      );
      this.on('pointerover', (p: Phaser.Input.Pointer) => {
        if (this.visual !== 'disabled' && opts.hover !== false) this.setVisualState('hover');
        if (opts.tip !== undefined) tooltipOf(scene)?.show(opts.tip, p.x, p.y);
      });
      this.on('pointerout', () => {
        if (this.visual !== 'disabled' && opts.hover !== false) this.setVisualState('idle');
        if (opts.tip !== undefined) tooltipOf(scene)?.hide();
      });
      this.on('pointerdown', () => {
        if (this.visual !== 'disabled') this.setVisualState('press');
      });
      this.on('pointerup', () => {
        if (this.visual === 'disabled') return;
        this.setVisualState(opts.hover === false ? 'idle' : 'hover');
        this.playClickSound();
        opts.onClick();
      });
      // 버튼이 사라질 때 툴팁이 남지 않게 한다 — 다시 그리면 버튼은 파괴되는데
      // 커서는 그 자리에 그대로 있어서 pointerout 이 오지 않는다
      this.once(Phaser.GameObjects.Events.DESTROY, () => {
        if (opts.tip !== undefined) tooltipOf(scene)?.hide();
      });

      if (opts.hotkey && this.visual !== 'disabled') {
        scene.input.keyboard?.on(`keydown-${keyCodeFor(opts.hotkey)}`, () => {
          if (this.visual === 'disabled' || !this.active) return;
          this.playClickSound();
          opts.onClick();
        });
      }
    }
  }

  private playClickSound(): void {
    if (this.opts.sound === false) return;
    playSfx(this.scene, this.opts.sound ?? 'sfx.click', 0.35);
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
      const want = skinKeyFor(this.visual);
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
      // 활성 버튼 판은 밝은 면이므로, 글자도 검정으로 뒤집어 읽힌다.
      const active = this.visual === 'hover' || this.visual === 'press';
      this.txt.setColor(
        css(this.visual === 'disabled' ? 'dust' : active ? 'ink' : variant === 'danger' ? 'wax' : 'bone'),
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
    this.txt.setColor(css(this.visual === 'hover' || this.visual === 'press' ? 'ink' : variant === 'danger' ? 'wax' : 'bone'));
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
