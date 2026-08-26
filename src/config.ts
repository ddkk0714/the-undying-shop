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
  // PHASE_AUTOPSY · PHASE_ANNOUNCE — 검시실·발표 창은 뺐다 (사용자 확정).
  // core 의 AUTOPSY/ANNOUNCE 단계 자체는 그대로 있고(계약 파일), DayScene 이
  // 화면 없이 기본값으로 자동 통과시킨다. 대신 그 자리에 하루 종료 화면을 하나 끼운다.
  PHASE_DAYEND: 'PhaseDayEnd',
} as const;

export type SceneKey = (typeof SCENES)[keyof typeof SCENES];

/**
 * 캔버스 밖 여백("액자") 색. **순수 검정** — 팔레트의 `ink` 와 같은 값이다 (사용자 확정).
 * 예전 #0A0908 은 따뜻한 기가 도는 검정이라 화면 가장자리만 색이 달랐다.
 */
export const LETTERBOX = '#000000';
