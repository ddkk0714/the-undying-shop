import Phaser from 'phaser';
import manifest from '../../content/manifest.json';
import { PALETTE } from './palette';

/**
 * 03-ASSET-MODULES §3 — 코드는 파일 경로를 모른다. 논리 키만 안다.
 *
 *   ❌ this.add.image(0, 0, 'assets/packs/final/bg/shop.png')
 *   ✅ this.add.image(0, 0, Assets.key('bg.shop'))
 *
 * 미싱 에셋은 절대 throw 하지 않는다. 아트 하나 빠졌다고 심사 중에 게임이 죽으면 안 된다.
 */

export type AssetKey = string;

interface Entry {
  type: 'image' | 'nineslice' | 'spritesheet' | 'audio';
  file: string;
  slice?: number[];
  frameWidth?: number;
  frameHeight?: number;
  loop?: boolean;
}

interface Pack {
  root: string;
  inherit?: string;
  entries: Record<string, Entry>;
}

const PACKS = manifest.packs as unknown as Record<string, Pack>;
const ACTIVE = manifest.activePack as string;

/** 개발 빌드에서 이미 경고한 키 — 콘솔을 도배하지 않는다 */
const warned = new Set<string>();

/** 미싱 키가 쓰였을 때 대신 나가는 텍스처 키 */
export const MISSING_TEXTURE = '__missing__';

function resolve(key: AssetKey, packName = ACTIVE, seen = new Set<string>()): { root: string; entry: Entry } | null {
  if (seen.has(packName)) return null;
  seen.add(packName);
  const pack = PACKS[packName];
  if (!pack) return null;
  const entry = pack.entries?.[key];
  if (entry) return { root: pack.root, entry };
  if (pack.inherit) return resolve(key, pack.inherit, seen);
  return null;
}

/** 매니페스트에 선언된 모든 키 (활성 팩 + inherit 체인) */
export function allKeys(): string[] {
  const keys = new Set<string>();
  let name: string | undefined = ACTIVE;
  const seen = new Set<string>();
  while (name && !seen.has(name)) {
    seen.add(name);
    const pack: Pack | undefined = PACKS[name];
    if (!pack) break;
    for (const k of Object.keys(pack.entries ?? {})) keys.add(k);
    name = pack.inherit;
  }
  return [...keys].sort();
}

/** 논리 키 → Phaser 텍스처 키. 없으면 경고 후 더미 키를 돌려준다 */
export function key(k: AssetKey): string {
  const hit = resolve(k);
  if (!hit) {
    if (import.meta.env.DEV && !warned.has(k)) {
      warned.add(k);
      console.warn(`[assets] missing: ${k}`);
    }
    return MISSING_TEXTURE;
  }
  return k;
}

/**
 * 출연자 한 명이 쓰는 아트 키.
 * 이름 규칙은 여기 한 곳에만 있다 — 씬이 문자열을 조립하지 않는다.
 *   body_karin → star.body.karin / star.portrait.karin / star.appeal.karin
 */
export function starArt(starId: string): {
  body: string;
  portrait: string;
  appeal: string;
  dialogue: string;
  expression: string;
  corpse: string;
} {
  const name = starId.replace(/^body_/, '');
  return {
    body: `star.body.${name}`,
    portrait: `star.portrait.${name}`,
    appeal: `star.appeal.${name}`,
    dialogue: `star.dialogue.${name}`,
    expression: `star.expression.${name}`,
    corpse: `star.corpse.${name}`,
  };
}

/** 워크북 표정 코드(neutral/smile/...)를 캐릭터별 전신 에셋 키로 바꾼다. */
export function starExpression(starId: string, expression: string): string {
  const name = starId.replace(/^body_/, '');
  return `star.expression.${name}.${expression}`;
}

/**
 * 매니페스트에 자리가 있어도 파일이 없으면 텍스처는 로드되지 않는다.
 * 그림을 그리기 전에 반드시 이걸로 물어봐야 미싱 더미가 화면에 뜨지 않는다.
 */
