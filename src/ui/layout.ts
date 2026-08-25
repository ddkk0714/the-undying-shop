/**
 * Shared 1920×1080 layout.
 *
 * The shop and broadcast art sets define these measurements. UI is positioned
 * around the artwork rather than stretching the artwork to a generic grid.
 */
export const L = {
  W: 1920,
  H: 1080,

  hud: { x: 0, y: 0, w: 1920, h: 144 },
  hudStatus: { x: 8, y: 16, w: 752, h: 112 },
  hudTools: { x: 768, y: 16, w: 1144, h: 112 },
  stage: { x: 0, y: 144, w: 1920, h: 936 },

  // Source art: room 1086×1324, bench 1748×1112. These preserve both ratios.
  guest: { x: 0, y: 147, w: 736, h: 792 },
  dialogue: { x: 0, y: 936, w: 736, h: 144 },
  bench: { x: 752, y: 147, w: 1160, h: 792 },
  actions: { x: 752, y: 936, w: 1160, h: 144 },
  actionsFull: { x: 0, y: 936, w: 1920, h: 144 },

  // Broadcast composition follows the supplied desk, map, battle and portrait art.
  /**
   * ③ 생방송 — `예상 이미지/전투화면.png` 배치 (HO-022).
   *
   * 기준은 **던전 배경을 원본 비율 그대로 놓는 것**이다 (1680x1330 -> 1182x936, 잘린 데 0).
   * 좌측 폭 738 은 그러고 남은 값이지 임의로 정한 게 아니다.
   * 상단 144 는 `DayScene` 의 HUD 다 — 이 씬은 그 위를 덮지 않는다.
   */
  live: {
    desk: { x: 0, y: 144, w: 738, h: 936 },        // 좌측 책상 판 (지도·무전기가 올라간다)
    floors: { x: 0, y: 144, w: 210, h: 936 },      // 탑 단면 층계 게이지
    map: { x: 140, y: 200, w: 620, h: 786 },       // 찢어진 지도 종이 — 방·복도는 씬이 그린다
    radio: { x: 600, y: 690, w: 220, h: 420 },     // 무전기. 지도 우하단에 겹친다
    combat: { x: 738, y: 144, w: 1182, h: 936 },   // 던전 (층 구간별로 갈아 끼운다)
    badge: { x: 782, y: 190, w: 206, h: 74 },      // LIVE 표시
    // 목업의 채팅창은 생각보다 작다. 560 으로 넓혔더니 적 CG 자리를 먹었다 (실측)
    chat: { x: 782, y: 288, w: 424, h: 300 },
    enemy: { x: 1230, y: 260, w: 256, h: 256 },    // 적 CG — 512x512 의 정확히 1/2
    // 우상단 흉상. 폭을 원본 초상과 같은 384 로 잡아 **1:1 로 놓는다** —
    // 320 으로 줄이면 0.83배가 되어 도트가 지글거린다. 세로만 잘라 흉상으로 만든다
    portrait: { x: 1512, y: 190, w: 384, h: 320 },
    stats: { x: 1512, y: 526, w: 384, h: 232 },    // 초상 아래 상태 (이름·상태·소생·어필)
    lantern: { x: 1440, y: 470, w: 460, h: 568 },  // 우하단 전경 (랜턴 든 팔)
    dialogue: { x: 820, y: 756, w: 1040, h: 200 }, // 용사 대사 배너
    choices: { x: 1024, y: 956, w: 896, h: 108 },  // 3택
  },

  // Contract sheet sits on the paper-shaped central area of the workbench.
  office: {
    paper: { x: 928, y: 171, w: 640, h: 720 },
  },

  slot3: { x: 1008, y: 243, w: 224, h: 272, gap: 16 },
  pad: 24,
  line: 2,
} as const;

export const slotX = (i: number): number => L.slot3.x + i * (L.slot3.w + L.slot3.gap);

export const ACTION_W = 269;
export const actionX = (i: number): number => L.actions.x + L.pad + i * (ACTION_W + 12);
