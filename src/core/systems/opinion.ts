import { content } from '../content';
import { draw } from '../rng';
import type { ChatMessage, ChatTone, GameState } from '../types';

type Corpus = Record<string, string[] | Record<string, string[]>>;
export type SuperchatTrigger = 'fork' | 'record' | 'death' | 'witness' | 'appeal';

const corpus = (): Corpus => content.chat as Corpus;
const moderationKey = 'opinion:moderation';
const bannedNickKey = (nick: string): string => `opinion:banned:${nick}`;

function lines(sourceKey: string, state: GameState): string[] {
  const value = corpus()[sourceKey];
  if (Array.isArray(value)) return value;
  const floor = state.seenWitnessFloors.at(-1);
  return sourceKey === 'TRUTH' ? value?.[`f${floor}`] ?? value?.relic ?? [] : [];
}

function availableNick(state: GameState, roll: number): string | undefined {
  const { nickPoolSize } = content.balance.opinion;
  const first = Math.floor(roll * nickPoolSize);
  for (let offset = 0; offset < nickPoolSize; offset += 1) {
    const nick = `viewer_${(first + offset) % nickPoolSize}`;
    if (state.flags[bannedNickKey(nick)] !== true) return nick;
  }
  return undefined;
}

function appendMessage(state: GameState, tone: ChatTone, sourceKey: string, leakPower: number, amount?: number): GameState {
  if (state.today === null) return state;
  const source = lines(sourceKey, state);
  if (source.length === 0) return state;
  const [lineRoll, next] = draw(state);
  const nick = availableNick(next, lineRoll);
  if (nick === undefined) return next;
  const message: ChatMessage = {
    id: `chat:${next.day}:${next.rngCursor}`,
    nick,
    text: source[Math.floor(lineRoll * source.length)] ?? source[0]!,
    tone,
    leakPower,
    amount,
    bornAt: next.phaseStartedAt,
    removed: false,
  };
  return { ...next, today: { ...next.today!, chatQueue: [...next.today!.chatQueue, message].slice(-content.balance.opinion.chatMaxVisible) } };
}

function needsBacklash(state: GameState): boolean {
  if (state.today === null || state.today.deletedCount <= content.balance.opinion.moderationFreeCount) return false;
  const intervalMs = content.balance.opinion.backlashIntervalSeconds * 1000;
  const interval = Math.floor(state.phaseStartedAt / intervalMs);
  return state.flags[`opinion:backlash:${interval}`] !== true;
}

export function spawnChat(state: GameState): GameState {
  if (state.phase !== 'LIVE' || state.today === null) return state;
  const rules = content.balance.opinion;
  if (needsBacklash(state)) {
    const interval = Math.floor(state.phaseStartedAt / (rules.backlashIntervalSeconds * 1000));
    return appendMessage({ ...state, flags: { ...state.flags, [`opinion:backlash:${interval}`]: true } }, 'DOUBT', 'MODERATION_BACKLASH', rules.leakPerIgnoredChat);
  }
  if (state.waitingSince !== null && state.phaseStartedAt - state.waitingSince >= rules.slowAfterSeconds * 1000) {
    return appendMessage(state, 'DOUBT', 'SLOW', 0);
  }
  const [toneRoll, withTone] = draw(state);
  const tone: ChatTone = withTone.leak >= rules.leakEndingThreshold || (withTone.leak >= rules.midLeakThreshold && toneRoll < rules.truthChanceAtMidLeak)
    ? 'TRUTH'
    : toneRoll < rules.hypeChance ? 'HYPE' : toneRoll < rules.casualChance ? 'CASUAL' : 'DOUBT';
  return appendMessage(withTone, tone, tone, tone === 'TRUTH' ? rules.truthLeakPower : tone === 'DOUBT' ? rules.leakPerIgnoredChat : 0);
}

export function expireChats(state: GameState): GameState {
  if (state.today === null) return state;
  const cutoff = state.phaseStartedAt - content.balance.opinion.chatLifetimeSeconds * 1000;
  const expired = state.today.chatQueue.filter((m) => !m.removed && m.bornAt <= cutoff);
  if (expired.length === 0) return state;
  return { ...state, leak: Math.min(100, state.leak + expired.reduce((n, m) => n + m.leakPower, 0)), today: { ...state.today, chatQueue: state.today.chatQueue.filter((m) => m.removed || m.bornAt > cutoff) } };
}

export function moderateChat(state: GameState, id: string, ban: boolean): GameState {
  if (state.phase !== 'LIVE' || state.today === null) return state;
  const target = state.today.chatQueue.find((m) => m.id === id);
  if (target === undefined || target.removed || (target.tone !== 'TRUTH' && target.tone !== 'DOUBT')) return state;
  const rules = content.balance.opinion;
  const amount = ban ? rules.moderationBanCost : rules.moderationDeleteCost;
  const total = state.today.deletedCount + amount;
  const oldExcess = Math.max(0, state.today.deletedCount - rules.moderationFreeCount);
  const nextExcess = Math.max(0, total - rules.moderationFreeCount);
  const flags: Record<string, boolean> = { ...state.flags, [moderationKey]: total > 0 };
  if (ban) flags[bannedNickKey(target.nick)] = true;
  return { ...state, flags, reputation: Math.max(0, state.reputation - (nextExcess - oldExcess) * rules.moderationRepPenalty), stats: { ...state.stats, chatsDeleted: state.stats.chatsDeleted + amount }, today: { ...state.today, deletedCount: total, chatQueue: state.today.chatQueue.map((m) => m.id === id ? { ...m, removed: true } : m) } };
}

export function addAppealChat(state: GameState): GameState {
  return state.phase === 'LIVE' ? appendMessage(state, 'HYPE', 'APPEAL', 0) : state;
}

export function awardSuperchat(state: GameState, trigger: SuperchatTrigger): GameState {
  if ((state.phase !== 'LIVE' && state.phase !== 'DEATH') || state.today === null) return state;
  const star = state.stars.find((candidate) => candidate.id === state.today?.starId);
  if (star === undefined) return state;
  const rules = content.balance.income.superchat;
  const range = rules[trigger];
  const [amountRoll, withRoll] = draw(state);
  const base = range[0] + (range[1] - range[0]) * amountRoll;
  const payPool = Math.max(1, withRoll.fans * rules.poolPerFan);
  const payPoolMul = Math.max(rules.depletedMul, 1 - withRoll.today!.superchat / payPool);
  const amount = Math.floor(base * (1 + withRoll.fans / 100000) * (1 + star.stats.charisma * rules.charismaMul) * payPoolMul);
  const paid = {
    ...withRoll,
    gold: withRoll.gold + amount,
    stats: { ...withRoll.stats, goldEarned: withRoll.stats.goldEarned + amount },
    today: {
      ...withRoll.today!,
      superchat: withRoll.today!.superchat + amount,
      income: { ...withRoll.today!.income, superchat: withRoll.today!.income.superchat + amount },
    },
  };
  const withMessage = appendMessage(paid, 'SUPERCHAT', 'SUPERCHAT', 0, amount);
  return { ...withMessage, pendingFx: [...withMessage.pendingFx, { kind: 'SUPERCHAT_POP', payload: { amount, trigger } }] };
}
