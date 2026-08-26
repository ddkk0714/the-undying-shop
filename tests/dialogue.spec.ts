import { describe, expect, it } from 'vitest';
import { content } from '../src/core/content';
import {
  dialogueCandidates,
  interpolateDialogue,
  matchesDialogueCondition,
  pickDialogue,
} from '../src/core/systems/dialogue';

describe('V3 dialogue assets', () => {
  it('loads every workbook row with a unique fixed id', () => {
    expect(content.dialogue.lines).toHaveLength(283);
    expect(new Set(content.dialogue.lines.map((line) => line.id)).size).toBe(283);
    expect(new Set(content.dialogue.lines.map((line) => line.starId))).toEqual(new Set(content.stars.map((star) => star.id)));
  });

  it('evaluates revive, floor, mental, item, and equipment conditions', () => {
    expect(matchesDialogueCondition('2<={REVIVES}<=4', { revives: 3 })).toBe(true);
    expect(matchesDialogueCondition('{FLOOR}>=18', { floor: 17 })).toBe(false);
    expect(matchesDialogueCondition('멘탈<15 & 무기없음', { mental: 10, hasWeapon: false })).toBe(true);
    expect(matchesDialogueCondition('중고', { itemUsed: true })).toBe(true);
    expect(matchesDialogueCondition('신품', { itemUsed: true })).toBe(false);
  });

  it('selects a contextual line and replaces workbook variables', () => {
    const candidates = dialogueCandidates('body_juno', 'SHOP_GREET', { revives: 1 });
    expect(candidates.some((line) => line.id === 'LUAN_G01')).toBe(true);
    const line = pickDialogue('body_juno', 'DUN_START', { floor: 24, revives: 1 }, 0);
    expect(line?.text).toContain('24층');
    expect(interpolateDialogue('{PLAYER} · {ITEM} · {GEN}', { player: '사장님', item: '단검', generation: 3 }))
      .toBe('사장님 · 단검 · 3');
  });
});
