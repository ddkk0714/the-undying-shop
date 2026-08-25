#!/usr/bin/env node
/**
 * 받은 그림을 슬롯 규격에 **맞춰서** final 팩에 넣는다.
 *
 *   node tools/fit-art.mjs <원본.png> <슬롯키> [옵션]
 *   node tools/fit-art.mjs "아트/장비/장비 도트/도적/뼈단검.png" item.dagger.crack --pixel
 *
 * ── 옵션 ───────────────────────────────────────────────────────
 *   --fit=cover|contain|stretch   목표 종횡비에 맞추는 방법 (기본 cover)
 *   --pixel                       최근접 이웃 축소 — **도트 아트는 이걸 써라**
 *   --dither                      1비트(ink/bone) 디더로 굽는다 — 배경 연출용
 *   --crop=x,y,w,h                한 장에 여러 조각이 들어 있을 때
 *   --canvas=WxH                  한 동작의 여러 단계를 같은 자리에 맞출 때
 *   --out=경로                     슬롯 대신 다른 곳에 쓴다 (넣기 전에 눈으로 볼 때)
 *
 * ── 색에 대하여 ────────────────────────────────────────────────
 * **색상 제약은 없다.** 원본의 색을 그대로 가져간다.
 *
 * 예전에는 여기서 무조건 1비트(ink/bone) 디더로 구웠다. 팔레트 5토큰 규약
 * (00-OVERVIEW §7-1) 때문이었는데, 실제로 받은 아트는 그보다 넓은 계조 램프
 * (`#000000 #161713 #3a3c31 #888c74 #acb192 #c2c8a5`)로 그려져 있었다.
 * 그걸 5토큰으로 밀어 넣으면 **도트의 명암 단계가 무너진다.** 작은 스프라이트일수록
 * 티가 크다 — 붉은 물약은 151색이 3색이 됐다.
 * 그래서 기본은 「그대로」다. 1비트 연출이 필요한 배경만 `--dither` 를 붙인다.
 *
 * ── 축소 방법 ──────────────────────────────────────────────────
 * `--pixel` (최근접) : 도트 아트. 픽셀 경계를 뭉개지 않는다. 계단이 살아 있어야 한다
 * 기본     (면적평균): 일러스트·배경. 부드럽게 줄어든다
 * 도트에 면적평균을 쓰면 흐려지고, 일러스트에 최근접을 쓰면 지글거린다.
 *
 * 새 의존성을 쓰지 않는다 (node:zlib 만 사용).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng, PALETTE, BAYER4 } from './png.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = join(ROOT, 'content', 'manifest.json');

/** decodePng 의 [luma, alpha, rgb] 평면을 RGBA 버퍼 하나로 편다 */
function toRgba(img) {
  const d = Buffer.alloc(img.w * img.h * 4);
  for (let i = 0; i < img.w * img.h; i++) {
    const c = img.rgb[i];
    const o = i * 4;
    d[o] = (c >> 16) & 0xff;
    d[o + 1] = (c >> 8) & 0xff;
    d[o + 2] = c & 0xff;
    d[o + 3] = Math.round(img.alpha[i]);
  }
  return { w: img.w, h: img.h, d };
}

/* ── 리샘플 ─────────────────────────────────────────────────── */

/**
 * 면적 평균 — 원본 사각영역 하나가 목표 픽셀 하나가 되도록 평균을 낸다.
 * 알파를 가중치로 쓴다 (투명한 곳의 색이 실루엣을 흐리지 않게).
 */
function resampleBox(src, dw, dh, rect) {
  const { x0, y0, x1, y1 } = rect;
  const out = Buffer.alloc(dw * dh * 4);
  const sw = x1 - x0, sh = y1 - y0;
  for (let dy = 0; dy < dh; dy++) {
    const sy0 = y0 + (dy * sh) / dh;
    const sy1 = y0 + ((dy + 1) * sh) / dh;
    const iy0 = Math.floor(sy0), iy1 = Math.max(iy0 + 1, Math.ceil(sy1));
    for (let dx = 0; dx < dw; dx++) {
      const sx0 = x0 + (dx * sw) / dw;
      const sx1 = x0 + ((dx + 1) * sw) / dw;
      const ix0 = Math.floor(sx0), ix1 = Math.max(ix0 + 1, Math.ceil(sx1));
      let rs = 0, gs = 0, bs = 0, as = 0, wsum = 0, areaSum = 0;
      for (let sy = iy0; sy < iy1; sy++) {
        if (sy < 0 || sy >= src.h) continue;
        const cy = Math.min(sy + 1, sy1) - Math.max(sy, sy0);
        if (cy <= 0) continue;
        for (let sx = ix0; sx < ix1; sx++) {
          if (sx < 0 || sx >= src.w) continue;
          const cx = Math.min(sx + 1, sx1) - Math.max(sx, sx0);
          if (cx <= 0) continue;
          const i = (sy * src.w + sx) * 4;
          const area = cx * cy;
          const a = src.d[i + 3] / 255;
          rs += src.d[i] * area * a;
          gs += src.d[i + 1] * area * a;
          bs += src.d[i + 2] * area * a;
          as += src.d[i + 3] * area;
          wsum += area * a;
          areaSum += area;
        }
      }
      const o = (dy * dw + dx) * 4;
      // 겹친 넓이의 **합**으로 나눈다. 훑은 칸 수로 나누면 가장자리 칸이 부분만
      // 겹치는 만큼 알파가 통째로 깎여서 불투명한 그림이 절반 뚫린 채로 나온다
      if (wsum > 0) {
        out[o] = Math.round(rs / wsum);
        out[o + 1] = Math.round(gs / wsum);
        out[o + 2] = Math.round(bs / wsum);
      }
      out[o + 3] = areaSum > 0 ? Math.round(as / areaSum) : 0;
    }
  }
  return { w: dw, h: dh, d: out };
}

