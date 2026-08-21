import { describe, expect, it } from 'vitest';
import { conservativePolicy, proactivePolicy, randomPolicy, simulate, simulateState } from '../src/core/sim';
import { content } from '../src/core/content';
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

  it('has no non-finite values or crashes across 1000 seeds for both recruitment policies', () => {
    for (const policy of [conservativePolicy, proactivePolicy]) {
      for (let seed = 1; seed <= 1000; seed += 1) {
        const state = simulateState(seed, policy);
        expect(state.isOver).toBe(true);
        for (const value of [state.gold, state.fans, state.reputation, state.maxFloor, state.leak, state.viewerFatigue]) expect(Number.isFinite(value)).toBe(true);
        for (const value of Object.values(state.stats)) expect(Number.isFinite(value)).toBe(true);
      }
    }
  }, 15_000);

  it('records real deaths and day-end settlement over an eight-day run', () => {
    const state = simulateState(20260822, randomPolicy);
    expect(state.day).toBe(content.balance.start.days);
    expect(state.corpses.length).toBeGreaterThan(0);
    expect(state.stars.some((star) => star.status === 'DEAD' || star.status === 'DISCARDED')).toBe(true);
    expect(state.maxFloor).toBeGreaterThanOrEqual(content.balance.start.maxFloor);
    expect(state.stats.deepestFloor).toBe(state.maxFloor);
    expect(state.gold).not.toBe(content.balance.start.gold);
    expect(state.fans).not.toBe(content.balance.start.fans);
  });
});
