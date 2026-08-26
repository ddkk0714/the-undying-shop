import { describe, expect, it } from 'vitest';
import { combatLine, createEncounter, createHero, isEncounterFloor, resolveCombatChoice } from '../src/core/systems/combat';
import { content } from '../src/core/content';

const karin = content.stars.find((star) => star.id === 'body_karin')!;

describe('combat', () => {
  it('creates encounters on every floor and applies the hero equipment stats', () => {
    const hero = createHero(karin, [content.items.find((item) => item.id === 'cloak_ash')!], 1);
    expect(isEncounterFloor(1)).toBe(true);
    expect(isEncounterFloor(4)).toBe(true);
    expect(hero.maxHp).toBe(96);
    expect(hero.def).toBe(9);
    expect(createEncounter(3, 'NONE', 0).line).toBe('사장님, 이 정도면 갑니다. 가까워요.');
  });

  it('selects each contextual combat line from localized content', () => {
    expect(combatLine('HALF', 0)).toBe('좀 버겁긴 한데… 아직 내려갈 수 있어요.');
    expect(combatLine('DANGER', 0)).toBe('사장님… 나 지금 죽으면 뉴스로 내보내실 거예요?');
    expect(combatLine('APPEAL', 0)).toBe('이게 먹히면… 오늘은 좀 버텨도 되는 거죠?');
    expect(combatLine('DEGRADE4', 0)).toBe('...제가 여기 왜 있죠?');
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
