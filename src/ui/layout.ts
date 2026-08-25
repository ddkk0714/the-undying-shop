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
  guest: { x: 0, y: 144, w: 650, h: 792 },
  dialogue: { x: 0, y: 936, w: 650, h: 144 },
  bench: { x: 668, y: 144, w: 1244, h: 792 },
  actions: { x: 668, y: 936, w: 1244, h: 144 },
  actionsFull: { x: 0, y: 936, w: 1920, h: 144 },

  // Broadcast composition follows the supplied desk, map, battle and portrait art.
  live: {
    bar: { x: 0, y: 0, w: 1920, h: 144 },
    floors: { x: 0, y: 144, w: 104, h: 792 },
    map: { x: 104, y: 144, w: 616, h: 792 },
    radio: { x: 704, y: 576, w: 384, h: 360 },
    combat: { x: 720, y: 144, w: 1000, h: 792 },
    choices: { x: 1040, y: 936, w: 840, h: 144 },
    portrait: { x: 1560, y: 176, w: 336, h: 400 },
    chat: { x: 832, y: 320, w: 360, h: 240 },
  },

  // Contract sheet sits on the paper-shaped central area of the workbench.
  office: {
    paper: { x: 928, y: 168, w: 640, h: 720 },
  },

  slot3: { x: 1008, y: 240, w: 224, h: 272, gap: 16 },
  pad: 24,
  line: 2,
} as const;

export const slotX = (i: number): number => L.slot3.x + i * (L.slot3.w + L.slot3.gap);

export const ACTION_W = 290;
export const actionX = (i: number): number => L.actions.x + L.pad + i * (ACTION_W + 12);
