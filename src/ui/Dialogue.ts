import Phaser from 'phaser';
import { BASE_W, BASE_H } from '../config';
import { PALETTE, css, type PaletteName } from '../render/palette';
import { FONT, FONT_TITLE } from '../render/font';
import { playSfx } from '../audio/Sfx';
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
   * 타자음. 글자 하나에 「띡」 하나가 난다 — 원본의 반복을 `tools/cut-sfx.mjs` 로
   * 한 방만 잘라 뒀다. 넘기지 않으면 소리가 없다 (`silent` 연출이면 넘겨도 안 난다).
   */
  voice?: 'male' | 'female';
  /**
   * 글자 크기. 기본은 대사창의 48px 이고, 생방송 무전 배너처럼 좁은 자리는 32px 을 쓴다.
   * (04-UI-KIT §3 — 16 / 32 / 48 셋뿐이다. 소수배로 줄이면 도트가 뭉갠다)
   */
  size?: 'body' | 'title';
}

/** 말줄임 뒤에서 한 번 끊는 시간 */
const ELLIPSIS_PAUSE_MS = 300;
/** 「pause」 — 말하기 전에 뜸을 들이는 시간 */
const PAUSE_MS = 520;
/** 「blackout」 — 화면이 꺼져 있는 시간 */
const BLACKOUT_MS = 260;
/** 타자음 크기. 글자마다 나므로 작게 */
const VOICE_VOLUME = 0.05;

/** 한 줄 타이핑 → 완료 뒤 통통 뛰는 ▼까지 한 수명으로 관리한다. */
export class Dialogue extends Phaser.GameObjects.Container {
  private readonly lineObject: Phaser.GameObjects.Text;
  private readonly arrow: Phaser.GameObjects.Text;
  private readonly chars: string[];
  private readonly opts: DialogueOpts;
  private revealEvent: Phaser.Time.TimerEvent | null = null;
  private bounce: Phaser.Tweens.Tween | null = null;
  private index = 0;
  /** 글자 하나 사이의 기본 간격 (ms) */
  private charDelay = 42;
  /** 글자마다 낼 타자음. `silent` 이거나 `voice` 를 안 넘기면 null */
  private voiceKey: string | null = null;

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
    this.charDelay = Math.max(16, Math.round((opts.charMs ?? 42) * effectSpeed / speedMul(scene.registry)));
    // 「silent」 — 속으로 하는 말이다. 타자 소리를 내지 않는다
    this.voiceKey = effects.has('silent') || opts.voice === undefined
      ? null
      : `sfx.text.${opts.voice}`;

    // 「blackout」 — 말하기 전에 화면이 한 번 꺼진다
    if (effects.has('blackout') && !reducedMotion(scene.registry)) this.blackout();
    // 「pause」 — 한 박자 뜸을 들이고 말한다
    // 고정 간격 루프가 아니라 **글자마다 다시 잡는다** — 말줄임 뒤에서 한 번 끊기 위해서다
    const lead = effects.has('pause') && !reducedMotion(scene.registry) ? PAUSE_MS : 0;
    this.revealEvent = scene.time.delayedCall(this.charDelay + lead, () => this.revealNext());

    if (effects.has('tremble')) {
      scene.tweens.add({ targets: this.lineObject, x: 2, y: -1, duration: 45, yoyo: true, repeat: -1 });
    } else if (effects.has('shake')) {
      scene.tweens.add({ targets: this, x: this.x + 6, duration: 60, yoyo: true, repeat: 5 });
    }
  }

  /** 말줄임인가 — 대사집이 「…」과 「..」을 섞어 쓴다 */
  private static isDot(ch: string | undefined): boolean {
    return ch === '…' || ch === '.';
  }

  /**
   * 다음 글자를 언제 낼지 잡는다.
   * **말줄임이 끝나는 자리에서 한 번 쉰다** (사용자 확정) — 「……옵니다」가
   * 「……」에서 한 박자 끊기고 「옵니다」가 나온다. 뜸 들이는 말투가 그렇게 읽힌다.
   */
  private scheduleNext(): void {
    const justTyped = this.chars[this.index - 1];
    const next = this.chars[this.index];
    let run = 0;
    for (let i = this.index - 1; i >= 0 && Dialogue.isDot(this.chars[i]); i -= 1) run += 1;
    // **문장 끝 마침표 하나로는 쉬지 않는다** — 그러면 모든 문장이 뚝뚝 끊긴다.
    // 「…」 한 글자이거나 점이 둘 이상 이어졌을 때만 말줄임으로 본다
    const isEllipsis = run > 0 && !Dialogue.isDot(next) && (justTyped === '…' || run >= 2);
    const wait = this.charDelay + (isEllipsis ? ELLIPSIS_PAUSE_MS : 0);
    this.revealEvent = this.scene.time.delayedCall(wait, () => this.revealNext());
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
    if (this.voiceKey !== null && this.chars[this.index - 1] !== ' ') {
      playSfx(this.scene, this.voiceKey, VOICE_VOLUME);
    }
    if (this.index >= this.chars.length) this.finish(true);
    else this.scheduleNext();
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

  /**
   * 「blackout」 — 화면 전체가 잠깐 꺼졌다 돌아온다. 페이드가 아니라 뚝 끊는다.
   * 대사 상자보다 위에 깔되(depth) 대사 자체는 그 위로 올린다
   */
  private blackout(): void {
    const cover = this.scene.add
      .rectangle(0, 0, BASE_W, BASE_H, PALETTE.ink)
      .setOrigin(0, 0)
      .setDepth(900);
    this.setDepth(901);
    this.scene.time.delayedCall(BLACKOUT_MS, () => cover.destroy());
  }

  override destroy(fromScene?: boolean): void {
    this.revealEvent?.remove(false);
    this.revealEvent = null;
    this.bounce?.stop();
    this.bounce = null;
    super.destroy(fromScene);
  }
}
