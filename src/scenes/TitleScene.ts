import Phaser from 'phaser';
import { BASE_W, BASE_H, SCENES } from '../config';
import { PALETTE, css } from '../render/palette';
import { FONT, FONT_TITLE } from '../render/font';
import { Button } from '../ui/Button';
import { key as assetKey, hasTexture, isFinalArt } from '../render/assets';
import { scrimTexture, SCRIM_TILE } from '../render/scrim';
import { reducedMotion } from '../ui/options';
import { hasSavedRun, loadRun, newRun } from './run';

const LAMP_KEYS = ['bg.title.lamp1', 'bg.title.lamp2', 'bg.title.lamp3', 'bg.title.lamp4'] as const;

const LAMP_CYCLE: ReadonlyArray<readonly [number, number]> = [
  [0, 1500], [1, 110], [0, 780], [1, 80], [2, 60], [1, 90],
  [0, 1800], [1, 100], [2, 70], [3, 50], [2, 90], [1, 110],
  [0, 1200], [1, 80], [2, 60], [3, 50], [4, 40], [3, 70], [1, 130],
];
/** 창의 불빛 4단 — 밝은 쪽부터. `bg.title` 자체가 가장 밝은 상태다 */

/**
 * 램프 깜빡임 순서 — `[프레임, 머무는 ms]`.
 * 0 은 배경 원본(가장 밝음), 1~4 는 어두워지는 단계다.
 *
 * 일정한 간격으로 돌리면 네온사인처럼 보인다. 기름 램프는 **대체로 밝게 타다가
 * 이따금 훅 꺼질 듯 흔들린다.** 그래서 0~1 에 오래 머물고, 3~4 는 짧게 스치기만 한다.
 */

/**
 * M01 §6 — 타이틀.
 *
 *         죽 지  않 는  가 게
 *         THE UNDYING SHOP
 *
 *      [ 새로 시작 ]   [ 이어하기 ]
 *      [ 옵션 ]        [ 조작 안내 ]
 *
 *   당신은 한 세계를 속이고 있다.
 */
export class TitleScene extends Phaser.Scene {
  constructor() {
    super(SCENES.TITLE);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PALETTE.ink);

    // 배경: 밤의 가게 앞 1컷.
    //
    // 알파를 먹이지 않는다. 1비트 디더 그림에 반투명을 걸면 ink 와 bone 이 섞여
    // 팔레트에 없는 회색이 생긴다 — 글자 가독성은 아래 scrim 으로 따로 만든다.
    const bg = hasTexture(this, 'bg.title')
      ? this.add.image(0, 0, assetKey('bg.title')).setOrigin(0).setDisplaySize(BASE_W, BASE_H)
      : null;

    if (bg !== null && isFinalArt('bg.title')) {
      // 그림을 한 겹 솎아 뒤로 물린다 (ink 25%). 알파를 낮추는 것과 보이는 결과는
      // 비슷하지만 색이 두 개 그대로다 — 그림은 죽고 글자는 산다.
      this.add
        .tileSprite(0, 0, BASE_W, BASE_H, scrimTexture(this, 1))
        .setOrigin(0, 0);
      this.lampFlicker(bg);
    } else {
      // 본 아트가 없을 때만 — 절차적 촛불이 이 화면의 유일한 불빛이다.
      // 그림이 들어오면 그 안에 이미 창의 불빛이 있으므로 덧그리지 않는다.
      this.candleFlicker();
    }

    // 제목 — 로고 아트가 오면 글자 대신 그것을 건다
    // Preserve the painted storefront: title occupies the empty upper wall.
    this.veil(500, 72, 920, 280);
    // 로고는 **본 아트일 때만** 건다. 플레이스홀더 로고는 테두리 친 상자라서
    // 배경 그림 위에 얹으면 하늘을 가리는 흰 판이 된다 — 그럴 바엔 글자가 낫다.
    if (isFinalArt('ui.logo') && hasTexture(this, 'ui.logo')) {
      this.add.image(BASE_W / 2, 156, assetKey('ui.logo')).setOrigin(0.5);
    } else {
      // 자간을 벌려 간판처럼
      this.add
        .text(BASE_W / 2, 208, '죽 지  않 는  가 게', { ...FONT_TITLE, color: css('bone') })
        .setOrigin(0.5);
      this.add
        .text(BASE_W / 2, 296, 'THE UNDYING SHOP', { ...FONT, color: css('dust') })
        .setOrigin(0.5);
    }

    // 버튼 2×2
    const bw = 528;
    const bh = 96;
    const gap = 48;
    // Keep the centre counter clear; actions use the two open lower-side bays.
    const left = 120;
    const right = BASE_W - 120 - bw;
    // 464 였다. 본 아트가 들어오면서 80px 올렸다 — 그 자리가 정확히 진열창이고,
    // 창의 불빛은 이 그림에서 유일하게 움직이는 것이다. 버튼으로 덮으면 깜빡임이 사라진다.
    const top = 656;

