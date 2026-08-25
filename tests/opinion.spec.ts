import { describe, expect, it } from 'vitest';
import { content } from '../src/core/content';
import { reducer } from '../src/core/reducer';
import { createInitialState } from '../src/core/state';
import { createEncounter } from '../src/core/systems/combat';
import { answerRadio } from '../src/core/systems/dive';
import { addAppealChat, audienceSnapshot, awardSuperchat, expireChats, moderateChat, spawnChat } from '../src/core/systems/opinion';
import type { ChatMessage, GameState } from '../src/core/types';

function liveState(seed = 71): GameState {
  const initial = createInitialState(seed);
  const star = initial.stars[0]!;
  return {
    ...initial,
    phase: 'LIVE',
    phaseStartedAt: 0,
    today: {
      starId: star.id,
      personaId: star.personaId,
      currentFloor: 1,
      hero: { hp: 82, maxHp: 82, atk: 13, def: 2 },
      encounter: null,
      appealCount: 0,
      claimedCeiling: 30,
      forks: [],
      superchat: 0,
      income: { superchat: 0, shelf: 0, goods: 0 },
      fansDelta: 0,
      chatQueue: [],
      deletedCount: 0,
      mental: 100,
      diedFloor: null,
      deathCause: null,
    },
  };
}

function message(id: string, tone: ChatMessage['tone'], bornAt = 0, nick = `viewer_${id}`): ChatMessage {
  return { id, nick, text: id, tone, leakPower: tone === 'TRUTH' ? content.balance.opinion.truthLeakPower : content.balance.opinion.leakPerIgnoredChat, bornAt, removed: false };
}

