import type { GameState } from './types';

export function mulberry32(seed: number): () => number {
  return () => {
    let value = seed | 0;
    value = (value + 0x6d2b79f5) | 0;
    let mixed = Math.imul(value ^ (value >>> 15), 1 | value);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export function draw(state: GameState): readonly [number, GameState] {
  const value = mulberry32(state.seed + state.rngCursor)();
  return [value, { ...state, rngCursor: state.rngCursor + 1 }];
}
