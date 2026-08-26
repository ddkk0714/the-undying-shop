import { content } from './content';
import type { GameState, RunStats } from './types';

const emptyStats = (): RunStats => ({
  appeals: 0,
  contractsRejected: 0,
  totalRevived: 0,
  totalDiscarded: 0,
  liesTold: 0,
  chatsDeleted: 0,
  falseAnnouncements: 0,
  goldEarned: 0,
  goldSpentOnRevive: 0,
  deepestFloor: content.balance.start.maxFloor,
});

function startingInventory(): GameState['inventory'] {
  const inventory: GameState['inventory'] = [];
  for (const itemId of content.balance.start.inventory) {
    const index = inventory.findIndex((stack) => stack.id === itemId);
    if (index < 0) inventory.push({ id: itemId, qty: 1 });
    else inventory[index] = { ...inventory[index]!, qty: inventory[index]!.qty + 1 };
  }
  return inventory;
}

export function createInitialState(seed: number): GameState {
  const stars = structuredClone(content.stars.slice(0, 2));
  // 이미 소속된 용사도 날짜별 계약서 후보에는 나타날 수 있다. 수락할 때는 같은 id의
  // 기존 Star를 재사용하므로 중복 몸이 생기지 않는다.
  const recruitPool = structuredClone(content.stars).map((star) => ({ ...star, status: 'HIDDEN' as const, personaId: null }));
  return {
    version: 1,
    seed,
    rngCursor: 0,
    day: 1,
    phase: 'REVIVE',
    phaseStartedAt: 0,
    waitingSince: null,
    isOver: false,
    ending: null,
    gold: content.balance.start.gold,
    fans: content.balance.start.fans,
    reputation: content.balance.start.reputation,
    maxFloor: content.balance.start.maxFloor,
    leak: 0,
    viewerFatigue: 0,
    stars,
    personas: structuredClone(content.personas),
    recruitPool,
    visitors: [],
    rejectedStarIds: [],
    corpses: [],
    today: null,
    shelf: [null, null, null],
    inventory: startingInventory(),
    seenWitnessFloors: [],
    witnessLog: [],
    flags: {},
    pendingFx: [],
    stats: emptyStats(),
  };
}
