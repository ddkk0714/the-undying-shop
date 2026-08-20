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
  dive: { baseFloorConst: number; gritMul: number; luckMul: number; floorSeconds: number; forcedDeathOffset: number };
}

export interface Content {
  balance: Balance;
  items: ItemDef[];
  stars: Star[];
  personas: Persona[];
  forks: { atFloor: number; left: ForkOutcome; right: ForkOutcome }[];
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
    assertNumber(value.price, `items[${index}].price`);
    assertShape(typeof value.tier === 'string' && typeof value.isRelic === 'boolean', `items[${index}] tier/relic missing`);
    // v3(CCR-001): depth 삭제, hp/atk/def 신설. items.json 12종 재작성은 M05 · Codex 몫이라
    // 아직 v2 파일이 들어온다. 필드가 없으면 0 으로 읽는다 (HANDOFF HO-002).
    return { id: value.id, name: value.name, iconKey: `item.${value.id}`, hp: numberOr(value.hp), atk: numberOr(value.atk), def: numberOr(value.def), price: value.price, tier: value.tier as ItemDef['tier'], isRelic: value.isRelic };
  });
}

function makeForks(raw: unknown): Content['forks'] {
  assertShape(isRecord(raw) && Array.isArray(raw.forks), 'floors.forks must be an array');
  return raw.forks.map((value, index) => {
    assertShape(isRecord(value), `forks[${index}] must be an object`);
    assertNumber(value.atFloor, `forks[${index}].atFloor`);
    assertShape(isRecord(value.left) && isRecord(value.right), `forks[${index}] branches missing`);
    return { atFloor: value.atFloor, left: value.left as unknown as ForkOutcome, right: value.right as unknown as ForkOutcome };
  });
}

export function loadContent(): Content {
  assertShape(isRecord(balanceJson) && isRecord(balanceJson.start) && isRecord(balanceJson.dive), 'balance start/dive missing');
  for (const key of ['gold', 'fans', 'reputation', 'maxFloor', 'days', 'targetFloor'] as const) assertNumber(balanceJson.start[key], `balance.start.${key}`);
  for (const key of ['baseFloorConst', 'gritMul', 'luckMul', 'floorSeconds', 'forcedDeathOffset'] as const) assertNumber(balanceJson.dive[key], `balance.dive.${key}`);
  assertShape(isRecord(radioJson) && isRecord(chatJson) && isRecord(narrativeJson), 'localized content must be objects');
  return {
    balance: balanceJson as Balance,
    items: makeItems(itemsJson),
    stars: makeStars(starsJson),
    personas: makePersonas(personasJson),
    forks: makeForks(floorsJson),
    radio: radioJson as Record<string, string[]>,
    chat: chatJson,
    narrative: narrativeJson,
  };
}

export const content = loadContent();
