import { content, type Balance } from '../content';
import type { Corpse, GameState, Star } from '../types';

export function reviveCost(balance: Balance, corpse: Corpse, star: Star, daysHeld: number): number {
  const rules = balance.revive;
  const raw = rules.base
    * Math.pow(rules.floorExp, corpse.diedFloor)
    * rules.gradeMul[corpse.grade]
    * Math.pow(rules.degradeExp, star.reviveCount)
    * Math.pow(rules.decayPerDay, Math.max(0, daysHeld));
  return Math.round(raw / rules.roundTo) * rules.roundTo;
}

export function reviveDaysHeld(state: GameState, corpse: Corpse): number {
  return Math.max(0, state.day - corpse.diedDay);
}

export function reviveQuote(state: GameState, corpse: Corpse, star: Star) {
  const cost = reviveCost(content.balance, corpse, star, reviveDaysHeld(state, corpse));
  const warningFloor = Math.min(...Object.keys(content.balance.opinion.leakPerWitnessRevive).map(Number));
  return { cost, affordable: state.gold >= cost, witnessWarning: star.witnessed.some((floor) => floor <= warningFloor) };
}

export function discardReviveCorpse(state: GameState, starId: string): GameState {
  const corpse = state.corpses.find((candidate) => candidate.starId === starId);
  const star = state.stars.find((candidate) => candidate.id === starId);
  if (corpse === undefined || star?.status !== 'DEAD') return state;
  const inventory = [...state.inventory];
  for (const itemId of corpse.loot) {
    const index = inventory.findIndex((stack) => stack.id === itemId);
    if (index < 0) inventory.push({ id: itemId, qty: 1 });
    else inventory[index] = { ...inventory[index]!, qty: inventory[index]!.qty + 1 };
  }
  return {
    ...state,
    inventory,
    stars: state.stars.map((candidate) => candidate.id === starId ? { ...candidate, status: 'DISCARDED' as const } : candidate),
    stats: { ...state.stats, totalDiscarded: state.stats.totalDiscarded + 1 },
    pendingFx: [...state.pendingFx, { kind: 'SEAL_STAMP', payload: { starId } }],
  };
}
