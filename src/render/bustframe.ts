/**
 * 전신 표정 스프라이트(752x792)에서 **흉상으로 쓸 네모**.
 *
 * 전투 초상 칸은 256x248 이고 `bust()` 는 원래 384x480 짜리 흉상 그림을 1:1 로 놓고
 * 잘라 쓰도록 짜여 있었다. 표정은 전신이라 같은 식으로 자르면 위쪽 한 조각만 뽑혀
 * 턱이 잘린다 — 그래서 **얼굴 상자를 따로 재서 절반으로 줄인다.**
 *
 * ★ 상자 크기를 512x496 으로 잡은 건 우연이 아니다. 초상 칸(256x248)의 **정확히 2배**라
 *   배율이 1/2 로 떨어진다. 소수배로 줄이면 디더가 뭉갠다 (00-OVERVIEW §7-1).
 *
 * ★ 자리는 실측이다. 다섯 캐릭터 모두 **머리끝에서 입까지 247~275px** 로 거의 같아
 *   (스프라이트가 같은 판형으로 그려져 있다), 상자를 **머리끝에 맞추고 입 x 를 가운데**
 *   두면 다 맞는다. 다만 그림마다 여백이 달라서 (ilan 은 머리끝이 y=71) 값은 캐릭터별로 둔다.
 */

export interface BustFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 이 표가 전제하는 원본 크기. 다른 판형이 오면 쓰지 않는다 */
const SPRITE_W = 752;
const SPRITE_H = 792;

/** 초상 칸의 정확히 2배 — 1/2 로 줄어든다 */
const FRAME_W = 512;
const FRAME_H = 496;

/** [머리끝 y, 입 중심 x] — 격자 캡처와 알파 경계로 잰 값 */
const ANCHOR: Record<string, readonly [number, number]> = {
  karin: [1, 381],
  juno: [0, 372],
  sela: [0, 364],
  ilan: [71, 316],
  mor: [0, 371],
};

/** `body_karin` → `karin` */
function shortName(starId: string): string {
  return starId.replace(/^body_/, '');
}

/**
 * 이 배우의 전신에서 흉상으로 쓸 네모. 표에 없거나 판형이 다르면 null —
 * 그때는 부르는 쪽이 원래 방식(1:1 잘라내기)으로 돌아간다.
 */
export function bustFrame(starId: string, srcW: number, srcH: number): BustFrame | null {
  if (srcW !== SPRITE_W || srcH !== SPRITE_H) return null;
  const anchor = ANCHOR[shortName(starId)];
  if (anchor === undefined) return null;
  const [top, mouthX] = anchor;
  return {
    x: Math.max(0, Math.min(mouthX - FRAME_W / 2, srcW - FRAME_W)),
    y: Math.max(0, Math.min(top, srcH - FRAME_H)),
    w: FRAME_W,
    h: FRAME_H,
  };
}