    // 버튼 판 아래를 깔아 둔다. 버튼 자체는 불투명하지만 두 열 사이 48px 틈으로
    // 배경이 그대로 새어 나와 밝은 세로줄처럼 보인다.
    this.veil(left - 24, top - 24, bw + 48, bh * 2 + gap + 48);
    this.veil(right - 24, top - 24, bw + 48, bh * 2 + gap + 48);

    new Button(this, {
      x: left, y: top, w: bw, h: bh,
      label: '새로 시작', hotkey: '1',
      onClick: () => this.startNewGame(),
    });
    new Button(this, {
      x: right, y: top, w: bw, h: bh,
      label: '이어하기', hotkey: '2',
      enabled: hasSavedRun(),
      onClick: () => this.continueGame(),
    });
    new Button(this, {
      x: left, y: top + bh + gap, w: bw, h: bh,
      label: '옵션', hotkey: '3', variant: 'ghost',
      onClick: () => this.scene.start(SCENES.OPTIONS),
    });
    new Button(this, {
      x: right, y: top + bh + gap, w: bw, h: bh,
      label: '조작 안내', hotkey: '4', variant: 'ghost',
      onClick: () => this.scene.start(SCENES.HELP),
    });

    // 이 한 줄은 보도 위에 앉는다 — 거기가 그림에서 가장 밝은 자리다
    this.veil(640, 984, 640, 72);
    this.add
      .text(BASE_W / 2, 1016, '당신은 한 세계를 속이고 있다.', { ...FONT, color: css('bone') })
      .setOrigin(0.5);

    // 폰트 폴백 여부를 화면에 남긴다 (수용 기준 4 확인용)
    if (this.registry.get('fontOk') !== true) {
      this.add
        .text(BASE_W / 2, BASE_H - 56, '폰트 폴백 모드 (monospace)', { ...FONT, color: css('bone') })
        .setOrigin(0.5);
    }
  }

  /**
   * 글이 앉는 자리를 어둡게 깐다 — ink 픽셀을 Bayer 순서로 솎아 찍는다.
   * 반투명 사각형이 아니다. 반투명은 1비트 그림 위에서 팔레트에 없는 회색을 만든다.
   * 가운데는 ink 로 꽉 채우고 위아래로 75% → 50% → 25% 로 옅어지며 그림에 이어 붙는다.
   */
  private veil(x: number, y: number, w: number, h: number): void {
    const band = 16;
    const weights = [3, 2, 1] as const;
    const edge = band * weights.length;
    const core = Math.max(0, h - edge * 2);

    const lay = (px: number, py: number, pw: number, ph: number, weight: 1 | 2 | 3): void => {
      if (pw <= 0 || ph <= 0) return;
      this.add
        .tileSprite(px, py, pw, ph, scrimTexture(this, weight))
        .setOrigin(0, 0)
        .setTilePosition(px % SCRIM_TILE, py % SCRIM_TILE);
    };

    this.add.rectangle(x, y + edge, w, core, PALETTE.ink).setOrigin(0, 0);
    weights.forEach((weight, i) => {
      lay(x, y + edge - band * (i + 1), w, band, weight);
      lay(x, y + edge + core + band * i, w, band, weight);
    });
  }

  /**
   * 창의 불빛 깜빡임 — 배경 텍스처를 밝기 5단 사이에서 갈아 끼운다.
   * 4장이 **전부** 있을 때만 켠다. 한 장이라도 없으면 깜빡이지 않는 그림 그대로가 정답이다.
   */
  private lampFlicker(bg: Phaser.GameObjects.Image): void {
    if (reducedMotion(this.registry)) return;
    if (!LAMP_KEYS.every((k) => hasTexture(this, k))) return;

    const frames = [assetKey('bg.title'), ...LAMP_KEYS.map((k) => assetKey(k))];
    let step = 0;
    const advance = (): void => {
      const [frame, hold] = LAMP_CYCLE[step % LAMP_CYCLE.length] ?? [0, 1000];
      bg.setTexture(frames[frame] ?? frames[0]!);
      step += 1;
      this.time.delayedCall(hold, advance);
    };
    advance();
  }

  /** 본 아트가 없을 때의 촛불 2프레임 루프 — tallow 점 하나의 밝기만 바꾼다 */
  private candleFlicker(): void {
    const candle = this.add.graphics();
    let lit = true;
    const paint = (): void => {
      candle.clear();
      candle.fillStyle(PALETTE.bone, lit ? 1 : 0.45);
      candle.fillRect(164, 528, 8, 12);
      candle.fillStyle(PALETTE.wax, lit ? 0.35 : 0.15);
      candle.fillRect(156, 520, 24, 28);
    };
    paint();
    this.time.addEvent({
      delay: 420,
      loop: true,
      callback: () => {
        lit = !lit;
        paint();
      },
    });
  }

  private startNewGame(): void {
    newRun(this.game);          // 스토어를 새로 만든다 — DayScene 은 이걸 집어 든다
    this.scene.start(SCENES.DAY);
  }

  private continueGame(): void {
    if (loadRun(this.game) === null) return;
    this.scene.start(SCENES.DAY);
  }
}
