import { describe, expect, it } from 'vitest';
import { reducer } from '../src/core/reducer';
import { createInitialState } from '../src/core/state';
import { recruitCapacity } from '../src/core/systems/roster';
import type { Contract, GameState, Star } from '../src/core/types';

function contractFor(star: Star): Contract {
  return {
    starId: star.id,
    displayName: star.bodyName,
    recognition: 'C',
    fandom: 1200,
    claimedTiers: [{ floor: 21, rate: 1 }, { floor: 25, rate: 0.75 }, { floor: 31, rate: 0.25 }],
    fee: 1200,
    honesty: 0.7,
  };
}

function signSela(base: GameState): GameState {
  const sela = base.recruitPool.find((star) => star.id === 'body_sela')!;
  return reducer({ ...base, phase: 'OFFICE', visitors: [contractFor(sela)] }, { type: 'OFFICE/CONTRACT_ACCEPT', starId: sela.id });
}

describe('roster', () => {
  it('inherits a persona with fandom loss, generation, lineage, and FX', () => {
    const base = signSela(createInitialState(4));
    const state = {
      ...base,
      stars: base.stars.map((star) => star.id === 'body_karin' ? { ...star, status: 'DEAD' as const } : star.id === 'body_sela' ? { ...star, status: 'ALIVE' as const, personaId: null } : star),
      corpses: [{ starId: 'body_karin', diedFloor: 31, diedDay: 1, grade: 'INTACT' as const, announced: null, loot: [] }],
    };
    const next = reducer(state, { type: 'REVIVE/INHERIT', personaId: 'persona_rion', toStarId: 'body_sela' });
    const persona = next.personas.find((item) => item.id === 'persona_rion')!;
    expect(persona.generation).toBe(4);
    expect(persona.fandom).toBe(10540);
    expect(next.stars.find((star) => star.id === 'body_sela')?.personaId).toBe('persona_rion');
    expect(next.pendingFx.at(-1)?.kind).toBe('PERSONA_INHERIT');
  });

  it('exhausts recruit capacity after four false announcements', () => {
    const state = { ...createInitialState(5), stats: { ...createInitialState(5).stats, falseAnnouncements: 4 } };
    expect(recruitCapacity(state)).toBe(0);
  });

  it('allows a persona to inherit from a discarded body record', () => {
    const base = signSela(createInitialState(6));
    const state = {
      ...base,
      stars: base.stars.map((star) => star.id === 'body_karin' ? { ...star, status: 'DISCARDED' as const } : star.id === 'body_sela' ? { ...star, personaId: null } : star),
      corpses: [{ starId: 'body_karin', diedFloor: 31, diedDay: 1, grade: 'DAMAGED' as const, announced: null, loot: [] }],
    };
    const next = reducer(state, { type: 'REVIVE/INHERIT', personaId: 'persona_rion', toStarId: 'body_sela' });
    expect(next.stars.find((star) => star.id === 'body_sela')?.personaId).toBe('persona_rion');
    expect(next.personas.find((persona) => persona.id === 'persona_rion')?.lineage.at(-1)).toEqual({ starId: 'body_sela', diedFloor: 31 });
  });

  it('requires a signed star before a persona can inherit into that body', () => {
    const base = createInitialState(7);
    const state = {
      ...base,
      stars: base.stars.map((star) => star.id === 'body_karin' ? { ...star, status: 'DEAD' as const } : star),
      corpses: [{ starId: 'body_karin', diedFloor: 31, diedDay: 1, grade: 'INTACT' as const, announced: null, loot: [] }],
    };
    const next = reducer(state, { type: 'REVIVE/INHERIT', personaId: 'persona_rion', toStarId: 'body_sela' });
    expect(next.stars.find((star) => star.id === 'body_sela')).toBeUndefined();
    expect(next.recruitPool.find((star) => star.id === 'body_sela')?.personaId).toBeNull();
  });
});
