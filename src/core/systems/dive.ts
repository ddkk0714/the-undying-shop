import { content } from '../content';
import { draw } from '../rng';
import { combatLine, createEncounter, createHero, isEncounterFloor, resolveCombatChoice, type CombatLineTone } from './combat';
import { addAppealChat, awardSuperchat } from './opinion';
import type { CombatChoice, Combatant, GameState, ItemDef, ItemId, Star } from '../types';

function equippedItems(state: GameState): ItemDef[] {
  return state.shelf.flatMap((id) => {
    const item = content.items.find((candidate) => candidate.id === id);
    return item?.kind === 'GEAR' ? [item] : [];
  });
}

function degradationMultiplier(star: Star): number {
  const multipliers = content.balance.degrade.statMul;
  return multipliers[Math.min(star.reviveCount, multipliers.length - 1)] ?? multipliers[0] ?? 1;
}

function currentTime(state: GameState, dt: number): number {
  return state.phaseStartedAt + dt * 1000;
}

function lieCallbackKey(starId: string): string {
  return `lieCallback:${starId}`;
}

function isGatekeeperFork(fork: typeof content.floors.forks[number]): boolean {
  return fork.a.hazard === 'GATEKEEPER' || fork.b.hazard === 'GATEKEEPER';
}

function actualCeiling(state: GameState): number {
  const today = state.today;
  const star = today === null ? undefined : state.stars.find((candidate) => candidate.id === today.starId);
  return today === null ? 1 : Math.max(1, Math.floor(today.claimedCeiling * (star?.honesty ?? 1)));
}

function reduceMental(mental: number, star: Star, rawLoss: number): number {
  if (rawLoss <= 0) return mental;
  const rules = content.balance.mental;
  const multiplier = Math.max(rules.minimumDamageMultiplier, 1 - star.stats.grit * rules.gritResistancePerPoint);
  return Math.max(0, Math.round(mental - rawLoss * multiplier));
}

function mentalAfterDamage(mental: number, star: Star, damage: number): number {
  const rules = content.balance.mental;
  return reduceMental(mental, star, Math.max(0, damage - rules.damageThreshold) * rules.damagePerHp);
}

function combatLineTone(star: Star, hero: Combatant, mental: number, choice?: CombatChoice): CombatLineTone {
  if (mental <= content.balance.mental.panicThreshold) return 'MENTAL_BREAK';
  if (star.reviveCount >= 4) return 'DEGRADE4';
  if (choice === 'APPEAL') return 'APPEAL';
  const healthRatio = hero.hp / hero.maxHp;
  if (healthRatio <= 0.15) return 'DANGER';
  if (healthRatio <= 0.5) return 'HALF';
  return 'HEALTHY';
}

function waitingPenalty(state: GameState, now: number): GameState {
  if (state.waitingSince === null || state.flags.reducedMotion === true) return { ...state, phaseStartedAt: now };
  const waitedSeconds = Math.max(0, (now - state.waitingSince) / 1000 - content.balance.dive.delayGraceSeconds);
  const loss = Math.min(content.balance.dive.delayFanLossCap, waitedSeconds * content.balance.dive.delayFanLossPerSec);
  return { ...state, phaseStartedAt: now, fans: Math.max(0, Math.floor(state.fans * (1 - loss))) };
}

export function startLive(state: GameState): GameState {
  if (state.today === null) return state;
  const star = state.stars.find((candidate) => candidate.id === state.today?.starId);
  if (star === undefined) return state;
  const callbackKey = lieCallbackKey(star.id);
  if (state.flags[callbackKey] !== true) {
    return {
      ...state,
      phase: 'LIVE',
      waitingSince: null,
      today: { ...state.today, hero: createHero(star, equippedItems(state), degradationMultiplier(star)), encounter: null, mental: content.balance.mental.max },
    };
  }
  const [roll, nextState] = draw(state);
  const lines = content.radio.lieCallback;
  const line = lines[Math.floor(roll * lines.length)] ?? lines[0] ?? '';
  const flags = { ...nextState.flags };
  delete flags[callbackKey];
  return {
    ...nextState,
    phase: 'LIVE',
    waitingSince: null,
    flags,
    today: { ...state.today, hero: createHero(star, equippedItems(state), degradationMultiplier(star)), encounter: null, mental: content.balance.mental.max },
    pendingFx: [...nextState.pendingFx, { kind: 'TRUTH_WHISPER', payload: { starId: star.id, line } }],
  };
}

