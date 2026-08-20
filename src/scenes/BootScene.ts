import Phaser from 'phaser';
import { BASE_W, BASE_H } from '../config';
import { PALETTE, css } from '../render/palette';

/**
 * D0 스캐폴딩 확인용 최소 씬.
 * M01(D1)에서 폰트 로딩 + PreloadScene 인계로 대체된다.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PALETTE.soot);

    // 480×270 경계를 눈으로 확인하기 위한 1px 프레임
    this.add.rectangle(0, 0, BASE_W, BASE_H).setOrigin(0).setStrokeStyle(1, PALETTE.line);

    this.add
      .text(BASE_W / 2, 112, '죽지 않는 가게', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: css('bone'),
        resolution: 1,
      })
      .setOrigin(0.5);

    this.add
      .text(BASE_W / 2, 136, 'D0 · SCAFFOLD OK', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: css('wax'),
        resolution: 1,
      })
      .setOrigin(0.5);

    this.add
      .text(BASE_W / 2, 160, `${BASE_W}x${BASE_H} · zoom x${this.scale.zoom}`, {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: css('dust'),
        resolution: 1,
      })
      .setOrigin(0.5);
  }
}
