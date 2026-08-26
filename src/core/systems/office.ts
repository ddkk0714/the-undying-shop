import { content } from '../content';
import { draw } from '../rng';
import { createHero } from './combat';
import type { Combatant, Contract, GameState, ItemDef, Star, TodayRun } from '../types';

function signedContractKey(starId: string): string {
  return `contractSigned:${starId}`;
}

/** 신문 일차별 누적 방문 후보. 계약 타입을 늘리지 않고 로스터 규칙으로만 관리한다. */
const VISITOR_AVAILABLE_DAY: Readonly<Record<string, number>> = {
  body_ilan: 1, // 미레
  body_juno: 1, // 루엔
  body_sela: 1, // 비오레
  body_mor: 2, // 메르네
  body_karin: 3, // 세이로
};

/** 새로 신문에 소개되는 날에는 해당 용사가 그날의 첫 방문자로 온다. */
const PRIORITY_VISITOR_BY_DAY: Readonly<Record<number, string>> = {
  2: 'body_mor', // 메르네
  3: 'body_karin', // 세이로
};

function haggledContractKey(starId: string): string {
  return `contractHaggled:${starId}`;
}

function saleHaggleKey(day: number, attempt: number): string {
  return `shopSaleHaggle:${day}:${attempt}`;
}

function saleSoldKey(day: number, slot: number): string {
  return `shopSaleSold:${day}:${slot}`;
}

function salePriceKey(day: number, multiplier: number): string {
  return `shopSalePrice:${day}:${multiplier.toFixed(1)}`;
}

function saleTriedKey(day: number, revision: number): string {
  return `shopSaleTried:${day}:${revision}`;
}

export function saleHaggleCount(state: Readonly<GameState>): number {
  let count = 0;
  for (let attempt = 1; attempt <= content.balance.shopSale.maxHaggles; attempt += 1) {
    if (state.flags[saleHaggleKey(state.day, attempt)] === true) count += 1;
  }
  return count;
}

export function saleSlotSold(state: Readonly<GameState>, slot: number): boolean {
  return state.flags[saleSoldKey(state.day, slot)] === true;
}

export function salePurchaseChance(multiplier: number): number {
  const rules = content.balance.shopSale;
  const clamped = Math.max(rules.minMultiplier, Math.min(rules.maxMultiplier, multiplier));
  return Math.max(
    rules.minPurchaseChance,
    Math.min(rules.maxPurchaseChance, rules.basePurchaseChance - (clamped - 1) * rules.chancePerMultiplier),
  );
}

export function salePriceMultiplier(state: Readonly<GameState>): number {
  const rules = content.balance.shopSale;
  for (let value = rules.minMultiplier; value <= rules.maxMultiplier + rules.step / 2; value += rules.step) {
    const snapped = Math.round(value / rules.step) * rules.step;
    if (state.flags[salePriceKey(state.day, snapped)] === true) return snapped;
  }
  return 1;
}

export function saleOfferTried(state: Readonly<GameState>): boolean {
  return state.flags[saleTriedKey(state.day, saleHaggleCount(state))] === true;
}

