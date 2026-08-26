import { content } from '../content';
import { mulberry32 } from '../rng';
import type { Corpse, CorpsePart, CorpsePartId, CorpsePartState } from '../types';

/**
 * 부위별 손상 (HO-029).
 *
 * `Corpse.grade` 는 **사람이 내리는 판정**(온전하다고 보고할 것인가, 해체할 것인가)이다.
 * 이 파일이 정하는 것은 그 판정 이전의 **몸의 실제 상태**다 — 소생실 작업대에 눕혀 놓고
 * 살펴보면 보이는 것. 깊은 층에서 죽었으면 험하게 상해 있다.
 *
 * ⚠️ `draw()` 를 쓰지 않는다. 저 함수는 `state.rngCursor` 를 밀기 때문에,
 *    사망 처리에 뽑기를 끼워 넣으면 그 뒤의 모든 난수가 밀려 기존 시뮬·테스트가 어긋난다.
 *    대신 **시체 식별자에서 바로** 뽑는다. 그래서 결과가 저장·불러오기에도 흔들리지 않고,
 *    `parts` 가 없는 예전 세이브도 같은 표를 다시 얻는다.
 */
export const CORPSE_PART_IDS: readonly CorpsePartId[] = [
  'HEAD', 'CHEST', 'LEFT ARM', 'RIGHT ARM', 'LEFT LEG', 'RIGHT LEG',
];

/** 시체 하나를 가리키는 안정된 정수. 같은 사람이라도 죽은 날·층이 다르면 다른 시체다 */
function corpseSeed(seed: number, starId: string, diedDay: number, diedFloor: number): number {
  let hash = seed | 0;
  for (let index = 0; index < starId.length; index += 1) {
    hash = Math.imul(hash ^ starId.charCodeAt(index), 0x01000193) | 0;
  }
  hash = Math.imul(hash ^ diedDay, 0x01000193) | 0;
  hash = Math.imul(hash ^ diedFloor, 0x01000193) | 0;
  return hash >>> 0;
}

/**
 * ⚠️ `mulberry32(s)` 가 돌려주는 함수는 **상태를 갖지 않는다** — 몇 번을 불러도 같은 값이다.
 * 그래서 `draw()` 도 매번 `seed + rngCursor` 로 새로 만든다. 여기서도 같은 방식으로,
 * 뽑을 때마다 씨앗을 한 칸씩 옮긴다.
 */
function rollAt(base: number, step: number): number {
  return mulberry32(base + step)();
}

export function rollCorpseParts(seed: number, starId: string, diedDay: number, diedFloor: number): CorpsePart[] {
  const rules = content.balance.corpseParts;
  const base = corpseSeed(seed, starId, diedDay, diedFloor);
  const chance = Math.min(rules.maxChance, rules.baseChance + diedFloor * rules.perFloor);
  return CORPSE_PART_IDS.map((part, index) => {
    if (rollAt(base, index * 2) >= chance) return { part, state: 'INTACT' as CorpsePartState };
    // 머리와 몸통이 통째로 없어지면 소생 자체가 성립하지 않는다 — 찢긴 데까지만 간다
    const canBeLost = !rules.neverLost.includes(part);
    const lost = canBeLost && rollAt(base, index * 2 + 1) < rules.lostChance;
    return { part, state: (lost ? 'LOST' : 'TORN') as CorpsePartState };
  });
}

/** 저장된 표를 쓰되, 없으면(예전 세이브) 같은 규칙으로 그 자리에서 만들어 준다 */
export function corpsePartsOf(seed: number, corpse: Corpse): CorpsePart[] {
  return corpse.parts ?? rollCorpseParts(seed, corpse.starId, corpse.diedDay, corpse.diedFloor);
}

/** 상한 부위만, 험한 순서로. 소생실은 이 앞쪽 몇 개만 마크로 가리킨다 */
export function damagedCorpseParts(seed: number, corpse: Corpse): CorpsePart[] {
  return corpsePartsOf(seed, corpse)
    .filter((entry) => entry.state !== 'INTACT')
    .sort((a, b) => (a.state === b.state ? 0 : a.state === 'LOST' ? -1 : 1));
}
