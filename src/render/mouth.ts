/**
 * 말하는 동안 얼굴에 얹는 **입** — 어디에 얹을지의 표.
 *
 * 받은 입 그림(`아트_V3/캐릭터/입`)은 표정 스프라이트(752x792)에서 잘라 낸 조각이라,
 * **그 스프라이트 좌표계 안의 한 점**으로만 자리를 말할 수 있다. 화면 좌표가 아니다 —
 * 씬마다 스프라이트를 자르고 줄이는 방식이 달라서, 그 변환은 부르는 쪽이 한다.
 *
 * ★ 자리는 눈대중이 아니다. 표정 스프라이트를 20px 격자와 함께 떠서 입 중심을 읽고,
 *   입 그림의 어두운 부분(벌린 입) 중심을 계산해서 둘을 맞춘 값이다. 다섯 캐릭터 모두
 *   합성해서 얼굴에 제대로 붙는지 눈으로 확인했다.
 *   흰 배경으로 온 파일(세이로)은 `tools/key-white.mjs` 로 투명하게 만들어 두었다.
 */

export interface MouthSpot {
  /** 표정 스프라이트 좌표계에서 입 그림의 왼쪽 위 */
  x: number;
  y: number;
  w: number;
  h: number;
}

const SPOT: Record<string, MouthSpot> = {
  karin: { x: 342, y: 234, w: 84, h: 57 },
  juno: { x: 342, y: 216, w: 64, h: 55 },
  sela: { x: 347, y: 254, w: 40, h: 16 },
  ilan: { x: 290, y: 300, w: 50, h: 60 },
  mor: { x: 349, y: 241, w: 56, h: 40 },
};

/** `body_karin` → `karin`. `starArt` 와 같은 규칙이다 */
function shortName(starId: string): string {
  return starId.replace(/^body_/, '');
}

export function mouthKey(starId: string): string {
  return `star.mouth.${shortName(starId)}`;
}

/** 이 배우의 입 자리. 표에 없으면 null — 그러면 입을 얹지 않는다 */
export function mouthSpot(starId: string | undefined): MouthSpot | null {
  if (starId === undefined) return null;
  return SPOT[shortName(starId)] ?? null;
}
