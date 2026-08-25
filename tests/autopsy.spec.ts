import { describe, expect, it } from 'vitest';
import { content } from '../src/core/content';
import { reducer } from '../src/core/reducer';
import { createInitialState } from '../src/core/state';
import { recruitCapacity } from '../src/core/systems/roster';
import type { Contract, Corpse, GameState, Star } from '../src/core/types';

function contractFor(star: Star): Contract {
  return {
    starId: star.id,
    displayName: star.bodyName,
    recognition: 'C',
    fandom: 1200,
    claimedTiers: [{ floor: 18, rate: 1 }],
    fee: 0,
    honesty: 1,
  };
}

function autopsyState(seed = 91, grade: Corpse['grade'] = 'INTACT', diedFloor = 23): GameState {
  const initial = createInitialState(seed);
  const star = initial.stars[0]!;
  return {
    ...initial,
    phase: 'AUTOPSY',
    today: {
      starId: star.id,
      personaId: star.personaId,
      currentFloor: diedFloor,
      hero: { hp: 0, maxHp: 82, atk: 13, def: 2 },
      encounter: null,
      appealCount: 0,
      claimedCeiling: diedFloor,
      forks: [],
      superchat: 0,
      income: { superchat: 0, shelf: 0, goods: 0 },
      fansDelta: 0,
      chatQueue: [],
      deletedCount: 0,
      mental: 100,
      diedFloor,
      deathCause: 'test',
    },
    stars: initial.stars.map((candidate) => candidate.id === star.id ? { ...candidate, status: 'DEAD', witnessed: [18, 23] } : candidate),
    corpses: [{ starId: star.id, diedFloor, diedDay: 1, grade, announced: null, loot: [] }],
    witnessLog: [
      { floor: 18, starId: star.id, line: 'f18', day: 1, suppressed: false },
      { floor: 23, starId: star.id, line: 'f23', day: 1, suppressed: false },
    ],
  };
}

function decideAndAnnounce(state: GameState, grade: Corpse['grade'], announcement: 'SUCCESS' | 'FAILURE'): GameState {
  return reducer(reducer(state, { type: 'AUTOPSY/DECIDE', grade }), { type: 'ANNOUNCE/DECLARE', as: announcement });
}

