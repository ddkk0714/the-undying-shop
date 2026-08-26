import { describe, expect, it } from 'vitest';
import { combatLine, createEncounter, createHero, isEncounterFloor, resolveCombatChoice } from '../src/core/systems/combat';
import { content } from '../src/core/content';

const karin = content.stars.find((star) => star.id === 'body_karin')!;

describe('combat', () => {
  it('creates encounters every three floors and applies the hero equipment stats', () => {
    const hero = createHero(karin, [content.items.find((item) => item.id === 'cloak_ash')!], 1);
    expect(isEncounterFloor(3)).toBe(true);
    expect(isEncounterFloor(4)).toBe(false);
    expect(hero.maxHp).toBe(96);
    expect(hero.def).toBe(9);
    expect(content.radio.combatHealthy).toContain(createEncounter(3, 'NONE', 0).line);
  });

  it('selects each contextual combat line from localized content', () => {
    expect(content.radio.combatHalf).toContain(combatLine('HALF', 0));
    expect(content.radio.combatDanger).toContain(combatLine('DANGER', 0));
    expect(content.radio.combatAppeal).toContain(combatLine('APPEAL', 0));
    expect(content.radio.degrade4).toContain(combatLine('DEGRADE4', 0));
  });

  it('attack damages the enemy and only counterattacks at the configured chance', () => {
    const hero = createHero(karin, [], 1);
    const encounter = createEncounter(3, 'NONE', 0);
    const result = resolveCombatChoice(hero, encounter, 'ATTACK', karin.stats.charisma, [0.5, 0]);
    expect(result.encounter.enemy.hp).toBeLessThan(encounter.enemy.hp);
    expect(result.hero.hp).toBeLessThan(hero.hp);
  });

  it('defend reduces incoming damage and applies the configured audience penalty', () => {
    const hero = createHero(karin, [], 1);
    const encounter = createEncounter(18, 'BEAST', 0);
    const defended = resolveCombatChoice(hero, encounter, 'DEFEND', karin.stats.charisma, [0, 0]);
    expect(defended.hero.hp).toBeGreaterThan(0);
    expect(defended.fanMultiplier).toBe(1 - content.balance.combat.defend.fanPenalty);
  });

  it('appeal earns fans, guarantees a superchat, and exposes extra truth risk', () => {
    const hero = createHero(karin, [], 1);
    const encounter = createEncounter(18, 'BEAST', 0);
    const appealed = resolveCombatChoice(hero, encounter, 'APPEAL', karin.stats.charisma, [0, 1]);
    expect(appealed.fansDelta).toBeGreaterThan(0);
    expect(appealed.superchat).toBe(true);
    expect(appealed.leakRiskMultiplier).toBe(content.balance.combat.appeal.leakRiskMul);
  });

  it('uses the configured 55% appeal-hit boundary across 1000 deterministic rolls', () => {
    const hero = createHero(karin, [], 1);
    const encounter = createEncounter(18, 'NONE', 0);
    let hits = 0;
    for (let index = 0; index < 1000; index += 1) {
      const result = resolveCombatChoice(hero, encounter, 'APPEAL', karin.stats.charisma, [index / 1000, 0]);
      if (result.hero.hp < hero.hp) hits += 1;
    }
    expect(hits).toBe(550);
  });
});
