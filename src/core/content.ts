import balanceJson from '../../content/balance.json';
import itemsJson from '../../content/items.json';
import starsJson from '../../content/stars.json';
import personasJson from '../../content/personas.json';
import floorsJson from '../../content/floors.json';
import radioJson from '../../content/radio.ko.json';
import chatJson from '../../content/chat.ko.json';
import narrativeJson from '../../content/narrative.ko.json';
import dialogueJson from '../../content/dialogue.ko.json';
import type { ForkOutcome, ItemDef, Persona, Star } from './types';

export interface Balance {
  start: { gold: number; fans: number; reputation: number; maxFloor: number; days: number; targetFloor: number; inventory: string[] };
  revive: { base: number; floorExp: number; gradeMul: Record<'INTACT' | 'DAMAGED', number>; degradeExp: number; decayPerDay: number; roundTo: number; discardLoot: number };
  dive: { floorSeconds: number; encounterEvery: number; delayGraceSeconds: number; delayFanLossPerSec: number; delayFanLossCap: number };
  combat: CombatBalance;
  mental: {
    max: number;
    panicThreshold: number;
    damageThreshold: number;
    damagePerHp: number;
    gritResistancePerPoint: number;
    minimumDamageMultiplier: number;
    enemyFear: Record<string, number>;
    witnessFear: Record<string, number>;
  };
  equipment: {
    weaponSlot: number;
    armorSlot: number;
    utilitySlot: number;
    slotByItem: Record<string, number>;
  };
  degrade: { statMul: number[] };
  income: {
    goodsPerFan: number;
    superchat: {
      poolPerFan: number;
      fork: [number, number];
      record: [number, number];
      death: [number, number];
      witness: [number, number];
      appeal: [number, number];
      charismaMul: number;
      depletedMul: number;
    };
  };
  opinion: {
    chatLifetimeSeconds: number;
    chatMaxVisible: number;
    nickPoolSize: number;
    midLeakThreshold: number;
    truthChanceAtMidLeak: number;
    hypeChance: number;
    casualChance: number;
    truthLeakPower: number;
    slowAfterSeconds: number;
    backlashIntervalSeconds: number;
    moderationDeleteCost: number;
    moderationBanCost: number;
    leakPerWitnessRevive: Record<string, number>;
    leakPerIgnoredChat: number;
    leakPerTruthRelicSale: number;
    leakPerFakeSuccess: number;
    leakEndingThreshold: number;
    viewerFatigueOn28F: number;
    moderationFreeCount: number;
    moderationRepPenalty: number;
    audience: {
      minViewers: number;
      earlyFloorMax: number;
      basePerFan: number;
      maxPerFan: number;
      viewersPerFloor: number;
      appealViewerBoost: number;
      superchatViewerPerGold: number;
      recordViewerBoost: number;
      dangerHealthRatio: number;
      dangerViewerBoost: number;
      viewersPerChatStep: number;
      firstChatIntervalMs: number;
      chatIntervalStepMs: number;
      minChatIntervalMs: number;
    };
  };
  fans: { base: number; depthPivot: number; depthMul: number; recordBonus: number; shallowLiePenalty: number; appealMul: number };
  reputation: { onSuccessAnnounce: number; onFailureAnnounce: number; grades: [number, string][] };
  recruit: { baseSlots: number; lossPerFailures: number };
  contract: {
    visitorsPerDay: number;
    feeBase: number;
    feePerFandomK: number;
    feeHonestyBias: number;
    haggleFeeMultiplier: number;
    honestyMin: number;
    honestyMax: number;
    fandomBase: number;
    fandomPerCharisma: number;
    claimedTiers: { floor: number; rate: number }[];
  };
  autopsy: { lootMin: number; lootMax: number; truthRelicMinFloor: number; truthRelicIds: string[] };
  roster: { inheritFandomLoss: number; inheritSuspicion: number };
}

