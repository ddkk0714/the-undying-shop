import Phaser from 'phaser';
import { SCENES } from '../config';
import { PALETTE } from '../render/palette';
import { waitForFont } from '../render/font';
import { createMissingTexture } from '../render/assets';

/**
 * M01 §4 — 폰트를 기다리고, HTML 로딩 인디케이터를 걷어낸 뒤 Preload 로 넘긴다.
 * 폰트 로딩에 실패해도 **반드시 진행한다.** 게임이 멈추는 것보다 못생긴 게 낫다.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENES.BOOT);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PALETTE.ink);
    createMissingTexture(this);

    void waitForFont(3000).then((ok) => {
      this.registry.set('fontOk', ok);
      // HTML 로딩 인디케이터 제거 — 여기서부터는 캔버스가 화면을 책임진다
      document.getElementById('boot-loader')?.remove();
      this.scene.start(SCENES.PRELOAD);
    });
  }
}
