import { describe, expect, it } from 'vitest';
import { reducer } from '../src/core/reducer';
import { createInitialState } from '../src/core/state';
import { content } from '../src/core/content';
import { randomPolicy } from '../src/core/sim';
import { populateVisitors, saleHaggleCount, saleOfferTried, salePriceMultiplier, salePurchaseChance, saleSlotSold } from '../src/core/systems/office';
import type { Contract, GameState, Star } from '../src/core/types';

function officeState(seed = 31): GameState {
  return { ...createInitialState(seed), phase: 'OFFICE' };
}

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

describe('office', () => {
  it('keeps all five heroes as hidden daily-contract candidates without duplicating signed stars', () => {
    const state = createInitialState(30);
    expect(state.stars).toHaveLength(2);
    expect(state.recruitPool).toHaveLength(5);
    expect(state.recruitPool.every((star) => star.status === 'HIDDEN')).toBe(true);
    expect(state.recruitPool.filter((candidate) => state.stars.some((star) => star.id === candidate.id))).toHaveLength(2);
    expect(state.inventory).toEqual([
      { id: 'dagger_crack', qty: 1 },
      { id: 'rope_hemp', qty: 1 },
      { id: 'potion_crimson', qty: 1 },
      { id: 'lantern_old', qty: 1 },
    ]);
  });

  it('limits newspaper visitor candidates cumulatively by day', () => {
    const dayOne = new Set<string>();
    for (let seed = 1; seed <= 120; seed += 1) {
      const state = { ...createInitialState(seed), day: 1, phase: 'OFFICE' as const };
      dayOne.add(populateVisitors(state).visitors[0]!.starId);
    }
    expect([...dayOne].sort()).toEqual(['body_ilan', 'body_juno', 'body_sela']); // 미레, 루엔, 비오레

    for (let seed = 1; seed <= 120; seed += 1) {
      const dayTwo = populateVisitors({ ...createInitialState(seed), day: 2, phase: 'OFFICE' as const });
      const dayThree = populateVisitors({ ...createInitialState(seed), day: 3, phase: 'OFFICE' as const });
      expect(dayTwo.visitors[0]?.starId).toBe('body_mor'); // 메르네 우선
      expect(dayThree.visitors[0]?.starId).toBe('body_karin'); // 세이로 우선
    }
  });

  it('offers a unique, affordable visitor when no living star remains', () => {
    const initial = createInitialState(31);
    const rejectedId = initial.recruitPool[0]!.id;
    const blocked = {
      ...initial,
      stars: initial.stars.map((star) => ({ ...star, status: 'DEAD' as const })),
      rejectedStarIds: [rejectedId],
    };
    const office = reducer(blocked, { type: 'PHASE/ADVANCE' });
    expect(office.phase).toBe('OFFICE');
    expect(office.visitors).toHaveLength(content.balance.contract.visitorsPerDay);
    expect(new Set(office.visitors.map((visitor) => visitor.starId)).size).toBe(office.visitors.length);
    expect(office.visitors.some((visitor) => visitor.starId === rejectedId)).toBe(false);
    const offeredProfile = content.starProfiles[office.visitors[0]!.starId]!;
    expect(office.visitors[0]?.fandom).toBe(offeredProfile.fans);
    expect(office.visitors[0]?.recognition).toBe(offeredProfile.fame);
    expect(office.visitors[0]?.claimedTiers[1]?.floor).toBe(offeredProfile.targetFloor);
    const visitor = office.visitors.find((candidate) => office.gold >= candidate.fee);
    expect(visitor).toBeDefined();
    expect(randomPolicy(office)).toMatchObject({ type: 'OFFICE/CONTRACT_ACCEPT' });
    const accepted = reducer(office, { type: 'OFFICE/CONTRACT_ACCEPT', starId: visitor!.starId });
    expect(accepted.stars.some((star) => star.id === visitor!.starId && star.status === 'ALIVE')).toBe(true);
    expect(accepted.phase).toBe('OFFICE');
    expect(accepted.today?.starId).toBe(visitor!.starId);
    expect(accepted.today?.claimedCeiling).toBe(Math.max(...visitor!.claimedTiers.map((tier) => tier.floor)));
    expect(reducer(accepted, { type: 'OFFICE/CONFIRM' }).phase).toBe('LIVE');
  });

  it('creates a real combatant and a non-stub ceiling when a star is picked', () => {
    const state = reducer(officeState(), { type: 'OFFICE/PICK_STAR', starId: 'body_karin' });
    expect(state.today?.hero).toEqual({ hp: 84, maxHp: 84, atk: 14, def: 2 });
    expect(state.today?.claimedCeiling).toBe(26);
    const live = reducer(state, { type: 'OFFICE/CONFIRM' });
    const finished = reducer(live, { type: 'PHASE/ADVANCE' });
    expect(finished.today?.diedFloor).toBe(26);
  });

  it('uses the submitted contract ceiling when the picked applicant has one', () => {
    const initial = officeState();
    const karin = initial.stars.find((star) => star.id === 'body_karin')!;
    const state = reducer({ ...initial, visitors: [contractFor(karin)] }, { type: 'OFFICE/PICK_STAR', starId: karin.id });
    expect(state.today?.claimedCeiling).toBe(31);
  });

  it('charges accepted contracts and permanently removes rejected applicants', () => {
    const initial = officeState();
    const applicant = initial.recruitPool[0]!;
    const offered = { ...initial, gold: 2_000, recruitPool: [applicant], visitors: [contractFor(applicant)] };
    const accepted = reducer(offered, { type: 'OFFICE/CONTRACT_ACCEPT', starId: applicant.id });
    expect(accepted.gold).toBe(offered.gold - 1200);
    expect(accepted.stars.find((star) => star.id === applicant.id)?.honesty).toBe(0.7);
    expect(accepted.visitors).toEqual([]);
    expect(accepted.phase).toBe('OFFICE');
    expect(accepted.today?.starId).toBe(applicant.id);
    expect(accepted.pendingFx.at(-1)?.kind).toBe('CONTRACT_SIGN');
    expect(reducer(accepted, { type: 'OFFICE/CONFIRM' }).phase).toBe('LIVE');

    const rejected = reducer(offered, { type: 'OFFICE/CONTRACT_REJECT', starId: applicant.id });
    expect(rejected.recruitPool).toEqual([]);
    expect(rejected.rejectedStarIds).toEqual([applicant.id]);
    expect(rejected.stats.contractsRejected).toBe(1);
    const followingDay = reducer({ ...rejected, day: 2, phase: 'REVIVE', visitors: [] }, { type: 'PHASE/ADVANCE' });
    expect(followingDay.visitors.some((visitor) => visitor.starId === applicant.id)).toBe(false);
  });

  it('keeps one visitor on the desk and brings the next candidate after a rejection', () => {
    const initial = officeState(37);
    const first = initial.recruitPool[0]!;
    const second = initial.recruitPool[1]!;
    const inventory = [{ id: 'dagger_crack', qty: 1 }, { id: 'rope_hemp', qty: 1 }, { id: 'potion_crimson', qty: 1 }];
    const offered = {
      ...initial,
      inventory,
      shelf: ['dagger_crack', 'rope_hemp', 'potion_crimson'],
      recruitPool: [first, second],
      visitors: [contractFor(first)],
    };
    const rejected = reducer(offered, { type: 'OFFICE/CONTRACT_REJECT', starId: first.id });
    expect(rejected.visitors).toHaveLength(1);
    expect(rejected.visitors[0]?.starId).toBe(second.id);
    expect(rejected.rejectedStarIds).toEqual([first.id]);
    expect(rejected.shelf).toEqual([null, null, null]);
    expect(rejected.inventory).toEqual(inventory);
  });

  it('discounts an offered contract once, then charges the discounted fee', () => {
    const initial = officeState();
    const applicant = initial.recruitPool[0]!;
    const offered = { ...initial, recruitPool: [applicant], visitors: [contractFor(applicant)] };
    const haggled = reducer(offered, { type: 'OFFICE/CONTRACT_HAGGLE', starId: applicant.id });
    const discountedFee = Math.round(1200 * content.balance.contract.haggleFeeMultiplier);
    expect(haggled.visitors[0]?.fee).toBe(discountedFee);
    expect(haggled.flags[`contractHaggled:${applicant.id}`]).toBe(true);
    expect(reducer(haggled, { type: 'OFFICE/CONTRACT_HAGGLE', starId: applicant.id })).toEqual(haggled);

    const accepted = reducer(haggled, { type: 'OFFICE/CONTRACT_ACCEPT', starId: applicant.id });
    expect(accepted.gold).toBe(offered.gold - discountedFee);
  });

  it('sells every displayed item with one successful roll and locks each sold category', () => {
    const weaponSlot = content.balance.equipment.weaponSlot;
    const utilitySlot = content.balance.equipment.utilitySlot;
    let state = {
      ...officeState(7),
      inventory: [{ id: 'dagger_crack', qty: 1 }, { id: 'soil_deep', qty: 1 }, { id: 'lantern_old', qty: 1 }],
    };
    expect(reducer(state, { type: 'OFFICE/SELL_BATCH' })).toEqual(state);
    state = reducer(state, { type: 'OFFICE/PLACE', slot: weaponSlot, itemId: 'dagger_crack' });
    state = reducer(state, { type: 'OFFICE/PLACE', slot: utilitySlot, itemId: 'soil_deep' });
    state = reducer(state, { type: 'OFFICE/SALE_PRICE_SET', multiplier: 0.5 });
    expect(salePriceMultiplier(state)).toBe(0.5);
    const daggerPrice = content.items.find((item) => item.id === 'dagger_crack')!.price;
    const price = Math.round(daggerPrice * 0.5) + Math.round(4400 * 0.5);
    state = reducer(state, { type: 'OFFICE/SELL_BATCH' });
    expect(state.gold).toBe(content.balance.start.gold + price);
    expect(state.stats.goldEarned).toBe(price);
    expect(state.shelf[weaponSlot]).toBeNull();
    expect(state.shelf[utilitySlot]).toBeNull();
    expect(state.leak).toBe(10);
    expect(saleSlotSold(state, weaponSlot)).toBe(true);
    expect(saleSlotSold(state, utilitySlot)).toBe(true);

    const displayedAgain = reducer(state, { type: 'OFFICE/PLACE', slot: utilitySlot, itemId: 'lantern_old' });
    expect(displayedAgain).toEqual(state);
    expect(displayedAgain.shelf[utilitySlot]).toBeNull();
  });

  it('applies one seeded result to the whole shelf and allows at most three new price proposals', () => {
    const weaponSlot = content.balance.equipment.weaponSlot;
    const armorSlot = content.balance.equipment.armorSlot;
    let state = { ...officeState(4), inventory: [{ id: 'dagger_crack', qty: 1 }, { id: 'rope_hemp', qty: 1 }] };
    state = reducer(state, { type: 'OFFICE/PLACE', slot: weaponSlot, itemId: 'dagger_crack' });
    state = reducer(state, { type: 'OFFICE/PLACE', slot: armorSlot, itemId: 'rope_hemp' });
    expect(salePurchaseChance(0.5)).toBeGreaterThan(salePurchaseChance(1));
    expect(salePurchaseChance(2)).toBeLessThan(salePurchaseChance(1));
    for (let i = 0; i < content.balance.shopSale.maxHaggles; i += 1) {
      state = reducer(state, { type: 'OFFICE/SALE_PRICE_SET', multiplier: 2 });
      expect(saleOfferTried(state)).toBe(false);
      state = reducer(state, { type: 'OFFICE/SELL_BATCH' });
      expect(saleOfferTried(state)).toBe(true);
    }
    expect(state.shelf[weaponSlot]).toBe('dagger_crack');
    expect(state.shelf[armorSlot]).toBe('rope_hemp');
    expect(saleHaggleCount(state)).toBe(3);
    const exhausted = reducer(state, { type: 'OFFICE/SALE_PRICE_SET', multiplier: 0.5 });
    expect(exhausted).toEqual(state);
  });

  it('hands each star one weapon, armor, and utility; only the handed potion can be used live', () => {
    let state = officeState();
    expect(reducer(state, { type: 'OFFICE/PLACE', slot: content.balance.equipment.armorSlot, itemId: 'dagger_crack' })).toEqual(state);

    state = reducer(state, { type: 'OFFICE/PLACE', slot: content.balance.equipment.weaponSlot, itemId: 'dagger_crack' });
    state = reducer(state, { type: 'OFFICE/PLACE', slot: content.balance.equipment.armorSlot, itemId: 'rope_hemp' });
    state = reducer(state, { type: 'OFFICE/PLACE', slot: content.balance.equipment.utilitySlot, itemId: 'potion_crimson' });
    expect(state.shelf).toEqual(['dagger_crack', 'rope_hemp', 'potion_crimson']);

    state = reducer(state, { type: 'OFFICE/PICK_STAR', starId: 'body_karin' });
    state = reducer(state, { type: 'OFFICE/CONFIRM' });
    const wounded = { ...state, today: { ...state.today!, hero: { ...state.today!.hero, hp: 20 } } };
    const healed = reducer(wounded, { type: 'COMBAT/USE_ITEM', itemId: 'potion_crimson' });
    expect(healed.today?.hero).toMatchObject({ hp: 44, maxHp: 90, atk: 19, def: 4 });
    expect(healed.shelf).toEqual(['dagger_crack', 'rope_hemp', null]);
    expect(healed.inventory.some((stack) => stack.id === 'potion_crimson')).toBe(false);
  });
});
