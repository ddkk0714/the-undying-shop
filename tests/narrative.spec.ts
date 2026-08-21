import { describe, expect, it } from 'vitest';
import { content } from '../src/core/content';
import { reducer } from '../src/core/reducer';
import { createInitialState } from '../src/core/state';
import { judgeEnding } from '../src/core/systems/narrative';

describe('narrative ending judgement', () => {
  it('opens the door as soon as the target floor is reached', () => {
    const initial = createInitialState(111);
    const state = { ...initial, day: 3, phase: 'ANNOUNCE' as const, maxFloor: content.balance.start.targetFloor };
    expect(judgeEnding(state)).toBe('A_OPEN');
    expect(reducer(state, { type: 'PHASE/ADVANCE' })).toMatchObject({ isOver: true, ending: 'A_OPEN' });
  });

  it('uses the leak threshold only on the final day', () => {
    const initial = createInitialState(112);
    const early = { ...initial, day: content.balance.start.days - 1, leak: content.balance.opinion.leakEndingThreshold, maxFloor: content.balance.start.targetFloor - 1 };
    expect(judgeEnding(early)).toBeNull();
    expect(judgeEnding({ ...early, day: content.balance.start.days })).toBe('B_REVEAL');
    expect(judgeEnding({ ...early, day: content.balance.start.days, leak: content.balance.opinion.leakEndingThreshold - 1 })).toBe('B_CONTINUE');
  });
});
