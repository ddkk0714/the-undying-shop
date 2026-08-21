import { describe, expect, it } from 'vitest';
import { randomPolicy, simulate, simulateState } from '../src/core/sim';
import { createInitialState } from '../src/core/state';

describe('headless simulation', () => {
  it('prioritizes an affordable revival when no star can enter OFFICE', () => {
    const initial = createInitialState(8);
    const deadStar = initial.stars[0]!;
    const state = {
      ...initial,
      stars: initial.stars.map((star) => ({ ...star, status: 'DEAD' as const })),
      corpses: [{ starId: deadStar.id, diedFloor: 1, diedDay: 1, grade: 'INTACT' as const, announced: null, loot: [] }],
    };
    expect(randomPolicy(state)).toEqual({ type: 'REVIVE/PAY', starId: deadStar.id });
  });
  it('finishes eight days and returns RunStats without Phaser', () => {
    const stats = simulate(1, randomPolicy);
    expect(stats.deepestFloor).toBeGreaterThan(0);
    expect(stats.totalDiscarded).toBeGreaterThanOrEqual(0);
  });

  it('has no non-finite values or crashes across 1000 seeds', () => {
    for (let seed = 1; seed <= 1000; seed += 1) {
      const state = simulateState(seed, randomPolicy);
      expect(state.isOver).toBe(true);
      for (const value of [state.gold, state.fans, state.reputation, state.maxFloor, state.leak, state.viewerFatigue]) expect(Number.isFinite(value)).toBe(true);
      for (const value of Object.values(state.stats)) expect(Number.isFinite(value)).toBe(true);
    }
  });
});
