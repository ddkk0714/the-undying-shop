import Phaser from 'phaser';
import { css, type PaletteName } from '../render/palette';
import { FONT_LABEL } from '../render/font';

/**
 * 04-UI-KIT §3 — 머리글 라벨. 색은 팔레트 이름으로만, 크기는 16px 단일.
 *
 * `PhaseScene` 을 상속하는 단계 씬은 내장 `this.label()` 을 쓴다.
 * 이건 그 밖의 씬(타이틀·HUD·옵션 등)을 위한 것이다.
 */
export function label(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  color: PaletteName = 'dust',
): Phaser.GameObjects.Text {
  return scene.add.text(Math.round(x), Math.round(y), text, { ...FONT_LABEL, color: css(color) });
}
