import balanceJson from '../../content/balance.json';
import itemsJson from '../../content/items.json';
import starsJson from '../../content/stars.json';
import personasJson from '../../content/personas.json';
import floorsJson from '../../content/floors.json';
import radioJson from '../../content/radio.ko.json';
import chatJson from '../../content/chat.ko.json';
import narrativeJson from '../../content/narrative.ko.json';
import type { ForkOutcome, ItemDef, Persona, Star } from './types';

export interface Balance {
  start: { gold: number; fans: number; reputation: number; maxFloor: number; days: number; targetFloor: number };
  revive: { base: number; floorExp: number; gradeMul: Record<'INTACT' | 'DAMAGED', number>; degradeExp: number; decayPerDay: number; roundTo: number };
  dive: { floorSeconds: number; encounterEvery: number; delayGraceSeconds: number; delayFanLossPerSec: number; delayFanLossCap: number };
  combat: CombatBalance;
  degrade: { statMul: number[] };
  income: { superchat: { witness: number[] } };
  opinion: { leakPerWitnessRevive: Record<string, number> };
}

export interface CombatBalance {
  hero: { hpBase: number; hpPerGrit: number; atkBase: number; atkPerGrit: number; defBase: number };
  enemy: { hpBase: number; hpPerFloor: number; atkBase: number; atkPerFloor: number };
  attack: { varMin: number; varMax: number; counterChance: number };
  defend: { damageMul: number; fanPenalty: number };
  appeal: { fanBase: number; charismaMul: number; floorMul: number; hitChance: number; damageMul: number; leakRiskMul: number; leakFromFloor: number };
  hazardAtkMul: Record<ForkOutcome['hazard'], number>;
}

export interface FloorContent {
  encounterEvery: number;
  enemy: Balance['combat']['enemy'];
  enemiesByZone: { upTo: number; keys: string[] }[];
  forks: { atFloor: number; a: ForkOutcome; b: ForkOutcome }[];
}

export interface Content {
  balance: Balance;
  items: ItemDef[];
  stars: Star[];
  personas: Persona[];
  floors: FloorContent;
  radio: Record<string, string[]>;
  chat: Record<string, unknown>;
  narrative: Record<string, unknown>;
}

