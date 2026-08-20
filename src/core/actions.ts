/**
 * 계약 파일 — Project_docs/modules/M02-core-state.md §2 를 그대로 옮긴 것.
 *
 * ★ 이 파일은 Claude Code 와 Codex 가 함께 의존한다.
 *   사람의 승인(CCR) 없이 고치지 않는다. 절차는 07-PARALLEL-DEV.md §5-2.
 *
 * 명명 규약: DOMAIN/VERB 대문자 스네이크 (01-ARCHITECTURE.md §3-2)
 */

import type { GameState, StarId, PersonaId, ItemId, CorpseGrade } from './types';

export type Action =
  | { type: 'GAME/NEW'; seed: number }
  | { type: 'GAME/LOAD'; state: GameState }
  | { type: 'PHASE/ADVANCE' }                                   // 다음 단계로
  | { type: 'PHASE/TIMEOUT' }                                   // 소프트 타이머 만료 → 기본 선택 적용
  | { type: 'REVIVE/PAY'; starId: StarId }
  | { type: 'REVIVE/SKIP'; starId: StarId }
  | { type: 'REVIVE/INHERIT'; personaId: PersonaId; toStarId: StarId }
  | { type: 'CASTING/PICK'; starId: StarId }
  | { type: 'SHOP/PLACE'; slot: number; itemId: ItemId | null }
  | { type: 'SHOP/CONFIRM' }
  | { type: 'DIVE/TICK'; dt: number }
  | { type: 'RADIO/ANSWER'; dir: 'LEFT' | 'RIGHT' | 'UNKNOWN' }
  | { type: 'CHAT/SPAWN' }
  | { type: 'CHAT/DELETE'; id: string }
  | { type: 'CHAT/BAN'; id: string }
  | { type: 'AUTOPSY/DECIDE'; grade: CorpseGrade }
  | { type: 'ANNOUNCE/DECLARE'; as: 'SUCCESS' | 'FAILURE' }
  | { type: 'FX/CONSUME' }
  | { type: 'OPTION/SET'; key: string; value: number | boolean };