export interface CombatBalance {
  hero: { hpBase: number; hpPerGrit: number; atkBase: number; atkPerGrit: number; defBase: number };
  profileScale: { hp: number; atk: number; def: number };
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

export interface StarProfile {
  stageName: string;
  realName: string;
  role: string;
  origin: string;
  heightCm: number;
  hp: number;
  atk: number;
  def: number;
  will: number;
  fame: 'S' | 'A' | 'B' | 'C' | 'F';
  fans: number;
  pastRevivals: number;
  nature: string;
  refuses: string;
  purse: number;
  targetFloor: number;
  likelyEnd: string;
  bodyGrade: string;
  salvage: string;
  revival: string;
  bestZone: string;
  equipment: string[];
  notes: string;
}

export type DialogueSituation =
  | 'SHOP_FIRST' | 'SHOP_GREET' | 'SHOP_TOUCH' | 'SHOP_ITEM' | 'SHOP_CONTRACT' | 'SHOP_LEAVE'
  | 'DUN_START' | 'DUN_RADIO' | 'DUN_EVENT' | 'DUN_HURT' | 'DUN_LOW' | 'DUN_MENTAL'
  | 'DEATH' | 'REVIVE';

export interface DialogueLine {
  id: string;
  starId: string;
  speaker: string;
  situation: DialogueSituation;
  condition: string;
  expression: string;
  effects: string[];
  text: string;
  note: string | null;
}

export interface DialogueContent {
  variables: Record<string, string>;
  lines: DialogueLine[];
}

export interface Content {
  balance: Balance;
  items: ItemDef[];
  stars: Star[];
  starProfiles: Record<string, StarProfile>;
  personas: Persona[];
  floors: FloorContent;
  radio: Record<string, string[]>;
  chat: Record<string, unknown>;
  narrative: Record<string, unknown>;
  dialogue: DialogueContent;
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
    assertNumber(value.healing, `items[${index}].healing`);
    assertShape(typeof value.tier === 'string' && typeof value.isRelic === 'boolean', `items[${index}] tier/relic missing`);
    assertShape(value.kind === 'GEAR' || value.kind === 'POTION' || value.kind === 'RELIC', `items[${index}].kind invalid`);
    return { id: value.id, name: value.name, iconKey: `item.${value.id}`, hp: value.hp, atk: value.atk, def: value.def, price: value.price, tier: value.tier as ItemDef['tier'], kind: value.kind as ItemDef['kind'], healing: value.healing, isRelic: value.isRelic };
  });
}

function makeStarProfiles(raw: unknown): Record<string, StarProfile> {
  assertShape(Array.isArray(raw), 'stars must be an array');
  return Object.fromEntries(raw.map((value, index) => {
    assertShape(isRecord(value) && typeof value.id === 'string', `stars[${index}] id missing`);
    assertShape(isRecord(value.profile), `stars[${index}].profile missing`);
    const profile = value.profile;
    for (const key of ['stageName', 'realName', 'role', 'origin', 'fame', 'nature', 'refuses', 'likelyEnd', 'bodyGrade', 'salvage', 'revival', 'bestZone', 'notes'] as const) {
      assertShape(typeof profile[key] === 'string', `stars[${index}].profile.${key} missing`);
    }
    for (const key of ['heightCm', 'hp', 'atk', 'def', 'will', 'fans', 'pastRevivals', 'purse', 'targetFloor'] as const) {
      assertNumber(profile[key], `stars[${index}].profile.${key}`);
    }
    assertShape(Array.isArray(profile.equipment) && profile.equipment.every((item) => typeof item === 'string'), `stars[${index}].profile.equipment missing`);
    return [value.id, profile as unknown as StarProfile];
  }));
}