function assertShape(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`[content] ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function assertNumber(value: unknown, path: string): asserts value is number {
  assertShape(typeof value === 'number' && Number.isFinite(value), `${path} must be a finite number`);
}

function numberOr(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function makeStars(raw: unknown): Star[] {
  assertShape(Array.isArray(raw), 'stars must be an array');
  return raw.map((value, index) => {
    assertShape(isRecord(value), `stars[${index}] must be an object`);
    assertShape(typeof value.id === 'string' && typeof value.name === 'string', `stars[${index}] id/name missing`);
    assertNumber(value.grit, `stars[${index}].grit`);
    assertNumber(value.cha, `stars[${index}].cha`);
    assertNumber(value.luck, `stars[${index}].luck`);
    return {
      id: value.id,
      bodyName: value.name,
      portraitKey: `star.portrait.${value.id.replace('body_', '')}`,
      stats: { grit: value.grit, charisma: value.cha, luck: value.luck },
      // v3(CCR-001): honesty 는 계약서에서 확정된다. stars.json 이 아직 v2 라 기본 1.0.
      honesty: numberOr(value.honesty, 1),
      reviveCount: 0,
      personaId: typeof value.startPersonaId === 'string' ? value.startPersonaId : null,
      status: 'ALIVE',
      witnessed: [],
    };
  });
}

function makePersonas(raw: unknown): Persona[] {
  assertShape(Array.isArray(raw), 'personas must be an array');
  return raw.map((value, index) => {
    assertShape(isRecord(value), `personas[${index}] must be an object`);
    assertShape(typeof value.id === 'string' && typeof value.displayName === 'string', `personas[${index}] id/displayName missing`);
    assertNumber(value.fandom, `personas[${index}].fandom`);
    assertNumber(value.goodsPerDay, `personas[${index}].goodsPerDay`);
    assertNumber(value.generation, `personas[${index}].generation`);
    assertShape(typeof value.recognition === 'string', `personas[${index}].recognition missing`);
    assertShape(Array.isArray(value.lineage), `personas[${index}].lineage missing`);
    return {
      id: value.id,
      displayName: value.displayName,
      fandom: value.fandom,
      recognition: value.recognition as Persona['recognition'],
      goodsRevenue: value.goodsPerDay,
      generation: value.generation,
      lineage: value.lineage.map((entry, lineageIndex) => {
        assertShape(isRecord(entry) && typeof entry.starId === 'string', `personas[${index}].lineage[${lineageIndex}] invalid`);
        return { starId: entry.starId, diedFloor: typeof entry.diedFloor === 'number' ? entry.diedFloor : 0 };
      }),
      suspicion: 0,
    };
  });
}

function makeItems(raw: unknown): ItemDef[] {
  assertShape(Array.isArray(raw), 'items must be an array');
  return raw.map((value, index) => {
    assertShape(isRecord(value), `items[${index}] must be an object`);
    assertShape(typeof value.id === 'string' && typeof value.name === 'string', `items[${index}] id/name missing`);
    assertNumber(value.hp, `items[${index}].hp`);
    assertNumber(value.atk, `items[${index}].atk`);
    assertNumber(value.def, `items[${index}].def`);
    assertNumber(value.price, `items[${index}].price`);
    assertShape(typeof value.tier === 'string' && typeof value.isRelic === 'boolean', `items[${index}] tier/relic missing`);
    return { id: value.id, name: value.name, iconKey: `item.${value.id}`, hp: value.hp, atk: value.atk, def: value.def, price: value.price, tier: value.tier as ItemDef['tier'], isRelic: value.isRelic };
  });
}

function makeOutcome(raw: Record<string, unknown>, path: string): ForkOutcome {
  assertShape(typeof raw.label === 'string', `${path}.label must be a string`);
  assertNumber(raw.reachDelta, `${path}.reachDelta`);
  assertShape(typeof raw.hazard === 'string', `${path}.hazard must be a string`);
  return { label: raw.label, reachDelta: raw.reachDelta, risk: numberOr(raw.risk), hazard: raw.hazard as ForkOutcome['hazard'] };
}

function makeFloors(raw: unknown): FloorContent {
  assertShape(isRecord(raw) && Array.isArray(raw.forks) && Array.isArray(raw.enemiesByZone), 'floors sections missing');
  assertNumber(raw.encounterEvery, 'floors.encounterEvery');
  assertShape(isRecord(raw.enemy), 'floors.enemy missing');
  for (const key of ['hpBase', 'hpPerFloor', 'atkBase', 'atkPerFloor'] as const) assertNumber(raw.enemy[key], `floors.enemy.${key}`);
  const enemiesByZone = raw.enemiesByZone.map((value, index) => {
    assertShape(isRecord(value) && Array.isArray(value.keys), `floors.enemiesByZone[${index}] invalid`);
    assertNumber(value.upTo, `floors.enemiesByZone[${index}].upTo`);
    assertShape(value.keys.every((key) => typeof key === 'string'), `floors.enemiesByZone[${index}].keys invalid`);
    return { upTo: value.upTo, keys: value.keys as string[] };
  });
  const forks = raw.forks.map((value, index) => {
    assertShape(isRecord(value), `forks[${index}] must be an object`);
    assertNumber(value.atFloor, `forks[${index}].atFloor`);
    assertShape(isRecord(value.a) && isRecord(value.b), `forks[${index}] branches missing`);
    return { atFloor: value.atFloor, a: makeOutcome(value.a, `forks[${index}].a`), b: makeOutcome(value.b, `forks[${index}].b`) };
  });
  return {
    encounterEvery: raw.encounterEvery,
    enemy: {
      hpBase: numberOr(raw.enemy.hpBase),
      hpPerFloor: numberOr(raw.enemy.hpPerFloor),
      atkBase: numberOr(raw.enemy.atkBase),
      atkPerFloor: numberOr(raw.enemy.atkPerFloor),
    },
    enemiesByZone,
    forks,
  };
}

export function loadContent(): Content {
  assertShape(isRecord(balanceJson) && isRecord(balanceJson.start) && isRecord(balanceJson.revive) && isRecord(balanceJson.dive) && isRecord(balanceJson.combat) && isRecord(balanceJson.degrade) && isRecord(balanceJson.income), 'balance sections missing');
  for (const key of ['gold', 'fans', 'reputation', 'maxFloor', 'days', 'targetFloor'] as const) assertNumber(balanceJson.start[key], `balance.start.${key}`);
  for (const key of ['base', 'floorExp', 'degradeExp', 'decayPerDay', 'roundTo'] as const) assertNumber(balanceJson.revive[key], `balance.revive.${key}`);
  assertShape(isRecord(balanceJson.revive.gradeMul), 'balance.revive.gradeMul missing');
  assertNumber(balanceJson.revive.gradeMul.INTACT, 'balance.revive.gradeMul.INTACT');
  assertNumber(balanceJson.revive.gradeMul.DAMAGED, 'balance.revive.gradeMul.DAMAGED');
  for (const key of ['floorSeconds', 'encounterEvery', 'delayGraceSeconds', 'delayFanLossPerSec', 'delayFanLossCap'] as const) assertNumber(balanceJson.dive[key], `balance.dive.${key}`);
  assertShape(Array.isArray(balanceJson.degrade.statMul) && balanceJson.degrade.statMul.length > 0, 'balance.degrade.statMul missing');
  assertShape(isRecord(balanceJson.income.superchat) && Array.isArray(balanceJson.income.superchat.witness), 'balance.income.superchat.witness missing');
  assertShape(isRecord(balanceJson.opinion) && isRecord(balanceJson.opinion.leakPerWitnessRevive), 'balance.opinion.leakPerWitnessRevive missing');
  assertShape(isRecord(radioJson) && isRecord(chatJson) && isRecord(narrativeJson), 'localized content must be objects');
  return {
    balance: balanceJson as Balance,
    items: makeItems(itemsJson),
    stars: makeStars(starsJson),
    personas: makePersonas(personasJson),
    floors: makeFloors(floorsJson),
    radio: radioJson as Record<string, string[]>,
    chat: chatJson,
    narrative: narrativeJson,
  };
}

export const content = loadContent();
