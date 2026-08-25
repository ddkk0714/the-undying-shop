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
    radio: { x: 556, y: 648, w: 200, h: 382 },     // 무전기. 지도 우하단에 비스듬히 걸친다
    combat: { x: 738, y: 144, w: 1182, h: 936 },   // 던전 (층 구간별로 갈아 끼운다)
    // 방송 오버레이 바 — ON AIR · 방송 이름 · 시청자 수. 전투 칸 위에 걸친다
    liveBar: { x: 738, y: 144, w: 1182, h: 60 },   // HUD 바로 아래에 딱 붙는다
    badge: { x: 750, y: 148, w: 145, h: 52 },      // ON AIR 표시 (바 왼쪽 끝. 206x74 의 비율 유지)
    // 목업의 채팅창은 생각보다 작다. 560 으로 넓혔더니 적 CG 자리를 먹었다 (실측)
    chat: { x: 782, y: 216, w: 424, h: 496 },
    // 적은 배경의 **바닥선**에 발을 딛는다. 배경 그림에서 길이 시작되는 높이가 y 716 근처다
    enemy: { x: 1230, y: 540, w: 256, h: 256 },
    // 우상단 흉상. **1:1 로 놓고 칸을 줄여 잘라낸다** — 배율을 낮추면(0.83배 등)
    // 도트가 지글거린다. 칸이 작아진 만큼 얼굴 위주로 더 바짝 잘린다
    portrait: { x: 1640, y: 216, w: 256, h: 248 },
    stats: { x: 1640, y: 472, w: 256, h: 200 },    // 초상 바로 아래 — 이름·공·방·체력
    lantern: { x: 1440, y: 470, w: 460, h: 568 },  // 우하단 전경 (랜턴 든 팔)
    dialogue: { x: 860, y: 848, w: 900, h: 173 },  // 용사 대사 배너 (원본 1592x307 의 비율 그대로)
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
