import Phaser from 'phaser';
import { SCENES } from '../config';
import { PALETTE } from '../render/palette';
import { L } from '../ui/layout';
import { reducedMotion } from '../ui/options';

/**
 * 04-UI-KIT — 씬 전환은 **디더 와이프**로 한다.
 *
 * 페이드는 중간 계조를 만든다. 이 게임에는 중간 계조가 없다 (00-OVERVIEW §7-1).
 * 그래서 Bayer 격자의 임계값을 0 → 16 으로 올려 **점이 차오르듯** 화면을 덮는다.
 * 덮인 순간에 씬을 갈아끼우고, 임계값을 다시 내려 걷는다.
 *
 * 이 씬은 항상 맨 위에 있다. 아래에서 무엇이 바뀌든 상관하지 않는다.
 */

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/** 덮는 데 / 걷는 데 각각 걸리는 시간 */
const HALF_MS = 200;
/** 격자 한 칸. 4px 이면 1920 폭에서 480칸 — 그릴 만하다 */
const CELL = 4;

export class WipeScene extends Phaser.Scene {
  private layer!: Phaser.GameObjects.Graphics;
  private startedAt = 0;
  private running = false;
  private onCovered: (() => void) | null = null;

  constructor() {
    super(SCENES.WIPE);
  }

  create(): void {
    this.layer = this.add.graphics();
    this.layer.setVisible(false);
    this.scene.bringToTop();
  }

  /** 화면을 덮었다가 걷는다. 덮인 순간 `onCovered` 를 부른다 */
  run(onCovered: () => void): void {
    // 아직 create() 가 안 돌았으면 연출 없이 넘긴다. 전환이 막히면 안 된다
    if (this.layer === undefined) {
      onCovered();
      return;
    }
    if (reducedMotion(this.registry)) {
      onCovered();
      return;
    }
    if (this.running) {
      // 이미 도는 중이면 앞의 것을 마무리하고 새로 시작한다
      this.onCovered?.();
    }
    this.running = true;
    this.startedAt = this.time.now;
    this.onCovered = onCovered;
    this.layer.setVisible(true);
    this.scene.bringToTop();
  }

  override update(): void {
    if (!this.running) return;
    const elapsed = this.time.now - this.startedAt;

    if (elapsed >= HALF_MS && this.onCovered !== null) {
      // 완전히 덮인 지점 — 여기서 갈아끼운다
      this.onCovered();
      this.onCovered = null;
      this.scene.bringToTop();
    }
    if (elapsed >= HALF_MS * 2) {
      this.running = false;
      this.layer.clear();
      this.layer.setVisible(false);
      return;
    }

    const t = elapsed < HALF_MS ? elapsed / HALF_MS : 1 - (elapsed - HALF_MS) / HALF_MS;
    this.paint(Math.round(t * 17));
  }

  /** 임계값 0..17 — 17 이면 전부 덮인다 */
  private paint(level: number): void {
    const g = this.layer;
    g.clear();
    if (level <= 0) return;
    if (level > 16) {
      g.fillStyle(PALETTE.ink, 1);
      g.fillRect(0, 0, L.W, L.H);
      return;
    }
    g.fillStyle(PALETTE.ink, 1);
    for (let y = 0; y < L.H; y += CELL) {
      const row = BAYER[(y / CELL) & 3]!;
      for (let x = 0; x < L.W; x += CELL) {
        if (row[(x / CELL) & 3]! < level) g.fillRect(x, y, CELL, CELL);
      }
    }
  }
}
