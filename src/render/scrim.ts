import Phaser from 'phaser';
import { css } from './palette';

/**
 * 00-OVERVIEW §7-1 — **그림 위에 글을 얹는 자리에 까는 판.**
 *
 * 본 아트가 들어오면 배경이 고주파 디더로 가득 차서, 그 위의 32px 본문이 읽히지 않는다.
 * 반투명 사각형으로 덮으면 중간 계조가 생겨 팔레트가 깨진다. 그래서 **ink 픽셀을
 * Bayer 순서로 솎아 찍는다** — 색은 ink 하나뿐이고, 덮는 비율만 달라진다.
 *
 * 격자 한 칸은 2px(`L.line`)이다. 4x4 칸 = 8x8px 타일 하나를 만들어 두고 타일링한다.
 * (칸마다 `fillRect` 를 돌면 작업대 한 판이 5만 번이다 — 타일 스프라이트로 한 번에 깐다.)
 */

/** 4칸 중 몇 칸을 덮는가 — 1=25% 2=50% 3=75% */
export type ScrimWeight = 1 | 2 | 3;

/** 격자 한 칸 (px) */
export const SCRIM_CELL = 2;
/** 타일 한 변 (px) — 위상을 화면 좌표에 맞출 때 이 값으로 나눈 나머지를 쓴다 */
export const SCRIM_TILE = SCRIM_CELL * 4;

/** 4x4 Bayer — 규칙적인 줄무늬가 눈에 띄지 않는 순서 */
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/**
 * 무게별 타일을 텍스처 매니저에 한 번만 만든다.
 * 씬마다 만들지 않는다 — Phaser 의 텍스처 매니저는 게임 전체가 공유한다.
 */
export function scrimTexture(scene: Phaser.Scene, weight: ScrimWeight): string {
  const name = `__scrim${weight}`;
  if (scene.textures.exists(name)) return name;

  const canvas = scene.textures.createCanvas(name, SCRIM_TILE, SCRIM_TILE);
  if (canvas === null) return name; // 만들지 못했으면 호출한 쪽이 조용히 건너뛴다
  const ctx = canvas.getContext();
  ctx.clearRect(0, 0, SCRIM_TILE, SCRIM_TILE);
  ctx.fillStyle = css('ink');
  const threshold = weight * 4;
  for (let cy = 0; cy < 4; cy += 1) {
    for (let cx = 0; cx < 4; cx += 1) {
      if ((BAYER[cy]?.[cx] ?? 16) >= threshold) continue;
      ctx.fillRect(cx * SCRIM_CELL, cy * SCRIM_CELL, SCRIM_CELL, SCRIM_CELL);
    }
  }
  canvas.refresh();
  return name;
}