describe('autopsy and announcement combinations', () => {
  it('keeps an intact body revivable after a truthful success announcement', () => {
    const initial = autopsyState();
    const next = decideAndAnnounce(initial, 'INTACT', 'SUCCESS');
    expect(next.phase).toBe('REVIVE');
    expect(next.stars[0]?.status).toBe('DEAD');
    expect(next.corpses[0]).toMatchObject({ grade: 'INTACT', announced: 'SUCCESS' });
    expect(next.reputation).toBe(initial.reputation + content.balance.reputation.onSuccessAnnounce);
  });

  it('hides an intact body after a false failure announcement without discarding its persona source', () => {
    const initial = autopsyState(92);
    const next = decideAndAnnounce(initial, 'INTACT', 'FAILURE');
    expect(next.stars[0]?.status).toBe('HIDDEN');
    expect(next.stars[0]?.personaId).toBe(initial.stars[0]?.personaId);
    expect(next.stats.falseAnnouncements).toBe(1);
    expect(next.reputation).toBe(initial.reputation + content.balance.reputation.onFailureAnnounce);

    const applicant = next.recruitPool[0]!;
    const signed = reducer({ ...next, phase: 'OFFICE', visitors: [contractFor(applicant)] }, { type: 'OFFICE/CONTRACT_ACCEPT', starId: applicant.id });
    const inherited = reducer(signed, { type: 'REVIVE/INHERIT', personaId: initial.stars[0]!.personaId!, toStarId: applicant.id });
    expect(inherited.stars.find((star) => star.id === applicant.id)?.personaId).toBe(initial.stars[0]?.personaId);
  });

  it('suppresses witnessed truth and transfers two to three relics when damaged', () => {
    const initial = autopsyState(93);
    const decided = reducer(initial, { type: 'AUTOPSY/DECIDE', grade: 'DAMAGED' });
    const corpse = decided.corpses[0]!;
    expect(decided.phase).toBe('ANNOUNCE');
    expect(decided.stars[0]?.status).toBe('DISCARDED');
    expect(corpse.grade).toBe('DAMAGED');
    expect(corpse.loot.length).toBeGreaterThanOrEqual(content.balance.autopsy.lootMin);
    expect(corpse.loot.length).toBeLessThanOrEqual(content.balance.autopsy.lootMax);
    expect(corpse.loot.some((itemId) => content.balance.autopsy.truthRelicIds.includes(itemId))).toBe(false);
    expect(decided.inventory.reduce((total, stack) => total + stack.qty, 0)).toBe(initial.inventory.reduce((total, stack) => total + stack.qty, 0) + corpse.loot.length);
    expect(decided.witnessLog.every((entry) => entry.suppressed)).toBe(true);
    expect(decided.stars[0]?.witnessed).toEqual([]);
    expect(decided.pendingFx.at(-1)?.kind).toBe('SEAL_STAMP');
  });

  it('clears a pending lie callback when the body is damaged', () => {
    const base = autopsyState(931);
    const initial: GameState = { ...base, flags: { ...base.flags, 'lieCallback:body_karin': true } };
    const decided = reducer(initial, { type: 'AUTOPSY/DECIDE', grade: 'DAMAGED' });

    expect(decided.stars[0]?.status).toBe('DISCARDED');
    expect(decided.flags['lieCallback:body_karin']).toBeUndefined();
    expect(decided.pendingFx.some((fx) => fx.kind === 'TRUTH_WHISPER')).toBe(false);
  });

  it('unlocks truth relics only for bodies recovered at the configured depth', () => {
    const deepLoot = Array.from({ length: 100 }, (_, seed) =>
      reducer(autopsyState(300 + seed, 'INTACT', content.balance.autopsy.truthRelicMinFloor), { type: 'AUTOPSY/DECIDE', grade: 'DAMAGED' }).corpses[0]!.loot,
    );
    expect(deepLoot.some((loot) => loot.some((itemId) => content.balance.autopsy.truthRelicIds.includes(itemId)))).toBe(true);
  });

  it('applies distinct fake-success and failure-announcement consequences after damage', () => {
    const initial = autopsyState(94);
    const fakeSuccess = decideAndAnnounce(initial, 'DAMAGED', 'SUCCESS');
    expect(fakeSuccess.leak).toBe(initial.leak + content.balance.opinion.leakPerFakeSuccess);
    expect(fakeSuccess.reputation).toBe(initial.reputation + content.balance.reputation.onSuccessAnnounce);
    expect(fakeSuccess.stats.falseAnnouncements).toBe(0);

    const failure = decideAndAnnounce(initial, 'DAMAGED', 'FAILURE');
    expect(failure.leak).toBe(initial.leak);
    expect(failure.reputation).toBe(initial.reputation + content.balance.reputation.onFailureAnnounce);
    expect(failure.stats.falseAnnouncements).toBe(1);
    expect(recruitCapacity({ ...failure, stats: { ...failure.stats, falseAnnouncements: content.balance.recruit.lossPerFailures } })).toBeLessThan(content.balance.recruit.baseSlots);
  });

  it('limits visitor candidates as failure announcements consume recruitment capacity', () => {
    const initial = createInitialState(96);
    const constrained: GameState = {
      ...initial,
      phase: 'REVIVE',
      stars: initial.stars.map((star) => ({ ...star, status: 'DEAD' })),
      stats: { ...initial.stats, falseAnnouncements: content.balance.recruit.lossPerFailures },
    };
    const office = reducer(constrained, { type: 'PHASE/ADVANCE' });
    expect(recruitCapacity(constrained)).toBe(1);
    expect(office.visitors).toHaveLength(1);

    const exhausted = reducer({ ...constrained, stats: { ...constrained.stats, falseAnnouncements: content.balance.recruit.lossPerFailures * content.balance.recruit.baseSlots } }, { type: 'PHASE/ADVANCE' });
    expect(exhausted.visitors).toHaveLength(1);
  });

  it('reveals each witnessed floor once when an intact body is revived', () => {
    const initial = autopsyState(95);
    const reviveState: GameState = { ...initial, phase: 'REVIVE', gold: 999999 };
    const revived = reducer(reviveState, { type: 'REVIVE/PAY', starId: reviveState.stars[0]!.id });
    const expectedLeak = content.balance.opinion.leakPerWitnessRevive['18']! + content.balance.opinion.leakPerWitnessRevive['23']!;
    expect(revived.leak).toBe(expectedLeak);
    expect(revived.flags['witnessRevealed:body_karin:18']).toBe(true);
    expect(revived.flags['witnessRevealed:body_karin:23']).toBe(true);
    expect(reducer({ ...revived, phase: 'REVIVE' }, { type: 'REVIVE/PAY', starId: reviveState.stars[0]!.id }).leak).toBe(expectedLeak);
  });
});
