import Phaser from 'phaser';
import { BASE_W, BASE_H } from '../config';
import { PALETTE, css } from '../render/palette';
import { FONT } from '../render/font';

/**
 * D0 스캐폴딩 확인용 최소 씬.
 * M01(D1)에서 PreloadScene 인계 + 타이틀로 대체된다.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PALETTE.soot);

    // 480×270 경계를 눈으로 확인하기 위한 1px 프레임
    this.add.rectangle(0, 0, BASE_W, BASE_H).setOrigin(0).setStrokeStyle(1, PALETTE.line);

    const line = (y: number, text: string, color: string) =>
      this.add.text(BASE_W / 2, y, text, { ...FONT, color }).setOrigin(0.5);

    line(96, '죽지 않는 가게', css('bone'));
    line(120, 'D0 · 스캐폴드 확인', css('wax'));
    line(144, `${BASE_W}x${BASE_H} · 정수배 x${this.scale.zoom}`, css('dust'));

    const ok = this.registry.get('fontReady') === true;
    line(168, ok ? '폰트 네오둥근모 적용됨' : '폰트 폴백 monospace', css(ok ? 'spirit' : 'tallow'));
  }
}
