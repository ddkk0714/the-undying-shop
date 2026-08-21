import { content } from '../content';
import type { EndingId, GameState } from '../types';

/** Decides only terminal outcomes; scenes own every ending presentation. */
export function judgeEnding(state: GameState): EndingId | null {
  if (state.maxFloor >= content.balance.start.targetFloor) return 'A_OPEN';
  if (state.day < content.balance.start.days) return null;
  return state.leak >= content.balance.opinion.leakEndingThreshold ? 'B_REVEAL' : 'B_CONTINUE';
}
