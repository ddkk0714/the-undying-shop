import Phaser from 'phaser';
import { BASE_W, BASE_H } from '../config';

/**
 * 01-ARCHITECTURE §4-1 — 정수배 스케일만 허용한다.
 * FIT 모드는 반픽셀을 만들어 픽셀 폰트를 뭉갠다.
 */
export function applyIntegerScale(game: Phaser.Game): () => void {
  const fit = () => {
    const z = Math.max(
      1,
      Math.floor(Math.min(window.innerWidth / BASE_W, window.innerHeight / BASE_H)),
    );
    game.scale.setZoom(z);
    game.scale.refresh();
  };
  fit();
  window.addEventListener('resize', fit);
  return () => window.removeEventListener('resize', fit);
}
