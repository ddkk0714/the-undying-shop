import { content } from '../content';
import type { GameState, ItemDef, ItemId, StarId } from '../types';

export interface DescentForecastBand {
  from: number;
  to: number;
  difficulty: number;
  chance: number;
}

export function runEquipmentFlagKey(day: number, starId: StarId, slot: number, itemId: ItemId): string {
  return `runEquipment:${day}:${starId}:${slot}:${itemId}`;
}

/** 판매로 진열대가 비워진 뒤에도 해당 방송에 확정된 장비 슬롯을 복원한다. */
export function equippedItemIds(state: Readonly<GameState>, starId: StarId): (ItemId | null)[] {
  return state.shelf.map((shelfItemId, slot) => {
    if (shelfItemId !== null) return shelfItemId;
    const prefix = `runEquipment:${state.day}:${starId}:${slot}:`;
    const key = Object.keys(state.flags).find((candidate) => state.flags[candidate] === true && candidate.startsWith(prefix));
    return key === undefined ? null : key.slice(prefix.length);
  });
}

export function equippedItemsForRun(state: Readonly<GameState>, starId: StarId): ItemDef[] {
  return equippedItemIds(state, starId).flatMap((itemId) => {
    const item = content.items.find((candidate) => candidate.id === itemId);
    return item?.kind === 'GEAR' ? [item] : [];
  });
}

/** 편성실 스탯 서류와 방송 시작이 공유하는 장비 반영 하강 예측값. */
export function descentForecast(state: Readonly<GameState>, starId: StarId): DescentForecastBand[] {
  const profile = content.starProfiles[starId];
  const items = equippedItemsForRun(state, starId);
  const hp = (profile?.hp ?? 0) + items.reduce((total, item) => total + item.hp, 0);
  const atk = (profile?.atk ?? 0) + items.reduce((total, item) => total + item.atk, 0);
  const def = (profile?.def ?? 0) + items.reduce((total, item) => total + item.def, 0);
  const rules = content.balance.forecast;
  const score = hp * rules.hpWeight + atk * rules.atkWeight + def * rules.defWeight;
  return rules.bands.map((band) => ({
    ...band,
    chance: Math.max(1, Math.min(100, Math.round(100 / (1 + Math.exp((band.difficulty - score) / rules.curveScale))))),
  }));
}

/** 연속된 100% 예상 구간은 방송 시작 전에 통과한다. 반환값은 실제로 처음 진행할 층이다. */
export function firstPlayableForecastFloor(state: Readonly<GameState>, starId: StarId): number {
  let floor = 1;
  for (const band of descentForecast(state, starId)) {
    if (band.chance < 100) return floor;
    floor = band.to + 1;
  }
  return floor;
}
