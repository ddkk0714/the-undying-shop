import { content } from './content';
import { createInitialState } from './state';
import { answerRadio, chooseCombat, startLive, tickLive, useCombatItem } from './systems/dive';
import { addCorpseGearLoot, addInheritedSaleLoot, damageAutopsyCorpse, detachCarried, discardReviveCorpse, reclaimCorpseCarried, reviveQuote, takeCorpseCarried } from './systems/economy';
import { equippedItemIds } from './systems/forecast';
import { acceptContract, confirmOffice, haggleContract, pickStar, placeOfficeItem, populateVisitors, rejectContract, sellOfficeBatch, setShopSalePrice } from './systems/office';
import { rollCorpseParts } from './systems/corpse';
import { inherit } from './systems/roster';
import { awardSuperchat, expireChats, moderateChat, spawnChat } from './systems/opinion';
import { isEarlyClosure, judgeEnding } from './systems/narrative';
import type { Action } from './actions';
import type { Corpse, GameState, PhaseId } from './types';

const phaseOrder: PhaseId[] = ['REVIVE', 'OFFICE', 'LIVE', 'DEATH', 'AUTOPSY', 'ANNOUNCE'];
const nextPhase = (phase: PhaseId): PhaseId => phaseOrder[(phaseOrder.indexOf(phase) + 1) % phaseOrder.length] ?? 'REVIVE';
const withPhase = (state: GameState, phase: PhaseId): GameState => ({ ...state, phase });

/**
 * v3.1(CCR-002) — 상점 화면은 ①소생 / ②편성을 한 화면의 모드로 보여준다.
 * 그래서 이 두 단계 사이만 자유롭게 오갈 수 있다. 그 밖의 점프는 하루 사이클을 깨므로 막는다.
 */
const SHOP_PHASES: PhaseId[] = ['REVIVE', 'OFFICE'];
function gotoPhase(state: GameState, phase: PhaseId): GameState {
  if (state.isOver) return state;
  if (!SHOP_PHASES.includes(state.phase) || !SHOP_PHASES.includes(phase)) return state;
  return withPhase(state, phase);
}

function latestTodayCorpse(state: GameState): Corpse | undefined {
  return state.today === null ? undefined : state.corpses.find((corpse) => corpse.starId === state.today?.starId && corpse.diedDay === state.day);
}

function revealWitnessedTruth(state: GameState, starId: string): GameState {
  const star = state.stars.find((candidate) => candidate.id === starId);
  if (star === undefined) return state;
  let leak = state.leak;
  const flags: Record<string, boolean> = { ...state.flags };
  for (const floor of star.witnessed) {
    const key = `witnessRevealed:${starId}:${floor}`;
    if (flags[key] === true) continue;
    leak += content.balance.opinion.leakPerWitnessRevive[String(floor)] ?? 0;
    flags[key] = true;
  }
  return { ...state, leak: Math.min(100, leak), flags };
}

function concludeRun(state: GameState): GameState {
  if (state.today === null) return withPhase(state, 'DEATH');
  const existingCorpse = latestTodayCorpse(state);
  if (existingCorpse !== undefined) return withPhase(state, 'DEATH');
  const diedFloor = state.today.diedFloor ?? Math.max(1, state.today.currentFloor, state.today.claimedCeiling);
  const star = state.stars.find((candidate) => candidate.id === state.today?.starId);
  if (star === undefined) return withPhase(state, 'DEATH');
  const isRecord = diedFloor > state.maxFloor;
  const rules = content.balance.fans;
  const drama = 1 + (isRecord ? rules.recordBonus : 0) + (state.today.forks.some((fork) => fork.wasLie) ? rules.shallowLiePenalty : 0) + state.today.appealCount * rules.appealMul;
  const fansDelta = Math.floor(rules.base * (1 + (diedFloor - rules.depthPivot) * rules.depthMul) * drama * (1 - state.viewerFatigue / 100));
  const goodsIncome = Math.floor(state.fans * content.balance.income.goodsPerFan);
  // 들고 내려간 장비는 저절로 돌아오지 않는다 — 몸에 남고, 소생실에서 회수한다 (CCR-006)
  const equipped = equippedItemIds(state, star.id);
  const { carried, inventory } = detachCarried(state, equipped);
  const soldEquipmentIds = equipped.flatMap((itemId, slot) => {
    if (itemId === null) return [];
    const key = `runEquipment:${state.day}:${star.id}:${slot}:${itemId}`;
    return state.flags[key] === true ? [itemId] : [];
  });
  const [inheritedLoot, withInheritanceRng] = addInheritedSaleLoot({ ...state, inventory }, soldEquipmentIds);
  const [gearLoot, withLootRng] = addCorpseGearLoot(withInheritanceRng);
  // 몸의 실제 상태(부위별 손상)는 여기서 정해져 시체에 남는다 — 검시 판정(grade)과는 다른 것이다 (HO-029)
  const parts = rollCorpseParts(state.seed, star.id, state.day, diedFloor);
  const corpse: Corpse = { starId: star.id, diedFloor, diedDay: state.day, grade: 'INTACT', announced: null, loot: [], carried: [...carried, ...inheritedLoot, ...gearLoot], parts };
  const stars = withLootRng.stars.map((candidate) => candidate.id === star.id ? { ...candidate, status: 'DEAD' as const } : candidate);
  const maxFloor = Math.max(state.maxFloor, diedFloor);
  const settled: GameState = {
    ...withLootRng, phase: 'DEATH', stars, corpses: [...withLootRng.corpses, corpse], gold: withLootRng.gold + goodsIncome,
    fans: Math.max(0, withLootRng.fans + fansDelta),
    today: {
      ...withLootRng.today!, currentFloor: diedFloor, diedFloor,
      deathCause: withLootRng.today!.deathCause ?? '하강 중 사망', fansDelta,
      income: { ...withLootRng.today!.income, goods: withLootRng.today!.income.goods + goodsIncome },
    }, maxFloor,
    pendingFx: [...withLootRng.pendingFx, ...(isRecord ? [{ kind: 'RECORD_BREAK' as const }] : [])],
    stats: { ...withLootRng.stats, goldEarned: withLootRng.stats.goldEarned + goodsIncome, deepestFloor: Math.max(withLootRng.stats.deepestFloor, diedFloor) },
  };
  const withDeathSuperchat = awardSuperchat(settled, 'death');
  return isRecord ? awardSuperchat(withDeathSuperchat, 'record') : withDeathSuperchat;
}

