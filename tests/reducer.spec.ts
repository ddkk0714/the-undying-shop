import { describe, expect, it } from 'vitest';
import { reducer } from '../src/core/reducer';
import { createInitialState } from '../src/core/state';
import type { Action } from '../src/core/actions';

function replay(seed: number, actions: Action[]) {
  return actions.reduce(reducer, createInitialState(seed));
}

describe('reducer', () => {
  it('is deterministic for the same seed and action sequence', () => {
    const actions: Action[] = [
      { type: 'PHASE/ADVANCE' },
      { type: 'OFFICE/PICK_STAR', starId: 'body_karin' },
      { type: 'OFFICE/CONFIRM' },
      { type: 'LIVE/TICK', dt: 30 },
      { type: 'PHASE/ADVANCE' },
      { type: 'PHASE/ADVANCE' },
      { type: 'AUTOPSY/DECIDE', grade: 'INTACT' },
      { type: 'ANNOUNCE/DECLARE', as: 'SUCCESS' },
    ];
    expect(JSON.stringify(replay(77, actions))).toBe(JSON.stringify(replay(77, actions)));
  });

  it('advances through the six phases and serializes without loss', () => {
    const state = replay(5, [
      { type: 'PHASE/ADVANCE' },
      { type: 'OFFICE/PICK_STAR', starId: 'body_karin' },
      { type: 'OFFICE/CONFIRM' },
      { type: 'LIVE/TICK', dt: 30 },
      { type: 'PHASE/ADVANCE' },
      { type: 'PHASE/ADVANCE' },
      { type: 'AUTOPSY/DECIDE', grade: 'INTACT' },
      { type: 'ANNOUNCE/DECLARE', as: 'SUCCESS' },
    ]);
    expect(state.day).toBe(2);
    expect(state.phase).toBe('REVIVE');
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});