export function tickLive(state: GameState, dt: number): GameState {
  if (state.phase !== 'LIVE' || state.today === null || dt <= 0) return state;
  const now = currentTime(state, dt);
  if (state.today.encounter !== null || state.waitingSince !== null) return waitingPenalty(state, now);

  const floorSteps = Math.max(1, Math.floor(dt / content.balance.dive.floorSeconds));
  let nextState: GameState = { ...state, phaseStartedAt: now };
  for (let step = 0; step < floorSteps; step += 1) {
    const today = nextState.today;
    if (today === null) return nextState;
    const floor = today.currentFloor + 1;
    if (floor >= actualCeiling(nextState) + content.floors.encounterEvery) {
      return { ...nextState, phase: 'DEATH', waitingSince: null, today: { ...today, currentFloor: floor, diedFloor: floor, deathCause: '하강 한계 도달' }, pendingFx: [...nextState.pendingFx, { kind: 'SIGNAL_LOST' }] };
    }
    const witnessFloor = Object.keys(content.balance.opinion.leakPerWitnessRevive).map(Number).find((value) => value === floor && !nextState.seenWitnessFloors.includes(value));
    if (witnessFloor !== undefined) {
      const star = nextState.stars.find((candidate) => candidate.id === today.starId);
      const mental = star === undefined ? today.mental : reduceMental(today.mental, star, content.balance.mental.witnessFear[String(witnessFloor)] ?? 0);
      const witnessed = { ...nextState, seenWitnessFloors: [...nextState.seenWitnessFloors, witnessFloor], stars: nextState.stars.map((candidate) => candidate.id === today.starId ? { ...candidate, witnessed: [...candidate.witnessed, witnessFloor] } : candidate), witnessLog: [...nextState.witnessLog, { floor: witnessFloor, starId: today.starId, line: '', day: nextState.day, suppressed: false }], viewerFatigue: witnessFloor === Math.max(...Object.keys(content.balance.opinion.leakPerWitnessRevive).map(Number)) ? nextState.viewerFatigue + content.balance.opinion.viewerFatigueOn28F : nextState.viewerFatigue, today: { ...today, currentFloor: floor, mental } };
      return awardSuperchat(witnessed, 'witness');
    }
    const fork = content.floors.forks.find((candidate) => candidate.atFloor === floor);
    if (fork !== undefined) {
      const flags = isGatekeeperFork(fork) && nextState.flags.gatekeeperCutscene !== true
        ? { ...nextState.flags, gatekeeperCutscene: true }
        : nextState.flags;
      return { ...nextState, flags, waitingSince: now, today: { ...today, currentFloor: floor, forks: [...today.forks, { floor, truth: { a: fork.a, b: fork.b }, told: 'UNKNOWN', wasLie: false }] } };
    }
    if (isEncounterFloor(floor)) {
      const [enemyRoll, afterEnemy] = draw(nextState);
      const [lineRoll, withRng] = draw(afterEnemy);
      const star = withRng.stars.find((candidate) => candidate.id === today.starId);
      const encounter = createEncounter(floor, 'NONE', enemyRoll);
      const mental = star === undefined ? today.mental : reduceMental(today.mental, star, content.balance.mental.enemyFear[encounter.enemyKey] ?? 0);
      const line = star === undefined ? combatLine('HEALTHY', lineRoll) : combatLine(combatLineTone(star, today.hero, mental), lineRoll);
      return {
        ...withRng,
        waitingSince: now,
        today: { ...today, currentFloor: floor, mental, encounter: { ...encounter, line } },
      };
    }
    nextState = { ...nextState, today: { ...today, currentFloor: floor } };
  }
  return nextState;
}

export function answerRadio(state: GameState, dir: 'A' | 'B' | 'UNKNOWN'): GameState {
  const today = state.today;
  const record = today?.forks.at(-1);
  if (state.phase !== 'LIVE' || today === null || record === undefined || record.told !== 'UNKNOWN') return state;
  const [roll, next] = draw(state);
  const swapped = roll < 0.5;
  const chosen = dir === 'UNKNOWN' ? undefined : (dir === 'A' ? (swapped ? record.truth.b : record.truth.a) : (swapped ? record.truth.a : record.truth.b));
  const alternative = chosen === record.truth.a ? record.truth.b : record.truth.a;
  const wasLie = chosen !== undefined && chosen.reachDelta < alternative.reachDelta;
  const flags = wasLie ? { ...next.flags, [lieCallbackKey(today.starId)]: true } : next.flags;
  const answered: GameState = {
    ...next,
    flags,
    waitingSince: null,
    stats: wasLie ? { ...next.stats, liesTold: next.stats.liesTold + 1 } : next.stats,
    today: { ...today, currentFloor: today.currentFloor + (chosen?.reachDelta ?? 0), forks: [...today.forks.slice(0, -1), { ...record, told: dir, wasLie }] },
  };
  const hazardMultiplier = content.balance.combat.hazardAtkMul;
  const choseRiskierPath = chosen !== undefined && hazardMultiplier[chosen.hazard] > hazardMultiplier[alternative.hazard];
  return choseRiskierPath ? awardSuperchat(answered, 'fork') : answered;
}