describe('opinion and superchat core', () => {
  it('uses seeded chat generation, keeps at most seven lines, and forces TRUTH after the leak threshold', () => {
    const initial = { ...liveState(72), leak: content.balance.opinion.leakEndingThreshold };
    const generated = Array.from({ length: 10 }).reduce<GameState>((state) => spawnChat(state), initial);
    expect(generated.today?.chatQueue).toHaveLength(content.balance.opinion.chatMaxVisible);
    expect(generated.today?.chatQueue.every((entry) => entry.tone === 'TRUTH')).toBe(true);
    expect(Array.from({ length: 10 }).reduce<GameState>((state) => spawnChat(state), initial)).toEqual(generated);

    const firstTruth = spawnChat(initial);
    const deleted = moderateChat(firstTruth, firstTruth.today!.chatQueue[0]!.id, false);
    expect(deleted.today?.chatQueue[0]?.removed).toBe(true);
    const afterDelete = spawnChat(deleted);
    expect(deleted.leak).toBe(initial.leak);
    expect(afterDelete.today?.chatQueue.at(-1)?.tone).toBe('TRUTH');
  });

  it('expires ignored truth without leaking deleted truth', () => {
    const lifetimeMs = content.balance.opinion.chatLifetimeSeconds * 1000;
    const initial = { ...liveState(73), phaseStartedAt: lifetimeMs, today: { ...liveState(73).today!, chatQueue: [message('truth', 'TRUTH')] } };
    const expired = expireChats(initial);
    expect(expired.leak).toBe(content.balance.opinion.truthLeakPower);
    expect(expired.today?.chatQueue).toEqual([]);

    const deleted = moderateChat(initial, 'truth', false);
    expect(expireChats(deleted).leak).toBe(0);
  });

  it('adds a delayed SLOW line, records bans, and emits one moderation backlash per interval', () => {
    const slowAt = content.balance.opinion.slowAfterSeconds * 1000;
    const slow = spawnChat({ ...liveState(74), phaseStartedAt: slowAt, waitingSince: 0 });
    const slowLines = (content.chat as Record<string, string[]>).SLOW;
    expect(slow.today?.chatQueue[0]).toMatchObject({ tone: 'DOUBT' });
    expect(slowLines).toContain(slow.today?.chatQueue[0]?.text);

    const queue = Array.from({ length: content.balance.opinion.moderationFreeCount + 1 }, (_, index) => message(`truth-${index}`, 'TRUTH', 0, `viewer_${index}`));
    const moderationState: GameState = { ...liveState(75), today: { ...liveState(75).today!, chatQueue: queue } };
    const moderated = queue.reduce<GameState>((state, entry) => moderateChat(state, entry.id, false), moderationState);
    expect(moderated.reputation).toBe(liveState(75).reputation - content.balance.opinion.moderationRepPenalty);
    const intervalMs = content.balance.opinion.backlashIntervalSeconds * 1000;
    const backlash = spawnChat({ ...moderated, phaseStartedAt: intervalMs });
    expect(backlash.today?.chatQueue.at(-1)?.text).toBeDefined();
    expect(backlash.flags['opinion:backlash:1']).toBe(true);
    expect(spawnChat(backlash).flags).toEqual(backlash.flags);

    const banned = moderateChat({ ...liveState(76), today: { ...liveState(76).today!, chatQueue: [message('ban-me', 'TRUTH', 0, 'viewer_7')] } }, 'ban-me', true);
    expect(banned.flags['opinion:banned:viewer_7']).toBe(true);
    expect(banned.today?.deletedCount).toBe(content.balance.opinion.moderationBanCost);
  });

  it('emits an APPEAL line and pays a deterministic superchat from the daily pool', () => {
    const initial = liveState(77);
    const appealed = addAppealChat(initial);
    expect(appealed.today?.chatQueue[0]).toMatchObject({ tone: 'HYPE' });
    const paid = awardSuperchat(appealed, 'appeal');
    expect(paid.gold).toBeGreaterThan(initial.gold);
    expect(paid.stats.goldEarned).toBeGreaterThan(0);
    expect(paid.today?.superchat).toBe(paid.stats.goldEarned);
    expect(paid.today?.income.superchat).toBe(paid.today?.superchat);
    expect(paid.today?.chatQueue.some((entry) => entry.tone === 'SUPERCHAT' && entry.amount !== undefined)).toBe(true);
    expect(paid.pendingFx.at(-1)).toMatchObject({ kind: 'SUPERCHAT_POP', payload: { trigger: 'appeal', expression: 'SMILE' } });
    const appealResponses = (content.chat as Record<string, Record<string, string[]>>).STREAMER_REACTION.appeal;
    expect(appealResponses).toContain(paid.pendingFx.at(-1)?.payload?.reaction);
    expect(awardSuperchat(appealed, 'appeal')).toEqual(paid);

    const paidAgain = awardSuperchat(paid, 'appeal');
    expect((paidAgain.today?.superchat ?? 0) - (paid.today?.superchat ?? 0)).toBeLessThan(paid.today?.superchat ?? 0);
  });

  it('uses the LIVE situation for chat copy and gives each superchat a streamer reaction payload', () => {
    const fork = content.floors.forks[0]!;
    const forkWait: GameState = {
      ...liveState(304),
      waitingSince: 0,
      today: {
        ...liveState(304).today!,
        currentFloor: fork.atFloor,
        forks: [{ floor: fork.atFloor, truth: { a: fork.a, b: fork.b }, told: 'UNKNOWN', wasLie: false }],
      },
    };
    const generated = Array.from({ length: 12 }).reduce<GameState>((state) => spawnChat(state), forkWait);
    const forkHype = (content.chat as Record<string, string[]>).FORK;
    const forkDoubt = (content.chat as Record<string, string[]>).FORK_DOUBT;
    for (const entry of generated.today?.chatQueue ?? []) {
      if (entry.tone === 'HYPE') expect(forkHype).toContain(entry.text);
      if (entry.tone === 'DOUBT') expect(forkDoubt).toContain(entry.text);
    }

    const paid = awardSuperchat(liveState(305), 'witness');
    const event = paid.pendingFx.at(-1);
    const witnessResponses = (content.chat as Record<string, Record<string, string[]>>).STREAMER_REACTION.witness;
    expect(event).toMatchObject({ kind: 'SUPERCHAT_POP', payload: { trigger: 'witness', expression: 'UNEASY' } });
    expect(witnessResponses).toContain(event?.payload?.reaction);
    const superchat = paid.today?.chatQueue.at(-1);
    expect((content.chat as Record<string, string[]>).SUPERCHAT_WITNESS).toContain(superchat?.text);
  });

  it('starts a broadcast quieter, then grows the audience and chat density with good LIVE moments', () => {
    const opening = audienceSnapshot(liveState(306));
    const thriving: GameState = {
      ...liveState(306),
      maxFloor: 26,
      today: {
        ...liveState(306).today!,
        currentFloor: 31,
        hero: { hp: 30, maxHp: 82, atk: 13, def: 2 },
        appealCount: 3,
        superchat: 900,
      },
    };
    const peak = audienceSnapshot(thriving);
    expect(opening.viewers).toBeGreaterThanOrEqual(content.balance.opinion.audience.minViewers);
    expect(peak.viewers).toBeGreaterThan(opening.viewers);
    expect(peak.chatIntervalMs).toBeLessThan(opening.chatIntervalMs);
    expect(audienceSnapshot(thriving)).toEqual(peak);
  });

  it('uses seeded fantasy nicknames and respects a ban', () => {
    const first = spawnChat(liveState(307));
    const nicknames = (content.chat as Record<string, string[]>).NICKS;
    const nick = first.today?.chatQueue[0]?.nick;
    expect(nicknames).toContain(nick);
    const banned = moderateChat({ ...first, today: { ...first.today!, chatQueue: [{ ...first.today!.chatQueue[0]!, tone: 'DOUBT', leakPower: 1 }] } }, first.today!.chatQueue[0]!.id, true);
    expect(spawnChat(banned).today?.chatQueue.at(-1)?.nick).not.toBe(nick);
  });

  it('pays the appeal superchat through the LIVE combat reducer path', () => {
    const initial = liveState(78);
    const state: GameState = { ...initial, today: { ...initial.today!, encounter: createEncounter(1, 'NONE', 0) } };
    const next = reducer(state, { type: 'COMBAT/CHOOSE', choice: 'APPEAL' });
    expect(next.today?.appealCount).toBe(1);
    expect(next.today?.superchat).toBeGreaterThan(0);
    expect(next.gold).toBeGreaterThan(state.gold);
    expect(next.pendingFx.some((fx) => fx.kind === 'SUPERCHAT_POP')).toBe(true);
  });

  it('pays superchats for the riskier fork, witness, death, and record triggers only', () => {
    const fork = content.floors.forks[0]!;
    const forkPaid = Array.from({ length: 32 }, (_, offset) => {
      const initial = liveState(100 + offset);
      const state: GameState = {
        ...initial,
        today: { ...initial.today!, currentFloor: fork.atFloor, forks: [{ floor: fork.atFloor, truth: { a: fork.a, b: fork.b }, told: 'UNKNOWN', wasLie: false }] },
      };
      return answerRadio(state, 'A');
    }).find((state) => (state.today?.superchat ?? 0) > 0);
    expect(forkPaid?.pendingFx.at(-1)).toMatchObject({ kind: 'SUPERCHAT_POP', payload: { trigger: 'fork' } });

    const witnessInitial = liveState(79);
    const witnessed = reducer({ ...witnessInitial, today: { ...witnessInitial.today!, currentFloor: 17 } }, { type: 'LIVE/TICK', dt: content.balance.dive.floorSeconds });
    expect(witnessed.witnessLog[0]?.floor).toBe(18);
    expect(witnessed.pendingFx.at(-1)).toMatchObject({ kind: 'SUPERCHAT_POP', payload: { trigger: 'witness' } });

    const recordInitial = liveState(80);
    const recorded = reducer({ ...recordInitial, today: { ...recordInitial.today!, currentFloor: 28, claimedCeiling: 26 } }, { type: 'LIVE/TICK', dt: content.balance.dive.floorSeconds });
    expect(recorded.phase).toBe('DEATH');
    expect(recorded.today?.superchat).toBeGreaterThan(0);
    expect(recorded.pendingFx.filter((fx) => fx.kind === 'SUPERCHAT_POP').map((fx) => fx.payload?.trigger)).toEqual(['death', 'record']);
  });
});
