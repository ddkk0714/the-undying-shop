/**
 * 01-ARCHITECTURE §4 — 기준 해상도.
 * v3.1 아트 개편으로 480x270 → **1920x1080**. 아트가 고해상도 1비트 디더로 바뀌었다.
 */
export const BASE_W = 1920;
export const BASE_H = 1080;

/** M01 인터페이스 — 씬 키는 문자열 리터럴을 흩뿌리지 않고 여기서만 관리한다. */
export const SCENES = {
  BOOT: 'Boot',
  PRELOAD: 'Preload',
  TITLE: 'Title',
  DAY: 'Day',
  ENDING: 'Ending',
  WIPE: 'Wipe',
  HELP: 'Help',
  OPTIONS: 'Options',

  // 단계 씬 — DayScene 이 phase 에 맞춰 launch/stop 한다 (v3 6단계)
  PHASE_REVIVE: 'PhaseRevive',
  PHASE_OFFICE: 'PhaseOffice',
  PHASE_LIVE: 'PhaseLive',
  PHASE_DEATH: 'PhaseDeath',
  PHASE_AUTOPSY: 'PhaseAutopsy',
  PHASE_ANNOUNCE: 'PhaseAnnounce',
} as const;

export type SceneKey = (typeof SCENES)[keyof typeof SCENES];

/** 캔버스 밖 여백("액자") 색. soot 보다 한 단계 어둡다. */
export const LETTERBOX = '#0A0908';
