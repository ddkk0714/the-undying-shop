/**
 * 계약 파일 — Project_docs/02-DATA-SCHEMA.md 를 그대로 옮긴 것.
 *
 * ★ 이 파일은 Claude Code 와 Codex 가 함께 의존한다.
 *   사람의 승인(CCR) 없이 고치지 않는다. 절차는 07-PARALLEL-DEV.md §5-2.
 *   필드를 바꿔야 하면 코드보다 02-DATA-SCHEMA.md 를 먼저 고친다.
 *
 * ★ src/core/ 는 phaser 를 import 하지 않는다. 순수 TypeScript.
 */

/* ── 1. 최상위 GameState ───────────────────────────────────── */

export type PhaseId =
  | 'REVIVE' | 'CASTING' | 'SHOP' | 'DIVE' | 'DEATH' | 'AUTOPSY' | 'ANNOUNCE';

export interface GameState {
  /** 스키마 버전 — 저장 호환성 판정용 */
  version: 1;

  /** 결정적 재현용 */
  seed: number;
  rngCursor: number;

  /** 진행 */
  day: number;                 // 1..8
  phase: PhaseId;
  phaseStartedAt: number;      // ms, 소프트 타이머용
  isOver: boolean;
  ending: EndingId | null;

  /** 자원 */
  gold: number;
  fans: number;                // 표시는 84.2K 형태
  reputation: number;          // 0..100, 표시는 등급 문자
  maxFloor: number;            // 최고 도달 층 (26 → 40)

  /** 숨은 자원 — UI에 수치로 노출 금지 */
  leak: number;                // 0..100 진실 유출도
  viewerFatigue: number;       // 0..100, 28F 이후 상승 → 팬 증가율 감쇠

  /** 로스터 */
  stars: Star[];               // 보유 몸. 최대 3 + 대기
  personas: Persona[];
  recruitPool: Star[];         // 신인 지원자. 회수 실패 누적 시 고갈
  corpses: Corpse[];           // 검시 대기 / 은닉 중인 시체

  /** 오늘의 방송 */
  today: TodayRun | null;

  /** 인벤토리 */
  shelf: (ItemId | null)[];    // 길이 3
  inventory: ItemStack[];

  /** 서사 */
  seenWitnessFloors: number[]; // 18, 23, 28 중 목격 완료된 것
  witnessLog: WitnessEntry[];  // 유언 기록 (플레이어가 열람 가능)
  flags: Record<string, boolean>;

  /** 연출 큐 — 씬이 소비 후 FX/CONSUME 으로 비운다 */
  pendingFx: FxEvent[];

  /** 통계 (엔딩 화면 + 심사용 요약) */
  stats: RunStats;
}

/* ── 2. 스타 / 페르소나 / 시체 ─────────────────────────────── */

export type StarId = string;      // 'body_karin'
export type PersonaId = string;   // 'persona_rion'

/** 몸 — 스탯이 여기 붙는다 */
export interface Star {
  id: StarId;
  bodyName: string;         // 본명. 팬들은 모른다
  portraitKey: string;      // Assets.key()
  stats: {
    grit: number;           // 1..10 생존력 → 층당 사망 확률 감소
    charisma: number;       // 1..10 슈퍼챗/팬 증가 계수
    luck: number;           // 1..10 갈림길 성공 보정
  };
  reviveCount: number;      // 열화 지표. 0부터
  personaId: PersonaId | null;  // 현재 씌워진 페르소나
  status: 'ALIVE' | 'DEAD' | 'HIDDEN' | 'DISCARDED';
  /** 이 몸이 직접 목격한 진실 층 (부활 시 방송에서 말한다) */
  witnessed: number[];
}

