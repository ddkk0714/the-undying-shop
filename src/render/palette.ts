/** 00-OVERVIEW §7-1 — 9색 고정. 이 밖의 색은 어떤 모듈도 쓰지 않는다. */
export const PALETTE = {
  soot: 0x12100e,   // 배경 최하층 · 그을음
  ash: 0x1e1a17,    // 패널 · 재
  clay: 0x2c2622,   // 융기 패널 · 흙
  line: 0x3d342e,   // 구분선
  bone: 0xe6dcc8,   // 본문 텍스트 · 뼈
  dust: 0x8a8073,   // 보조 텍스트 · 먼지
  wax: 0xc0392f,    // ★메인 · 봉랍
  tallow: 0xe0a63c, // 골드/가치 · 촛농
  spirit: 0x5f8c7b, // 부활/연금술 · 영액 (소생실 전용)
} as const;

export type PaletteName = keyof typeof PALETTE;

export const hex = (n: PaletteName): number => PALETTE[n];
export const css = (n: PaletteName): string => '#' + PALETTE[n].toString(16).padStart(6, '0');
