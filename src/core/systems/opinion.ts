import { content } from '../content';
import { draw } from '../rng';
import type { ChatMessage, ChatTone, GameState } from '../types';

type Corpus = Record<string, string[] | Record<string, string[]>>;
export type SuperchatTrigger = 'fork' | 'record' | 'death' | 'witness' | 'appeal';
export interface AudienceSnapshot {
  viewers: number;
  /** UI가 CHAT/SPAWN 타이머에 쓰는 권장 주기. 낮을수록 채팅이 빠르다. */
  chatIntervalMs: number;
}

const corpus = (): Corpus => content.chat as Corpus;
const moderationKey = 'opinion:moderation';
const bannedNickKey = (nick: string): string => `opinion:banned:${nick}`;

function lines(sourceKey: string, state: GameState): string[] {
  const value = corpus()[sourceKey];
  if (Array.isArray(value)) return value;
  const floor = state.seenWitnessFloors.at(-1);
  return sourceKey === 'TRUTH' ? value?.[`f${floor}`] ?? value?.relic ?? [] : [];
}

/**
 * 채팅은 단순한 랜덤 잡담이 아니라 지금 방송에서 벌어진 일을 따라간다.
 * 톤(색·삭제 규칙)은 그대로 두고, 같은 톤 안에서만 상황별 코퍼스를 고른다.
 */
function contextualSource(state: GameState, tone: ChatTone): string {
  const run = state.today;
  if (run === null) return tone;
  const isForkWait = run.encounter === null && state.waitingSince !== null && run.forks.at(-1)?.told === 'UNKNOWN';
  const isDanger = run.hero.maxHp > 0 && run.hero.hp / run.hero.maxHp <= 0.5;
  if (tone === 'HYPE' && run.encounter !== null) return 'COMBAT';
  if (tone === 'HYPE' && isForkWait) return 'FORK';
  if (tone === 'HYPE' && isDanger) return 'DANGER';
  if (tone === 'DOUBT' && isForkWait) return 'FORK_DOUBT';
  if (tone === 'DOUBT' && isDanger) return 'DANGER_DOUBT';
  if (tone === 'HYPE' && run.currentFloor <= content.balance.opinion.audience.earlyFloorMax) return 'EARLY_HYPE';
  if (tone === 'CASUAL' && run.currentFloor <= content.balance.opinion.audience.earlyFloorMax) return 'EARLY_CASUAL';
  return tone;
}

function streamerReaction(trigger: SuperchatTrigger, roll: number): string {
  const source = corpus().STREAMER_REACTION;
  if (Array.isArray(source)) return source[Math.floor(roll * source.length)] ?? source[0] ?? '';
  const options = source?.[trigger] ?? [];
  return options[Math.floor(roll * options.length)] ?? options[0] ?? '';
}

function streamerExpression(trigger: SuperchatTrigger): string {
  switch (trigger) {
    case 'appeal': return 'SMILE';
    case 'record': return 'TRIUMPH';
    case 'death': return 'SHOCK';
    case 'witness': return 'UNEASY';
    case 'fork': return 'FOCUSED';
  }
}

function availableNick(state: GameState, roll: number): string | undefined {
  const fantasyNicks = lines('NICKS', state);
  if (fantasyNicks.length > 0) {
    const first = Math.floor(roll * fantasyNicks.length);
    for (let offset = 0; offset < fantasyNicks.length; offset += 1) {
      const nick = fantasyNicks[(first + offset) % fantasyNicks.length]!;
      if (state.flags[bannedNickKey(nick)] !== true) return nick;
    }
    return undefined;
  }
  const { nickPoolSize } = content.balance.opinion;
  const first = Math.floor(roll * nickPoolSize);
  for (let offset = 0; offset < nickPoolSize; offset += 1) {
    const nick = `viewer_${(first + offset) % nickPoolSize}`;
    if (state.flags[bannedNickKey(nick)] !== true) return nick;
  }
  return undefined;
}

/**
 * 방송 시작은 조용하고, 층·어필·후원·위기가 쌓일수록 시청자와 채팅 박자가 올라간다.
 * 저장 상태를 바꾸지 않는 표시 전용 계산이라 UI가 매 프레임 안전하게 읽을 수 있다.
 */
export function audienceSnapshot(state: GameState): AudienceSnapshot {
  const rules = content.balance.opinion.audience;
  const run = state.today;
  if (run === null) return { viewers: rules.minViewers, chatIntervalMs: rules.firstChatIntervalMs };
  const healthRatio = run.hero.maxHp <= 0 ? 0 : run.hero.hp / run.hero.maxHp;
  const raw = state.fans * rules.basePerFan
    + run.currentFloor * rules.viewersPerFloor
    + run.appealCount * rules.appealViewerBoost
    + run.superchat * rules.superchatViewerPerGold
    + Math.max(0, run.currentFloor - state.maxFloor) * rules.recordViewerBoost
    + (healthRatio <= rules.dangerHealthRatio ? rules.dangerViewerBoost : 0);
  const viewers = Math.max(rules.minViewers, Math.min(Math.floor(state.fans * rules.maxPerFan), Math.floor(raw)));
  const chatSteps = Math.floor(Math.max(0, viewers - rules.minViewers) / rules.viewersPerChatStep);
  return { viewers, chatIntervalMs: Math.max(rules.minChatIntervalMs, rules.firstChatIntervalMs - chatSteps * rules.chatIntervalStepMs) };
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
  return appendMessage(withTone, tone, contextualSource(withTone, tone), tone === 'TRUTH' ? rules.truthLeakPower : tone === 'DOUBT' ? rules.leakPerIgnoredChat : 0);
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
  const withMessage = appendMessage(paid, 'SUPERCHAT', `SUPERCHAT_${trigger.toUpperCase()}`, 0, amount);
  const reaction = streamerReaction(trigger, amountRoll);
  const expression = streamerExpression(trigger);
  return { ...withMessage, pendingFx: [...withMessage.pendingFx, { kind: 'SUPERCHAT_POP', payload: { amount, trigger, reaction, expression } }] };
}
