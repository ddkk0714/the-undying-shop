import Phaser from 'phaser';
import { BASE_W, BASE_H, SCENES } from '../config';
import { PALETTE, css } from '../render/palette';
import { FONT, FONT_TITLE } from '../render/font';
import { Button } from '../ui/Button';
import { key as assetKey, hasTexture, isFinalArt } from '../render/assets';
import { scrimTexture, SCRIM_TILE } from '../render/scrim';
import { reducedMotion } from '../ui/options';
import { playAmbience, playBgm, playSfx, stopAmbience } from '../audio/Sfx';
import { hasSavedRun, loadRun, newRun } from './run';

/**
 * 램프 깜빡임 순서 — `[단계, 머무는 ms]`.
 * 0 이 가장 밝고 4 가 가장 어둡다.
 *
 * 일정한 간격으로 돌리면 네온사인처럼 보인다. 기름 램프는 **대체로 밝게 타다가
 * 이따금 훅 꺼질 듯 흔들린다.** 그래서 0~1 에 오래 머물고, 3~4 는 짧게 스치기만 한다.
 */
const LAMP_CYCLE: ReadonlyArray<readonly [number, number]> = [
  [0, 1500], [1, 110], [0, 780], [1, 80], [2, 60], [1, 90],
  [0, 1800], [1, 100], [2, 70], [3, 50], [2, 90], [1, 110],
  [0, 1200], [1, 80], [2, 60], [3, 50], [4, 40], [3, 70], [1, 130],
];

/**
 * 같은 5단을 **조절판 알파**로 낸다. 0 은 판이 안 보이는 상태 = 원본 그대로 가장 밝다.
 * 배경 5장(각 190KB)을 갈아 끼우던 걸 2KB 짜리 판 한 장으로 대신한다.
 */
const LAMP_ALPHA = [0, 0.22, 0.42, 0.62, 0.8] as const;

/**
 * 진열창 빛 조절판이 앉는 자리.
 *
 * 눈대중이 아니다. 원본 배경(2835x1594)과 「빛1~4」를 픽셀 단위로 비교해서
 * **실제로 달라지는 구간**을 뽑았더니 (957, 801, 567, 300) 이었고, 이건 받은
 * `빛조절창.png` 의 크기(567x300)와 정확히 일치한다. 그 값을 1920x1080 으로 옮긴 것이다.
 */
const WINDOW_BOX = { x: 648, y: 543, w: 384, h: 203 } as const;

/**
 * 문 위 처마등. 같은 방식으로 원본 (1692, 881, 86, 59) 을 옮겼다.
 * 원본 그림의 등은 점선 윤곽이고, 이 스프라이트는 그걸 덮는 **꽉 찬 실루엣**이다.
 */
const LANTERN_BOX = { x: 1146, y: 597, w: 58, h: 40 } as const;

/**
 * 처마등이 흔들리는 폭(도)과 한 번 왕복하는 시간 — 바람 없는 밤이다. 약하게.
 *
 * 회전축은 등 자체가 아니라 **등을 매단 처마**다. 등의 꼭대기를 축으로 돌리면
 * 갓이 제자리에서 갸웃거린다. 축을 위로 `LANTERN_PIVOT` 만큼 올려야 매달린 것이 흔들린다.
 * 1.6도로 잡았더니 밑동이 0.5px 도 안 움직여서 눈에 안 보였다 (실측) — 지금은 3px 쯤 움직인다.
 */
const LANTERN_SWING = 2.6;
const LANTERN_PERIOD = 3200;
const LANTERN_PIVOT = 30;

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
    playBgm(this, 'bgm.title', 0.24);
    playAmbience(this, 'bgm.title.noise', 0.16);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => stopAmbience(this));

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
      this.windowFlicker();
      this.lanternSway();
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
      sound: false,
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
   * 창의 불빛 깜빡임 — **조절판 한 장의 알파만 흔든다** (사용자 확정).
   *
   * 예전에는 1920x1080 배경을 5장 물고 통째로 갈아 끼웠다. 바뀌는 건 창 한 칸뿐인데
   * 디코드된 텍스처로 33MB(1920×1080×4 × 4장)를 들고 있었다. 이제 그 칸에만
   * 1.8KB 짜리 검은 판을 얹고 알파를 바꾼다. `bg.title.lamp1~4` 는 슬롯째 지웠다 (사용자 확정).
   *
   * ⚠️ 반투명이라 1비트 그림 위에 팔레트 밖 중간 계조가 생긴다 (00-OVERVIEW §7-1).
   *    창 안쪽 384x203 에 한정되고 연출이 요구한 것이라 감수한다.
   *
   * 판이 없으면 아무것도 안 한다 — 깜빡이지 않는 그림 그대로가 정답이다.
   */
  private windowFlicker(): void {
    if (!hasTexture(this, 'bg.title.window')) return;

    const v = WINDOW_BOX;
    const shade = this.add
      .image(v.x, v.y, assetKey('bg.title.window'))
      .setOrigin(0, 0)
      .setDisplaySize(v.w, v.h)
      .setAlpha(0);

    if (reducedMotion(this.registry)) return; // 판만 얹고 흔들지 않는다

    let step = 0;
    const advance = (): void => {
      const [level, hold] = LAMP_CYCLE[step % LAMP_CYCLE.length] ?? [0, 1000];
      shade.setAlpha(LAMP_ALPHA[level] ?? 0);
      step += 1;
      this.time.delayedCall(hold, advance);
    };
    advance();
  }

  /**
   * 문 위 처마등이 약하게 흔들린다.
   *
   * 매다는 물건이라 축이 **등보다 위**에 있다 (`LANTERN_PIVOT`). origin.y 를 음수로 주면
   * 회전 중심이 그림 밖 위쪽으로 나가므로, 그만큼 y 를 올려서 등은 제자리에 놓는다.
   */
  private lanternSway(): void {
    if (!hasTexture(this, 'bg.title.lantern')) return;

    const v = LANTERN_BOX;
    const lamp = this.add
      .image(v.x + v.w / 2, v.y - LANTERN_PIVOT, assetKey('bg.title.lantern'))
      .setOrigin(0.5, -LANTERN_PIVOT / v.h)
      .setDisplaySize(v.w, v.h);

    if (reducedMotion(this.registry)) return;

    lamp.setAngle(-LANTERN_SWING);
    this.tweens.add({
      targets: lamp,
      angle: LANTERN_SWING,
      duration: LANTERN_PERIOD / 2,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
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
    playSfx(this, 'sfx.title.chime', 0.55);
    playSfx(this, 'sfx.title.door', 0.62);
    newRun(this.game);          // 스토어를 새로 만든다 — DayScene 은 이걸 집어 든다
    this.scene.start(SCENES.DAY);
  }

  private continueGame(): void {
    if (loadRun(this.game) === null) return;
    this.scene.start(SCENES.DAY);
  }
}
