import Phaser from 'phaser';
import { BASE_W, BASE_H, SCENES } from '../config';
import { PALETTE, css } from '../render/palette';
import { FONT, FONT_TITLE } from '../render/font';
import { Button } from '../ui/Button';
import { key as assetKey, hasTexture } from '../render/assets';
import { newRun } from './run';

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

    // 배경: 어두운 가게 내부 1컷 (bg.title 이 오면 그걸 쓴다)
    if (hasTexture(this, 'bg.title')) {
      this.add.image(0, 0, assetKey('bg.title')).setOrigin(0).setDisplaySize(BASE_W, BASE_H).setAlpha(0.55);
    }

    // 촛불 깜빡임 2프레임 루프 — tallow 점 하나의 밝기만 바꾼다
    const candle = this.add.graphics();
    let lit = true;
    const paintCandle = () => {
      candle.clear();
      candle.fillStyle(PALETTE.bone, lit ? 1 : 0.45);
      candle.fillRect(164, 528, 8, 12);
      candle.fillStyle(PALETTE.wax, lit ? 0.35 : 0.15);
      candle.fillRect(156, 520, 24, 28);
    };
    paintCandle();
    this.time.addEvent({
      delay: 420,
      loop: true,
      callback: () => {
        lit = !lit;
        paintCandle();
      },
    });

    // 제목 — 로고 아트가 오면 글자 대신 그것을 건다
    if (hasTexture(this, 'ui.logo')) {
      this.add.image(BASE_W / 2, 256, assetKey('ui.logo')).setOrigin(0.5);
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
    const left = Math.round((BASE_W - bw * 2 - gap) / 2);
    const top = 464;

    new Button(this, {
      x: left, y: top, w: bw, h: bh,
      label: '새로 시작', hotkey: '1',
      onClick: () => this.startNewGame(),
    });
    new Button(this, {
      x: left + bw + gap, y: top, w: bw, h: bh,
      label: '이어하기', hotkey: '2',
      enabled: hasSave(),
      onClick: () => this.startNewGame(),
    });
    new Button(this, {
      x: left, y: top + bh + gap, w: bw, h: bh,
      label: '옵션', hotkey: '3', variant: 'ghost',
      onClick: () => this.scene.start(SCENES.OPTIONS),
    });
    new Button(this, {
      x: left + bw + gap, y: top + bh + gap, w: bw, h: bh,
      label: '조작 안내', hotkey: '4', variant: 'ghost',
      onClick: () => this.scene.start(SCENES.HELP),
    });

    this.add
      .text(BASE_W / 2, 848, '당신은 한 세계를 속이고 있다.', { ...FONT, color: css('dust') })
      .setOrigin(0.5);

    // 폰트 폴백 여부를 화면에 남긴다 (수용 기준 4 확인용)
    if (this.registry.get('fontOk') !== true) {
      this.add
        .text(BASE_W / 2, BASE_H - 56, '폰트 폴백 모드 (monospace)', { ...FONT, color: css('bone') })
        .setOrigin(0.5);
    }
  }

  private startNewGame(): void {
    newRun(this.game);          // 스토어를 새로 만든다 — DayScene 은 이걸 집어 든다
    this.scene.start(SCENES.DAY);
  }
}

function hasSave(): boolean {
  try {
    return localStorage.getItem('undying-shop:save:v1') !== null;
  } catch {
    return false;
  }
}
