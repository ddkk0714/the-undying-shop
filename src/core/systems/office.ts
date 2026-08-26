import { content } from '../content';
import { draw } from '../rng';
import { createHero } from './combat';
import type { Combatant, Contract, GameState, ItemDef, Star, TodayRun } from '../types';

function signedContractKey(starId: string): string {
  return `contractSigned:${starId}`;
}

function haggledContractKey(starId: string): string {
  return `contractHaggled:${starId}`;
}

function profileClaimedTiers(starId: string): { floor: number; rate: number }[] {
  const rules = content.balance.contract;
  const profile = content.starProfiles[starId];
  if (profile === undefined) return rules.claimedTiers.map((tier) => ({ ...tier }));
  const upperFloor = Math.max(...(profile.likelyEnd.match(/\d+/g)?.map(Number) ?? [profile.targetFloor]));
  return [
    { floor: Math.max(1, profile.targetFloor - 6), rate: rules.claimedTiers[0]?.rate ?? 1 },
    { floor: profile.targetFloor, rate: rules.claimedTiers[1]?.rate ?? 0.6 },
    { floor: upperFloor, rate: rules.claimedTiers[2]?.rate ?? 0.25 },
  ];
}

export function populateVisitors(state: GameState): GameState {
  if (state.phase !== 'OFFICE' || state.visitors.length > 0 || state.recruitPool.length === 0) return state;
  const eligible = state.recruitPool.filter((star) => !state.rejectedStarIds.includes(star.id));
  const candidates = eligible;
  if (candidates.length === 0) return state;

  const rules = content.balance.contract;
  const [candidateRoll, afterCandidate] = draw(state);
  const star = candidates[Math.floor(candidateRoll * candidates.length)];
  if (star === undefined) return afterCandidate;
  const [honestyRoll, next] = draw(afterCandidate);
  const honesty = rules.honestyMin + honestyRoll * (rules.honestyMax - rules.honestyMin);
  const profile = content.starProfiles[star.id];
  const fandom = profile?.fans ?? rules.fandomBase + star.stats.charisma * rules.fandomPerCharisma;
  // 팬 수는 계약서에 원본 수치를 보여주되, 계약금 밸런스는 기존 charisma 계수를 유지한다.
  const fee = Math.max(0, Math.round(rules.feeBase + star.stats.charisma * rules.feePerFandomK + (1 - honesty) * rules.feeHonestyBias));
  const claimedTiers = profileClaimedTiers(star.id);
  const visitor: Contract = {
    starId: star.id,
    displayName: star.bodyName,
    recognition: profile?.fame ?? 'C',
    fandom,
    claimedTiers,
    fee,
    honesty,
  };
  return { ...next, visitors: [visitor] };
}

function equippedItems(state: GameState): ItemDef[] {
  return state.shelf.flatMap((id) => {
    const item = content.items.find((candidate) => candidate.id === id);
    return item?.kind === 'GEAR' ? [item] : [];
  });
}

function removeInventoryItem(inventory: GameState['inventory'], itemId: string): GameState['inventory'] {
  return inventory.flatMap((stack) => {
    if (stack.id !== itemId) return [stack];
    return stack.qty <= 1 ? [] : [{ ...stack, qty: stack.qty - 1 }];
  });
}

export function placeOfficeItem(state: GameState, slot: number, itemId: string | null): GameState {
  if (state.phase !== 'OFFICE' || slot < 0 || slot >= state.shelf.length) return state;
  if (itemId !== null) {
    const item = content.items.find((candidate) => candidate.id === itemId);
    const available = state.inventory.some((stack) => stack.id === itemId && stack.qty > 0);
    const expectedSlot = content.balance.equipment.slotByItem[itemId];
    if (item === undefined || !available || expectedSlot !== slot || state.shelf.includes(itemId)) return state;
  }
  const shelf = [...state.shelf];
  shelf[slot] = itemId;
  return { ...state, shelf };
}

