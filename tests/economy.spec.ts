import { describe, expect, it } from 'vitest';
import { content } from '../src/core/content';
import { reducer } from '../src/core/reducer';
import { createInitialState } from '../src/core/state';
import { addCorpseGearLoot, addInheritedSaleLoot, discardReviveCorpse, reviveCost, reviveQuote } from '../src/core/systems/economy';
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
    expect(discarded.inventory).toEqual([
      ...initial.inventory,
      { id: 'mask_bone', qty: 2 },
      { id: 'ring_rust', qty: 1 },
    ]);
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
    expect(loot.some((itemId) => content.balance.autopsy.truthRelicIds.includes(itemId))).toBe(false);
    expect(discarded.inventory.reduce((total, stack) => total + stack.qty, 0)).toBe(initial.inventory.reduce((total, stack) => total + stack.qty, 0) + loot.length);
    expect(discarded.rngCursor).toBe(initial.rngCursor + loot.length);
    expect(discardReviveCorpse(initial, body.starId)).toEqual(discarded);
  });

  it('unlocks high-chance inherited copies of sold gear after the first cycle', () => {
    const beforeFirstCycle = { ...createInitialState(104), day: content.balance.inheritanceLoot.startDay - 2 };
    expect(addInheritedSaleLoot(beforeFirstCycle, ['dagger_crack'])).toEqual([[], beforeFirstCycle]);

    let drops = 0;
    for (let seed = 1; seed <= 100; seed += 1) {
      const state = { ...createInitialState(seed), day: content.balance.inheritanceLoot.startDay - 1 };
      const [loot, next] = addInheritedSaleLoot(state, ['dagger_crack']);
      expect(loot.every((id) => id === 'dagger_crack_inherited')).toBe(true);
      expect(next.rngCursor).toBe(state.rngCursor + 1);
      drops += loot.length;
    }
    expect(drops).toBeGreaterThanOrEqual(80);
    expect(content.items.find((item) => item.id === 'dagger_crack_inherited')?.atk)
      .toBeGreaterThan(content.items.find((item) => item.id === 'dagger_crack')!.atk);
  });

  it('lets the revive-room loot action recover an inherited equipment copy', () => {
    const body = { ...corpse(24, 'INTACT'), carried: ['dagger_crack_inherited'] };
    const base = createInitialState(105);
    const initial = {
      ...base,
      phase: 'REVIVE' as const,
      stars: base.stars.map((star) => star.id === body.starId ? { ...star, status: 'DEAD' as const } : star),
      corpses: [body],
    };
    const looted = reducer(initial, { type: 'REVIVE/LOOT', starId: body.starId, itemId: 'dagger_crack_inherited' });
    expect(looted.corpses[0]?.carried).toEqual([]);
    expect(looted.inventory).toContainEqual({ id: 'dagger_crack_inherited', qty: 1 });
  });

  it('draws one or two varied non-inherited gear items from corpses after the first cycle', () => {
    const beforeFirstCycle = { ...createInitialState(106), day: content.balance.corpseGearLoot.startDay - 2 };
    expect(addCorpseGearLoot(beforeFirstCycle)).toEqual([[], beforeFirstCycle]);

    let successfulSearches = 0;
    const seen = new Set<string>();
    for (let seed = 1; seed <= 100; seed += 1) {
      const state = { ...createInitialState(seed), day: content.balance.corpseGearLoot.startDay - 1 };
      const [loot] = addCorpseGearLoot(state);
      if (loot.length > 0) successfulSearches += 1;
      expect(loot.length === 0 || (loot.length >= content.balance.corpseGearLoot.min && loot.length <= content.balance.corpseGearLoot.max)).toBe(true);
      expect(new Set(loot).size).toBe(loot.length);
      for (const itemId of loot) {
        const item = content.items.find((candidate) => candidate.id === itemId);
        expect(item?.kind).toBe('GEAR');
        expect(itemId.endsWith('_inherited')).toBe(false);
        seen.add(itemId);
      }
    }
    expect(successfulSearches).toBeGreaterThanOrEqual(70);
    expect(seen.size).toBeGreaterThanOrEqual(8);
  });

  it('keeps sold run equipment on the corpse and adds its inherited copy after one cycle', () => {
    let inheritedDrops = 0;
    for (let seed = 1; seed <= 100; seed += 1) {
      const base = createInitialState(seed);
      const starId = 'body_karin';
      const runEquipment = `runEquipment:${content.balance.inheritanceLoot.startDay - 1}:${starId}:0:dagger_crack`;
      let state = reducer({
        ...base,
        day: content.balance.inheritanceLoot.startDay - 1,
        phase: 'OFFICE' as const,
        inventory: [],
        flags: { ...base.flags, [runEquipment]: true },
      }, { type: 'OFFICE/PICK_STAR', starId });
      state = reducer(state, { type: 'OFFICE/CONFIRM' });
      const dead = reducer(state, { type: 'PHASE/ADVANCE' });
      const carried = dead.corpses[0]?.carried ?? [];
      expect(carried).toContain('dagger_crack');
      inheritedDrops += carried.filter((id) => id === 'dagger_crack_inherited').length;
    }
    expect(inheritedDrops).toBeGreaterThanOrEqual(80);
  });
});
