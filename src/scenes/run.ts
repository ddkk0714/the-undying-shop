import Phaser from 'phaser';
import { createStore, type Store } from '../core/store';
import { createInitialState } from '../core/state';
import { reducer } from '../core/reducer';
import type { GameState } from '../core/types';

/**
 * 런(진행 중인 한 판)의 스토어를 만들고 보관한다.
 *
 * 스토어는 씬보다 오래 산다 — DayScene 이 재시작돼도, 나중에 단계 씬들이
 * launch/stop 으로 갈려도 같은 스토어를 봐야 한다. 그래서 registry 에 둔다.
 * (01-ARCHITECTURE §3 — 씬은 state 를 소유하지 않는다. 읽고 dispatch 만 한다.)
 */

const KEY = 'run';
const SAVE_KEY_PREFIX = 'undying-shop:save:v2:slot:';
const ACTIVE_SLOT_KEY = 'undying-shop:save:v2:active-slot';

export type SaveSlot = 1 | 2 | 3;

export interface SaveSlotInfo {
  slot: SaveSlot;
  state: GameState | null;
  savedAt: number | null;
}

const SAVE_SLOTS: readonly SaveSlot[] = [1, 2, 3];

function saveKey(slot: SaveSlot): string {
  return `${SAVE_KEY_PREFIX}${slot}`;
}

function activeSlot(): SaveSlot {
  try {
    const value = Number(localStorage.getItem(ACTIVE_SLOT_KEY));
    return SAVE_SLOTS.includes(value as SaveSlot) ? value as SaveSlot : 1;
  } catch {
    return 1;
  }
}

function setActiveSlot(slot: SaveSlot): void {
  try { localStorage.setItem(ACTIVE_SLOT_KEY, String(slot)); } catch { /* 저장 불가 환경 */ }
}

/** ?seed=12345 가 있으면 그 값, 없으면 새로 뽑는다 (01-ARCHITECTURE §6) */
function pickSeed(game: Phaser.Game): number {
  const fromUrl = game.registry.get('seed') as unknown;
  if (typeof fromUrl === 'number' && Number.isFinite(fromUrl) && fromUrl > 0) return fromUrl;
  return Math.floor(Math.random() * 0x7fffffff) + 1;
}

/** 새 판을 시작한다. 기존 스토어는 버린다. */
function isSavedState(value: unknown): value is GameState {
  if (value === null || typeof value !== 'object') return false;
  const state = value as Partial<GameState>;
  return typeof state.seed === 'number'
    && typeof state.day === 'number'
    && typeof state.phase === 'string'
    && Array.isArray(state.stars)
    && Array.isArray(state.corpses)
    && Array.isArray(state.inventory);
}

function writeSave(state: Readonly<GameState>, slot = activeSlot()): boolean {
  try {
    localStorage.setItem(saveKey(slot), JSON.stringify({ state, savedAt: Date.now() }));
    setActiveSlot(slot);
    return true;
  } catch {
    return false;
  }
}

function registerRun(game: Phaser.Game, store: Store, slot = activeSlot()): Store {
  game.registry.set(KEY, store);
  game.registry.set('run.saveSlot', slot);
  writeSave(store.getState(), slot);
  store.subscribe((state) => { writeSave(state, slot); });
  if (import.meta.env.DEV) {
    console.debug(`[run] active store · seed=${store.getState().seed}`);
    // 디버깅/자동화용. 프로덕션 번들에는 들어가지 않는다.
    (window as unknown as { __store?: Store }).__store = store;
    // 오브젝트 풀링 검증용 — 씬의 표시 목록을 세려면 게임 인스턴스가 필요하다 (M07 수용 기준)
    (window as unknown as { __game?: Phaser.Game }).__game = game;
  }
  return store;
}

/** 새 방송을 시작하고 즉시 저장한다. */
export function newRun(game: Phaser.Game, slot = activeSlot()): Store {
  const seed = pickSeed(game);
  return registerRun(game, createStore(createInitialState(seed), reducer), slot);
}

/** 저장된 상태는 reducer의 GAME/LOAD 경로로만 복원한다. */
export function loadRun(game: Phaser.Game, slot = activeSlot()): Store | null {
  try {
    const raw = localStorage.getItem(saveKey(slot));
    if (raw === null) return null;
    const payload: unknown = JSON.parse(raw);
    const saved = (payload as { state?: unknown }).state;
    if (!isSavedState(saved)) return null;
    const store = createStore(createInitialState(saved.seed), reducer);
    store.dispatch({ type: 'GAME/LOAD', state: saved });
    return registerRun(game, store, slot);
  } catch {
    return null;
  }
}

/** 타이틀에서 이어하기 활성화에만 쓴다. */
export function hasSavedRun(): boolean {
  return listSaveSlots().some(({ state }) => state !== null);
}

/** HUD 저장 아이콘의 명시적 저장 동작. 자동 저장도 동시에 유지한다. */
export function saveRun(store: Store, slot = activeSlot()): boolean {
  return writeSave(store.getState(), slot);
}

export function listSaveSlots(): SaveSlotInfo[] {
  return SAVE_SLOTS.map((slot) => {
    try {
      const raw = localStorage.getItem(saveKey(slot));
      if (raw === null) return { slot, state: null, savedAt: null };
      const payload: unknown = JSON.parse(raw);
      const record = payload as { state?: unknown; savedAt?: unknown };
      return isSavedState(record.state)
        ? { slot, state: record.state, savedAt: typeof record.savedAt === 'number' ? record.savedAt : null }
        : { slot, state: null, savedAt: null };
    } catch {
      return { slot, state: null, savedAt: null };
    }
  });
}

/** 진행 중인 판. 없으면 null */
export function currentRun(game: Phaser.Game): Store | null {
  return (game.registry.get(KEY) as Store | undefined) ?? null;
}
