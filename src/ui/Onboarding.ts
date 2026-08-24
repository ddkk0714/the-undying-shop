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
  | 'LIVE_RADIO'
  | 'AUTOPSY'
  | 'ANNOUNCE';

const LINES: Record<OnboardTag, string> = {
  REVIVE: '어제 리온이 죽었다. 살릴 것인가.',
  OFFICE_CONTRACT: '그가 적어온 숫자다. 사실인지는 아무도 모른다.',
  OFFICE_SHELF: '진열한 장비는 그의 무기가 된다. 파는 것은 따로다.',
  LIVE_COMBAT: '어필하면 돈이 된다. 그리고 그가 더 다친다.',
  LIVE_RADIO: '갈림길이다. 진짜 지도는 당신만 본다.',
  AUTOPSY: '온전하면 되살아난다. 그리고 본 것을 말한다.',
  ANNOUNCE: '공표는 사실과 달라도 된다.',
};

/** 화면마다 빈 자리가 다르다. 부르는 쪽이 자리를 정한다 */
export interface OnboardSpot {
  x: number;
  y: number;
  w: number;
}

/**
 * Day 1 에만 한 줄을 얹는다. 다른 날은 아무것도 하지 않는다.
 * 조작을 막지 않는다 — 위에 떠 있을 뿐이다.
 */
export function onboard(scene: Phaser.Scene, day: number, tag: OnboardTag, spot: OnboardSpot): void {
  if (day !== 1) return;
  const text = LINES[tag];
  const x = Math.round(spot.x);
  const y = Math.round(spot.y);
  const h = 48;

  const g = scene.add.graphics();
  g.fillStyle(PALETTE.ink, 0.88);
  g.fillRect(x, y, Math.round(spot.w), h);
  // 왼쪽에 붉은 눈금 하나 — 「지금 여기」 표시
  g.fillStyle(PALETTE.wax, 1);
  g.fillRect(x, y, L.line * 2, h);

  scene.add.text(x + 20, y + 8, text, { ...FONT, color: css('bone') });
}