export function chooseCombat(state: GameState, choice: CombatChoice): GameState {
  const activeRun = state.today;
  if (state.phase !== 'LIVE' || activeRun === null || activeRun.encounter === null) return state;
  const star = state.stars.find((candidate) => candidate.id === activeRun.starId);
  if (star === undefined) return state;
  const [effectRoll, afterEffect] = draw(state);
  const [counterRoll, afterCounter] = draw(afterEffect);
  const result = resolveCombatChoice(activeRun.hero, activeRun.encounter, choice, star.stats.charisma, [effectRoll, counterRoll]);
  let afterDialogue = afterCounter;
  let encounter = result.enemyDefeated ? null : result.encounter;
  if (!result.heroDied && encounter !== null) {
    const [lineRoll, next] = draw(afterDialogue);
    afterDialogue = next;
    const damage = Math.max(0, activeRun.hero.hp - result.hero.hp);
    const mental = mentalAfterDamage(activeRun.mental, star, damage);
    encounter = { ...encounter, line: combatLine(combatLineTone(star, result.hero, mental, choice), lineRoll) };
  }
  const fans = Math.max(0, Math.floor(afterDialogue.fans * result.fanMultiplier) + result.fansDelta);
  const today = {
    ...activeRun,
    hero: result.hero,
    encounter,
    mental: mentalAfterDamage(activeRun.mental, star, Math.max(0, activeRun.hero.hp - result.hero.hp)),
    appealCount: activeRun.appealCount + (choice === 'APPEAL' ? 1 : 0),
    fansDelta: activeRun.fansDelta + result.fansDelta,
  };
  const resolved: GameState = {
    ...afterDialogue,
    fans,
    today,
    leak: result.leakRiskMultiplier > 1 ? Math.min(100, afterDialogue.leak + result.leakRiskMultiplier) : afterDialogue.leak,
    stats: { ...afterDialogue.stats, appeals: afterDialogue.stats.appeals + (choice === 'APPEAL' ? 1 : 0) },
  };
  const withAppeal = result.superchat ? awardSuperchat(addAppealChat(resolved), 'appeal') : resolved;
  if (result.heroDied) {
    return {
      ...withAppeal,
      phase: 'DEATH',
      waitingSince: null,
      today: { ...withAppeal.today!, diedFloor: today.currentFloor, deathCause: '전투 중 사망' },
      pendingFx: [...withAppeal.pendingFx, { kind: 'SIGNAL_LOST' }],
    };
  }
  return {
    ...withAppeal,
    waitingSince: result.enemyDefeated ? null : withAppeal.phaseStartedAt,
    pendingFx: [...withAppeal.pendingFx, { kind: choice === 'APPEAL' ? 'APPEAL_POSE' : choice === 'DEFEND' ? 'GUARD' : 'HIT' }],
  };
}

export function useCombatItem(state: GameState, itemId: ItemId): GameState {
  if (state.phase !== 'LIVE' || state.today === null || state.today.hero.hp >= state.today.hero.maxHp) return state;
  const item = content.items.find((candidate) => candidate.id === itemId && candidate.kind === 'POTION');
  const stack = state.inventory.find((candidate) => candidate.id === itemId && candidate.qty > 0);
  const utilitySlot = content.balance.equipment.utilitySlot;
  if (item === undefined || stack === undefined || item.healing <= 0 || state.shelf[utilitySlot] !== itemId) return state;
  const inventory = state.inventory.flatMap((candidate) => {
    if (candidate.id !== itemId) return [candidate];
    return candidate.qty <= 1 ? [] : [{ ...candidate, qty: candidate.qty - 1 }];
  });
  return {
    ...state,
    inventory,
    shelf: state.shelf.map((equipped, index) => index === utilitySlot ? null : equipped),
    today: { ...state.today, hero: { ...state.today.hero, hp: Math.min(state.today.hero.maxHp, state.today.hero.hp + item.healing) } },
  };
}