function makeDialogue(raw: unknown): DialogueContent {
  assertShape(isRecord(raw) && isRecord(raw.variables) && Array.isArray(raw.lines), 'dialogue sections missing');
  const ids = new Set<string>();
  const situations = new Set<DialogueSituation>([
    'SHOP_FIRST', 'SHOP_GREET', 'SHOP_TOUCH', 'SHOP_ITEM', 'SHOP_CONTRACT', 'SHOP_LEAVE',
    'DUN_START', 'DUN_RADIO', 'DUN_EVENT', 'DUN_HURT', 'DUN_LOW', 'DUN_MENTAL', 'DEATH', 'REVIVE',
  ]);
  const lines = raw.lines.map((value, index) => {
    assertShape(isRecord(value), `dialogue.lines[${index}] invalid`);
    for (const key of ['id', 'starId', 'speaker', 'situation', 'condition', 'expression', 'text'] as const) {
      assertShape(typeof value[key] === 'string', `dialogue.lines[${index}].${key} missing`);
    }
    assertShape(!ids.has(value.id as string), `dialogue duplicate id ${value.id as string}`);
    ids.add(value.id as string);
    assertShape(situations.has(value.situation as DialogueSituation), `dialogue.lines[${index}].situation invalid`);
    assertShape(Array.isArray(value.effects) && value.effects.every((effect) => typeof effect === 'string'), `dialogue.lines[${index}].effects invalid`);
    assertShape(value.note === null || typeof value.note === 'string', `dialogue.lines[${index}].note invalid`);
    return value as unknown as DialogueLine;
  });
  return { variables: raw.variables as Record<string, string>, lines };
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
  assertShape(isRecord(balanceJson) && isRecord(balanceJson.start) && isRecord(balanceJson.revive) && isRecord(balanceJson.dive) && isRecord(balanceJson.combat) && isRecord(balanceJson.mental) && isRecord(balanceJson.equipment) && isRecord(balanceJson.degrade) && isRecord(balanceJson.income), 'balance sections missing');
  const items = makeItems(itemsJson);
  for (const key of ['gold', 'fans', 'reputation', 'maxFloor', 'days', 'targetFloor'] as const) assertNumber(balanceJson.start[key], `balance.start.${key}`);
  assertShape(Array.isArray(balanceJson.start.inventory) && balanceJson.start.inventory.every((itemId) => typeof itemId === 'string' && items.some((item) => item.id === itemId)), 'balance.start.inventory invalid');
  for (const key of ['base', 'floorExp', 'degradeExp', 'decayPerDay', 'roundTo', 'discardLoot'] as const) assertNumber(balanceJson.revive[key], `balance.revive.${key}`);
  assertShape(balanceJson.revive.discardLoot > 0, 'balance.revive.discardLoot must be positive');
  assertShape(isRecord(balanceJson.revive.gradeMul), 'balance.revive.gradeMul missing');
  assertNumber(balanceJson.revive.gradeMul.INTACT, 'balance.revive.gradeMul.INTACT');
  assertNumber(balanceJson.revive.gradeMul.DAMAGED, 'balance.revive.gradeMul.DAMAGED');
  for (const key of ['floorSeconds', 'encounterEvery', 'delayGraceSeconds', 'delayFanLossPerSec', 'delayFanLossCap'] as const) assertNumber(balanceJson.dive[key], `balance.dive.${key}`);
  assertShape(isRecord(balanceJson.combat.profileScale), 'balance.combat.profileScale missing');
  for (const key of ['hp', 'atk', 'def'] as const) {
    assertNumber(balanceJson.combat.profileScale[key], `balance.combat.profileScale.${key}`);
    assertShape(balanceJson.combat.profileScale[key] > 0, `balance.combat.profileScale.${key} must be positive`);
  }
  for (const key of ['max', 'panicThreshold', 'damageThreshold', 'damagePerHp', 'gritResistancePerPoint', 'minimumDamageMultiplier'] as const) assertNumber(balanceJson.mental[key], `balance.mental.${key}`);
  assertShape(isRecord(balanceJson.mental.enemyFear) && isRecord(balanceJson.mental.witnessFear), 'balance.mental fear tables missing');
  for (const [enemyKey, fear] of Object.entries(balanceJson.mental.enemyFear)) assertNumber(fear, `balance.mental.enemyFear.${enemyKey}`);
  for (const [floor, fear] of Object.entries(balanceJson.mental.witnessFear)) {
    assertNumber(Number(floor), `balance.mental.witnessFear.${floor} floor`);
    assertNumber(fear, `balance.mental.witnessFear.${floor}`);
  }
  assertShape(balanceJson.mental.max > 0 && balanceJson.mental.panicThreshold >= 0 && balanceJson.mental.panicThreshold <= balanceJson.mental.max, 'balance.mental range invalid');
  assertShape(balanceJson.mental.minimumDamageMultiplier > 0 && balanceJson.mental.minimumDamageMultiplier <= 1, 'balance.mental minimumDamageMultiplier invalid');
  for (const key of ['weaponSlot', 'armorSlot', 'utilitySlot'] as const) assertNumber(balanceJson.equipment[key], `balance.equipment.${key}`);
  assertShape(isRecord(balanceJson.equipment.slotByItem), 'balance.equipment.slotByItem missing');
  const equipmentSlots = [balanceJson.equipment.weaponSlot, balanceJson.equipment.armorSlot, balanceJson.equipment.utilitySlot];
  assertShape(new Set(equipmentSlots).size === equipmentSlots.length && equipmentSlots.every((slot) => Number.isInteger(slot) && slot >= 0 && slot < 3), 'balance.equipment slots invalid');
  for (const [itemId, slot] of Object.entries(balanceJson.equipment.slotByItem)) {
    assertShape(items.some((item) => item.id === itemId), `balance.equipment.slotByItem.${itemId} item missing`);
    assertNumber(slot, `balance.equipment.slotByItem.${itemId}`);
    assertShape(equipmentSlots.includes(slot), `balance.equipment.slotByItem.${itemId} slot invalid`);
  }
  assertShape(Array.isArray(balanceJson.degrade.statMul) && balanceJson.degrade.statMul.length > 0, 'balance.degrade.statMul missing');
  assertShape(isRecord(balanceJson.income.superchat), 'balance.income.superchat missing');
  assertNumber(balanceJson.income.goodsPerFan, 'balance.income.goodsPerFan');
  for (const key of ['poolPerFan', 'charismaMul', 'depletedMul'] as const) assertNumber(balanceJson.income.superchat[key], `balance.income.superchat.${key}`);
  for (const key of ['fork', 'record', 'death', 'witness', 'appeal'] as const) {
    const range = balanceJson.income.superchat[key];
    assertShape(Array.isArray(range) && range.length === 2, `balance.income.superchat.${key} range missing`);
    assertNumber(range[0], `balance.income.superchat.${key}[0]`);
    assertNumber(range[1], `balance.income.superchat.${key}[1]`);
  }
  assertShape(isRecord(balanceJson.fans), 'balance.fans missing');
  for (const key of ['base', 'depthPivot', 'depthMul', 'recordBonus', 'shallowLiePenalty', 'appealMul'] as const) assertNumber(balanceJson.fans[key], `balance.fans.${key}`);
  assertShape(isRecord(balanceJson.opinion) && isRecord(balanceJson.opinion.leakPerWitnessRevive), 'balance.opinion.leakPerWitnessRevive missing');
  for (const key of ['chatLifetimeSeconds', 'chatMaxVisible', 'nickPoolSize', 'midLeakThreshold', 'truthChanceAtMidLeak', 'hypeChance', 'casualChance', 'truthLeakPower', 'slowAfterSeconds', 'backlashIntervalSeconds', 'moderationDeleteCost', 'moderationBanCost', 'leakPerIgnoredChat', 'leakPerTruthRelicSale', 'leakPerFakeSuccess', 'leakEndingThreshold', 'moderationFreeCount', 'moderationRepPenalty'] as const) assertNumber(balanceJson.opinion[key], `balance.opinion.${key}`);
  assertNumber(balanceJson.opinion.viewerFatigueOn28F, 'balance.opinion.viewerFatigueOn28F');
  assertShape(isRecord(balanceJson.opinion.audience), 'balance.opinion.audience missing');
  for (const key of ['minViewers', 'earlyFloorMax', 'basePerFan', 'maxPerFan', 'viewersPerFloor', 'appealViewerBoost', 'superchatViewerPerGold', 'recordViewerBoost', 'dangerHealthRatio', 'dangerViewerBoost', 'viewersPerChatStep', 'firstChatIntervalMs', 'chatIntervalStepMs', 'minChatIntervalMs'] as const) assertNumber(balanceJson.opinion.audience[key], `balance.opinion.audience.${key}`);
  assertShape(isRecord(balanceJson.reputation) && Array.isArray(balanceJson.reputation.grades), 'balance.reputation.grades missing');
  assertNumber(balanceJson.reputation.onSuccessAnnounce, 'balance.reputation.onSuccessAnnounce');
  assertNumber(balanceJson.reputation.onFailureAnnounce, 'balance.reputation.onFailureAnnounce');
  assertShape(balanceJson.reputation.grades.every((grade) => Array.isArray(grade) && grade.length === 2 && typeof grade[0] === 'number' && typeof grade[1] === 'string'), 'balance.reputation.grades invalid');
  assertShape(isRecord(balanceJson.recruit) && isRecord(balanceJson.roster) && isRecord(balanceJson.contract) && isRecord(balanceJson.autopsy), 'balance.recruit/roster/contract/autopsy missing');
  for (const key of ['baseSlots', 'lossPerFailures'] as const) assertNumber(balanceJson.recruit[key], `balance.recruit.${key}`);
  for (const key of ['inheritFandomLoss', 'inheritSuspicion'] as const) assertNumber(balanceJson.roster[key], `balance.roster.${key}`);
  for (const key of ['visitorsPerDay', 'feeBase', 'feePerFandomK', 'feeHonestyBias', 'haggleFeeMultiplier', 'honestyMin', 'honestyMax', 'fandomBase', 'fandomPerCharisma'] as const) assertNumber(balanceJson.contract[key], `balance.contract.${key}`);
  assertShape(Array.isArray(balanceJson.contract.claimedTiers) && balanceJson.contract.claimedTiers.length > 0, 'balance.contract.claimedTiers missing');
  balanceJson.contract.claimedTiers.forEach((tier, index) => {
    assertShape(isRecord(tier), `balance.contract.claimedTiers[${index}] invalid`);
    assertNumber(tier.floor, `balance.contract.claimedTiers[${index}].floor`);
    assertNumber(tier.rate, `balance.contract.claimedTiers[${index}].rate`);
  });
  assertShape(balanceJson.contract.honestyMin <= balanceJson.contract.honestyMax, 'balance.contract honesty range invalid');
  assertShape(balanceJson.contract.haggleFeeMultiplier > 0 && balanceJson.contract.haggleFeeMultiplier < 1, 'balance.contract haggleFeeMultiplier invalid');
  for (const key of ['lootMin', 'lootMax', 'truthRelicMinFloor'] as const) assertNumber(balanceJson.autopsy[key], `balance.autopsy.${key}`);
  assertShape(balanceJson.autopsy.lootMin > 0 && balanceJson.autopsy.lootMin <= balanceJson.autopsy.lootMax, 'balance.autopsy loot range invalid');
  assertShape(Array.isArray(balanceJson.autopsy.truthRelicIds) && balanceJson.autopsy.truthRelicIds.length === 2 && balanceJson.autopsy.truthRelicIds.every((id) => typeof id === 'string'), 'balance.autopsy truth relic ids invalid');
  assertShape(balanceJson.autopsy.truthRelicIds.every((id) => items.some((item) => item.id === id && item.isRelic)), 'balance.autopsy truth relic ids must be relic items');
  assertShape(isRecord(radioJson) && isRecord(chatJson) && isRecord(narrativeJson), 'localized content must be objects');
  for (const key of ['combatHealthy', 'combatHalf', 'combatDanger', 'combatMentalBreak', 'combatAppeal', 'degrade4'] as const) {
    const lines = radioJson[key];
    assertShape(Array.isArray(lines) && lines.length > 0 && lines.every((line) => typeof line === 'string' && line.length > 0), `radio.${key} lines missing`);
  }
  return {
    balance: balanceJson as unknown as Balance,
    items,
    stars: makeStars(starsJson),
    starProfiles: makeStarProfiles(starsJson),
    personas: makePersonas(personasJson),
    floors: makeFloors(floorsJson),
    radio: radioJson as Record<string, string[]>,
    chat: chatJson,
    narrative: narrativeJson,
    dialogue: makeDialogue(dialogueJson),
  };
}

export const content = loadContent();

export function reputationGrade(reputation: number): string {
  let grade = content.balance.reputation.grades[0]?.[1] ?? '';
  for (const [minimum, name] of content.balance.reputation.grades) if (reputation >= minimum) grade = name;
  return grade;
}
