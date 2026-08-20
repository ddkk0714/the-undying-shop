/** 04-UI-KIT §1 — 모든 좌표는 이 상수를 쓴다. 씬에서 좌표를 새로 정하지 않는다. */
export const L = {
  W: 480,
  H: 270,

  hud: { x: 0, y: 0, w: 480, h: 26 },
  stage: { x: 0, y: 26, w: 480, h: 244 }, // 단계별 본문 영역

  // ④ DIVE 전용
  tower: { x: 0, y: 26, w: 288, h: 178 },
  chat: { x: 288, y: 26, w: 192, h: 178 },
  radio: { x: 0, y: 204, w: 480, h: 66 },

  // 공통 하단 액션 바
  actions: { x: 0, y: 226, w: 480, h: 44 },

  // 3칸 그리드 (진열대 / 캐스팅 / 검시 선택지)
  slot3: { x: 24, y: 70, w: 136, h: 120, gap: 12 },

  pad: 6,
  line: 1,
} as const;

/** 슬롯 x 좌표: 24, 172, 320 — 우측 여백 24로 대칭 */
export const slotX = (i: number): number => L.slot3.x + i * (L.slot3.w + L.slot3.gap);
