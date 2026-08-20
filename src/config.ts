/** 01-ARCHITECTURE §4 — 픽셀 퍼펙트 기준 해상도. 이 두 값은 바꾸지 않는다. */
export const BASE_W = 480;
export const BASE_H = 270;

/** M01 인터페이스 — 씬 키는 문자열 리터럴을 흩뿌리지 않고 여기서만 관리한다. */
export const SCENES = {
  BOOT: 'Boot',
  PRELOAD: 'Preload',
  TITLE: 'Title',
  DAY: 'Day',
  ENDING: 'Ending',
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
