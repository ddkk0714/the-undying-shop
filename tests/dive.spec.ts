import { describe, expect, it } from 'vitest';
import { reducer } from '../src/core/reducer';
import { createInitialState } from '../src/core/state';
import { createEncounter } from '../src/core/systems/combat';
import { content } from '../src/core/content';
import type { GameState } from '../src/core/types';

function liveState(seed: number, currentFloor: number, claimedCeiling = 40): GameState {
  const initial = createInitialState(seed);
  return {
    ...initial,
    phase: 'LIVE' as const,
    today: {
      starId: 'body_karin', personaId: 'persona_rion', currentFloor,
      hero: { hp: 82, maxHp: 82, atk: 13, def: 2 },
      encounter: null, appealCount: 0, claimedCeiling,
      forks: [], superchat: 0, income: { superchat: 0, shelf: 0, goods: 0 }, fansDelta: 0, chatQueue: [], deletedCount: 0, diedFloor: null, deathCause: null,
    },
  };
}

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

  it('lets the reduced-motion option disable the live wait penalty', () => {
    let state = createInitialState(130);
    state = { ...state, phase: 'OFFICE' };
    state = reducer(state, { type: 'OFFICE/PICK_STAR', starId: 'body_karin' });
    state = reducer(state, { type: 'OFFICE/CONFIRM' });
    state = reducer(state, { type: 'LIVE/TICK', dt: 1 });
    const fansBefore = state.fans;

    state = reducer(state, { type: 'OPTION/SET', key: 'reducedMotion', value: true });
    expect(state.flags.reducedMotion).toBe(true);
    state = reducer(state, { type: 'LIVE/TICK', dt: 10 });
    expect(state.fans).toBe(fansBefore);

    state = reducer(state, { type: 'OPTION/SET', key: 'reducedMotion', value: false });
    expect(state.flags.reducedMotion).toBe(false);
    state = reducer(state, { type: 'LIVE/TICK', dt: 10 });
    expect(state.fans).toBeLessThan(fansBefore);
  });

  it('uses a signed applicant honesty value for the actual descent limit', () => {
    const initial = createInitialState(14);
    const claimedCeiling = Math.max(...content.balance.contract.claimedTiers.map((tier) => tier.floor));
    const actualCeiling = Math.floor(claimedCeiling * content.balance.contract.honestyMin);
    const deathFloor = actualCeiling + content.floors.encounterEvery;
    const star = { ...initial.stars[0]!, honesty: content.balance.contract.honestyMin };
    const state = {
      ...initial,
      phase: 'LIVE' as const,
      stars: [star, ...initial.stars.slice(1)],
      today: {
        starId: star.id, personaId: star.personaId, currentFloor: deathFloor - 1,
        hero: { hp: 82, maxHp: 82, atk: 13, def: 2 }, encounter: null, appealCount: 0,
        claimedCeiling, forks: [], superchat: 0, income: { superchat: 0, shelf: 0, goods: 0 }, fansDelta: 0, chatQueue: [], deletedCount: 0,
        diedFloor: null, deathCause: null,
      },
    };
    const next = reducer(state, { type: 'LIVE/TICK', dt: 1 });
    expect(next.today?.diedFloor).toBe(deathFloor);
    expect(next.stars.find((candidate) => candidate.id === star.id)?.status).toBe('DEAD');
  });

  it('moves to DEATH when combat reduces hero HP to zero', () => {
    let state = createInitialState(14);
    state = { ...state, phase: 'LIVE', today: {
      starId: 'body_karin', personaId: 'persona_rion', currentFloor: 3,
      hero: { hp: 1, maxHp: 82, atk: 13, def: 2 },
      encounter: createEncounter(3, 'GATEKEEPER', 0), appealCount: 0, claimedCeiling: 20,
      forks: [], superchat: 0, income: { superchat: 0, shelf: 0, goods: 0 }, fansDelta: 0, chatQueue: [], deletedCount: 0, diedFloor: null, deathCause: null,
    } };
    state = reducer(state, { type: 'COMBAT/CHOOSE', choice: 'DEFEND' });
    expect(state.phase).toBe('DEATH');
    expect(state.today?.diedFloor).toBe(3);
    expect(state.corpses).toHaveLength(1);
    expect(state.corpses[0]).toMatchObject({ starId: 'body_karin', diedFloor: 3, diedDay: 1 });
    expect(state.stars.find((star) => star.id === 'body_karin')?.status).toBe('DEAD');
  });

  it('forces a descent death at the claimed ceiling plus three floors', () => {
    let state = liveState(15, 6, 4);
    state = reducer(state, { type: 'LIVE/TICK', dt: content.balance.dive.floorSeconds });
    expect(state.phase).toBe('DEATH');
    expect(state.today?.diedFloor).toBe(7);
    expect(state.today?.deathCause).toBe('descent limit');
    expect(state.corpses).toHaveLength(1);
    expect(state.maxFloor).toBe(26);
  });

  it('settles record, fan, goods, and corpse state only once on death', () => {
    let state = liveState(16, 28, 26);
    state = reducer(state, { type: 'LIVE/TICK', dt: content.balance.dive.floorSeconds });
    expect(state.phase).toBe('DEATH');
    expect(state.maxFloor).toBe(29);
    expect(state.stats.deepestFloor).toBe(29);
    expect(state.fans).toBeGreaterThan(createInitialState(16).fans);
    expect(state.gold).toBeGreaterThan(createInitialState(16).gold);
    expect(state.today?.income.goods).toBeGreaterThan(0);
    expect((state.today?.income.goods ?? 0) + (state.today?.income.superchat ?? 0)).toBe(state.gold - createInitialState(16).gold);
    const settled = state;
    state = reducer(state, { type: 'PHASE/ADVANCE' });
    expect(state.corpses).toHaveLength(1);
    expect(state.gold).toBe(settled.gold);
    expect(state.fans).toBe(settled.fans);
  });

  it('records each witness floor only once and applies 28F fatigue', () => {
    const witnessed = [18, 23, 28].map((floor) => {
      let state = liveState(100 + floor, floor - 1);
      state = reducer(state, { type: 'LIVE/TICK', dt: content.balance.dive.floorSeconds });
      expect(state.seenWitnessFloors).toEqual([floor]);
      const first = state;
      state = { ...state, waitingSince: null, today: { ...state.today!, currentFloor: floor - 1, encounter: null } };
      state = reducer(state, { type: 'LIVE/TICK', dt: content.balance.dive.floorSeconds });
      expect(state.seenWitnessFloors).toEqual([floor]);
      return first;
    });
    expect(witnessed.map((state) => state.witnessLog[0]?.floor)).toEqual([18, 23, 28]);
    expect(witnessed[2]?.viewerFatigue).toBe(content.balance.opinion.viewerFatigueOn28F);
  });

  it('swaps fork sides from the seeded RNG, while identical seeds stay identical', () => {
    const fork = content.floors.forks[0]!;
    const answerA = (seed: number) => reducer({
      ...liveState(seed, fork.atFloor),
      waitingSince: 1,
      today: { ...liveState(seed, fork.atFloor).today!, forks: [{ floor: fork.atFloor, truth: { a: fork.a, b: fork.b }, told: 'UNKNOWN', wasLie: false }] },
    }, { type: 'RADIO/ANSWER', dir: 'A' });
    const outcomes = new Set<number>();
    for (let seed = 1; seed <= 100; seed += 1) outcomes.add(answerA(seed).today!.currentFloor);
    expect(outcomes).toEqual(new Set([fork.atFloor + fork.a.reachDelta, fork.atFloor + fork.b.reachDelta]));
    expect(answerA(42)).toEqual(answerA(42));
  });

  it('marks the gatekeeper cutscene when its fork is first reached', () => {
    const gatekeeper = content.floors.forks.find((fork) => fork.a.hazard === 'GATEKEEPER' || fork.b.hazard === 'GATEKEEPER')!;
    const state = liveState(140, gatekeeper.atFloor - 1);
    const next = reducer(state, { type: 'LIVE/TICK', dt: content.balance.dive.floorSeconds });

    expect(next.today?.currentFloor).toBe(gatekeeper.atFloor);
    expect(next.waitingSince).not.toBeNull();
    expect(next.flags.gatekeeperCutscene).toBe(true);
  });

  it('plays one delayed radio callback when a lied-to star returns after revival', () => {
    const fork = content.floors.forks[0]!;
    const answer = (seed: number, dir: 'A' | 'B') => reducer({
      ...liveState(seed, fork.atFloor),
      waitingSince: 1,
      today: { ...liveState(seed, fork.atFloor).today!, forks: [{ floor: fork.atFloor, truth: { a: fork.a, b: fork.b }, told: 'UNKNOWN', wasLie: false }] },
    }, { type: 'RADIO/ANSWER', dir });
    let lied = answer(1, 'A');
    for (let seed = 1; seed <= 100 && lied.stats.liesTold === 0; seed += 1) {
      lied = answer(seed, 'A');
      if (lied.stats.liesTold === 0) lied = answer(seed, 'B');
    }
    expect(lied.stats.liesTold).toBe(1);
    const revived = {
      ...lied,
      phase: 'OFFICE' as const,
      stars: lied.stars.map((star) => star.id === 'body_karin' ? { ...star, status: 'ALIVE' as const, reviveCount: 1 } : star),
    };
    const resumed = reducer(revived, { type: 'OFFICE/CONFIRM' });
    expect(resumed.pendingFx.at(-1)).toMatchObject({ kind: 'TRUTH_WHISPER', payload: { starId: 'body_karin' } });
    expect(resumed.flags['lieCallback:body_karin']).toBeUndefined();
    expect(reducer({ ...resumed, phase: 'OFFICE' }, { type: 'OFFICE/CONFIRM' }).pendingFx.filter((fx) => fx.kind === 'TRUTH_WHISPER')).toHaveLength(1);
  });
});