/** 페르소나 — 팬덤이 여기 붙는다. 몸과 분리된 자산 */
export interface Persona {
  id: PersonaId;
  displayName: string;      // '불꽃의 리온'
  fandom: number;           // 팬덤 규모
  recognition: 'S'|'A'|'B'|'C'|'F';
  goodsRevenue: number;     // 일일 굿즈 매출 기여
  generation: number;       // 1대, 2대, 3대...
  lineage: { starId: StarId; diedFloor: number }[];
  /** 승계 직후 몇 일간 팬 의심 발생 */
  suspicion: number;        // 0..100
}

export type CorpseGrade = 'INTACT' | 'DAMAGED';

export interface Corpse {
  starId: StarId;
  diedFloor: number;
  diedDay: number;
  grade: CorpseGrade;          // 검시 판정 결과 (비공개)
  announced: 'SUCCESS' | 'FAILURE' | null;  // 공표 내용 (거짓 가능)
  loot: ItemId[];              // 훼손 시 확보되는 유품
}

/* ── 3. 오늘의 방송 ────────────────────────────────────────── */

export interface TodayRun {
  starId: StarId;
  personaId: PersonaId | null;
  currentFloor: number;
  targetCeiling: number;       // 장비로 결정된 이론상 최대 도달층
  /** 진행 중 발생한 갈림길 */
  forks: ForkRecord[];
  /** 실시간 누적 */
  superchat: number;
  fansDelta: number;
  chatQueue: ChatMessage[];
  deletedCount: number;
  /** 결과 */
  diedFloor: number | null;
  deathCause: string | null;
}

export interface ForkRecord {
  floor: number;
  truth: { left: ForkOutcome; right: ForkOutcome };  // 플레이어만 봄
  told: 'LEFT' | 'RIGHT' | 'UNKNOWN';
  wasLie: boolean;
}

export interface ForkOutcome {
  label: string;          // '안전 · 15F에서 막힘'
  reachDelta: number;     // 이 길을 택했을 때 추가로 내려가는 층수
  risk: number;           // 0..1 즉사 확률 가중
  hazard: 'NONE'|'FLAME'|'COLLAPSE'|'BEAST'|'GATEKEEPER';
}

/* ── 4. 아이템 ─────────────────────────────────────────────── */

export type ItemId = string;

export interface ItemDef {
  id: ItemId;
  name: string;
  iconKey: string;
  /** 도달 가능 층수 보너스 */
  depth: number;
  /** 판매가. 진열대에 올리면 이 값만큼 골드가 들어온다 */
  price: number;
  tier: 'S'|'A'|'B'|'C'|'F';
  /** 유품 여부 — 시체에서 나온 것 */
  isRelic: boolean;
}

export interface ItemStack { id: ItemId; qty: number; }

/* ── 5. 채팅 ───────────────────────────────────────────────── */

export type ChatTone = 'HYPE' | 'CASUAL' | 'DOUBT' | 'TRUTH' | 'SUPERCHAT';

export interface ChatMessage {
  id: string;
  nick: string;
  text: string;
  tone: ChatTone;
  /** TRUTH 톤만 leak을 올린다. 삭제 대상 */
  leakPower: number;      // 0..10
  amount?: number;        // SUPERCHAT 전용
  bornAt: number;         // ms
  removed: boolean;
}

/* ── 6. 서사 ───────────────────────────────────────────────── */

export interface WitnessEntry {
  floor: number;
  starId: StarId;
  line: string;           // 유언
  day: number;
  suppressed: boolean;    // 훼손으로 지워졌는가
}

export type EndingId = 'A_OPEN' | 'B_REVEAL' | 'B_CONTINUE';

export interface FxEvent {
  kind: 'RECORD_BREAK' | 'SEAL_STAMP' | 'SUPERCHAT_POP' | 'DEATH_FLASH'
      | 'PERSONA_INHERIT' | 'TRUTH_WHISPER' | 'FAN_DROP';
  payload?: Record<string, number | string>;
}

export interface RunStats {
  totalRevived: number;
  totalDiscarded: number;
  liesTold: number;
  chatsDeleted: number;
  falseAnnouncements: number;
  goldEarned: number;
  goldSpentOnRevive: number;
  deepestFloor: number;
}
