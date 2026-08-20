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