export function hasTexture(scene: Phaser.Scene, k: AssetKey): boolean {
  const textureKey = key(k);
  return textureKey !== MISSING_TEXTURE && scene.textures.exists(textureKey);
}

/**
 * 이 키가 **본 아트**인가, 아니면 inherit 폴백으로 나온 플레이스홀더인가.
 *
 * `hasTexture` 는 둘을 구분하지 못한다 — 플레이스홀더도 엄연히 로드된 텍스처다.
 * 하지만 연출은 구분해야 할 때가 있다. 예: 타이틀 배경이 본 아트면 그림 자체에 불빛이
 * 들어 있으므로 절차적 촛불을 덧그리면 안 되고, 플레이스홀더면 촛불이 유일한 불빛이다.
 */
export function isFinalArt(k: AssetKey): boolean {
  return PACKS[ACTIVE]?.entries?.[k] !== undefined;
}

/** 후보 중 실제로 로드된 첫 키. 전부 없으면 null (본 아트 → 플레이스홀더 → 절차적 순서로 쓴다) */
export function firstTexture(scene: Phaser.Scene, ...keys: AssetKey[]): string | null {
  for (const k of keys) if (hasTexture(scene, k)) return key(k);
  return null;
}

/** nineslice 슬라이스 값 조회 */
export function slice(k: AssetKey): [number, number, number, number] {
  const hit = resolve(k);
  const s = hit?.entry.slice;
  if (!s || s.length !== 4) return [0, 0, 0, 0];
  return [s[0]!, s[1]!, s[2]!, s[3]!];
}

/** Phaser loader 에 활성 팩 전체를 등록 (PreloadScene 에서 1회) */
export function queuePack(loader: Phaser.Loader.LoaderPlugin): number {
  let queued = 0;
  for (const k of allKeys()) {
    const hit = resolve(k);
    if (!hit) continue;
    const url = hit.root + hit.entry.file;
    switch (hit.entry.type) {
      case 'image':
      case 'nineslice':
        loader.image(k, url);
        queued++;
        break;
      case 'spritesheet':
        loader.spritesheet(k, url, {
          frameWidth: hit.entry.frameWidth ?? 16,
          frameHeight: hit.entry.frameHeight ?? 16,
        });
        queued++;
        break;
      case 'audio':
        loader.audio(k, url);
        queued++;
        break;
    }
  }
  return queued;
}

/**
 * 미싱 에셋용 더미 텍스처를 만든다.
 *  - 개발: 자홍색 체크무늬 (눈에 띄어야 한다)
 *  - 프로덕션: soot 빈 사각형 (조용히)
 */
export function createMissingTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(MISSING_TEXTURE)) return;
  const size = 16;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  if (import.meta.env.DEV) {
    g.fillStyle(0xff00ff, 1);
    g.fillRect(0, 0, size, size);
    g.fillStyle(0x000000, 1);
    g.fillRect(0, 0, size / 2, size / 2);
    g.fillRect(size / 2, size / 2, size / 2, size / 2);
  } else {
    g.fillStyle(PALETTE.ink, 1);
    g.fillRect(0, 0, size, size);
  }
  g.generateTexture(MISSING_TEXTURE, size, size);
  g.destroy();
}

/** 로드 실패한 키를 미싱으로 취급하기 위해 로더 에러를 삼킨다 */
export function swallowLoadErrors(scene: Phaser.Scene): string[] {
  const failed: string[] = [];
  scene.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
    failed.push(file.key);
    if (import.meta.env.DEV) console.warn(`[assets] load failed: ${file.key} (${file.url})`);
  });
  return failed;
}

export const Assets = { key, slice, queuePack, allKeys, createMissingTexture, starArt, starExpression, hasTexture, firstTexture, isFinalArt, MISSING_TEXTURE };
