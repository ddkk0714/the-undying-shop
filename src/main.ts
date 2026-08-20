import Phaser from 'phaser';
import { BASE_W, BASE_H } from './config';
import { PALETTE } from './render/palette';
import { applyIntegerScale } from './render/scaler';
import { BootScene } from './scenes/BootScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: BASE_W,
  height: BASE_H,
  parent: 'game',
  backgroundColor: PALETTE.soot,
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.NONE, // ★ FIT 금지. 정수배만 — 01-ARCHITECTURE §4
    autoCenter: Phaser.Scale.CENTER_BOTH,
    zoom: 1, // scaler 가 런타임에 정수로 재설정
  },
  scene: [BootScene],
});

applyIntegerScale(game);
