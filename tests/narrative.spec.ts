import { describe, expect, it } from 'vitest';
import { content } from '../src/core/content';
import { reducer } from '../src/core/reducer';
import { createInitialState } from '../src/core/state';
import { reviveQuote } from '../src/core/systems/economy';
import { isEarlyClosure, judgeEnding } from '../src/core/systems/narrative';

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

  it('ends an unwinnable shop loop before day eight', () => {
    const initial = createInitialState(113);
    const deadStars = initial.stars.map((star) => ({ ...star, status: 'DEAD' as const }));
    const blocked = {
      ...initial,
      day: 5,
      gold: 0,
      stars: deadStars,
      recruitPool: [],
      corpses: deadStars.map((star) => ({ starId: star.id, diedFloor: 26, diedDay: 4, grade: 'INTACT' as const, announced: 'SUCCESS' as const, loot: [] })),
    };

    expect(isEarlyClosure(blocked)).toBe(true);
    expect(reducer(blocked, { type: 'PHASE/ADVANCE' })).toMatchObject({
      day: 5,
      phase: 'REVIVE',
      isOver: true,
      ending: 'B_CONTINUE',
    });
  });

  it('keeps recovery paths open, including the seeded contract opportunity', () => {
    const initial = createInitialState(114);
    const dead = initial.stars[0]!;
    const corpse = { starId: dead.id, diedFloor: 26, diedDay: 1, grade: 'INTACT' as const, announced: null, loot: [] };
    const revivable = { ...initial, stars: [{ ...dead, status: 'DEAD' as const }], recruitPool: [], corpses: [corpse] };
    const quote = reviveQuote(revivable, corpse, revivable.stars[0]!);

    expect(quote.affordable).toBe(true);
    expect(isEarlyClosure(revivable)).toBe(false);
    expect(reducer(revivable, { type: 'PHASE/ADVANCE' })).toMatchObject({ phase: 'OFFICE', isOver: false });

    const recruitable = { ...revivable, gold: 0, recruitPool: [initial.recruitPool[0]!], corpses: [] };
    expect(isEarlyClosure(recruitable)).toBe(false);
    const office = reducer(recruitable, { type: 'PHASE/ADVANCE' });
    expect(office).toMatchObject({ phase: 'OFFICE', isOver: false });
    expect(office.visitors.length).toBeGreaterThanOrEqual(1);
  });

  it('also closes an exhausted office when it cannot start a live run', () => {
    const initial = createInitialState(115);
    const office = { ...initial, day: 6, phase: 'OFFICE' as const, gold: 0, stars: initial.stars.map((star) => ({ ...star, status: 'DEAD' as const })), recruitPool: [] };

    expect(reducer(office, { type: 'OFFICE/CONFIRM' })).toMatchObject({
      day: 6,
      phase: 'OFFICE',
      isOver: true,
      ending: 'B_CONTINUE',
    });
  });
});
