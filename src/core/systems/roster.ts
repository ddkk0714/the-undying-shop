import { content } from '../content';
import type { GameState, PersonaId, StarId } from '../types';

export function recruitCapacity(state: GameState): number {
  const rules = content.balance.recruit;
  return Math.max(0, rules.baseSlots - Math.floor(state.stats.falseAnnouncements / rules.lossPerFailures));
}

export function inherit(state: GameState, personaId: PersonaId, toStarId: StarId): GameState {
  const persona = state.personas.find((candidate) => candidate.id === personaId);
  const target = state.stars.find((candidate) => candidate.id === toStarId && candidate.status === 'ALIVE' && candidate.personaId === null);
  const source = state.stars.find((candidate) => candidate.personaId === personaId && candidate.status !== 'ALIVE');
  const corpse = source === undefined ? undefined : state.corpses.find((candidate) => candidate.starId === source.id);
  if (persona === undefined || target === undefined || source === undefined || corpse === undefined) return state;
  const rules = content.balance.roster;
  return {
    ...state,
    stars: state.stars.map((star) => star.id === source.id ? { ...star, personaId: null } : star.id === target.id ? { ...star, personaId } : star),
    personas: state.personas.map((candidate) => candidate.id === personaId ? {
      ...candidate,
      generation: candidate.generation + 1,
      fandom: Math.floor(candidate.fandom * (1 - rules.inheritFandomLoss)),
      suspicion: candidate.suspicion + rules.inheritSuspicion,
      lineage: [...candidate.lineage, { starId: target.id, diedFloor: corpse.diedFloor }],
    } : candidate),
    pendingFx: [...state.pendingFx, { kind: 'PERSONA_INHERIT', payload: { personaId, toStarId } }],
  };
}
