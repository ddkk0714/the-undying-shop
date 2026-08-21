import { content, type Balance } from '../content';
import { draw } from '../rng';
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

export function damageAutopsyCorpse(state: GameState, starId: string): GameState {
  const corpse = state.corpses.find((candidate) => candidate.starId === starId);
  const star = state.stars.find((candidate) => candidate.id === starId && candidate.status === 'DEAD');
  if (corpse === undefined || star === undefined) return state;

  const rules = content.balance.autopsy;
  const relics = content.items.filter((item) => item.isRelic).map((item) => item.id);
  if (relics.length === 0) return state;
  const [countRoll, afterCount] = draw(state);
  const lootCount = Math.min(relics.length, rules.lootMin + Math.floor(countRoll * (rules.lootMax - rules.lootMin + 1)));
  const available = [...relics];
  const loot: string[] = [];
  let next = afterCount;
  for (let index = 0; index < lootCount; index += 1) {
    const [itemRoll, afterItem] = draw(next);
    const itemIndex = Math.floor(itemRoll * available.length);
    const [itemId] = available.splice(itemIndex, 1);
    if (itemId !== undefined) loot.push(itemId);
    next = afterItem;
  }

  const inventory = [...next.inventory];
  for (const itemId of loot) {
    const index = inventory.findIndex((stack) => stack.id === itemId);
    if (index < 0) inventory.push({ id: itemId, qty: 1 });
    else inventory[index] = { ...inventory[index]!, qty: inventory[index]!.qty + 1 };
  }
  return {
    ...next,
    inventory,
    corpses: next.corpses.map((candidate) => candidate === corpse ? { ...candidate, grade: 'DAMAGED' as const, loot } : candidate),
    stars: next.stars.map((candidate) => candidate.id === starId ? { ...candidate, status: 'DISCARDED' as const, witnessed: [] } : candidate),
    witnessLog: next.witnessLog.map((entry) => entry.starId === starId ? { ...entry, suppressed: true } : entry),
    stats: { ...next.stats, totalDiscarded: next.stats.totalDiscarded + 1 },
    pendingFx: [...next.pendingFx, { kind: 'SEAL_STAMP', payload: { starId } }],
  };
}
