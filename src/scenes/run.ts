import Phaser from 'phaser';
import { createStore, type Store } from '../core/store';
import { createInitialState } from '../core/state';
import { reducer } from '../core/reducer';

/**
 * 런(진행 중인 한 판)의 스토어를 만들고 보관한다.
 *
 * 스토어는 씬보다 오래 산다 — DayScene 이 재시작돼도, 나중에 단계 씬들이
 * launch/stop 으로 갈려도 같은 스토어를 봐야 한다. 그래서 registry 에 둔다.
 * (01-ARCHITECTURE §3 — 씬은 state 를 소유하지 않는다. 읽고 dispatch 만 한다.)
 */

const KEY = 'run';

/** ?seed=12345 가 있으면 그 값, 없으면 새로 뽑는다 (01-ARCHITECTURE §6) */
function pickSeed(game: Phaser.Game): number {
  const fromUrl = game.registry.get('seed') as unknown;
  if (typeof fromUrl === 'number' && Number.isFinite(fromUrl) && fromUrl > 0) return fromUrl;
  return Math.floor(Math.random() * 0x7fffffff) + 1;
}

/** 새 판을 시작한다. 기존 스토어는 버린다. */
export function newRun(game: Phaser.Game): Store {
  const seed = pickSeed(game);
  const store = createStore(createInitialState(seed), reducer);
  game.registry.set(KEY, store);
  if (import.meta.env.DEV) {
    console.debug(`[run] 새 판 시작 · seed=${seed}`);
    // 디버깅/자동화용. 프로덕션 번들에는 들어가지 않는다.
    (window as unknown as { __store?: Store }).__store = store;
    // 오브젝트 풀링 검증용 — 씬의 표시 목록을 세려면 게임 인스턴스가 필요하다 (M07 수용 기준)
    (window as unknown as { __game?: Phaser.Game }).__game = game;
  }
  return store;
}

/** 진행 중인 판. 없으면 null */
export function currentRun(game: Phaser.Game): Store | null {
  return (game.registry.get(KEY) as Store | undefined) ?? null;
}
