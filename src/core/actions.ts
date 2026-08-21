/**
 * 계약 파일 — Project_docs/modules/M02-core-state.md §2 를 그대로 옮긴 것.
 *
 * ★ 이 파일은 Claude Code 와 Codex 가 함께 의존한다.
 *   사람의 승인(CCR) 없이 고치지 않는다. 절차는 07-PARALLEL-DEV.md §5-2.
 *
 * 명명 규약: DOMAIN/VERB 대문자 스네이크 (01-ARCHITECTURE.md §3-2)
 *
 * v3 반영 — CCR-001 (승인 D0).
 *   PHASE/TIMEOUT 삭제 (제한시간 없음, M02 §5)
 *   CASTING/* + SHOP/* → OFFICE/*   ·   DIVE/TICK → LIVE/TICK
 *   COMBAT/CHOOSE 신설   ·   RADIO/ANSWER 는 A|B|UNKNOWN
 *
 * v3.1 반영 — CCR-002 (승인). PHASE/GOTO 신설.
 *   상점 화면이 ①소생 / ②편성 두 단계를 한 화면의 모드로 보여주므로,
 *   하단 4택에서 ②에서 ①로 되돌아갈 길이 필요하다. 임의 점프는 리듀서가 막는다.
 */

import type { CombatChoice, CorpseGrade, GameState, ItemId, PersonaId, PhaseId, StarId } from './types';

export type Action =
  | { type: 'GAME/NEW'; seed: number }
  | { type: 'GAME/LOAD'; state: GameState }
  | { type: 'PHASE/ADVANCE' }                                   // 다음 단계로
  | { type: 'PHASE/GOTO'; phase: PhaseId }                      // 상점 화면(①↔②) 안에서만 오간다
  | { type: 'REVIVE/PAY'; starId: StarId }
  | { type: 'REVIVE/SKIP'; starId: StarId }
  | { type: 'REVIVE/DISCARD'; starId: StarId }
  | { type: 'REVIVE/INHERIT'; personaId: PersonaId; toStarId: StarId }
  | { type: 'OFFICE/CONTRACT_ACCEPT'; starId: StarId }
  | { type: 'OFFICE/CONTRACT_REJECT'; starId: StarId }
  | { type: 'OFFICE/PICK_STAR'; starId: StarId }
  | { type: 'OFFICE/PLACE'; slot: number; itemId: ItemId | null }
  | { type: 'OFFICE/CONFIRM' }
  | { type: 'LIVE/TICK'; dt: number }
  | { type: 'COMBAT/CHOOSE'; choice: CombatChoice }
  | { type: 'RADIO/ANSWER'; dir: 'A' | 'B' | 'UNKNOWN' }
  | { type: 'CHAT/SPAWN' }
  | { type: 'CHAT/DELETE'; id: string }
  | { type: 'CHAT/BAN'; id: string }
  | { type: 'AUTOPSY/DECIDE'; grade: CorpseGrade }
  | { type: 'ANNOUNCE/DECLARE'; as: 'SUCCESS' | 'FAILURE' }
  | { type: 'FX/CONSUME' }
  | { type: 'OPTION/SET'; key: string; value: number | boolean };
