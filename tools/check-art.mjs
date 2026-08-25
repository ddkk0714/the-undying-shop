#!/usr/bin/env node
/**
 * 본 아트 팔레트 검사 — **파이프라인을 안 거친 그림을 잡는다.**
 *
 *   node tools/check-art.mjs            보고만 한다
 *   node tools/check-art.mjs --strict   위반이 있으면 exit 1  (prebuild 가 이걸 쓴다)
 *   node tools/check-art.mjs --fix      위반 파일을 그 자리에서 고친다
 *   node tools/check-art.mjs --only=bg/  그 경로만 검사·수정 (상대 작업 구역을 피할 때)
 *
 * ── 왜 필요한가 ────────────────────────────────────────────────
 * 00-OVERVIEW §7-1 은 팔레트 5토큰이고, 중간 계조는 Bayer 디더로만 만든다.
 * 그런데 원본 풀컬러 PNG 를 `final/` 에 그냥 떨구면 게임은 **멀쩡히 돈다.**
 * 아무도 안 죽고, 콘솔도 조용하고, 화면만 회색 얼룩이 된다.
 * 실제로 2026-08-26 에 배경 3장(autopsy 47,893색 · live 24,667색 · studio 33,507색)이
 * 그 상태로 며칠 들어 있었다. 눈으로는 「좀 뭉갠 그림」과 구분이 안 된다.
 *
 * 그래서 사람이 지키는 규칙이 아니라 **빌드가 막는 규칙**으로 만든다.
 * 두 에이전트가 같은 팩을 채우는 동안 이게 유일한 공통 방어선이다.
 *
 * ── 왜 「색 개수」가 아니라 「팔레트 밖 픽셀 비율」인가 ─────────────
 * 받은 인물 아트는 가장자리에 리샘플 부스러기가 남아 색이 수백 개로 잡힌다.
 * 그건 화면에서 안 보인다. 반면 파이프라인을 안 거친 풀컬러는 **화면 대부분**이
 * 팔레트 밖이다. 그래서 개수가 아니라 **넓이**로 판정한다.
 */
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { decodePng, encodePng, PALETTE, PALETTE_RGB, BAYER4 } from './png.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = join(ROOT, 'content', 'manifest.json');

/**
 * 팔레트 밖 픽셀이 이 비율을 넘으면 「파이프라인을 안 거쳤다」고 본다.
 * 정상 변환물은 0%, 인물 아트의 리샘플 부스러기는 보통 1~3% 다.
 * 풀컬러 원본은 90% 를 넘는다 — 그 사이는 아주 넓어서 임계값이 예민하지 않다.
 */
const LIMIT = 0.25;

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const finalRoot = join(ROOT, 'public', manifest.packs.final.root);

function walk(dir, out = []) {
  let names;
  try { names = readdirSync(dir); } catch { return out; }
  for (const name of names) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.toLowerCase().endsWith('.png') && !name.startsWith('.')) out.push(full);
  }
  return out;
}

/** 팔레트 밖 픽셀 비율 (완전투명은 세지 않는다) */
function offPaletteRatio(img) {
  let opaque = 0;
  let off = 0;
  for (let i = 0; i < img.w * img.h; i++) {
    if (img.alpha[i] < 8) continue;
    opaque++;
    if (!PALETTE_RGB.has(img.rgb[i])) off++;
  }
  return { ratio: opaque === 0 ? 0 : off / opaque, opaque, off };
}

/**
 * 위반에는 두 종류가 있고, 고치는 법이 다르다.
 *
 *  1) **색을 조금 빗나간 그림** — 받은 아트 대부분이다. 외곽선을 팔레트의 ink(#0f1f17)
 *     대신 순수 검정(#000000)으로 그렸고, 축소 과정에서 가장자리에 중간색이 남았다.
 *     이건 이미 1비트 스타일이므로 **가장 가까운 팔레트 토큰으로 스냅**하면 된다.
 *     다시 디더링하면 멀쩡한 그림을 명암부터 새로 만드는 셈이라 오히려 망가진다.
 *
 *  2) **파이프라인을 아예 안 거친 풀컬러 원본** — 벤치 배경처럼 색이 수만 개다.
 *     스냅하면 5색 포스터라이즈가 되어 계조가 통째로 날아간다. **다시 디더링**해야 한다.
 *
 * 고유색 개수로 가른다. 둘 사이가 아주 넓어서(수천 vs 수만) 임계값이 예민하지 않다.
 */
const SNAP_MAX_COLORS = 4096;

function distinctColors(img) {
  const seen = new Set();
  for (let i = 0; i < img.w * img.h; i++) {
    if (img.alpha[i] < 8) continue;
    seen.add(img.rgb[i]);
    if (seen.size > SNAP_MAX_COLORS) return seen.size;
  }
  return seen.size;
}

