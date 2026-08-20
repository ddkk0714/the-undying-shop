import { content } from './content';
import { draw } from './rng';
import { createInitialState } from './state';
import type { Action } from './actions';
import type { Corpse, GameState, PhaseId, Star, TodayRun } from './types';

const phaseOrder: PhaseId[] = ['REVIVE', 'CASTING', 'SHOP', 'DIVE', 'DEATH', 'AUTOPSY', 'ANNOUNCE'];

function nextPhase(phase: PhaseId): PhaseId {
  return phaseOrder[(phaseOrder.indexOf(phase) + 1) % phaseOrder.length] ?? 'REVIVE';
}

function withPhase(state: GameState, phase: PhaseId): GameState {
  return { ...state, phase };
}

function aliveStars(state: GameState): Star[] {
  return state.stars.filter((star) => star.status === 'ALIVE');
}

function popularStar(state: GameState): Star | undefined {
  return aliveStars(state).sort((left, right) => {
    const leftFandom = state.personas.find((persona) => persona.id === left.personaId)?.fandom ?? 0;
    const rightFandom = state.personas.find((persona) => persona.id === right.personaId)?.fandom ?? 0;
    return rightFandom - leftFandom || left.id.localeCompare(right.id);
  })[0];
}

function latestTodayCorpse(state: GameState): Corpse | undefined {
  return state.today === null ? undefined : state.corpses.find((corpse) => corpse.starId === state.today?.starId && corpse.diedDay === state.day);
}

function startDive(state: GameState): GameState {
  if (state.today === null) return state;
  const star = state.stars.find((candidate) => candidate.id === state.today?.starId);
  if (star === undefined) return state;
  const itemDepth = state.shelf.reduce((sum, id) => sum + (content.items.find((item) => item.id === id)?.depth ?? 0), 0);
  const targetCeiling = Math.max(1, Math.round(content.balance.dive.baseFloorConst + star.stats.grit * content.balance.dive.gritMul + star.stats.luck * content.balance.dive.luckMul + itemDepth));
  return withPhase({ ...state, today: { ...state.today, targetCeiling } }, 'DIVE');
}

function finishDive(state: GameState): GameState {
  if (state.today === null || state.today.diedFloor !== null) return withPhase(state, 'DEATH');
  const diedFloor = Math.max(1, state.today.currentFloor, state.today.targetCeiling);
  const star = state.stars.find((candidate) => candidate.id === state.today?.starId);
  if (star === undefined) return withPhase(state, 'DEATH');
  const corpse: Corpse = { starId: star.id, diedFloor, diedDay: state.day, grade: 'INTACT', announced: null, loot: [] };
  const stars = state.stars.map((candidate) => candidate.id === star.id ? { ...candidate, status: 'DEAD' as const } : candidate);
  const maxFloor = Math.max(state.maxFloor, diedFloor);
  return {
    ...state,
    phase: 'DEATH',
    stars,
    corpses: [...state.corpses, corpse],
    today: { ...state.today, currentFloor: diedFloor, diedFloor, deathCause: '하강 중 사망' },
    maxFloor,
    pendingFx: [...state.pendingFx, { kind: 'DEATH_FLASH' }, ...(diedFloor > state.maxFloor ? [{ kind: 'RECORD_BREAK' as const }] : [])],
    stats: { ...state.stats, deepestFloor: Math.max(state.stats.deepestFloor, diedFloor) },
  };
}

function advance(state: GameState): GameState {
  if (state.isOver) return state;
  if (state.phase === 'SHOP') return startDive(state);
  if (state.phase === 'DIVE') return finishDive(state);
  if (state.phase === 'ANNOUNCE') {
    if (state.day >= content.balance.start.days) {
      return { ...state, isOver: true, ending: state.maxFloor >= content.balance.start.targetFloor ? 'A_OPEN' : state.leak >= 70 ? 'B_REVEAL' : 'B_CONTINUE', today: null };
    }
    return { ...state, day: state.day + 1, phase: 'REVIVE', today: null, shelf: [null, null, null] };
  }
  return withPhase(state, nextPhase(state.phase));
}

