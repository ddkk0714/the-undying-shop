/**
 * 07-PARALLEL-DEV §5-3 — Codex 의 core 가 도착하기 전까지 화면을 만들기 위한 가짜 스토어.
 *
 * ★ Claude Code 소유. 최종 빌드에서 제외한다.
 * ★ src/core/types.ts (계약) 외에는 아무것도 참조하지 않는다.
 *   실제 core/store.ts 가 오면 import 한 줄만 바꾼다.
 *
 * Codex 가 만들 예정인 systems/*.ts 를 "임시로" 채우지 않기 위한 장치다.
 */

import type { Action } from '../../core/actions';
import type { GameState } from '../../core/types';

export type Unsubscribe = () => void;

/** 01-ARCHITECTURE §3-1 의 Store 계약 */
export interface Store {
  getState(): Readonly<GameState>;
  dispatch(action: Action): void;
  subscribe(fn: (s: Readonly<GameState>, prev: Readonly<GameState>) => void): Unsubscribe;
}

export const FAKE_STATE: GameState = {
  version: 1,
  seed: 1234,
  rngCursor: 0,

  day: 1,
  phase: 'REVIVE',
  phaseStartedAt: 0,
  isOver: false,
  ending: null,

  gold: 1200,
  fans: 84200,
  reputation: 62,
  maxFloor: 26,

  leak: 0,
  viewerFatigue: 0,

  stars: [
    {
      id: 'body_karin',
      bodyName: '카린',
      portraitKey: 'star.portrait.karin',
      stats: { grit: 6, charisma: 7, luck: 5 },
      reviveCount: 0,
      personaId: 'persona_rion',
      status: 'ALIVE',
      witnessed: [],
    },
  ],
  personas: [
    {
      id: 'persona_rion',
      displayName: '불꽃의 리온',
      fandom: 84200,
      recognition: 'A',
      goodsRevenue: 320,
      generation: 3,
      lineage: [],
      suspicion: 0,
    },
  ],
  recruitPool: [],
  corpses: [],

  today: null,

  shelf: [null, null, null],
  inventory: [],

  seenWitnessFloors: [],
  witnessLog: [],
  flags: {},

  pendingFx: [],

  stats: {
    totalRevived: 0,
    totalDiscarded: 0,
    liesTold: 0,
    chatsDeleted: 0,
    falseAnnouncements: 0,
    goldEarned: 0,
    goldSpentOnRevive: 0,
    deepestFloor: 26,
  },
};

/** dispatch 는 아무 일도 하지 않는다. 로직은 Codex 영역이다. */
export const fakeStore: Store = {
  getState: () => FAKE_STATE,
  dispatch: (action: Action) => {
    if (import.meta.env.DEV) console.debug('[fakeStore] dispatch (무시됨):', action.type);
  },
  subscribe: () => () => {},
};