/** 팔레트 5토큰 중 가장 가까운 색으로 스냅한다. 알파는 1비트로 자른다 */
function snapToPalette(img) {
  const { w, h, alpha, rgb } = img;
  const tokens = Object.values(PALETTE);
  const cache = new Map();
  const nearest = (c) => {
    const hit = cache.get(c);
    if (hit !== undefined) return hit;
    const r = (c >> 16) & 0xff, g = (c >> 8) & 0xff, b = c & 0xff;
    let best = tokens[0];
    let bestD = Infinity;
    for (const t of tokens) {
      const d = (r - t[0]) ** 2 + (g - t[1]) ** 2 + (b - t[2]) ** 2;
      if (d < bestD) { bestD = d; best = t; }
    }
    cache.set(c, best);
    return best;
  };

  const rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (alpha[i] < 8) continue;
      // 반투명 가장자리는 Bayer 로 1비트화한다 — 남겨 두면 팔레트가 다시 깨진다
      if ((alpha[i] / 255) * 16 <= BAYER4[y & 3][x & 3]) continue;
      const c = nearest(rgb[i]);
      const o = i * 4;
      rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2]; rgba[o + 3] = 255;
    }
  }
  return encodePng(w, h, rgba);
}

/** 같은 크기 그대로 1비트(ink/bone)로 다시 디더링한다 — fit-art 의 --fit=stretch 와 같은 결과 */
function redither(img) {
  const { w, h, luma, alpha } = img;
  const rgba = Buffer.alloc(w * h * 4);
  const lo = 0.299 * PALETTE.ink[0] + 0.587 * PALETTE.ink[1] + 0.114 * PALETTE.ink[2];
  const hi = 0.299 * PALETTE.bone[0] + 0.587 * PALETTE.bone[1] + 0.114 * PALETTE.bone[2];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (alpha[i] < 8) continue;
      const t = Math.max(0, Math.min(1, (luma[i] - lo) / (hi - lo)));
      const c = t * 16 > BAYER4[y & 3][x & 3] ? PALETTE.bone : PALETTE.ink;
      const o = i * 4;
      rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2];
      rgba[o + 3] = (alpha[i] / 255) * 16 > BAYER4[y & 3][x & 3] ? 255 : 0;
    }
  }
  return encodePng(w, h, rgba);
}

const strict = process.argv.includes('--strict');
const fix = process.argv.includes('--fix');

/**
 * `--only=<경로조각>` — 검사·수정을 그 경로에만 건다.
 *
 * 두 사람이 같은 팩을 채우는 동안 **일괄 변환이 제일 위험하다.** 실제로 한 번,
 * 상대가 그 순간 손보고 있던 시계 바늘 PNG 두 장을 전체 `--fix` 가 같이 건드렸다.
 * 결과는 멀쩡했지만 그건 운이었다. 남의 작업 구역이 열려 있으면 범위를 잘라라.
 *
 *   node tools/check-art.mjs --fix --only=bg/      배경만
 *   node tools/check-art.mjs --fix --only=ui/icon  아이콘만
 */
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7) ?? null;

const files = walk(finalRoot)
  .filter((f) => only === null || relative(finalRoot, f).split('\\').join('/').includes(only))
  .sort();
const bad = [];
const unreadable = [];

for (const file of files) {
  let img;
  try {
    img = decodePng(file, { rgb: true });
  } catch (err) {
    unreadable.push({ file, why: err.message });
    continue;
  }
  const { ratio, off } = offPaletteRatio(img);
  if (ratio > LIMIT) bad.push({ file, ratio, off, img });
}

const rel = (f) => relative(join(ROOT, 'public'), f).split('\\').join('/');

console.log('');
console.log(
  `팔레트 검사 — PNG ${files.length}장 · public/${manifest.packs.final.root}` +
    (only === null ? '' : `   (--only=${only})`),
);

if (unreadable.length > 0) {
  console.log('');
  console.log('읽지 못한 파일 (비트뎁스 16 · 인터레이스 등)');
  for (const u of unreadable) console.log('  ? ' + rel(u.file) + '   ' + u.why);
}

if (bad.length === 0 && unreadable.length === 0) {
  console.log('OK — 팔레트 5토큰 밖 픽셀이 넓게 깔린 파일 없음.');
  console.log('');
  process.exit(0);
}

if (bad.length > 0) {
  console.log('');
  console.log('파이프라인을 안 거친 그림 — 팔레트 5토큰 밖 픽셀이 화면 대부분이다');
  for (const b of bad) {
    console.log('  ! ' + rel(b.file).padEnd(44) + (b.ratio * 100).toFixed(1) + '% 가 팔레트 밖');
  }
  console.log('');
  if (fix) {
    let snapped = 0;
    let redithered = 0;
    for (const b of bad) {
      const colors = distinctColors(b.img);
      if (colors > SNAP_MAX_COLORS) {
        writeFileSync(b.file, redither(b.img));
        redithered++;
        console.log('  + 다시 디더링  ' + rel(b.file).padEnd(44) + `고유색 ${colors}+`);
      } else {
        writeFileSync(b.file, snapToPalette(b.img));
        snapped++;
        console.log('  + 팔레트 스냅  ' + rel(b.file).padEnd(44) + `고유색 ${colors}`);
      }
    }
    console.log('');
    console.log(`스냅 ${snapped}장 · 재디더링 ${redithered}장. 개발 서버를 재시작해라.`);
    console.log('');
    process.exit(0);
  }
  console.log('  고치는 법');
  console.log('    npm run art:fix                                    (그 자리에서 스냅/재디더링)');
  console.log('    node tools/fit-art.mjs <원본> <슬롯키> --fit=cover   (원본부터 다시 넣을 때)');
  console.log('');
}

if (strict) {
  console.error('빌드를 멈춘다 — 이대로 배포하면 화면이 회색 얼룩이 된다.');
  process.exit(1);
}