/** 최근접 이웃 — 도트 아트용. 보간하지 않는다, 픽셀은 픽셀로 남는다 */
function resampleNearest(src, dw, dh, rect) {
  const { x0, y0, x1, y1 } = rect;
  const out = Buffer.alloc(dw * dh * 4);
  const sw = x1 - x0, sh = y1 - y0;
  for (let dy = 0; dy < dh; dy++) {
    const sy = Math.min(src.h - 1, Math.max(0, y0 + Math.floor(((dy + 0.5) * sh) / dh)));
    for (let dx = 0; dx < dw; dx++) {
      const sx = Math.min(src.w - 1, Math.max(0, x0 + Math.floor(((dx + 0.5) * sw) / dw)));
      const si = (sy * src.w + sx) * 4;
      src.d.copy(out, (dy * dw + dx) * 4, si, si + 4);
    }
  }
  return { w: dw, h: dh, d: out };
}

/* ── 조각 다루기 ────────────────────────────────────────────── */

/** 원본 일부만 잘라낸다 — 한 장에 여러 조각이 들어 있을 때 (상단정보바 = 좌/우 패널) */
function cropTo(src, cx, cy, cw, ch) {
  const out = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    const sy = y + cy;
    if (sy < 0 || sy >= src.h) continue;
    for (let x = 0; x < cw; x++) {
      const sx = x + cx;
      if (sx < 0 || sx >= src.w) continue;
      const si = (sy * src.w + sx) * 4;
      src.d.copy(out, (y * cw + x) * 4, si, si + 4);
    }
  }
  return { w: cw, h: ch, d: out };
}

/**
 * 원본을 투명한 WxH 캔버스 가운데에 얹는다.
 * 여러 장이 **한 동작의 단계**일 때 필요하다 — 의심도 1~5 는 눈이 떠지는 5단인데
 * 저마다 내용에 맞게 잘려 와서, 각자 맞추면 감은 눈이 뜬 눈만큼 커진다.
 */
function padToCanvas(src, cw, ch) {
  const out = Buffer.alloc(cw * ch * 4);
  const ox = Math.round((cw - src.w) / 2);
  const oy = Math.round((ch - src.h) / 2);
  for (let y = 0; y < src.h; y++) {
    const dy = y + oy;
    if (dy < 0 || dy >= ch) continue;
    for (let x = 0; x < src.w; x++) {
      const dx = x + ox;
      if (dx < 0 || dx >= cw) continue;
      const si = (y * src.w + x) * 4;
      src.d.copy(out, (dy * cw + dx) * 4, si, si + 4);
    }
  }
  return { w: cw, h: ch, d: out };
}

/** 원본에서 잘라낼 사각형 — 목표 종횡비에 맞춘다 */
function fitRect(sw, sh, dw, dh, mode) {
  if (mode === 'stretch') return { x0: 0, y0: 0, x1: sw, y1: sh };
  const srcAR = sw / sh, dstAR = dw / dh;
  const wider = mode === 'cover' ? srcAR > dstAR : srcAR < dstAR;
  if (wider) {
    const cw = Math.round(sh * dstAR);
    const x = Math.round((sw - cw) / 2);
    return { x0: x, y0: 0, x1: x + cw, y1: sh };
  }
  const chh = Math.round(sw / dstAR);
  const y = Math.round((sh - chh) / 2);
  return { x0: 0, y0: y, x1: sw, y1: y + chh };
}

/**
 * 1비트 Bayer 디더 — **`--dither` 를 줬을 때만** 쓴다.
 * 기본이 아니다. 배경을 판화처럼 굽고 싶을 때의 연출 도구다.
 */
