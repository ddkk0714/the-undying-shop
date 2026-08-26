/**
 * 00-OVERVIEW §7-1 (v3.1 아트 개편) — **1비트 디더 · 지정 3색**.
 *
 * 기획자 지정색 3개(ink · mid · bone)가 전부다.
 * 중간 계조가 필요하면 색을 늘리지 말고 **디더 패턴**을 쓴다.
 */
export const PALETTE = {
  // ★배경 · 그림자. **순수 검정이다** (사용자 확정).
  //
  // 원래 0x0f1f17 (초록기 도는 검정)이었다. 그런데 실제로 받은 아트를 세어 보면
  // 어두운 부분이 거의 다 #000000 이다 — 던전 배경 69% · 채팅창 95% · 표정 14%(+#161713 5%).
  // #0f1f17 을 쓰는 건 `title.png` 한 장뿐이고 그건 그림 안에 들어 있다.
  // 그래서 씬 배경만 초록빛으로 떠서 검은 아트 위에 얹힌 것처럼 보였다.
  ink: 0x000000,
  mid: 0x3a3c31,  // ★지정 · 캐릭터 중간색 · 융기 패널 · 비활성
  bone: 0xc2c8a5, // ★지정 · 시스템 전반 (텍스트 · 라인 · 밝은 면)

  dust: 0x68735e, // 파생 — bone/ink 50% 디더의 근사치. 보조 텍스트 전용
  wax: 0xc0392f,  // 강조 — 화면에서 유일한 유채색 (LIVE · 소생 · 위험 · 봉랍)
} as const;

export type PaletteName = keyof typeof PALETTE;

export const hex = (n: PaletteName): number => PALETTE[n];
export const css = (n: PaletteName): string => '#' + PALETTE[n].toString(16).padStart(6, '0');
