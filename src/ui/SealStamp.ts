import Phaser from 'phaser';
import { PALETTE } from '../render/palette';
import { key, hasTexture } from '../render/assets';
import { L } from './layout';

/**
 * M09 §봉랍 연출 — **이 연출이 이 게임의 로고이자 시그니처다.**
 *
 *   hitStop 120ms → 붉은 도장이 화면 중앙에서 쾅 → 흔들림 3px → 자국이 남는다
 *
 * `ui.seal` 스프라이트시트(192×192 × 4프레임)를 쓴다. 아직 본 아트가 안 왔으면
 * 같은 타이밍으로 wax 원을 찍는다 — 연출이 비어 보이지 않는 게 더 중요하다.
 */

const HIT_STOP_MS = 120;
const FRAME_MS = 70;
const FRAMES = 4;
/** 도장이 다 찍히고 나서 다음 단계로 넘기기까지 */
export const SEAL_TOTAL_MS = HIT_STOP_MS + FRAME_MS * FRAMES + 220;

export interface SealOpts {
  /** 자국이 남을 자리. 생략하면 화면 중앙 */
  x?: number;
  y?: number;
  /** 연출 감소 — 즉시 끝낸다 */
  reduced?: boolean;
  onDone: () => void;
}

export function sealStamp(scene: Phaser.Scene, opts: SealOpts): void {
  const cx = Math.round(opts.x ?? L.W / 2);
  const cy = Math.round(opts.y ?? L.H / 2);

  if (opts.reduced === true) {
    opts.onDone();
    return;
  }

  const size = 192;
  const useArt = hasTexture(scene, 'ui.seal');
  const mark = useArt
    ? scene.add.image(cx, cy, key('ui.seal'), 0).setOrigin(0.5)
    : scene.add.graphics();

  let frame = 0;
  const paintFallback = (progress: number): void => {
    const g = mark as Phaser.GameObjects.Graphics;
    g.clear();
    const r = Math.round((size / 2) * progress);
    if (r <= 0) return;
    g.fillStyle(PALETTE.wax, 1);
    g.fillCircle(cx, cy, r);
    if (r > 12) {
      g.fillStyle(PALETTE.ink, 1);
      g.fillCircle(cx, cy, r - 10);
      g.fillStyle(PALETTE.wax, 1);
      g.fillCircle(cx, cy, Math.max(0, r - 22));
    }
  };

  if (useArt) {
    // 크게 들어와서 제 크기로 내려앉는다 — 「쾅」은 크기 변화에서 나온다
    (mark as Phaser.GameObjects.Image).setScale(2.2).setAlpha(0);
  } else {
    paintFallback(0);
  }

  // hitStop — 아무것도 움직이지 않는 120ms 가 타격을 만든다
  scene.time.delayedCall(HIT_STOP_MS, () => {
    scene.cameras.main.shake(260, 0.003);
    const tick = scene.time.addEvent({
      delay: FRAME_MS,
      repeat: FRAMES - 1,
      callback: () => {
        frame += 1;
        const progress = frame / FRAMES;
        if (useArt) {
          const img = mark as Phaser.GameObjects.Image;
          img.setFrame(Math.min(FRAMES - 1, frame - 1));
          img.setAlpha(1);
          img.setScale(2.2 - 1.2 * progress);
        } else {
          paintFallback(progress);
        }
        if (frame >= FRAMES) {
          tick.remove();
          scene.time.delayedCall(220, opts.onDone);
        }
      },
    });
  });
}
