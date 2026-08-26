#!/usr/bin/env node
/**
 * 애니메이션 GIF 를 가로로 이어붙인 스프라이트시트 PNG 로 굽는다.
 *
 *   node tools/gif-sheet.mjs <원본.gif> <슬롯키> --size=N [--out=경로]
 *
 * `tools/fit-art.mjs` 는 정지 이미지 한 장을 슬롯에 맞추는 도구다. 이건 그
 * 사촌으로, **프레임이 여러 장인 GIF**를 매니페스트의 `spritesheet` 타입
 * 슬롯에 맞춰 굽는다. 슬롯의 `frameWidth`/`frameHeight` 가 정본이다.
 *
 * 프레임마다 서로 다른 영역만 다시 그리는 GIF 특유의 디스포절은
 * `tools/gif.mjs` 가 이미 전체 캔버스로 합성해서 준다 — 여기서는 그
 * 결과를 정사각형으로 리샘플해 가로로 나열하기만 한다.
 *
 * 새 의존성을 쓰지 않는다 (node:zlib 만 — png.mjs 경유).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeGifFile } from './gif.mjs';
import { encodePng } from './png.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = join(ROOT, 'content', 'manifest.json');

/** 면적 평균 축소 — 알파를 가중치로 쓴다 (투명한 곳이 색을 흐리지 않게) */
function resampleBoxSquare(src, sw, sh, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4);
  for (let dy = 0; dy < dh; dy += 1) {
    const sy0 = (dy * sh) / dh;
    const sy1 = ((dy + 1) * sh) / dh;
    const iy0 = Math.floor(sy0);
    const iy1 = Math.max(iy0 + 1, Math.ceil(sy1));
    for (let dx = 0; dx < dw; dx += 1) {
      const sx0 = (dx * sw) / dw;
      const sx1 = ((dx + 1) * sw) / dw;
      const ix0 = Math.floor(sx0);
      const ix1 = Math.max(ix0 + 1, Math.ceil(sx1));
      let rs = 0, gs = 0, bs = 0, as = 0, wsum = 0;
      for (let sy = iy0; sy < iy1 && sy < sh; sy += 1) {
        const cy = Math.min(sy + 1, sy1) - Math.max(sy, sy0);
        if (cy <= 0) continue;
        for (let sx = ix0; sx < ix1 && sx < sw; sx += 1) {
          const cx = Math.min(sx + 1, sx1) - Math.max(sx, sx0);
          if (cx <= 0) continue;
          const area = cx * cy;
          const o = (sy * sw + sx) * 4;
          const a = src[o + 3] / 255;
          rs += src[o] * a * area; gs += src[o + 1] * a * area; bs += src[o + 2] * a * area;
          as += src[o + 3] * area; wsum += a * area;
        }
      }
      const o = (dy * dw + dx) * 4;
      if (wsum > 0) {
        out[o] = Math.round(rs / wsum); out[o + 1] = Math.round(gs / wsum); out[o + 2] = Math.round(bs / wsum);
      }
      const totalArea = (iy1 - iy0) * (ix1 - ix0);
      out[o + 3] = totalArea > 0 ? Math.round(as / totalArea) : 0;
    }
  }
  return out;
}

const argv = process.argv.slice(2);
const flags = argv.filter((a) => a.startsWith('--'));
const [srcArg, slotKey] = argv.filter((a) => !a.startsWith('--'));
const sizeFlag = flags.find((f) => f.startsWith('--size='))?.slice(7);

if (!srcArg || !slotKey) {
  console.error('사용법: node tools/gif-sheet.mjs <원본.gif> <슬롯키> [--size=N] [--out=경로]');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const entry = manifest.packs.placeholder.entries[slotKey];
if (entry === undefined) {
  console.error(`슬롯 «${slotKey}» 가 매니페스트에 없다.`);
  process.exit(1);
}
if (entry.type !== 'spritesheet') {
  console.error(`슬롯 «${slotKey}» 은 spritesheet 타입이 아니다 (${entry.type}).`);
  process.exit(1);
}

const size = sizeFlag ? Number(sizeFlag) : entry.frameWidth;
const gif = decodeGifFile(resolve(srcArg));
const frames = gif.frames;

const sheet = Buffer.alloc(size * frames.length * size * 4);
for (let i = 0; i < frames.length; i += 1) {
  const small = resampleBoxSquare(frames[i].rgba, gif.width, gif.height, size, size);
  for (let y = 0; y < size; y += 1) {
    const srcRow = small.subarray(y * size * 4, (y + 1) * size * 4);
    const destOff = (y * frames.length * size + i * size) * 4;
    srcRow.copy(sheet, destOff);
  }
}

const png = encodePng(size * frames.length, size, sheet);
const outFlag = flags.find((f) => f.startsWith('--out='))?.slice(6);
const dest = outFlag ? resolve(outFlag) : join(ROOT, 'public', manifest.packs.final.root, entry.file);
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, png);

console.log('');
console.log(`  ${srcArg}  (${gif.width}x${gif.height}, ${frames.length}프레임, 프레임당 ${frames.map((f) => f.delayCs * 10).join('/')}ms)`);
console.log(`  -> ${size}x${size} x ${frames.length}  =  ${size * frames.length}x${size}`);
console.log(`  ${slotKey}  ->  ${outFlag ?? 'public/' + manifest.packs.final.root + entry.file}   ${(png.length / 1024).toFixed(0)}KB`);
console.log('');