function timeout(state: GameState): GameState {
  switch (state.phase) {
    case 'REVIVE': return advance(state);
    case 'CASTING': {
      const star = popularStar(state);
      return star === undefined ? advance(state) : reducer(state, { type: 'CASTING/PICK', starId: star.id });
    }
    case 'SHOP': return reducer(state, { type: 'SHOP/CONFIRM' });
    case 'DIVE': return advance(state);
    case 'AUTOPSY': return reducer(state, { type: 'AUTOPSY/DECIDE', grade: 'INTACT' });
    case 'ANNOUNCE': return reducer(state, { type: 'ANNOUNCE/DECLARE', as: 'SUCCESS' });
    case 'DEATH': return advance(state);
  }
}

export function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'GAME/NEW': return createInitialState(action.seed);
    case 'GAME/LOAD': return structuredClone(action.state);
    case 'PHASE/ADVANCE': return advance(state);
    case 'PHASE/TIMEOUT': return timeout(state);
    case 'REVIVE/PAY': {
      if (state.phase !== 'REVIVE') return state;
      const corpse = state.corpses.find((candidate) => candidate.starId === action.starId && candidate.grade === 'INTACT');
      if (corpse === undefined) return state;
      return {
        ...state,
        stars: state.stars.map((star) => star.id === action.starId ? { ...star, status: 'ALIVE' as const, reviveCount: star.reviveCount + 1 } : star),
        stats: { ...state.stats, totalRevived: state.stats.totalRevived + 1 },
      };
    }
    case 'REVIVE/SKIP': return state;
    case 'REVIVE/INHERIT': return state;
    case 'CASTING/PICK': {
      if (state.phase !== 'CASTING') return state;
      const star = aliveStars(state).find((candidate) => candidate.id === action.starId);
      if (star === undefined) return state;
      const today: TodayRun = { starId: star.id, personaId: star.personaId, currentFloor: 1, targetCeiling: 1, forks: [], superchat: 0, fansDelta: 0, chatQueue: [], deletedCount: 0, diedFloor: null, deathCause: null };
      return { ...state, today, phase: 'SHOP' };
    }
    case 'SHOP/PLACE': {
      if (state.phase !== 'SHOP' || action.slot < 0 || action.slot >= state.shelf.length) return state;
      const shelf = [...state.shelf];
      shelf[action.slot] = action.itemId;
      return { ...state, shelf };
    }
    case 'SHOP/CONFIRM': return state.phase === 'SHOP' ? startDive(state) : state;
    case 'DIVE/TICK': {
      if (state.phase !== 'DIVE' || state.today === null || action.dt <= 0) return state;
      const floorSteps = Math.max(1, Math.floor(action.dt / content.balance.dive.floorSeconds));
      const currentFloor = Math.min(state.today.targetCeiling, state.today.currentFloor + floorSteps);
      const progressed = { ...state, today: { ...state.today, currentFloor } };
      const [, advancedRng] = draw(progressed);
      return currentFloor >= progressed.today.targetCeiling ? finishDive(advancedRng) : advancedRng;
    }
    case 'RADIO/ANSWER': return state;
    case 'CHAT/SPAWN': return state;
    case 'CHAT/DELETE': return state;
    case 'CHAT/BAN': return state;
    case 'AUTOPSY/DECIDE': {
      if (state.phase !== 'AUTOPSY') return state;
      const corpse = latestTodayCorpse(state);
      if (corpse === undefined) return advance(state);
      const corpses = state.corpses.map((candidate) => candidate === corpse ? { ...candidate, grade: action.grade } : candidate);
      const stars = state.stars.map((star) => star.id === corpse.starId && action.grade === 'DAMAGED' ? { ...star, status: 'DISCARDED' as const } : star);
      const stats = action.grade === 'DAMAGED' ? { ...state.stats, totalDiscarded: state.stats.totalDiscarded + 1 } : state.stats;
      return { ...state, corpses, stars, stats, phase: 'ANNOUNCE', pendingFx: [...state.pendingFx, { kind: 'SEAL_STAMP' }] };
    }
    case 'ANNOUNCE/DECLARE': {
      if (state.phase !== 'ANNOUNCE') return state;
      const corpse = latestTodayCorpse(state);
      const corpses = corpse === undefined ? state.corpses : state.corpses.map((candidate) => candidate === corpse ? { ...candidate, announced: action.as } : candidate);
      const falseAnnouncements = action.as === 'FAILURE' ? state.stats.falseAnnouncements + 1 : state.stats.falseAnnouncements;
      return advance({ ...state, corpses, stats: { ...state.stats, falseAnnouncements } });
    }
    case 'FX/CONSUME': return { ...state, pendingFx: [] };
    case 'OPTION/SET': return state;
  }
}