function ditherToInkBone(img) {
  const { w, h, d } = img;
  const out = Buffer.alloc(w * h * 4);
  const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
  const lo = lum(...PALETTE.ink);
  const hi = lum(...PALETTE.bone);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = d[i + 3];
      if (a < 8) continue;
      const t = Math.max(0, Math.min(1, (lum(d[i], d[i + 1], d[i + 2]) - lo) / (hi - lo)));
      const c = t * 16 > BAYER4[y & 3][x & 3] ? PALETTE.bone : PALETTE.ink;
      out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2];
      out[i + 3] = (a / 255) * 16 > BAYER4[y & 3][x & 3] ? 255 : 0;
    }
  }
  return out;
}

/* ── main ───────────────────────────────────────────────────── */
const argv = process.argv.slice(2);
const flags = argv.filter((a) => a.startsWith('--'));
const [srcArg, slotKey] = argv.filter((a) => !a.startsWith('--'));
const fitMode = flags.find((f) => f.startsWith('--fit='))?.slice(6) ?? 'cover';
const pixel = flags.includes('--pixel');
const wantDither = flags.includes('--dither');

if (!srcArg || !slotKey) {
  console.error('사용법: node tools/fit-art.mjs <원본.png> <슬롯키> [--fit=cover|contain|stretch]');
  console.error('        [--pixel] [--dither] [--crop=x,y,w,h] [--canvas=WxH] [--out=경로]');
  process.exit(1);
}
if (!['cover', 'contain', 'stretch'].includes(fitMode)) {
  console.error(`--fit 은 cover|contain|stretch 중 하나여야 한다 (받은 값: ${fitMode})`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const entry = manifest.packs.placeholder.entries[slotKey];
if (entry === undefined) {
  console.error(`슬롯 «${slotKey}» 가 매니페스트에 없다. 있는 슬롯:`);
  for (const k of Object.keys(manifest.packs.placeholder.entries)) console.error('  ' + k);
  process.exit(1);
}
if (!Array.isArray(entry.size)) {
  console.error(`슬롯 «${slotKey}» 에는 고정 크기가 없다 (${entry.type}). 이 도구로는 못 맞춘다.`);
  process.exit(1);
}

const [dw, dh] = entry.size;
let src = toRgba(decodePng(resolve(srcArg), { rgb: true }));

const cropFlag = flags.find((f) => f.startsWith('--crop='))?.slice(7);
if (cropFlag !== undefined) {
  const n = cropFlag.split(',').map(Number);
  if (n.length !== 4 || n.some((v) => !Number.isFinite(v))) {
    console.error(`--crop 은 x,y,w,h 꼴이어야 한다 (받은 값: ${cropFlag})`);
    process.exit(1);
  }
  src = cropTo(src, n[0], n[1], n[2], n[3]);
}

const canvasFlag = flags.find((f) => f.startsWith('--canvas='))?.slice(9);
if (canvasFlag !== undefined) {
  const m = /^(\d+)x(\d+)$/.exec(canvasFlag);
  if (m === null) {
    console.error(`--canvas 는 640x480 꼴이어야 한다 (받은 값: ${canvasFlag})`);
    process.exit(1);
  }
  src = padToCanvas(src, Number(m[1]), Number(m[2]));
}

const rect = fitRect(src.w, src.h, dw, dh, fitMode);
const small = pixel ? resampleNearest(src, dw, dh, rect) : resampleBox(src, dw, dh, rect);
const png = encodePng(dw, dh, wantDither ? ditherToInkBone(small) : small.d);

const outFlag = flags.find((f) => f.startsWith('--out='))?.slice(6);
const dest = outFlag ? resolve(outFlag) : join(ROOT, 'public', manifest.packs.final.root, entry.file);
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, png);

const cut = rect.x1 - rect.x0 !== src.w || rect.y1 - rect.y0 !== src.h;
const how = [pixel ? '최근접' : '면적평균', wantDither ? '1비트 디더' : '색 그대로'].join(' · ');
console.log('');
console.log(`  ${srcArg}`);
console.log(`  ${src.w}x${src.h}  ->  ${dw}x${dh}   (${fitMode} · ${how}` +
  `${cut ? ' · 잘라냄 ' + (rect.x1 - rect.x0) + 'x' + (rect.y1 - rect.y0) : ''})`);
console.log(`  ${slotKey}  ->  ${outFlag ?? 'public/' + manifest.packs.final.root + entry.file}   ${(png.length / 1024).toFixed(0)}KB`);
console.log('');
if (!outFlag) console.log('  npm run art 로 매니페스트에 반영하고, 개발 서버를 재시작해라.\n');
