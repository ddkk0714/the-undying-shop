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

  it('persists a revive record stamp for the same corpse without consuming RNG', () => {
    const initial = createInitialState(9);
    const state = {
      ...initial,
      phase: 'REVIVE' as const,
      corpses: [{ starId: 'body_karin', diedDay: 1, diedFloor: 26, grade: 'INTACT' as const, announced: null, loot: [] }],
    };
    const action: Action = { type: 'REVIVE/RECORD_STAMP', starId: 'body_karin', diedDay: 1, diedFloor: 26 };
    const stamped = reducer(state, action);
    expect(stamped.flags['reviveRecordStamped:body_karin:1:26']).toBe(true);
    expect(stamped.rngCursor).toBe(state.rngCursor);
    expect(reducer(stamped, action)).toBe(stamped);
  });

});
