import type { Action } from './actions';
import type { GameState } from './types';

export type Unsubscribe = () => void;

export interface Store {
  getState(): Readonly<GameState>;
  dispatch(action: Action): void;
  subscribe(fn: (state: Readonly<GameState>, previous: Readonly<GameState>) => void): Unsubscribe;
}

export function createStore(initialState: GameState, reduce: (state: GameState, action: Action) => GameState): Store {
  let state = initialState;
  const listeners = new Set<(state: Readonly<GameState>, previous: Readonly<GameState>) => void>();
  return {
    getState: () => state,
    dispatch: (action) => {
      const previous = state;
      state = reduce(state, action);
      for (const listener of listeners) listener(state, previous);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
