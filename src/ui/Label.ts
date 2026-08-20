import Phaser from 'phaser';
import { css, type PaletteName } from '../render/palette';
import { FONT } from '../render/font';

/** 04-UI-KIT §3 — 색은 팔레트 이름으로만 지정한다. 크기는 16px 단일. */
export function label(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  color: PaletteName = 'bone',
): Phaser.GameObjects.Text {
  return scene.add.text(Math.round(x), Math.round(y), text, { ...FONT, color: css(color) });
}
