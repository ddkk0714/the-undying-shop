import { describe, expect, it } from 'vitest';
import { content } from '../src/core/content';
import { reducer } from '../src/core/reducer';
import { createInitialState } from '../src/core/state';
import { discardReviveCorpse, reviveCost, reviveQuote } from '../src/core/systems/economy';
import type { Corpse, Star } from '../src/core/types';

function corpse(diedFloor: number, grade: Corpse['grade']): Corpse {
  return { starId: 'body_karin', diedFloor, diedDay: 1, grade, announced: null, loot: [] };
}

function karin(reviveCount: number): Star {
  return { ...content.stars.find((star) => star.id === 'body_karin')!, status: 'DEAD', reviveCount };
}

describe('revive economy', () => {
  it.each([
    [12, 'INTACT' as const, 0, 760],
    [24, 'DAMAGED' as const, 2, 4250],
    [31, 'DAMAGED' as const, 4, 12120],
  ])('matches the balance reference at %iF', (floor, grade, reviveCount, expected) => {
    const value = reviveCost(content.balance, corpse(floor, grade), karin(reviveCount), 0);
    expect(value).toBeGreaterThanOrEqual(expected * 0.95);
    expect(value).toBeLessThanOrEqual(expected * 1.05);
  });

  it('raises the quote by the configured daily holding decay', () => {
    const body = corpse(12, 'INTACT');
    const today = reviveCost(content.balance, body, karin(0), 0);
    const delayed = reviveCost(content.balance, body, karin(0), 1);
    expect(delayed / today).toBeCloseTo(content.balance.revive.decayPerDay, 1);
  });

  it('charges only an affordable dead star once and exposes the witness warning', () => {
    const body = corpse(12, 'INTACT');
    const star = { ...karin(0), witnessed: [18] };
    const initial = { ...createInitialState(91), phase: 'REVIVE' as const, stars: createInitialState(91).stars.map((candidate) => candidate.id === star.id ? star : candidate), corpses: [body] };
    const quote = reviveQuote(initial, body, star);
    expect(quote.witnessWarning).toBe(true);
    const paid = reducer(initial, { type: 'REVIVE/PAY', starId: star.id });
    expect(paid.gold).toBe(initial.gold - quote.cost);
    expect(paid.stats.goldSpentOnRevive).toBe(quote.cost);
    expect(reducer(paid, { type: 'REVIVE/PAY', starId: star.id })).toEqual(paid);
  });

  it('discards a dead body once, preserves its inheritance record, and transfers its loot', () => {
    const body = { ...corpse(24, 'DAMAGED'), loot: ['mask_bone', 'mask_bone', 'ring_rust'] };
    const base = createInitialState(92);
    const initial = { ...base, phase: 'REVIVE' as const, stars: base.stars.map((star) => star.id === body.starId ? { ...star, status: 'DEAD' as const } : star), corpses: [body] };
    const discarded = discardReviveCorpse(initial, body.starId);
    expect(discarded.stars.find((star) => star.id === body.starId)?.status).toBe('DISCARDED');
    expect(discarded.inventory).toEqual([{ id: 'mask_bone', qty: 2 }, { id: 'ring_rust', qty: 1 }]);
    expect(discarded.corpses).toEqual([body]);
    expect(discarded.stats.totalDiscarded).toBe(1);
    expect(discarded.pendingFx.at(-1)).toMatchObject({ kind: 'SEAL_STAMP', payload: { starId: body.starId } });
    expect(reducer(discarded, { type: 'REVIVE/DISCARD', starId: body.starId })).toEqual(discarded);
  });

  it('seeds configured relic loot when directly discarding an empty corpse', () => {
    const body = corpse(12, 'INTACT');
    const base = createInitialState(93);
    const initial = { ...base, phase: 'REVIVE' as const, stars: base.stars.map((star) => star.id === body.starId ? { ...star, status: 'DEAD' as const } : star), corpses: [body] };
    const discarded = discardReviveCorpse(initial, body.starId);
    const loot = discarded.corpses[0]!.loot;

    expect(loot).toHaveLength(content.balance.revive.discardLoot);
    expect(new Set(loot).size).toBe(loot.length);
    expect(loot.every((itemId) => content.items.some((item) => item.id === itemId && item.isRelic))).toBe(true);
    expect(discarded.inventory.reduce((total, stack) => total + stack.qty, 0)).toBe(loot.length);
    expect(discarded.rngCursor).toBe(initial.rngCursor + loot.length);
    expect(discardReviveCorpse(initial, body.starId)).toEqual(discarded);
  });
});
