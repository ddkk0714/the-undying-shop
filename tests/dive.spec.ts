import { describe, expect, it } from 'vitest';
import { reducer } from '../src/core/reducer';
import { createInitialState } from '../src/core/state';
import { createEncounter } from '../src/core/systems/combat';

describe('live dive', () => {
  it('starts an encounter on every third floor and waits for combat input', () => {
    let state = createInitialState(12);
    state = { ...state, phase: 'OFFICE', shelf: ['cloak_ash', null, null] };
    state = reducer(state, { type: 'OFFICE/PICK_STAR', starId: 'body_karin' });
    state = reducer(state, { type: 'OFFICE/CONFIRM' });
    state = reducer(state, { type: 'LIVE/TICK', dt: 1 });
    expect(state.today?.currentFloor).toBe(3);
    expect(state.today?.hero.maxHp).toBeGreaterThan(80);
    expect(state.today?.encounter).not.toBeNull();
    expect(state.waitingSince).not.toBeNull();
  });

  it('applies the wait penalty without progressing an unresolved encounter', () => {
    let state = createInitialState(13);
    state = { ...state, phase: 'OFFICE' };
    state = reducer(state, { type: 'OFFICE/PICK_STAR', starId: 'body_karin' });
    state = reducer(state, { type: 'OFFICE/CONFIRM' });
    state = reducer(state, { type: 'LIVE/TICK', dt: 1 });
    const fansBefore = state.fans;
    state = reducer(state, { type: 'LIVE/TICK', dt: 10 });
    expect(state.today?.currentFloor).toBe(3);
    expect(state.fans).toBeLessThan(fansBefore);
  });

  it('moves to DEATH when combat reduces hero HP to zero', () => {
    let state = createInitialState(14);
    state = { ...state, phase: 'LIVE', today: {
      starId: 'body_karin', personaId: 'persona_rion', currentFloor: 3,
      hero: { hp: 1, maxHp: 82, atk: 13, def: 2 },
      encounter: createEncounter(3, 'GATEKEEPER', 0), appealCount: 0, claimedCeiling: 20,
      forks: [], superchat: 0, fansDelta: 0, chatQueue: [], deletedCount: 0, diedFloor: null, deathCause: null,
    } };
    state = reducer(state, { type: 'COMBAT/CHOOSE', choice: 'DEFEND' });
    expect(state.phase).toBe('DEATH');
    expect(state.today?.diedFloor).toBe(3);
  });
});
