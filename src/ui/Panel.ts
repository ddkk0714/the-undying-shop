import Phaser from 'phaser';
import { PALETTE } from '../render/palette';

export type PanelVariant = 'raised' | 'sunken';

/**
 * 04-UI-KIT §2-2 — 라운딩 0, 그림자 없음.
 * 1px 하드 엣지만으로 깊이를 만든다.
 */
export function panel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  variant: PanelVariant = 'raised',
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  const X = Math.round(x);
  const Y = Math.round(y);
  const fill = variant === 'raised' ? PALETTE.clay : PALETTE.ash;
  const topLeft = variant === 'raised' ? PALETTE.line : PALETTE.soot;
  const bottomRight = variant === 'raised' ? PALETTE.soot : PALETTE.line;

  g.fillStyle(fill, 1);
  g.fillRect(X, Y, w, h);

  g.fillStyle(topLeft, 1);
  g.fillRect(X, Y, w, 1);
  g.fillRect(X, Y, 1, h);

  g.fillStyle(bottomRight, 1);
  g.fillRect(X, Y + h - 1, w, 1);
  g.fillRect(X + w - 1, Y, 1, h);

  return g;
}