function finishLive(state: GameState): GameState {
  return concludeRun(state);
}

function concludeRunIfDead(state: GameState): GameState {
  return state.phase === 'DEATH' ? concludeRun(state) : state;
}

function advance(state: GameState): GameState {
  if (state.isOver) return state;
  if (state.phase === 'OFFICE') {
    const confirmed = confirmOffice(state);
    const automatic = confirmed.today !== null
      ? confirmed
      : (() => {
        const star = confirmed.stars.find((candidate) => candidate.status === 'ALIVE');
        return star === undefined ? confirmed : pickStar(confirmed, star.id);
      })();
    return isEarlyClosure(automatic) ? { ...automatic, isOver: true, ending: 'B_CONTINUE', today: null } : startLive(automatic);
  }
  if (state.phase === 'REVIVE') {
    return isEarlyClosure(state)
      ? { ...state, isOver: true, ending: 'B_CONTINUE', today: null }
      : populateVisitors(withPhase(state, 'OFFICE'));
  }
  if (state.phase === 'LIVE') return finishLive(state);
  if (state.phase === 'ANNOUNCE') {
    const ending = judgeEnding(state);
    if (ending !== null) return { ...state, isOver: true, ending, today: null };
    return { ...state, day: state.day + 1, phase: 'REVIVE', today: null, shelf: [null, null, null], visitors: [] };
  }
  return withPhase(state, nextPhase(state.phase));
}

