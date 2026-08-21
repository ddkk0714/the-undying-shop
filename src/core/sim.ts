import { createStore } from './store';
import { reducer } from './reducer';
import { createInitialState } from './state';
import { mulberry32 } from './rng';
import type { Action } from './actions';
import { reviveQuote } from './systems/economy';
import type { GameState, RunStats } from './types';

export type Policy = (state: Readonly<GameState>) => Action;

export const randomPolicy: Policy = (state) => {
  const roll = mulberry32(state.seed + state.rngCursor + state.day)();
  if (state.phase === 'REVIVE') {
    const corpse = state.corpses.find((candidate) => candidate.grade === 'INTACT' && state.stars.some((star) => star.id === candidate.starId && star.status === 'DEAD'));
    const star = corpse === undefined ? undefined : state.stars.find((candidate) => candidate.id === corpse.starId && candidate.status === 'DEAD');
    const quote = corpse === undefined || star === undefined ? undefined : reviveQuote(state, corpse, star);
    const hasAliveStar = state.stars.some((candidate) => candidate.status === 'ALIVE');
    return corpse === undefined || quote === undefined || !quote.affordable || (hasAliveStar && roll < 0.2) ? { type: 'PHASE/ADVANCE' } : { type: 'REVIVE/PAY', starId: corpse.starId };
  }
  if (state.phase === 'OFFICE') {
    const choices = state.stars.filter((star) => star.status === 'ALIVE');
    if (state.today !== null) return { type: 'OFFICE/CONFIRM' };
    if (choices.length === 0) {
      const affordable = state.visitors.filter((visitor) => state.gold >= visitor.fee);
      const visitor = affordable[Math.floor(roll * affordable.length)] ?? affordable[0];
      return visitor === undefined ? { type: 'OFFICE/CONFIRM' } : { type: 'OFFICE/CONTRACT_ACCEPT', starId: visitor.starId };
    }
    return { type: 'OFFICE/PICK_STAR', starId: choices[Math.floor(roll * choices.length)]?.id ?? choices[0]!.id };
  }
  if (state.phase === 'LIVE') {
    if (state.today?.encounter !== null && state.today?.encounter !== undefined) return { type: 'COMBAT/CHOOSE', choice: roll < 0.7 ? 'APPEAL' : 'ATTACK' };
    return { type: 'LIVE/TICK', dt: 30 };
  }
  if (state.phase === 'AUTOPSY') return { type: 'AUTOPSY/DECIDE', grade: 'INTACT' };
  if (state.phase === 'ANNOUNCE') return { type: 'ANNOUNCE/DECLARE', as: 'SUCCESS' };
  return { type: 'PHASE/ADVANCE' };
};

/** Conservatively recruit only after every living star is gone. */
export const conservativePolicy: Policy = randomPolicy;

/** Accept every affordable current visitor before selecting a star. */
export const proactivePolicy: Policy = (state) => {
  if (state.phase === 'OFFICE' && state.today === null) {
    const affordable = state.visitors.filter((visitor) => state.gold >= visitor.fee);
    const visitor = affordable[0];
    if (visitor !== undefined) return { type: 'OFFICE/CONTRACT_ACCEPT', starId: visitor.starId };
  }
  return conservativePolicy(state);
};

export function simulateState(seed: number, policy: Policy): GameState {
  const store = createStore(createInitialState(seed), reducer);
  const maxSteps = 1000;
  for (let step = 0; step < maxSteps && !store.getState().isOver; step += 1) store.dispatch(policy(store.getState()));
  const state = store.getState();
  if (!state.isOver) throw new Error(`[sim] seed ${seed} did not finish within ${maxSteps} steps`);
  return structuredClone(state);
}

export function simulate(seed: number, policy: Policy): RunStats {
  return simulateState(seed, policy).stats;
}
