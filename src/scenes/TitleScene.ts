import Phaser from 'phaser';
import { BASE_W, BASE_H, SCENES } from '../config';
import { PALETTE, css } from '../render/palette';
import { FONT, FONT_TITLE } from '../render/font';
import { Button } from '../ui/Button';
import { key as assetKey, hasTexture, isFinalArt } from '../render/assets';
import { scrimTexture, SCRIM_TILE } from '../render/scrim';
import { reducedMotion } from '../ui/options';
import { playAmbience, playBgm, playSfx, stopAmbience } from '../audio/Sfx';
import { hasSavedRun, listSaveSlots, loadRun, newRun, type SaveSlot } from './run';
import { PHASE_LABEL } from './DayScene';

/**
 * 조절판 알파 대본 — `[목표 알파, 걸리는 ms, 방식]`.
 * 알파 0 이 원본 그대로(가장 밝음), 1 이면 창이 완전히 죽는다.
 *
 * 사용자 확정 리듬: **빠르게 두세 번 깜빡 → 느리게 일렁**. 이걸 반복한다.
 * `snap` 은 그 자리에서 뚝 끊고 그만큼 머문다 (접촉 불량처럼 튀는 구간),
 * `ease` 는 그 시간 동안 부드럽게 건너간다 (기름이 숨 쉬는 구간).
 *
 * 깜빡을 일정 간격으로 돌리면 네온사인이 된다. 그래서 간격을 조금씩 어긋나게 두고,
 * 일렁 구간은 깜빡보다 20배 넘게 길게 잡아 두 리듬이 확실히 갈라지게 했다.
 */
const LAMP_SCRIPT: ReadonlyArray<readonly [number, number, 'snap' | 'ease']> = [
  // ① 빠르게 세 번
  [0.82, 55, 'snap'], [0.02, 85, 'snap'],
  [0.94, 45, 'snap'], [0.02, 70, 'snap'],
  [0.74, 60, 'snap'], [0.02, 120, 'snap'],
  // ② 느리게 일렁 — 세 번 숨 쉰다
  [0.26, 1400, 'ease'], [0.05, 1600, 'ease'],
  [0.20, 1500, 'ease'], [0.04, 1750, 'ease'],
  [0.30, 1300, 'ease'], [0.03, 1900, 'ease'],
  // ③ 빠르게 두 번
  [0.88, 50, 'snap'], [0.02, 95, 'snap'],
  [0.78, 55, 'snap'], [0.02, 110, 'snap'],
  // ④ 더 길게 일렁
  [0.22, 1700, 'ease'], [0.04, 2000, 'ease'],
  [0.16, 1900, 'ease'], [0.02, 2300, 'ease'],
];

/**
 * 진열창 빛 조절판이 앉는 자리.
 *
 * 눈대중이 아니다. 원본 배경(2835x1594)과 「빛1~4」를 픽셀 단위로 비교해서
 * **실제로 달라지는 구간**을 뽑았더니 (957, 801, 567, 300) 이었고, 이건 받은
 * `빛조절창.png` 의 크기(567x300)와 정확히 일치한다. 그 값을 1920x1080 으로 옮긴 것이다.
 */
const WINDOW_BOX = { x: 648, y: 543, w: 384, h: 203 } as const;

/**
 * 진열창 **안쪽 중간 상단**에 매달린 등 (사용자 확정 — 처음엔 문 위 처마등에 붙였는데
 * 그게 아니었다). 자리는 「빛1」에 그려진 등을 잘라 재서 잡았다: 원본 (1205, 802, 86, 59).
 *
 * `타이틀 배경.png` 에는 이 등이 **없다.** 아티스트가 흔들 수 있도록 따로 뽑아 준 것이고
 * (`랜턴애니메이션용.png`), 크기 86x59 가 「빛1」의 등과 정확히 맞는다.
 * y 가 창 상자의 위쪽 변(543)과 같은 것도 우연이 아니다 — 창틀에 매달려 있다.
 */
const LANTERN_BOX = { x: 816, y: 543, w: 58, h: 40 } as const;

/**
 * 흔들리는 폭(도)과 한 번 왕복하는 시간 — 바람 없는 밤이다. 약하게.
 *
 * **상단이 고정된 채 좌우로 각도만 바뀐다** (사용자 확정) — origin 을 (0.5, 0) 으로 잡는다.
 * 3.5도면 갓 밑동이 40 × tan(3.5°) ≈ 2.4px 움직인다. 밝은 창 위의 검은 실루엣이라
 * 이 정도면 눈에 들어온다.
 */
