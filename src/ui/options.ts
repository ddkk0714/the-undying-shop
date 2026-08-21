import type Phaser from 'phaser';

/**
 * 옵션 값의 단일 창구 (05-PRIORITY P0 #16).
 *
 * 값은 registry 에만 둔다 — 게임 규칙이 아니라 표현 강도이기 때문이다.
 * 규칙에 반영해야 하는 것(생방송 지체 페널티)은 core 의 `flags.reducedMotion` 이 따로 있다.
 */
export const OPTION_DEFAULTS = { reducedMotion: false, speed: 1 } as const;

/** 켜면 화면 흔들림·노이즈·깜빡임을 끈다 */
export function reducedMotion(registry: Phaser.Data.DataManager): boolean {
  return (registry.get('opt.reducedMotion') as boolean | undefined) ?? OPTION_DEFAULTS.reducedMotion;
}

/** 자동 진행 배속 (1~3). 하강 틱 간격을 나눈다 */
export function speedMul(registry: Phaser.Data.DataManager): number {
  const value = registry.get('opt.speed') as number | undefined;
  return value !== undefined && value >= 1 && value <= 3 ? value : OPTION_DEFAULTS.speed;
}
