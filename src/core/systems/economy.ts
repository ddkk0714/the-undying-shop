import { content, type Balance } from '../content';
import { draw } from '../rng';
import type { Corpse, GameState, Star } from '../types';

export function reviveCost(balance: Balance, corpse: Corpse, star: Star, daysHeld: number): number {
  const rules = balance.revive;
  const raw = rules.base
    * Math.pow(rules.floorExp, corpse.diedFloor)
    * rules.gradeMul[corpse.grade]
    * Math.pow(rules.degradeExp, star.reviveCount)
    * Math.pow(rules.decayPerDay, Math.max(0, daysHeld));
  return Math.round(raw / rules.roundTo) * rules.roundTo;
}

export function reviveDaysHeld(state: GameState, corpse: Corpse): number {
  return Math.max(0, state.day - corpse.diedDay);
}

export function reviveQuote(state: GameState, corpse: Corpse, star: Star) {
  const cost = reviveCost(content.balance, corpse, star, reviveDaysHeld(state, corpse));
  const warningFloor = Math.min(...Object.keys(content.balance.opinion.leakPerWitnessRevive).map(Number));
  return { cost, affordable: state.gold >= cost, witnessWarning: star.witnessed.some((floor) => floor <= warningFloor) };
}

function addLootToInventory(state: GameState, loot: string[]): GameState['inventory'] {
  const inventory = [...state.inventory];
  for (const itemId of loot) {
    const index = inventory.findIndex((stack) => stack.id === itemId);
    if (index < 0) inventory.push({ id: itemId, qty: 1 });
    else inventory[index] = { ...inventory[index]!, qty: inventory[index]!.qty + 1 };
  }
  return inventory;
}

/**
 * 첫 방송 사이클 뒤부터, 방송 중 팔려 나간 장비는 시체에 "승계본"을 남길 수 있다.
 * 원본과 별도 ID를 쓰므로 계약(ItemStack=id+qty)을 바꾸지 않으면서도 강화된 한 점을 보존한다.
 */
export function addInheritedSaleLoot(state: GameState, soldItemIds: readonly string[]): [string[], GameState] {
  const rules = content.balance.inheritanceLoot;
  // 사망 당일에는 아직 소생실이 열리지 않는다. Day 1 방송 사망분을 Day 2 소생실에서
  // 바로 찾을 수 있도록, 여기의 startDay는 "회수하는 날" 기준이다.
  if (state.day + 1 < rules.startDay || soldItemIds.length === 0) return [[], state];
  const loot: string[] = [];
  let next = state;
  for (const itemId of soldItemIds) {
    const inheritedId = `${itemId}_inherited`;
    const inherited = content.items.find((item) => item.id === inheritedId);
    if (inherited?.kind !== 'GEAR') continue;
    const [roll, afterRoll] = draw(next);
    next = afterRoll;
    if (roll < rules.chance) loot.push(inheritedId);
  }
  return [loot, next];
}

/** 소생실 수색용 일반 장비 드랍. 승계본은 판매 이력 전용이므로 이 풀에서는 제외한다. */
export function addCorpseGearLoot(state: GameState): [string[], GameState] {
  const rules = content.balance.corpseGearLoot;
  if (state.day + 1 < rules.startDay) return [[], state];
  const available = content.items
    .filter((item) => item.kind === 'GEAR' && !item.id.endsWith('_inherited'))
    .map((item) => item.id);
  if (available.length === 0) return [[], state];

  const [chanceRoll, afterChance] = draw(state);
  if (chanceRoll >= rules.chance) return [[], afterChance];
  const [countRoll, afterCount] = draw(afterChance);
  const count = Math.min(available.length, rules.min + Math.floor(countRoll * (rules.max - rules.min + 1)));
  const loot: string[] = [];
  let next = afterCount;
  for (let index = 0; index < count; index += 1) {
    const [itemRoll, afterItem] = draw(next);
    const itemIndex = Math.floor(itemRoll * available.length);
    const [itemId] = available.splice(itemIndex, 1);
    if (itemId !== undefined) loot.push(itemId);
    next = afterItem;
  }
  return [loot, next];
}

/**
 * 방송이 끝나 몸이 돌아왔을 때 — **진열대에 올려 들려 보낸 장비가 시체에 남는다** (CCR-006).
 * 인벤토리에서는 그만큼 빠진다. 소생실에서 회수하기 전까지는 다시 진열할 수 없다.
 */
export function detachCarried(
  state: GameState,
  shelf: readonly (string | null)[],
): { carried: string[]; inventory: GameState['inventory'] } {
  const carried = shelf.filter((id): id is string => id !== null);
  if (carried.length === 0) return { carried, inventory: state.inventory };
  const inventory = [...state.inventory];
  for (const itemId of carried) {
    const index = inventory.findIndex((stack) => stack.id === itemId && stack.qty > 0);
    if (index < 0) continue;
    const stack = inventory[index]!;
    if (stack.qty <= 1) inventory.splice(index, 1);
    else inventory[index] = { ...stack, qty: stack.qty - 1 };
  }
  return { carried, inventory };
}

/**
 * 시체가 지닌 장비 한 점을 회수한다 (CCR-006).
 * 시체에서 빼고 인벤토리로 옮기는 것뿐이다 — 수량·가격·판정은 건드리지 않는다.
 */
