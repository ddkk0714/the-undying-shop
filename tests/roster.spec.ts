import { describe, expect, it } from 'vitest';
import { reducer } from '../src/core/reducer';
import { createInitialState } from '../src/core/state';
import { recruitCapacity } from '../src/core/systems/roster';

describe('roster', () => {
  it('inherits a persona with fandom loss, generation, lineage, and FX', () => {
    const base = createInitialState(4);
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
});
