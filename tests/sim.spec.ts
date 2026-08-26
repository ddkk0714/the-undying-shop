import { describe, expect, it } from 'vitest';
import { alwaysAppealPolicy, conservativePolicy, damageAwarePolicy, lowAppealPolicy, proactivePolicy, randomPolicy, simulate, simulateState } from '../src/core/sim';
import { content } from '../src/core/content';
import { createInitialState } from '../src/core/state';
import { createStore } from '../src/core/store';
import { reducer } from '../src/core/reducer';
import { reviveQuote } from '../src/core/systems/economy';

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

  it('makes always appealing richer but keeps it shallower than low-appeal play across 1000 seeds', () => {
    let lowAppealGold = 0;
    let lowAppealFloor = 0;
    let alwaysAppealGold = 0;
    let alwaysAppealFloor = 0;
    for (let seed = 1; seed <= 1000; seed += 1) {
      const lowAppeal = simulateState(seed, lowAppealPolicy);
      const alwaysAppeal = simulateState(seed, alwaysAppealPolicy);
      lowAppealGold += lowAppeal.gold;
      lowAppealFloor += lowAppeal.maxFloor;
      alwaysAppealGold += alwaysAppeal.gold;
      alwaysAppealFloor += alwaysAppeal.maxFloor;
      expect(alwaysAppeal.maxFloor).toBeLessThan(content.balance.start.targetFloor);
    }
    expect(alwaysAppealGold).toBeGreaterThan(lowAppealGold);
    expect(lowAppealFloor).toBeGreaterThan(alwaysAppealFloor);
  }, 15_000);

  it('chooses damage only when the next intact revival is unaffordable, then sells that recovery loot once', () => {
    const initial = createInitialState(19);
    const star = initial.stars[0]!;
    const corpse = { starId: star.id, diedFloor: 26, diedDay: 1, grade: 'INTACT' as const, announced: null, loot: [] };
    const autopsy = { ...initial, phase: 'AUTOPSY' as const, gold: 0, stars: initial.stars.map((candidate) => candidate.id === star.id ? { ...candidate, status: 'DEAD' as const } : candidate), corpses: [corpse] };
    expect(damageAwarePolicy(autopsy)).toEqual({ type: 'AUTOPSY/DECIDE', grade: 'DAMAGED' });

    const deadStar = autopsy.stars[0]!;
    const immediate = reviveQuote({ ...autopsy, day: 2 }, corpse, deadStar).cost;
    const following = reviveQuote({ ...autopsy, day: 3 }, { ...corpse, diedDay: 2 }, { ...deadStar, reviveCount: 1 }).cost;
    const forecastLimited = { ...autopsy, gold: immediate + following - Math.floor(autopsy.fans * content.balance.income.goodsPerFan) - 1 };
    expect(reviveQuote({ ...forecastLimited, day: 2 }, corpse, deadStar).affordable).toBe(true);
    expect(damageAwarePolicy(forecastLimited)).toEqual({ type: 'AUTOPSY/DECIDE', grade: 'DAMAGED' });

    const office = {
      ...initial,
      day: 2,
      phase: 'OFFICE' as const,
      inventory: [{ id: 'soil_deep', qty: 1 }],
      corpses: [{ ...corpse, diedDay: 1, grade: 'DAMAGED' as const, loot: ['soil_deep'] }],
    };
    const display = damageAwarePolicy(office);
    expect(display).toEqual({ type: 'OFFICE/PLACE', slot: content.balance.equipment.utilitySlot, itemId: 'soil_deep' });
    const displayed = reducer(office, display);
    expect(damageAwarePolicy(displayed)).toEqual({ type: 'OFFICE/SELL_BATCH' });
    expect(damageAwarePolicy({ ...office, inventory: [], day: 3 })).not.toMatchObject({ type: 'OFFICE/SELL_BATCH' });
  });

  it('uses one appeal per encounter day before returning to low-risk combat', () => {
    const initial = createInitialState(20);
    const live = {
      ...initial,
      phase: 'LIVE' as const,
      today: {
        starId: initial.stars[0]!.id, personaId: null, currentFloor: 3,
        hero: { hp: 82, maxHp: 82, atk: 13, def: 2 }, encounter: { floor: 3, enemyKey: 'enemy', enemy: { hp: 10, maxHp: 10, atk: 1, def: 0 }, turn: 0, line: '', guarding: false, log: [] },
        appealCount: 0, claimedCeiling: 30, forks: [], superchat: 0, income: { superchat: 0, shelf: 0, goods: 0 }, fansDelta: 0, chatQueue: [], deletedCount: 0, mental: 100, diedFloor: null, deathCause: null,
      },
    };
    expect(damageAwarePolicy(live)).toEqual({ type: 'COMBAT/CHOOSE', choice: 'APPEAL' });
    expect(damageAwarePolicy({ ...live, today: { ...live.today, appealCount: 1 } })).toEqual({ type: 'COMBAT/CHOOSE', choice: 'ATTACK' });
  });

  it('finishes 1000 seeded runs with starter stock, potion use, and emergency sales enabled', () => {
    for (let seed = 1; seed <= 1000; seed += 1) {
      const state = simulateState(seed, damageAwarePolicy);
      expect(state.isOver).toBe(true);
      expect(state.day).toBeLessThanOrEqual(content.balance.start.days);
      expect(Number.isFinite(state.gold)).toBe(true);
    }
  }, 15_000);

  it('keeps the realistic mixed-income model centered on superchat across 1000 runs', () => {
    const income = { superchat: 0, goods: 0, stock: 0 };
    for (let seed = 1; seed <= 1000; seed += 1) {
      const store = createStore(createInitialState(seed), reducer);
      const settledDays = new Set<number>();
      for (let step = 0; step < 1000 && !store.getState().isOver; step += 1) {
        const before = store.getState();
        const action = damageAwarePolicy(before);
        store.dispatch(action);
        const after = store.getState();
        if (action.type === 'OFFICE/SELL_BATCH') income.stock += after.gold - before.gold;
        if (after.today !== null && after.today.diedFloor !== null && !settledDays.has(after.day)) {
          settledDays.add(after.day);
          income.superchat += after.today.income.superchat;
          income.goods += after.today.income.goods;
          income.stock += after.today.income.shelf;
        }
      }
      expect(store.getState().isOver).toBe(true);
    }
    const total = income.superchat + income.goods + income.stock;
    expect(income.superchat / total).toBeGreaterThanOrEqual(0.5);
    expect(income.superchat / total).toBeLessThanOrEqual(0.7);
    expect(income.goods / total).toBeGreaterThanOrEqual(0.25);
    expect(income.goods / total).toBeLessThanOrEqual(0.4);
    expect(income.stock / total).toBeLessThanOrEqual(0.15);
  }, 15_000);
});
