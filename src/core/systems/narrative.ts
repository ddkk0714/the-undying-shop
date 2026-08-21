import { content } from '../content';
import { reviveQuote } from './economy';
import type { EndingId, GameState } from '../types';

/** Decides only terminal outcomes; scenes own every ending presentation. */
export function judgeEnding(state: GameState): EndingId | null {
  if (state.maxFloor >= content.balance.start.targetFloor) return 'A_OPEN';
  if (state.day < content.balance.start.days) return null;
  return state.leak >= content.balance.opinion.leakEndingThreshold ? 'B_REVEAL' : 'B_CONTINUE';
}

/**
 * Last-resort guard for a run that cannot leave the shop phases.
 * A remaining recruit is deliberately enough to keep the run open: entering
 * OFFICE must still get its seeded contract opportunity before we close.
 */
export function isEarlyClosure(state: GameState): boolean {
  const hasAliveStar = state.stars.some((star) => star.status === 'ALIVE');
  if (hasAliveStar || state.recruitPool.length > 0) return false;

  return !state.corpses.some((corpse) => {
    const star = state.stars.find((candidate) => candidate.id === corpse.starId && candidate.status === 'DEAD');
    return star !== undefined && reviveQuote(state, corpse, star).affordable;
  });
}