export function takeCorpseCarried(state: GameState, starId: string, itemId: string): GameState {
  const corpse = state.corpses.find((candidate) => candidate.starId === starId);
  if (corpse === undefined) return state;
  const index = (corpse.carried ?? []).indexOf(itemId);
  if (index < 0) return state;
  const carried = [...corpse.carried!];
  carried.splice(index, 1);
  return {
    ...state,
    inventory: addLootToInventory(state, [itemId]),
    corpses: state.corpses.map((candidate) => candidate === corpse ? { ...candidate, carried } : candidate),
  };
}

/**
 * 시체가 소생실을 떠날 때(소생·폐기·훼손) **회수하지 않고 남은 장비**를 돌려준다.
 * 조용히 사라지게 두지 않는다 — 잃는 규칙은 밸런스가 검증한 뒤에나 넣을 일이다.
 */
export function reclaimCorpseCarried(state: GameState, starId: string): GameState {
  const corpse = state.corpses.find((candidate) => candidate.starId === starId);
  const carried = corpse?.carried ?? [];
  if (corpse === undefined || carried.length === 0) return state;
  return {
    ...state,
    inventory: addLootToInventory(state, carried),
    corpses: state.corpses.map((candidate) => candidate === corpse ? { ...candidate, carried: [] } : candidate),
  };
}

function drawUniqueRelics(state: GameState, count: number, diedFloor: number): [string[], GameState] {
  const rules = content.balance.autopsy;
  const truthRelicsAllowed = diedFloor >= rules.truthRelicMinFloor;
  const available = content.items
    .filter((item) => item.isRelic && (truthRelicsAllowed || !rules.truthRelicIds.includes(item.id)))
    .map((item) => item.id);
  const loot: string[] = [];
  let next = state;
  for (let index = 0; index < Math.min(count, available.length); index += 1) {
    const [itemRoll, afterItem] = draw(next);
    const itemIndex = Math.floor(itemRoll * available.length);
    const [itemId] = available.splice(itemIndex, 1);
    if (itemId !== undefined) loot.push(itemId);
    next = afterItem;
  }
  return [loot, next];
}

export function discardReviveCorpse(rawState: GameState, starId: string): GameState {
  const state = reclaimCorpseCarried(rawState, starId);
  const corpse = state.corpses.find((candidate) => candidate.starId === starId);
  const star = state.stars.find((candidate) => candidate.id === starId);
  if (corpse === undefined || star?.status !== 'DEAD') return state;
  const [generatedLoot, next] = corpse.loot.length === 0
    ? drawUniqueRelics(state, content.balance.revive.discardLoot, corpse.diedFloor)
    : [corpse.loot, state];
  const loot = corpse.loot.length === 0 ? generatedLoot : corpse.loot;
  return {
    ...next,
    inventory: addLootToInventory(next, loot),
    corpses: next.corpses.map((candidate) => candidate === corpse && corpse.loot.length === 0 ? { ...candidate, loot } : candidate),
    stars: next.stars.map((candidate) => candidate.id === starId ? { ...candidate, status: 'DISCARDED' as const } : candidate),
    stats: { ...next.stats, totalDiscarded: next.stats.totalDiscarded + 1 },
    pendingFx: [...next.pendingFx, { kind: 'SEAL_STAMP', payload: { starId } }],
  };
}

export function damageAutopsyCorpse(rawState: GameState, starId: string): GameState {
  const state = reclaimCorpseCarried(rawState, starId);
  const corpse = state.corpses.find((candidate) => candidate.starId === starId);
  const star = state.stars.find((candidate) => candidate.id === starId && candidate.status === 'DEAD');
  if (corpse === undefined || star === undefined) return state;

  const rules = content.balance.autopsy;
  const relicCount = content.items.filter((item) => item.isRelic && (corpse.diedFloor >= rules.truthRelicMinFloor || !rules.truthRelicIds.includes(item.id))).length;
  if (relicCount === 0) return state;
  const [countRoll, afterCount] = draw(state);
  const lootCount = Math.min(relicCount, rules.lootMin + Math.floor(countRoll * (rules.lootMax - rules.lootMin + 1)));
  const [loot, next] = drawUniqueRelics(afterCount, lootCount, corpse.diedFloor);
  const flags = { ...next.flags };
  // A damaged body cannot return to LIVE, so its deferred lie callback must not survive disposal.
  delete flags[`lieCallback:${starId}`];
  return {
    ...next,
    flags,
    inventory: addLootToInventory(next, loot),
    corpses: next.corpses.map((candidate) => candidate === corpse ? { ...candidate, grade: 'DAMAGED' as const, loot } : candidate),
    stars: next.stars.map((candidate) => candidate.id === starId ? { ...candidate, status: 'DISCARDED' as const, witnessed: [] } : candidate),
    witnessLog: next.witnessLog.map((entry) => entry.starId === starId ? { ...entry, suppressed: true } : entry),
    stats: { ...next.stats, totalDiscarded: next.stats.totalDiscarded + 1 },
    pendingFx: [...next.pendingFx, { kind: 'SEAL_STAMP', payload: { starId } }],
  };
}
