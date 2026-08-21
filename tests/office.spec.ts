import { describe, expect, it } from 'vitest';
import { reducer } from '../src/core/reducer';
import { createInitialState } from '../src/core/state';
import { content } from '../src/core/content';
import { randomPolicy } from '../src/core/sim';
import type { Contract, GameState, Star } from '../src/core/types';

function officeState(seed = 31): GameState {
  return { ...createInitialState(seed), phase: 'OFFICE' };
}

function contractFor(star: Star): Contract {
  return {
    starId: star.id,
    displayName: star.bodyName,
    recognition: 'C',
    fandom: 1200,
    claimedTiers: [{ floor: 21, rate: 1 }, { floor: 25, rate: 0.75 }, { floor: 31, rate: 0.25 }],
    fee: 1200,
    honesty: 0.7,
  };
}

describe('office', () => {
  it('starts with two signed stars and three hidden applicants', () => {
    const state = createInitialState(30);
    expect(state.stars).toHaveLength(2);
    expect(state.recruitPool).toHaveLength(3);
    expect(state.recruitPool.every((star) => star.status === 'HIDDEN')).toBe(true);
    expect(state.recruitPool.some((candidate) => state.stars.some((star) => star.id === candidate.id))).toBe(false);
  });

  it('offers a unique, affordable visitor when no living star remains', () => {
    const initial = createInitialState(31);
    const rejectedId = initial.recruitPool[0]!.id;
    const blocked = {
      ...initial,
      stars: initial.stars.map((star) => ({ ...star, status: 'DEAD' as const })),
      rejectedStarIds: [rejectedId],
    };
    const office = reducer(blocked, { type: 'PHASE/ADVANCE' });
    expect(office.phase).toBe('OFFICE');
    expect(office.visitors.length).toBeGreaterThanOrEqual(1);
    expect(office.visitors.length).toBeLessThanOrEqual(content.balance.contract.visitorsPerDay);
    expect(new Set(office.visitors.map((visitor) => visitor.starId)).size).toBe(office.visitors.length);
    expect(office.visitors.some((visitor) => visitor.starId === rejectedId)).toBe(false);
    expect(office.visitors[0]?.claimedTiers).toEqual(content.balance.contract.claimedTiers);
    const visitor = office.visitors.find((candidate) => office.gold >= candidate.fee);
    expect(visitor).toBeDefined();
    expect(randomPolicy(office)).toMatchObject({ type: 'OFFICE/CONTRACT_ACCEPT' });
    const accepted = reducer(office, { type: 'OFFICE/CONTRACT_ACCEPT', starId: visitor!.starId });
    expect(accepted.stars.some((star) => star.id === visitor!.starId && star.status === 'ALIVE')).toBe(true);
    const picked = reducer(accepted, { type: 'OFFICE/PICK_STAR', starId: visitor!.starId });
    expect(picked.today?.claimedCeiling).toBe(Math.max(...content.balance.contract.claimedTiers.map((tier) => tier.floor)));
  });

  it('creates a real combatant and a non-stub ceiling when a star is picked', () => {
    const state = reducer(officeState(), { type: 'OFFICE/PICK_STAR', starId: 'body_karin' });
    expect(state.today?.hero).toEqual({ hp: 82, maxHp: 82, atk: 13, def: 2 });
    expect(state.today?.claimedCeiling).toBe(26);
    const live = reducer(state, { type: 'OFFICE/CONFIRM' });
    const finished = reducer(live, { type: 'PHASE/ADVANCE' });
    expect(finished.today?.diedFloor).toBe(26);
  });

  it('uses the submitted contract ceiling when the picked applicant has one', () => {
    const initial = officeState();
    const karin = initial.stars.find((star) => star.id === 'body_karin')!;
    const state = reducer({ ...initial, visitors: [contractFor(karin)] }, { type: 'OFFICE/PICK_STAR', starId: karin.id });
    expect(state.today?.claimedCeiling).toBe(31);
  });

  it('charges accepted contracts and permanently removes rejected applicants', () => {
    const initial = officeState();
    const applicant = { ...initial.stars.find((star) => star.id === 'body_sela')!, status: 'HIDDEN' as const };
    const offered = { ...initial, stars: initial.stars.filter((star) => star.id !== applicant.id), recruitPool: [applicant], visitors: [contractFor(applicant)] };
    const accepted = reducer(offered, { type: 'OFFICE/CONTRACT_ACCEPT', starId: applicant.id });
    expect(accepted.gold).toBe(offered.gold - 1200);
    expect(accepted.stars.find((star) => star.id === applicant.id)?.honesty).toBe(0.7);
    expect(accepted.visitors).toEqual([]);
    expect(accepted.pendingFx.at(-1)?.kind).toBe('CONTRACT_SIGN');

    const rejected = reducer(offered, { type: 'OFFICE/CONTRACT_REJECT', starId: applicant.id });
    expect(rejected.recruitPool).toEqual([]);
    expect(rejected.rejectedStarIds).toEqual([applicant.id]);
    expect(rejected.stats.contractsRejected).toBe(1);
    const followingDay = reducer({ ...rejected, day: 2, phase: 'REVIVE', visitors: [] }, { type: 'PHASE/ADVANCE' });
    expect(followingDay.visitors.some((visitor) => visitor.starId === applicant.id)).toBe(false);
  });

  it('sells shelf equipment, updates live stats, and leaks truth relic sales', () => {
    let state = { ...officeState(), shelf: ['cloak_ash', 'soil_deep', null] };
    state = reducer(state, { type: 'OFFICE/PICK_STAR', starId: 'body_karin' });
    state = reducer(state, { type: 'OFFICE/CONFIRM' });
    expect(state.gold).toBe(12840 + 1340 + 4400);
    expect(state.stats.goldEarned).toBe(5740);
    expect(state.leak).toBe(10);
    expect(state.today?.hero).toEqual({ hp: 94, maxHp: 94, atk: 13, def: 9 });
  });
});
