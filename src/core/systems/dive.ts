import { content } from '../content';
import { draw } from '../rng';
import { createEncounter, createHero, isEncounterFloor, resolveCombatChoice } from './combat';
import type { CombatChoice, GameState, ItemDef, Star } from '../types';

function equippedItems(state: GameState): ItemDef[] {
  return state.shelf.flatMap((id) => {
    const item = content.items.find((candidate) => candidate.id === id);
    return item === undefined ? [] : [item];
  });
}

function degradationMultiplier(star: Star): number {
  const multipliers = content.balance.degrade.statMul;
  return multipliers[Math.min(star.reviveCount, multipliers.length - 1)] ?? multipliers[0] ?? 1;
}

function currentTime(state: GameState, dt: number): number {
  return state.phaseStartedAt + dt * 1000;
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
  return {
    ...state,
    phase: 'LIVE',
    waitingSince: null,
    today: { ...state.today, hero: createHero(star, equippedItems(state), degradationMultiplier(star)), encounter: null },
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
    if (isEncounterFloor(floor)) {
      const [enemyRoll, withRng] = draw(nextState);
      return {
        ...withRng,
        waitingSince: now,
        today: { ...today, currentFloor: floor, encounter: createEncounter(floor, 'NONE', enemyRoll) },
      };
    }
    nextState = { ...nextState, today: { ...today, currentFloor: floor } };
  }
  return nextState;
}

export function chooseCombat(state: GameState, choice: CombatChoice): GameState {
  const activeRun = state.today;
  if (state.phase !== 'LIVE' || activeRun === null || activeRun.encounter === null) return state;
  const star = state.stars.find((candidate) => candidate.id === activeRun.starId);
  if (star === undefined) return state;
  const [effectRoll, afterEffect] = draw(state);
  const [counterRoll, afterCounter] = draw(afterEffect);
  const result = resolveCombatChoice(activeRun.hero, activeRun.encounter, choice, star.stats.charisma, [effectRoll, counterRoll]);
  const fans = Math.max(0, Math.floor(afterCounter.fans * result.fanMultiplier) + result.fansDelta);
  const today = {
    ...activeRun,
    hero: result.hero,
    encounter: result.enemyDefeated ? null : result.encounter,
    appealCount: activeRun.appealCount + (choice === 'APPEAL' ? 1 : 0),
    fansDelta: activeRun.fansDelta + result.fansDelta,
    superchat: activeRun.superchat + (result.superchat ? content.balance.income.superchat.witness[0] ?? 0 : 0),
  };
  if (result.heroDied) {
    return {
      ...afterCounter,
      phase: 'DEATH',
      waitingSince: null,
      fans,
      today: { ...today, diedFloor: today.currentFloor, deathCause: '전투 중 사망' },
      pendingFx: [...afterCounter.pendingFx, { kind: 'SIGNAL_LOST' }],
    };
  }
  return {
    ...afterCounter,
    waitingSince: result.enemyDefeated ? null : afterCounter.phaseStartedAt,
    fans,
    today,
    leak: result.leakRiskMultiplier > 1 ? Math.min(100, afterCounter.leak + result.leakRiskMultiplier) : afterCounter.leak,
    stats: { ...afterCounter.stats, appeals: afterCounter.stats.appeals + (choice === 'APPEAL' ? 1 : 0) },
    pendingFx: [...afterCounter.pendingFx, { kind: choice === 'APPEAL' ? 'APPEAL_POSE' : choice === 'DEFEND' ? 'GUARD' : 'HIT' }],
  };
}
