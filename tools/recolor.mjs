#!/usr/bin/env node
/**
 * 팩에 이미 들어간 그림에서 **색 하나를 다른 색으로** 바꾼다.
 *
 *   node tools/recolor.mjs <파일.png> <#RRGGBB> <#RRGGBB> [...더 많은 파일]
 *
 * 예전 팔레트(ink = #0f1f17)로 구워 넣은 그림이 여럿 있다. 원본을 다시 못 찾는 것들은
 * 그 색만 검정으로 되돌린다 — 형태는 그대로 두고 색만 제자리로 돌린다.
 *
 * 새 의존성을 쓰지 않는다 (`tools/png.mjs` 만 쓴다).
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const { decodePng, encodePng } = await import(pathToFileURL(resolve(here, 'png.mjs')).href);

const args = process.argv.slice(2);
const hexAt = args.findIndex((a) => a.startsWith('#'));
if (hexAt < 0 || args.length < 3) {
  console.error('사용법: node tools/recolor.mjs <파일.png...> <#RRGGBB 원래색> <#RRGGBB 새색>');
  process.exit(1);
}
const files = args.slice(0, hexAt);
const from = parseInt(args[hexAt].slice(1), 16);
const to = parseInt(args[hexAt + 1].slice(1), 16);

for (const f of files) {
  const im = decodePng(f, { rgb: true });
  const rgba = Buffer.alloc(im.w * im.h * 4);
  let hit = 0;
  for (let i = 0; i < im.w * im.h; i += 1) {
    const c = im.rgb[i] === from ? (hit += 1, to) : im.rgb[i];
    const o = i * 4;
    rgba[o] = (c >> 16) & 0xff;
    rgba[o + 1] = (c >> 8) & 0xff;
    rgba[o + 2] = c & 0xff;
    rgba[o + 3] = Math.round(im.alpha ? im.alpha[i] : 255);
  }
  writeFileSync(f, encodePng(im.w, im.h, rgba));
  console.log(`  ${f}  ${hit}px 바꿈`);
}