export function sellOfficeItem(state: GameState, itemId: string): GameState {
  if (state.phase !== 'OFFICE' || state.shelf.includes(itemId)) return state;
  const item = content.items.find((candidate) => candidate.id === itemId);
  const available = state.inventory.some((stack) => stack.id === itemId && stack.qty > 0);
  if (item === undefined || !available) return state;
  const truthRelic = item.id === 'soil_deep' || item.id === 'page_torn';
  return {
    ...state,
    gold: state.gold + item.price,
    inventory: removeInventoryItem(state.inventory, itemId),
    leak: truthRelic ? Math.min(100, state.leak + content.balance.opinion.leakPerTruthRelicSale) : state.leak,
    stats: { ...state.stats, goldEarned: state.stats.goldEarned + item.price },
    today: state.today === null ? null : { ...state.today, income: { ...state.today.income, shelf: state.today.income.shelf + item.price } },
  };
}

function degradationMultiplier(star: Star): number {
  const multipliers = content.balance.degrade.statMul;
  return multipliers[Math.min(star.reviveCount, multipliers.length - 1)] ?? multipliers[0] ?? 1;
}

function claimedCeiling(state: GameState, starId: string): number {
  const contract = state.visitors.find((visitor) => visitor.starId === starId);
  const claimedTiers = contract?.claimedTiers ?? (state.flags[signedContractKey(starId)] === true ? profileClaimedTiers(starId) : []);
  const highestClaim = claimedTiers.length === 0 ? undefined : Math.max(...claimedTiers.map((tier) => tier.floor));
  return Math.max(1, highestClaim ?? state.maxFloor);
}

export function officeHero(state: GameState, star: Star): Combatant {
  return createHero(star, equippedItems(state), degradationMultiplier(star));
}

export function pickStar(state: GameState, starId: string): GameState {
  if (state.phase !== 'OFFICE') return state;
  const star = state.stars.find((candidate) => candidate.id === starId && candidate.status === 'ALIVE');
  if (star === undefined) return state;
  const today: TodayRun = {
    starId: star.id, personaId: star.personaId, currentFloor: 1,
    hero: officeHero(state, star), encounter: null, appealCount: 0,
    claimedCeiling: claimedCeiling(state, star.id), forks: [], superchat: 0,
    income: { superchat: 0, shelf: 0, goods: 0 }, fansDelta: 0,
    chatQueue: [], deletedCount: 0, mental: content.balance.mental.max, diedFloor: null, deathCause: null,
  };
  return { ...state, today };
}

export function acceptContract(state: GameState, starId: string): GameState {
  if (state.phase !== 'OFFICE') return state;
  const contract = state.visitors.find((visitor) => visitor.starId === starId);
  const candidate = state.recruitPool.find((star) => star.id === starId);
  if (contract === undefined || candidate === undefined || state.gold < contract.fee) return state;
  const recruited: Star = { ...candidate, honesty: contract.honesty, status: 'ALIVE' };
  return {
    ...state,
    gold: state.gold - contract.fee,
    stars: [...state.stars, recruited],
    recruitPool: state.recruitPool.filter((star) => star.id !== starId),
    visitors: state.visitors.filter((visitor) => visitor.starId !== starId),
    flags: { ...state.flags, [signedContractKey(starId)]: true },
    pendingFx: [...state.pendingFx, { kind: 'CONTRACT_SIGN', payload: { starId } }],
  };
}

export function haggleContract(state: GameState, starId: string): GameState {
  if (state.phase !== 'OFFICE' || state.flags[haggledContractKey(starId)] === true) return state;
  const contract = state.visitors.find((visitor) => visitor.starId === starId);
  if (contract === undefined) return state;
  const fee = Math.max(0, Math.round(contract.fee * content.balance.contract.haggleFeeMultiplier));
  return {
    ...state,
    visitors: state.visitors.map((visitor) => visitor.starId === starId ? { ...visitor, fee } : visitor),
    flags: { ...state.flags, [haggledContractKey(starId)]: true },
  };
}

export function rejectContract(state: GameState, starId: string): GameState {
  if (state.phase !== 'OFFICE' || !state.visitors.some((visitor) => visitor.starId === starId)) return state;
  return {
    ...state,
    visitors: state.visitors.filter((visitor) => visitor.starId !== starId),
    recruitPool: state.recruitPool.filter((star) => star.id !== starId),
    rejectedStarIds: state.rejectedStarIds.includes(starId) ? state.rejectedStarIds : [...state.rejectedStarIds, starId],
    stats: { ...state.stats, contractsRejected: state.stats.contractsRejected + 1 },
  };
}

export function confirmOffice(state: GameState): GameState {
  return state;
}
