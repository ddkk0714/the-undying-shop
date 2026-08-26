import { content, type DialogueLine, type DialogueSituation } from '../content';

export interface DialogueContext {
  player?: string;
  floor?: number;
  item?: string;
  generation?: number;
  gold?: number;
  viewers?: number;
  deaths?: number;
  hero?: string;
  revives?: number;
  mental?: number;
  itemUsed?: boolean;
  hasWeapon?: boolean;
  answer?: 'Yes' | 'No';
}

/** 워크북의 과거 소생 이력 + 이번 플레이에서 발생한 소생 횟수. */
export function totalRevivals(starId: string, runtimeRevives: number): number {
  return (content.starProfiles[starId]?.pastRevivals ?? 0) + runtimeRevives;
}

function numberFor(name: string, context: DialogueContext): number | undefined {
  switch (name) {
    case 'REVIVES': return context.revives;
    case 'FLOOR': return context.floor;
    case 'GEN': return context.generation;
    case 'GOLD': return context.gold;
    case 'VIEWERS': return context.viewers;
    case 'DEATHS': return context.deaths;
    default: return undefined;
  }
}

function compare(value: number, op: string, expected: number): boolean {
  if (op === '=') return value === expected;
  if (op === '>=') return value >= expected;
  if (op === '<=') return value <= expected;
  if (op === '>') return value > expected;
  return value < expected;
}

function matchesToken(raw: string, context: DialogueContext): boolean {
  const token = raw.trim().replaceAll(' ', '');
  if (token === '' || token === '혼잣말') return true;
  if (token === '중고') return context.itemUsed === true;
  if (token === '신품') return context.itemUsed === false;
  if (token === '무기없음') return context.hasWeapon === false;
  if (token.startsWith('답변=')) return context.answer === token.slice(3);

  const normalized = token.replaceAll('{', '').replaceAll('}', '').replaceAll('멘탈', 'MENTAL');
  const between = /^(\d+)<=(REVIVES|FLOOR|GEN|GOLD|VIEWERS|DEATHS|MENTAL)<=(\d+)$/.exec(normalized);
  if (between !== null) {
    const value = between[2] === 'MENTAL' ? context.mental : numberFor(between[2]!, context);
    return value !== undefined && value >= Number(between[1]) && value <= Number(between[3]);
  }
  const simple = /^(REVIVES|FLOOR|GEN|GOLD|VIEWERS|DEATHS|MENTAL)(>=|<=|=|>|<)(\d+)$/.exec(normalized);
  if (simple !== null) {
    const value = simple[1] === 'MENTAL' ? context.mental : numberFor(simple[1]!, context);
    return value !== undefined && compare(value, simple[2]!, Number(simple[3]));
  }

  // 워크북의 비고성 조건(예: "가면 벗음")은 해당 상태를 게임이 아직 추적하지 않는다.
  // 이런 행을 무조건 제외하면 캐릭터별 대사 풀이 통째로 비므로, 알려진 조건만 엄격히 판정한다.
  return true;
}

export function matchesDialogueCondition(condition: string, context: DialogueContext): boolean {
  if (condition.trim() === '') return true;
  return condition.split(/[&·]/).every((token) => matchesToken(token, context));
}

export function dialogueCandidates(starId: string, situation: DialogueSituation, context: DialogueContext = {}): DialogueLine[] {
  return content.dialogue.lines.filter((line) =>
    line.starId === starId
    && line.situation === situation
    && matchesDialogueCondition(line.condition, context));
}

/**
 * 조사 짝 — `[받침 있을 때, 받침 없을 때]`.
 *
 * 대사집은 「{PLAYER}가」처럼 한쪽 형태로만 적혀 있다. 치환된 값에 받침이 있으면
 * 「사장님가」가 되어 버려서, 앞말을 보고 짝을 다시 고른다.
 * **확실한 짝만 넣는다.** 「라」·「나」 같은 건 낱말의 일부일 수 있어 건드리지 않는다.
 */
const JOSA: Record<string, readonly [string, string]> = {
  은: ['은', '는'], 는: ['은', '는'],
  이: ['이', '가'], 가: ['이', '가'],
  을: ['을', '를'], 를: ['을', '를'],
  과: ['과', '와'], 와: ['과', '와'],
};

/**
 * 마지막 글자에 받침이 있는가. 판정할 수 없으면 null (라틴 문자 등 — 그때는 손대지 않는다).
 *
 * 숫자는 **읽는 소리**로 본다: 0 영 · 1 일 · 3 삼 · 6 육 · 7 칠 · 8 팔 은 받침이 있고
 * 2 이 · 4 사 · 5 오 · 9 구 는 없다. 「12층이」와 「2층이」가 달라지는 이유다.
 */
function hasFinalConsonant(word: string): boolean | null {
  const ch = word.at(-1);
  if (ch === undefined) return null;
  if (ch >= '0' && ch <= '9') return '013678'.includes(ch);
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  return null;
}

export function interpolateDialogue(text: string, context: DialogueContext = {}): string {
  const values: Record<string, string | number | undefined> = {
    PLAYER: context.player ?? content.dialogue.variables.PLAYER ?? '사장님',
    FLOOR: context.floor,
    ITEM: context.item,
    GEN: context.generation,
    GOLD: context.gold,
    VIEWERS: context.viewers,
    DEATHS: context.deaths,
    HERO: context.hero,
    REVIVES: context.revives,
  };
  // 변수와 **바로 뒤에 붙은 조사 한 글자**를 함께 잡는다. 조사가 없으면 그냥 치환한다
  return text.replace(/\{([A-Z]+)\}([은는이가을를과와])?/g, (token, key: string, josa?: string) => {
    const value = values[key];
    if (value === undefined) return token;
    const word = String(value);
    if (josa === undefined) return word;
    const pair = JOSA[josa];
    const closed = hasFinalConsonant(word);
    // 판정 못 하면 적혀 있던 그대로 둔다 — 멋대로 바꾸는 것보다 낫다
    if (pair === undefined || closed === null) return word + josa;
    return word + (closed ? pair[0] : pair[1]);
  });
}

export function pickDialogue(
  starId: string,
  situation: DialogueSituation,
  context: DialogueContext = {},
  roll = 0,
): DialogueLine | null {
  const candidates = dialogueCandidates(starId, situation, context);
  if (candidates.length === 0) return null;
  const index = Math.min(candidates.length - 1, Math.floor(Math.max(0, Math.min(0.999999, roll)) * candidates.length));
  const line = candidates[index]!;
  return { ...line, text: interpolateDialogue(line.text, context) };
}
