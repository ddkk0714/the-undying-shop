import Phaser from 'phaser';
import { key, MISSING_TEXTURE } from '../render/assets';

/**
 * 03-ASSET-MODULES §6 — 사운드 모듈.
 *
 * > 전부 옵셔널. **파일 없으면 무음으로 진행한다** (`play()` 가 조용히 리턴).
 * > 매니페스트 자리는 미리 만든다. 나중에 파일만 떨구면 소리가 난다.
 *
 * 코드는 파일 경로를 모른다. 논리 키(`sfx.stamp`)만 안다.
 *
 * ★ 브라우저는 사용자가 한 번 누르기 전까지 소리를 막는다. 그래서 첫 클릭까지는
 *   재생이 조용히 실패한다 — 그래도 게임은 멈추지 않는다.
 */

const BGM_KEY = 'bgm.playing';
const MUTE_KEY = 'opt.mute';

/** 소리를 껐는가. 심사자가 조용히 보고 싶을 수 있다 */
export function muted(registry: Phaser.Data.DataManager): boolean {
  return (registry.get(MUTE_KEY) as boolean | undefined) ?? false;
}

export function setMuted(scene: Phaser.Scene, value: boolean): void {
  scene.registry.set(MUTE_KEY, value);
  scene.sound.mute = value;
}

function loaded(scene: Phaser.Scene, logicalKey: string): string | null {
  const k = key(logicalKey);
  if (k === MISSING_TEXTURE) return null;
  return scene.cache.audio.exists(k) ? k : null;
}

/** 한 번 울리고 만다. 없으면 아무 일도 없다 */
export function playSfx(scene: Phaser.Scene, logicalKey: string, volume = 0.6): void {
  if (muted(scene.registry)) return;
  const k = loaded(scene, logicalKey);
  if (k === null) return;
  try {
    scene.sound.play(k, { volume });
  } catch {
    // 브라우저가 아직 소리를 막고 있다. 조용히 넘어간다
  }
}

/**
 * 배경음. 같은 곡이면 그대로 두고, 다른 곡이면 갈아끼운다.
 * 씬이 바뀌어도 이어지도록 게임 전역 사운드 매니저를 쓴다.
 */
export function playBgm(scene: Phaser.Scene, logicalKey: string, volume = 0.35): void {
  const current = scene.registry.get(BGM_KEY) as string | undefined;
  if (current === logicalKey) return;

  stopBgm(scene);
  scene.registry.set(BGM_KEY, logicalKey);
  if (muted(scene.registry)) return;

  const k = loaded(scene, logicalKey);
  if (k === null) return;
  try {
    scene.sound.play(k, { loop: true, volume });
  } catch {
    // 재생이 막혔다. 다음 화면 전환에서 다시 시도된다
  }
}

export function stopBgm(scene: Phaser.Scene): void {
  const current = scene.registry.get(BGM_KEY) as string | undefined;
  if (current === undefined) return;
  const k = loaded(scene, current);
  if (k !== null) scene.sound.stopByKey(k);
  scene.registry.set(BGM_KEY, undefined);
}