export function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'GAME/NEW': return createInitialState(action.seed);
    case 'GAME/LOAD': return structuredClone(action.state);
    case 'PHASE/ADVANCE': return advance(state);
    case 'PHASE/GOTO': return gotoPhase(state, action.phase);
    case 'REVIVE/PAY': {
      if (state.phase !== 'REVIVE') return state;
      const corpse = state.corpses.find((candidate) => candidate.starId === action.starId);
      const star = state.stars.find((candidate) => candidate.id === action.starId && candidate.status === 'DEAD');
      if (corpse === undefined || star === undefined) return state;
      const quote = reviveQuote(state, corpse, star);
      if (!quote.affordable) return state;
      const revealed = reclaimCorpseCarried(revealWitnessedTruth(state, action.starId), action.starId);
      return {
        ...revealed,
        gold: revealed.gold - quote.cost,
        stars: revealed.stars.map((candidate) => candidate.id === action.starId ? { ...candidate, status: 'ALIVE' as const, reviveCount: candidate.reviveCount + 1 } : candidate),
        stats: { ...revealed.stats, totalRevived: revealed.stats.totalRevived + 1, goldSpentOnRevive: revealed.stats.goldSpentOnRevive + quote.cost },
      };
    }
    case 'REVIVE/SKIP': return state;
    case 'REVIVE/LOOT': return state.phase === 'REVIVE' ? takeCorpseCarried(state, action.starId, action.itemId) : state;
    case 'REVIVE/RECORD_STAMP': {
      if (state.phase !== 'REVIVE') return state;
      const corpse = state.corpses.find((candidate) => candidate.starId === action.starId
        && candidate.diedDay === action.diedDay && candidate.diedFloor === action.diedFloor);
      if (corpse === undefined) return state;
      const key = `reviveRecordStamped:${action.starId}:${action.diedDay}:${action.diedFloor}`;
      return state.flags[key] === true ? state : { ...state, flags: { ...state.flags, [key]: true } };
    }
    case 'REVIVE/DISCARD': return state.phase === 'REVIVE' ? discardReviveCorpse(state, action.starId) : state;
    case 'REVIVE/INHERIT': return inherit(state, action.personaId, action.toStarId);
    case 'OFFICE/CONTRACT_ACCEPT': {
      const signed = acceptContract(state, action.starId);
      // 계약 확정과 방송 시작은 서로 다른 입력이다.
      // 수락 뒤에는 편성실에 머물고, 이어서 OFFICE/CONFIRM을 눌러 방송을 시작한다.
      return signed === state ? state : pickStar(signed, action.starId);
    }
    case 'OFFICE/CONTRACT_REJECT': return populateVisitors(rejectContract(state, action.starId));
    // CCR-005 — 계약만 열어 둔 자리다. 흥정 로직은 Codex 몫이고, 이 줄은 그냥 덮어써라.
    // 여기를 비워 두면 switch 가 exhaustive 하지 않아 `tsc --noEmit` 이 깨지고 배포가 멈춘다.
    case 'OFFICE/CONTRACT_HAGGLE': return haggleContract(state, action.starId);
    case 'OFFICE/PICK_STAR': return pickStar(state, action.starId);
    case 'OFFICE/PLACE': return placeOfficeItem(state, action.slot, action.itemId);
    case 'OFFICE/SALE_PRICE_SET': return setShopSalePrice(state, action.multiplier);
    case 'OFFICE/SELL_BATCH': return sellOfficeBatch(state);
    case 'OFFICE/CONFIRM': return state.phase === 'OFFICE' ? advance(state) : state;
    case 'LIVE/TICK': return expireChats(concludeRunIfDead(tickLive(state, action.dt)));
    case 'COMBAT/CHOOSE': return concludeRunIfDead(chooseCombat(state, action.choice));
    case 'COMBAT/USE_ITEM': return useCombatItem(state, action.itemId);
    case 'RADIO/ANSWER': return answerRadio(state, action.dir);
    case 'CHAT/SPAWN': return spawnChat(state);
    case 'CHAT/DELETE': return moderateChat(state, action.id, false);
    case 'CHAT/BAN': return moderateChat(state, action.id, true);
    case 'AUTOPSY/DECIDE': {
      if (state.phase !== 'AUTOPSY') return state;
      const corpse = latestTodayCorpse(state);
      if (corpse === undefined) return advance(state);
      if (action.grade === 'DAMAGED') return { ...damageAutopsyCorpse(state, corpse.starId), phase: 'ANNOUNCE' };
      const corpses = state.corpses.map((candidate) => candidate === corpse ? { ...candidate, grade: action.grade } : candidate);
      return { ...state, corpses, phase: 'ANNOUNCE', pendingFx: [...state.pendingFx, { kind: 'SEAL_STAMP' }] };
    }
    case 'ANNOUNCE/DECLARE': {
      if (state.phase !== 'ANNOUNCE') return state;
      const corpse = latestTodayCorpse(state);
      const corpses = corpse === undefined ? state.corpses : state.corpses.map((candidate) => candidate === corpse ? { ...candidate, announced: action.as } : candidate);
      const falseAnnouncements = action.as === 'FAILURE' ? state.stats.falseAnnouncements + 1 : state.stats.falseAnnouncements;
      const reputation = Math.max(0, Math.min(100, state.reputation + (action.as === 'SUCCESS' ? content.balance.reputation.onSuccessAnnounce : content.balance.reputation.onFailureAnnounce)));
      const stars = corpse?.grade === 'INTACT' && action.as === 'FAILURE' ? state.stars.map((star) => star.id === corpse.starId ? { ...star, status: 'HIDDEN' as const } : star) : state.stars;
      const leak = corpse?.grade === 'DAMAGED' && action.as === 'SUCCESS' ? Math.min(100, state.leak + content.balance.opinion.leakPerFakeSuccess) : state.leak;
      return advance({ ...state, corpses, stars, leak, reputation, stats: { ...state.stats, falseAnnouncements } });
    }
    case 'FX/CONSUME': return { ...state, pendingFx: [] };
    case 'OPTION/SET': {
      if (action.key !== 'reducedMotion' || typeof action.value !== 'boolean') return state;
      return { ...state, flags: { ...state.flags, reducedMotion: action.value } };
    }
  }
}
