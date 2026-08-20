import { content } from '../content';
import { createHero } from './combat';
import type { Combatant, GameState, ItemDef, Star, TodayRun } from '../types';

function equippedItems(state: GameState): ItemDef[] {
  return state.shelf.flatMap((id) => {
    const item = content.items.find((candidate) => candidate.id === id);
    return item === undefined ? [] : [item];
  });
}

function degradationMultiplier(star: Star): number {
  const multipliers = content.balance.degrade.statMul;
  return multipliers[Math.min(star.reviveCount, multipliers.length - 1)] ?? multipliers[0] ?? 1;
}

function claimedCeiling(state: GameState, starId: string): number {
  const contract = state.visitors.find((visitor) => visitor.starId === starId);
  const highestClaim = contract === undefined ? undefined : Math.max(...contract.claimedTiers.map((tier) => tier.floor));
  return Math.max(1, highestClaim ?? state.maxFloor);
}

export function officeHero(state: GameState, star: Star): Combatant {
  return createHero(star, equippedItems(state), degradationMultiplier(star));
}

export function pickStar(state: GameState, starId: string): GameState {
  if (state.phase !== 'OFFICE') return state;
  const star = state.stars.find((candidate) => candidate.id === starId && candidate.status === 'ALIVE');
  if (star === undefined) return state;
  const today: TodayRun = {
    starId: star.id, personaId: star.personaId, currentFloor: 1,
    hero: officeHero(state, star), encounter: null, appealCount: 0,
    claimedCeiling: claimedCeiling(state, star.id), forks: [], superchat: 0,
    fansDelta: 0, chatQueue: [], deletedCount: 0, diedFloor: null, deathCause: null,
  };
  return { ...state, today };
}

export function acceptContract(state: GameState, starId: string): GameState {
  if (state.phase !== 'OFFICE') return state;
  const contract = state.visitors.find((visitor) => visitor.starId === starId);
  const candidate = state.recruitPool.find((star) => star.id === starId);
  if (contract === undefined || candidate === undefined || state.gold < contract.fee) return state;
  const recruited: Star = { ...candidate, honesty: contract.honesty, status: 'ALIVE' };
  return {
    ...state,
    gold: state.gold - contract.fee,
    stars: [...state.stars, recruited],
    recruitPool: state.recruitPool.filter((star) => star.id !== starId),
    visitors: state.visitors.filter((visitor) => visitor.starId !== starId),
    pendingFx: [...state.pendingFx, { kind: 'CONTRACT_SIGN', payload: { starId } }],
  };
}

export function rejectContract(state: GameState, starId: string): GameState {
  if (state.phase !== 'OFFICE' || !state.visitors.some((visitor) => visitor.starId === starId)) return state;
  return {
    ...state,
    visitors: state.visitors.filter((visitor) => visitor.starId !== starId),
    recruitPool: state.recruitPool.filter((star) => star.id !== starId),
    rejectedStarIds: state.rejectedStarIds.includes(starId) ? state.rejectedStarIds : [...state.rejectedStarIds, starId],
    stats: { ...state.stats, contractsRejected: state.stats.contractsRejected + 1 },
  };
}

export function confirmOffice(state: GameState): GameState {
  if (state.phase !== 'OFFICE') return state;
  const sold = equippedItems(state);
  const goldEarned = sold.reduce((total, item) => total + item.price, 0);
  const truthRelics = sold.filter((item) => item.id === 'soil_deep' || item.id === 'page_torn').length;
  return {
    ...state,
    gold: state.gold + goldEarned,
    leak: Math.min(100, state.leak + truthRelics * 10),
    stats: { ...state.stats, goldEarned: state.stats.goldEarned + goldEarned },
  };
}
