import Phaser from 'phaser';
import { PALETTE, css } from '../render/palette';
import { FONT } from '../render/font';
import { L } from './layout';

/**
 * 04-UI-KIT §7 — 첫 30초 온보딩.
 *
 * **Day 1 은 강제 튜토리얼 하루다.** 각 단계에 한 줄만 얹는다.
 * Day 2 부터는 아무것도 표시하지 않는다.
 *
 * 규칙을 설명하지 않는다. **무엇을 고르는 자리인지만** 말한다.
 * 특히 무전의 한 줄은 이 게임 전체를 설명한다 —
 * 「갈림길이다. 진짜 지도는 당신만 본다.」
 */

export type OnboardTag =
  | 'REVIVE'
  | 'OFFICE_CONTRACT'
  | 'OFFICE_SHELF'
  | 'LIVE_COMBAT'
  | 'LIVE_RADIO';

const LINES: Record<OnboardTag, string> = {
  REVIVE: '사망한 출연자를 되살릴지 결정하세요.',
  OFFICE_CONTRACT: '계약서를 확인하고 수락 또는 거절하세요.',
  OFFICE_SHELF: '장비를 진열해 출연자를 강화하세요.',
  LIVE_COMBAT: '어필하면 수입이 늘지만 더 다칩니다.',
  LIVE_RADIO: '지도를 보고 갈림길을 선택하세요.',
};

/** 화면마다 빈 자리가 다르다. 부르는 쪽이 자리를 정한다 */
export interface OnboardSpot {
  x: number;
  y: number;
  w: number;
}

/** 본문 32px 기준 글자 폭 — 전각 32, 반각 16 (04-UI-KIT §3 과 같은 규칙) */
function wrapLine(s: string, px: number): string[] {
  const lines: string[] = [];
  let cur = '';
  let used = 0;
  for (const ch of s) {
    const w = ch.charCodeAt(0) > 0x2000 ? 32 : 16;
    if (used + w > px && cur !== '') {
      lines.push(cur);
      cur = '';
      used = 0;
    }
    cur += ch;
    used += w;
  }
  if (cur !== '') lines.push(cur);
  return lines;
}

/**
 * Day 1 에만 한 줄을 얹는다. 다른 날은 아무것도 하지 않는다.
 * 조작을 막지 않는다 — 위에 떠 있을 뿐이다.
 *
 * ★ `spot.w` 를 **지킨다.** 예전에는 판만 그 폭으로 그리고 글자는 그냥 흘려서,
 *   좁은 자리에 부르면 글이 판 밖으로 삐져나와 옆 그림에 깔렸다
 *   (생방송 무전기를 지도 우하단으로 옮기고 나서 드러났다). 넘치면 줄을 접는다.
 */
export function onboard(scene: Phaser.Scene, day: number, tag: OnboardTag, spot: OnboardSpot): void {
  if (day !== 1) return;
  const x = Math.round(spot.x);
  const y = Math.round(spot.y);
  const w = Math.round(spot.w);
  const lines = wrapLine(LINES[tag], w - 40);
  const h = 16 + lines.length * 32;

  const g = scene.add.graphics();
  g.fillStyle(PALETTE.ink, 0.88);
  g.fillRect(x, y, w, h);
  // 왼쪽에 붉은 눈금 하나 — 「지금 여기」 표시
  g.fillStyle(PALETTE.wax, 1);
  g.fillRect(x, y, L.line * 2, h);

  lines.forEach((line, i) => {
    scene.add.text(x + 20, y + 8 + i * 32, line, { ...FONT, color: css('bone') });
  });
}
