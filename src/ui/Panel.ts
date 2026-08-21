import Phaser from 'phaser';
import { PALETTE } from '../render/palette';
import { firstTexture, slice } from '../render/assets';
import { L } from './layout';

export type PanelVariant = 'raised' | 'sunken' | 'danger';

/**
 * 04-UI-KIT §2-2 (v3.1) — 라운딩 0, 그림자 없음.
 * **2px 하드 엣지만으로 깊이를 만든다.**
 *
 * raised : mid 채움 + bone 2px   (카드 · 버튼 · 액자)
 * sunken : ink 채움 + dust 2px   (목록 · 채팅창 · 진열 슬롯)
 * danger : ink 채움 + wax 2px    (되돌릴 수 없는 선택)
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
  const t = L.line;

  // 패널 CG 가 있으면 9-slice 로 대신한다. Graphics 는 빈 채로 돌려준다 (호출부 시그니처 유지)
  const skinKey = variant === 'raised' ? 'ui.panel.9s' : 'ui.panel.sunken.9s';
  const tex = firstTexture(scene, skinKey, 'ui.panel.9s');
  if (tex !== null) {
    const [left, right, top, bottom] = slice(skinKey);
    scene.add.nineslice(X, Y, tex, undefined, Math.round(w), Math.round(h), left, right, top, bottom).setOrigin(0, 0);
    return g;
  }
  const fill = variant === 'raised' ? PALETTE.mid : PALETTE.ink;
  const border = variant === 'raised' ? PALETTE.bone : variant === 'danger' ? PALETTE.wax : PALETTE.dust;

  g.fillStyle(fill, 1);
  g.fillRect(X, Y, w, h);

  g.fillStyle(border, 1);
  g.fillRect(X, Y, w, t);
  g.fillRect(X, Y + h - t, w, t);
  g.fillRect(X, Y, t, h);
  g.fillRect(X + w - t, Y, t, h);

  return g;
}
