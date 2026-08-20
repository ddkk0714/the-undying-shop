import { content } from './content';
import { createInitialState } from './state';
import { chooseCombat, startLive, tickLive } from './systems/dive';
import { acceptContract, confirmOffice, pickStar, rejectContract } from './systems/office';
import type { Action } from './actions';
import type { Corpse, GameState, PhaseId } from './types';

const phaseOrder: PhaseId[] = ['REVIVE', 'OFFICE', 'LIVE', 'DEATH', 'AUTOPSY', 'ANNOUNCE'];
const nextPhase = (phase: PhaseId): PhaseId => phaseOrder[(phaseOrder.indexOf(phase) + 1) % phaseOrder.length] ?? 'REVIVE';
const withPhase = (state: GameState, phase: PhaseId): GameState => ({ ...state, phase });

function latestTodayCorpse(state: GameState): Corpse | undefined {
  return state.today === null ? undefined : state.corpses.find((corpse) => corpse.starId === state.today?.starId && corpse.diedDay === state.day);
}

function finishLive(state: GameState): GameState {
  if (state.today === null || state.today.diedFloor !== null) return withPhase(state, 'DEATH');
  const diedFloor = Math.max(1, state.today.currentFloor, state.today.claimedCeiling);
  const star = state.stars.find((candidate) => candidate.id === state.today?.starId);
  if (star === undefined) return withPhase(state, 'DEATH');
  const corpse: Corpse = { starId: star.id, diedFloor, diedDay: state.day, grade: 'INTACT', announced: null, loot: [] };
  const stars = state.stars.map((candidate) => candidate.id === star.id ? { ...candidate, status: 'DEAD' as const } : candidate);
  const maxFloor = Math.max(state.maxFloor, diedFloor);
  return {
    ...state, phase: 'DEATH', stars, corpses: [...state.corpses, corpse],
    today: { ...state.today, currentFloor: diedFloor, diedFloor, deathCause: '하강 중 사망' }, maxFloor,
    pendingFx: [...state.pendingFx, { kind: 'SIGNAL_LOST' }, ...(diedFloor > state.maxFloor ? [{ kind: 'RECORD_BREAK' as const }] : [])],
    stats: { ...state.stats, deepestFloor: Math.max(state.stats.deepestFloor, diedFloor) },
  };
}

function advance(state: GameState): GameState {
  if (state.isOver) return state;
  if (state.phase === 'OFFICE') return startLive(confirmOffice(state));
  if (state.phase === 'LIVE') return finishLive(state);
  if (state.phase === 'ANNOUNCE') {
    if (state.day >= content.balance.start.days) {
      return { ...state, isOver: true, ending: state.maxFloor >= content.balance.start.targetFloor ? 'A_OPEN' : state.leak >= 70 ? 'B_REVEAL' : 'B_CONTINUE', today: null };
    }
    return { ...state, day: state.day + 1, phase: 'REVIVE', today: null, shelf: [null, null, null] };
  }
  return withPhase(state, nextPhase(state.phase));
}

export function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'GAME/NEW': return createInitialState(action.seed);
    case 'GAME/LOAD': return structuredClone(action.state);
    case 'PHASE/ADVANCE': return advance(state);
    case 'REVIVE/PAY': {
      if (state.phase !== 'REVIVE') return state;
      const corpse = state.corpses.find((candidate) => candidate.starId === action.starId && candidate.grade === 'INTACT');
      if (corpse === undefined) return state;
      return { ...state, stars: state.stars.map((star) => star.id === action.starId ? { ...star, status: 'ALIVE' as const, reviveCount: star.reviveCount + 1 } : star), stats: { ...state.stats, totalRevived: state.stats.totalRevived + 1 } };
    }
    case 'REVIVE/SKIP': return state;
    case 'REVIVE/INHERIT': return state;
    case 'OFFICE/CONTRACT_ACCEPT': return acceptContract(state, action.starId);
    case 'OFFICE/CONTRACT_REJECT': return rejectContract(state, action.starId);
    case 'OFFICE/PICK_STAR': return pickStar(state, action.starId);
    case 'OFFICE/PLACE': {
      if (state.phase !== 'OFFICE' || action.slot < 0 || action.slot >= state.shelf.length) return state;
      const shelf = [...state.shelf];
      shelf[action.slot] = action.itemId;
      return { ...state, shelf };
    }
    case 'OFFICE/CONFIRM': return state.phase === 'OFFICE' ? startLive(confirmOffice(state)) : state;
    case 'LIVE/TICK': return tickLive(state, action.dt);
    case 'COMBAT/CHOOSE': return chooseCombat(state, action.choice);
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
