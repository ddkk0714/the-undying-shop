import { content } from '../content';
import type { CombatChoice, Combatant, Encounter, ForkOutcome, ItemDef, Star } from '../types';

export interface CombatResolution {
  hero: Combatant;
  encounter: Encounter;
  fansDelta: number;
  fanMultiplier: number;
  superchat: boolean;
  leakRiskMultiplier: number;
  heroDied: boolean;
  enemyDefeated: boolean;
}

export type CombatLineTone = 'HEALTHY' | 'HALF' | 'DANGER' | 'MENTAL_BREAK' | 'APPEAL' | 'DEGRADE4';

const combatLineKey: Record<CombatLineTone, string> = {
  HEALTHY: 'combatHealthy',
  HALF: 'combatHalf',
  DANGER: 'combatDanger',
  MENTAL_BREAK: 'combatMentalBreak',
  APPEAL: 'combatAppeal',
  DEGRADE4: 'degrade4',
};

function equippedBonus(items: readonly ItemDef[], key: 'hp' | 'atk' | 'def'): number {
  return items.reduce((total, item) => total + item[key], 0);
}

function degraded(value: number, multiplier: number): number {
  return Math.max(1, Math.floor(value * multiplier));
}

function damageTaken(incoming: number, defense: number, multiplier: number): number {
  return Math.max(1, Math.floor(Math.max(1, incoming - defense) * multiplier));
}

function enemyKeyForFloor(floor: number, roll: number): string {
  const zone = content.floors.enemiesByZone.find((candidate) => floor <= candidate.upTo) ?? content.floors.enemiesByZone.at(-1);
  if (zone === undefined || zone.keys.length === 0) throw new Error('[combat] enemy zone missing');
  return zone.keys[Math.min(zone.keys.length - 1, Math.floor(roll * zone.keys.length))] ?? zone.keys[0]!;
}

export function combatLine(tone: CombatLineTone, roll: number): string {
  const lines = content.radio[combatLineKey[tone]] ?? [];
  return lines[Math.min(lines.length - 1, Math.floor(roll * lines.length))] ?? '';
}

export function isEncounterFloor(floor: number): boolean {
  return floor > 0 && floor % content.floors.encounterEvery === 0;
}

export function createHero(star: Star, equipped: readonly ItemDef[], degradeMultiplier: number): Combatant {
  const rules = content.balance.combat.hero;
  const profile = content.starProfiles[star.id];
  const scale = content.balance.combat.profileScale;
  const baseHp = profile === undefined ? rules.hpBase + star.stats.grit * rules.hpPerGrit : profile.hp * scale.hp;
  const baseAtk = profile === undefined ? rules.atkBase + star.stats.grit * rules.atkPerGrit : profile.atk * scale.atk;
  const baseDef = profile === undefined ? rules.defBase : profile.def * scale.def;
  const hp = degraded(baseHp + equippedBonus(equipped, 'hp'), degradeMultiplier);
  const atk = degraded(baseAtk + equippedBonus(equipped, 'atk'), degradeMultiplier);
  const def = degraded(baseDef + equippedBonus(equipped, 'def'), degradeMultiplier);
  return { hp, maxHp: hp, atk, def };
}

export function createEncounter(floor: number, hazard: ForkOutcome['hazard'], enemyRoll: number, line = combatLine('HEALTHY', enemyRoll)): Encounter {
  const enemyRules = content.floors.enemy;
  const enemyHp = Math.ceil(enemyRules.hpBase + floor * enemyRules.hpPerFloor);
  const enemyAtk = Math.ceil((enemyRules.atkBase + floor * enemyRules.atkPerFloor) * content.balance.combat.hazardAtkMul[hazard]);
  return {
    floor,
    enemyKey: enemyKeyForFloor(floor, enemyRoll),
    enemy: { hp: enemyHp, maxHp: enemyHp, atk: enemyAtk, def: 0 },
    turn: 1,
    line,
    guarding: false,
    log: [],
  };
}

export function resolveCombatChoice(
  hero: Combatant,
  encounter: Encounter,
  choice: CombatChoice,
  charisma: number,
  rolls: readonly [number, number],
): CombatResolution {
  const rules = content.balance.combat;
  const [effectRoll, counterRoll] = rolls;
  let nextHero = { ...hero };
  let nextEnemy = { ...encounter.enemy };
  let fansDelta = 0;
  let fanMultiplier = 1;
  let superchat = false;
  let leakRiskMultiplier = 1;
  let guarding = false;

  if (choice === 'ATTACK') {
    const variance = rules.attack.varMin + (rules.attack.varMax - rules.attack.varMin) * effectRoll;
    nextEnemy.hp = Math.max(0, nextEnemy.hp - Math.max(1, Math.floor(nextHero.atk * variance) - nextEnemy.def));
    if (nextEnemy.hp > 0 && counterRoll < rules.attack.counterChance) nextHero.hp = Math.max(0, nextHero.hp - damageTaken(nextEnemy.atk, nextHero.def, 1));
  }

  if (choice === 'DEFEND') {
    guarding = true;
    nextHero.hp = Math.max(0, nextHero.hp - damageTaken(nextEnemy.atk, nextHero.def, rules.defend.damageMul));
    fanMultiplier = 1 - rules.defend.fanPenalty;
  }

  if (choice === 'APPEAL') {
    const appealScale = (1 + charisma * rules.appeal.charismaMul) * (1 + encounter.floor * rules.appeal.floorMul);
    fansDelta = Math.floor(rules.appeal.fanBase * appealScale);
    superchat = true;
    if (encounter.floor >= rules.appeal.leakFromFloor) leakRiskMultiplier = rules.appeal.leakRiskMul;
    if (effectRoll < rules.appeal.hitChance) nextHero.hp = Math.max(0, nextHero.hp - damageTaken(nextEnemy.atk, nextHero.def, rules.appeal.damageMul));
  }

  const nextEncounter: Encounter = {
    ...encounter,
    enemy: nextEnemy,
    turn: encounter.turn + 1,
    guarding,
    log: [...encounter.log, choice],
  };
  return {
    hero: nextHero,
    encounter: nextEncounter,
    fansDelta,
    fanMultiplier,
    superchat,
    leakRiskMultiplier,
    heroDied: nextHero.hp === 0,
    enemyDefeated: nextEnemy.hp === 0,
  };
}
