import Phaser from 'phaser';
import { PALETTE } from '../render/palette';
import { firstTexture, starArt } from '../render/assets';
import { L } from './layout';
import type { Star } from '../core/types';

/**
 * M03 §열화 — **열화는 숫자로 표시하지 않는다. 초상화와 대사로만 보여준다.**
 *
 * | reviveCount | 시각 표현 |
 * |---|---|
 * | 0 | 없음 |
 * | 1 | 초상 우하단 균열 1 |
 * | 2 | 균열 2 + 알파 0.95 |
 * | 3 | 균열 3 + 디더 노이즈 |
 * | 4 | 실루엣 일부 결손 |
 * | 5+ | 초상이 반쯤 지워짐 |
 *
 * 소생 횟수가 몇 번인지 세어 보게 만들지 않는다. **몸이 상해 가는 게 보이면 그걸로 끝이다.**
 */

export interface PortraitOpts {
  /** 어필 컷으로 바꿔 그린다 (M06 §7) */
  appealing?: boolean;
  /** 연출 감소 — 노이즈와 결손을 뺀다 */
  reduced?: boolean;
}

/**
 * 상자 안에 초상을 비율을 지켜 넣고, 그 위에 열화를 얹는다.
 * 그림이 없으면 실루엣으로, 실루엣도 없으면 mid 사각형으로 내려간다.
 */
export function portrait(
  scene: Phaser.Scene,
  box: { x: number; y: number; w: number; h: number },
  star: Star | undefined,
  opts: PortraitOpts = {},
): void {
  const x = Math.round(box.x);
  const y = Math.round(box.y);

  if (star === undefined) {
    fill(scene, x, y, box.w, box.h, PALETTE.mid);
    return;
  }

  const art = starArt(star.id);
  const keys = opts.appealing === true ? [art.appeal, art.portrait] : [art.portrait];
  const tex = firstTexture(scene, ...keys, 'star.silhouette');
  let drawn = { x, y, w: Math.round(box.w), h: Math.round(box.h) };

  if (tex === null) {
    fill(scene, x, y, box.w, box.h, PALETTE.mid);
  } else {
    const src = scene.textures.get(tex).getSourceImage() as { width: number; height: number };
    const scale = Math.min(box.w / src.width, box.h / src.height);
    const w = Math.round(src.width * scale);
    const h = Math.round(src.height * scale);
    drawn = { x: Math.round(x + (box.w - w) / 2), y: Math.round(y + (box.h - h) / 2), w, h };
    scene.add.image(drawn.x, drawn.y, tex).setOrigin(0, 0).setDisplaySize(w, h);
  }

  degradeOverlay(scene, drawn, star.reviveCount, opts.reduced === true);
}

/**
 * 그림은 이미 그려져 있고 **열화만 얹고 싶을 때** (전신 아트 위 등).
 * 소생 횟수만큼 몸이 상한다.
 */
export function degradeOverlay(
  scene: Phaser.Scene,
  box: { x: number; y: number; w: number; h: number },
  reviveCount: number,
  reduced: boolean,
): void {
  if (reviveCount <= 0) return;
  const g = scene.add.graphics();

  // 균열 — 1회당 하나씩, 우하단에서 위로 뻗는다. 최대 3.
  // ★ ink 로 그으면 어두운 실루엣 위에서 보이지 않는다. 1비트 팔레트에서는
  //   **밝은 선**이 금으로 읽힌다 — 갈라진 자리로 빛이 들어온 것처럼.
  const cracks = Math.min(3, reviveCount);
  g.fillStyle(PALETTE.dust, 1);
  for (let i = 0; i < cracks; i += 1) {
    let cx = box.x + box.w - Math.round(box.w * (0.18 + i * 0.14));
    let cy = box.y + box.h - 8;
    const steps = Math.round(box.h * (0.34 + i * 0.12)) >> 2;
    for (let s = 0; s < steps; s += 1) {
      // 지그재그 — 직선으로 그으면 균열로 안 보인다
      cx += ((s + i) % 3 === 0 ? 3 : -2);
      cy -= 4;
      g.fillRect(cx, cy, L.line, 4);
    }
  }

  // 2회부터 전체가 조금 흐려진다
  if (reviveCount >= 2) {
    g.fillStyle(PALETTE.ink, 0.05);
    g.fillRect(box.x, box.y, box.w, box.h);
  }

  if (reduced) return;

  // 3회 — 디더 노이즈가 낀다
  if (reviveCount >= 3) {
    g.fillStyle(PALETTE.ink, 1);
    for (let py = box.y; py < box.y + box.h; py += 6) {
      for (let px = box.x + ((py / 6) % 2 === 0 ? 0 : 3); px < box.x + box.w; px += 6) {
        g.fillRect(px, py, 2, 2);
      }
    }
  }

  // 4회 — 실루엣 일부가 결손된다. 도려낸 자리는 배경색이다
  if (reviveCount >= 4) {
    g.fillStyle(PALETTE.ink, 1);
    for (let i = 0; i < 5; i += 1) {
      const w = Math.round(box.w * 0.18);
      const h = Math.round(box.h * 0.06);
      g.fillRect(
        box.x + Math.round(box.w * (0.1 + ((i * 37) % 70) / 100)),
        box.y + Math.round(box.h * (0.2 + ((i * 53) % 60) / 100)),
        w,
        h,
      );
    }
  }

  // 5회 이상 — 아래 절반이 지워진다
  if (reviveCount >= 5) {
    g.fillStyle(PALETTE.ink, 0.72);
    g.fillRect(box.x, box.y + Math.round(box.h / 2), box.w, Math.round(box.h / 2));
  }
}

function fill(scene: Phaser.Scene, x: number, y: number, w: number, h: number, color: number): void {
  const g = scene.add.graphics();
  g.fillStyle(color, 1);
  g.fillRect(x, y, Math.round(w), Math.round(h));
}
