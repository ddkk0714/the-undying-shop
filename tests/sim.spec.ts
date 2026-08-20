import { describe, expect, it } from 'vitest';
import { randomPolicy, simulate, simulateState } from '../src/core/sim';

describe('headless simulation', () => {
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