const LANTERN_SWING = 3.5;
const LANTERN_PERIOD = 3200;

/**
 * M01 §6 — 타이틀.
 *
 *         죽 지  않 는  가 게
 *         THE UNDYING SHOP
 *
 *      [ 새로 시작 ]   [ 이어하기 ]
 *      [ 옵션 ]        [ 조작 안내 ]
 */
export class TitleScene extends Phaser.Scene {
  private slotPopup: Phaser.GameObjects.GameObject[] = [];
  private slotPopupMode: 'new' | 'continue' | null = null;
  private confirmOverwriteSlot: SaveSlot | null = null;

  constructor() {
    super(SCENES.TITLE);
  }

  create(): void {
    this.slotPopup = [];
    this.slotPopupMode = null;
    this.confirmOverwriteSlot = null;
    this.cameras.main.setBackgroundColor(PALETTE.ink);
    playBgm(this, 'bgm.title', 0.24);
    playAmbience(this, 'bgm.title.noise', 0.16);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      stopAmbience(this);
      this.closeSlotPopup();
    });

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
      // 등이 먼저다 — 등도 창 안에 있으니 조절판이 그 위를 덮어야 같이 어두워진다
      this.lanternSway();
      this.windowFlicker();
    } else {
      // 본 아트가 없을 때만 — 절차적 촛불이 이 화면의 유일한 불빛이다.
      // 그림이 들어오면 그 안에 이미 창의 불빛이 있으므로 덧그리지 않는다.
      this.candleFlicker();
    }

    // 제목 — 로고 아트가 오면 글자 대신 그것을 건다
    // 로고는 **본 아트일 때만** 건다. 플레이스홀더 로고는 테두리 친 상자라서
    // 배경 그림 위에 얹으면 하늘을 가리는 흰 판이 된다 — 그럴 바엔 글자가 낫다.
    if (isFinalArt('ui.logo') && hasTexture(this, 'ui.logo')) {
      this.add.image(BASE_W / 2, 320, assetKey('ui.logo')).setOrigin(0.5).setDisplaySize(560, 475);
    } else {
      // 플레이스홀더 글자만 배경과 섞이지 않도록 뒤에 판을 깐다.
      this.veil(500, 44, 920, 592);
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
      onClick: () => this.openSlotPopup('new'),
    });
    new Button(this, {
      x: right, y: top, w: bw, h: bh,
      label: '이어하기', hotkey: '2',
      enabled: hasSavedRun(),
      onClick: () => this.openSlotPopup('continue'),
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
      const [alpha, ms, how] = LAMP_SCRIPT[step % LAMP_SCRIPT.length] ?? [0, 1000, 'snap'];
      step += 1;
      if (how === 'snap') {
        shade.setAlpha(alpha);
        this.time.delayedCall(ms, advance);
        return;
      }
      // 일렁 — 알파를 그 시간 동안 건너간다. 끝나면 다음 칸으로
      this.tweens.add({
        targets: shade,
        alpha,
        duration: ms,
        ease: 'Sine.easeInOut',
        onComplete: advance,
      });
    };
    advance();
  }

  /**
   * 진열창 안 등이 약하게 흔들린다 — **꼭대기를 축으로 좌우 각도만** 바뀐다.
   * 매단 자리는 그대로 있고 갓만 기운다. origin (0.5, 0) 이 그 축이다.
   */
  private lanternSway(): void {
    if (!hasTexture(this, 'bg.title.lantern')) return;

    const v = LANTERN_BOX;
    const lamp = this.add
      .image(v.x + v.w / 2, v.y, assetKey('bg.title.lantern'))
      .setOrigin(0.5, 0)
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

  /** HO-028 — 새로 시작/이어하기 공용 3슬롯 선택 팝업. */
  private openSlotPopup(mode: 'new' | 'continue'): void {
    this.slotPopupMode = mode;
    this.confirmOverwriteSlot = null;
    this.renderSlotPopup();
  }

  private closeSlotPopup(): void {
    this.slotPopup.forEach((object) => object.destroy());
    this.slotPopup = [];
    this.slotPopupMode = null;
    this.confirmOverwriteSlot = null;
  }

  private renderSlotPopup(): void {
    this.slotPopup.forEach((object) => object.destroy());
    this.slotPopup = [];
    const mode = this.slotPopupMode;
    if (mode === null) return;

    const depth = 10_000;
    const objects = this.slotPopup;
    const add = <T extends Phaser.GameObjects.GameObject & { setDepth(depth: number): T }>(object: T): T => {
      object.setDepth(depth + objects.length);
      objects.push(object);
      return object;
    };

    const box = { x: 560, y: 190, w: 800, h: 700 };
    const close = (): void => this.closeSlotPopup();
    const panel = add(this.add.rectangle(BASE_W / 2, BASE_H / 2, BASE_W, BASE_H, PALETTE.ink, 0.72).setInteractive());
    panel.on('pointerup', close);
    add(this.add.rectangle(box.x, box.y, box.w, box.h, PALETTE.ink, 1).setOrigin(0));
    const frame = add(this.add.graphics());
    frame.lineStyle(4, PALETTE.bone, 1).strokeRect(box.x, box.y, box.w, box.h);
    add(this.add.text(box.x + 42, box.y + 34, mode === 'new' ? '새로 시작 · 슬롯 선택' : '이어하기 · 슬롯 선택', { ...FONT, color: css('bone'), fontSize: '48px' }));
    add(this.add.text(box.x + 42, box.y + 98, mode === 'new' ? '진행을 시작할 슬롯을 고르세요.' : '불러올 슬롯을 고르세요.', { ...FONT, color: css('dust'), fontSize: '24px' }));

    const rowY: Record<SaveSlot, number> = { 1: box.y + 158, 2: box.y + 314, 3: box.y + 470 };
    for (const info of listSaveSlots()) {
      const y = rowY[info.slot];
      const state = info.state;
      const empty = state === null;
      const label = state === null
        ? `슬롯 ${info.slot}  ·  비어 있음`
        : `슬롯 ${info.slot}  ·  DAY ${state.day} · ${PHASE_LABEL[state.phase]}`;
      const pendingConfirm = mode === 'new' && !empty && this.confirmOverwriteSlot === info.slot;
      const detail = pendingConfirm
        ? '정말 덮어쓰시겠습니까? 다시 누르면 시작합니다.'
        : info.savedAt === null
          ? (mode === 'new' ? '새 판을 시작합니다.' : '저장된 진행이 없습니다.')
          : new Date(info.savedAt).toLocaleString('ko-KR');

      // 인터랙티브로 잡아 둔다 — 비활성 버튼은 히트 영역이 없어, 안 잡으면 클릭이
      // 이 판을 뚫고 아래 배경(닫기 트리거)까지 떨어져 팝업이 조용히 닫혀 버린다.
      add(this.add.rectangle(box.x + 42, y, box.w - 84, 128, PALETTE.mid, 0.45).setOrigin(0).setInteractive());
      add(this.add.text(box.x + 66, y + 22, label, { ...FONT, color: css('bone'), fontSize: '32px', letterSpacing: -2 }));
      add(this.add.text(box.x + 66, y + 74, detail, { ...FONT, color: css(pendingConfirm ? 'wax' : 'dust'), fontSize: '21px' }));

      const actionLabel = mode === 'continue' ? '불러오기' : empty ? '시작' : '선택';
      const finalStep = mode === 'new' && (empty || pendingConfirm);
      // '불러오기' 는 글자 네 자라 130px 폭으로는 좌우가 잘렸다 — 160px 로 넓힌다.
      add(new Button(this, {
        x: box.x + box.w - 206, y: y + 22, w: 160, h: 76,
        label: actionLabel,
        variant: pendingConfirm ? 'danger' : 'default',
        enabled: mode === 'continue' ? !empty : true,
        sound: finalStep ? false : undefined,
        onClick: () => {
          if (mode === 'continue') {
            if (loadRun(this.game, info.slot) === null) return;
            this.closeSlotPopup();
            this.scene.start(SCENES.DAY);
            return;
          }
          if (!empty && this.confirmOverwriteSlot !== info.slot) {
            this.confirmOverwriteSlot = info.slot;
            this.renderSlotPopup();
            return;
          }
          playSfx(this, 'sfx.title.chime', 0.32);
          playSfx(this, 'sfx.title.door', 0.62);
          newRun(this.game, info.slot);   // 스토어를 새로 만든다 — DayScene 은 이걸 집어 든다
          this.closeSlotPopup();
          this.scene.start(SCENES.DAY);
        },
      }));
    }

    add(new Button(this, { x: box.x + box.w - 172, y: box.y + box.h - 86, w: 128, h: 54, label: '닫기', variant: 'ghost', onClick: close }));
  }
}
