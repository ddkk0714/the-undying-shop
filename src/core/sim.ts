import { createStore } from './store';
import { reducer } from './reducer';
import { createInitialState } from './state';
import { mulberry32 } from './rng';
import { reviveQuote } from './systems/economy';
import type { Action } from './actions';
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
    const pendingFork = state.today?.forks.at(-1);
    if (pendingFork?.told === 'UNKNOWN') return { type: 'RADIO/ANSWER', dir: roll < 0.5 ? 'A' : 'B' };
    if (state.today?.encounter !== null && state.today?.encounter !== undefined) return { type: 'COMBAT/CHOOSE', choice: roll < 0.7 ? 'APPEAL' : 'ATTACK' };
    return { type: 'LIVE/TICK', dt: 30 };
  }
  if (state.phase === 'AUTOPSY') return { type: 'AUTOPSY/DECIDE', grade: 'INTACT' };
  if (state.phase === 'ANNOUNCE') return { type: 'ANNOUNCE/DECLARE', as: 'SUCCESS' };
  return { type: 'PHASE/ADVANCE' };
};

/** 모집비를 아끼고, 생존 출연자가 모두 사라질 때만 계약한다. */
export const conservativePolicy: Policy = randomPolicy;

/** 오늘 낼 수 있는 계약서는 먼저 모두 수락한 뒤 출연자를 고른다. */
export const proactivePolicy: Policy = (state) => {
  if (state.phase === 'OFFICE' && state.today === null) {
    const affordable = state.visitors.filter((visitor) => state.gold >= visitor.fee);
    const visitor = affordable[0];
    if (visitor !== undefined) return { type: 'OFFICE/CONTRACT_ACCEPT', starId: visitor.starId };
  }
  return conservativePolicy(state);
};

/** Uses attack on every encounter to model a player who almost never appeals. */
export const lowAppealPolicy: Policy = (state) => {
  if (state.phase === 'LIVE' && state.today?.encounter !== null && state.today?.encounter !== undefined) return { type: 'COMBAT/CHOOSE', choice: 'ATTACK' };
  return conservativePolicy(state);
};

/** Uses appeal on every encounter to measure the short-term-income temptation. */
export const alwaysAppealPolicy: Policy = (state) => {
  if (state.phase === 'LIVE' && state.today?.encounter !== null && state.today?.encounter !== undefined) return { type: 'COMBAT/CHOOSE', choice: 'APPEAL' };
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