export function setShopSalePrice(state: GameState, multiplier: number): GameState {
  if (state.phase !== 'OFFICE' || !Number.isFinite(multiplier)) return state;
  const rules = content.balance.shopSale;
  const haggles = saleHaggleCount(state);
  if (haggles >= rules.maxHaggles) return state;
  const clamped = Math.max(rules.minMultiplier, Math.min(rules.maxMultiplier, multiplier));
  const snapped = Math.round(clamped / rules.step) * rules.step;
  const flags = { ...state.flags };
  const prefix = `shopSalePrice:${state.day}:`;
  for (const key of Object.keys(flags)) {
    if (key.startsWith(prefix)) delete flags[key];
  }
  flags[salePriceKey(state.day, snapped)] = true;
  flags[saleHaggleKey(state.day, haggles + 1)] = true;
  return { ...state, flags };
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
  // availableDay는 '그 날부터 누적 등장 가능'한 날짜다. 신문 일차별 편성에 맞춰
  // 1일차 3명 → 2일차 4명 → 3일차부터 5명으로 후보군이 확장된다.
  const eligible = state.recruitPool.filter((star) => (
    !state.rejectedStarIds.includes(star.id)
    && (VISITOR_AVAILABLE_DAY[star.id] ?? 1) <= state.day
  ));
  const candidates = eligible;
  if (candidates.length === 0) return state;

  const rules = content.balance.contract;
  const [candidateRoll, afterCandidate] = draw(state);
  const priorityId = PRIORITY_VISITOR_BY_DAY[state.day];
  const star = candidates.find((candidate) => candidate.id === priorityId)
    ?? candidates[Math.floor(candidateRoll * candidates.length)];
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
  // 이 종류를 오늘 이미 팔았다면 진열대 자체가 영업 종료다. 새 상품을 다시 올릴 수 없다.
  if (saleSlotSold(state, slot)) return state;
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

export function sellOfficeBatch(state: GameState): GameState {
  if (state.phase !== 'OFFICE' || saleOfferTried(state)) return state;
  const displayed = state.shelf.flatMap((itemId, slot) => {
    if (itemId === null || saleSlotSold(state, slot)) return [];
    const item = content.items.find((candidate) => candidate.id === itemId);
    const available = state.inventory.some((stack) => stack.id === itemId && stack.qty > 0);
    return item === undefined || !available ? [] : [{ item, slot }];
  });
  if (displayed.length === 0) return state;

  const multiplier = salePriceMultiplier(state);
  const [roll, afterRoll] = draw(state);
  const flags = { ...afterRoll.flags, [saleTriedKey(state.day, saleHaggleCount(state))]: true };
  if (roll >= salePurchaseChance(multiplier)) return { ...afterRoll, flags };

  const price = displayed.reduce((sum, { item }) => sum + Math.max(0, Math.round(item.price * multiplier)), 0);
  const truthRelics = displayed.filter(({ item }) => item.id === 'soil_deep' || item.id === 'page_torn').length;
  const shelf = [...state.shelf];
  let inventory = state.inventory;
  for (const { item, slot } of displayed) {
    shelf[slot] = null;
    inventory = removeInventoryItem(inventory, item.id);
    flags[saleSoldKey(state.day, slot)] = true;
  }
  return {
    ...afterRoll,
    flags,
    shelf,
    gold: state.gold + price,
    inventory,
    leak: Math.min(100, state.leak + truthRelics * content.balance.opinion.leakPerTruthRelicSale),
    stats: { ...state.stats, goldEarned: state.stats.goldEarned + price },
    today: state.today === null ? null : { ...state.today, income: { ...state.today.income, shelf: state.today.income.shelf + price } },
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
  const existing = state.stars.find((star) => star.id === starId);
  // 루엔/세이로처럼 이미 소속된 용사가 후보로 선택된 경우에는 새 몸을 추가하지 않고,
  // 원래 페르소나·소생 횟수를 가진 기존 Star를 오늘 출연자로 연결한다.
  const recruited: Star = { ...(existing ?? candidate), honesty: contract.honesty, status: 'ALIVE' };
  return {
    ...state,
    gold: state.gold - contract.fee,
    stars: existing === undefined
      ? [...state.stars, recruited]
      : state.stars.map((star) => star.id === starId ? recruited : star),
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
    // 돌려보낸 손님에게 보여 준 장비는 판매하거나 소모하지 않는다.
    // 다음 손님은 항상 비어 있는 진열대에서 시작한다.
    shelf: state.shelf.map(() => null),
    visitors: state.visitors.filter((visitor) => visitor.starId !== starId),
    recruitPool: state.recruitPool.filter((star) => star.id !== starId),
    rejectedStarIds: state.rejectedStarIds.includes(starId) ? state.rejectedStarIds : [...state.rejectedStarIds, starId],
    stats: { ...state.stats, contractsRejected: state.stats.contractsRejected + 1 },
  };
}

export function confirmOffice(state: GameState): GameState {
  return state;
}
