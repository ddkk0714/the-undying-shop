#!/usr/bin/env node
/**
 * 흰 배경을 투명으로 바꾼다.
 *
 *   node tools/key-white.mjs <원본.png> <나갈경로.png> [--gate=240]
 *
 * 받은 입 그림(`아트_V3/캐릭터/입`)이 파일마다 제각각이다 — 알파가 살아 있는 것도
 * 있고(비오레), 흰 사각형 배경째로 온 것도 있다(세이로). 그대로 얹으면 얼굴에
 * 흰 상자가 붙는다.
 *
 * **테두리에서 흘려 넣는다.** 가운데를 밝기만으로 지우면 입 안쪽 하이라이트까지
 * 뚫린다. 바깥에서 이어진 밝은 영역만 투명으로 만든다.
 *
 * 새 의존성을 쓰지 않는다 (`tools/png.mjs` 만 쓴다).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const { decodePng, encodePng } = await import(pathToFileURL(resolve(here, 'png.mjs')).href);

const [src, out] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const gateArg = process.argv.find((a) => a.startsWith('--gate='));
const gate = gateArg === undefined ? 240 : Number(gateArg.split('=')[1]);
if (src === undefined || out === undefined) {
  console.error('사용법: node tools/key-white.mjs <원본.png> <나갈경로.png> [--gate=240]');
  process.exit(1);
}

const im = decodePng(src, { rgb: true });
const alpha = new Uint8Array(im.w * im.h);
for (let i = 0; i < im.w * im.h; i += 1) alpha[i] = im.alpha ? im.alpha[i] : 255;

// 테두리에서 시작하는 밝은 영역만 흘려 넣어 지운다
const seen = new Uint8Array(im.w * im.h);
const stack = [];
const push = (x, y) => {
  if (x < 0 || y < 0 || x >= im.w || y >= im.h) return;
  const i = y * im.w + x;
  if (seen[i] === 1) return;
  seen[i] = 1;
  if (alpha[i] === 0 || im.luma[i] >= gate) stack.push(i);
};
for (let x = 0; x < im.w; x += 1) { push(x, 0); push(x, im.h - 1); }
for (let y = 0; y < im.h; y += 1) { push(0, y); push(im.w - 1, y); }

let cleared = 0;
while (stack.length > 0) {
  const i = stack.pop();
  if (alpha[i] !== 0) { alpha[i] = 0; cleared += 1; }
  const x = i % im.w;
  const y = Math.floor(i / im.w);
  push(x - 1, y); push(x + 1, y); push(x, y - 1); push(x, y + 1);
}

const rgba = Buffer.alloc(im.w * im.h * 4);
for (let i = 0; i < im.w * im.h; i += 1) {
  const o = i * 4;
  // `png.mjs` 의 rgb 평면은 픽셀당 **24비트 정수 하나**다 (배열 셋이 아니다).
  // 바이트로 읽으면 그림이 새까맣게 뭉개진다 — 한 번 당했다
  if (im.rgb !== undefined) {
    const c = im.rgb[i];
    rgba[o] = (c >> 16) & 0xff;
    rgba[o + 1] = (c >> 8) & 0xff;
    rgba[o + 2] = c & 0xff;
  } else {
    rgba[o] = im.luma[i]; rgba[o + 1] = im.luma[i]; rgba[o + 2] = im.luma[i];
  }
  rgba[o + 3] = alpha[i];
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, encodePng(im.w, im.h, rgba));

let opaque = 0;
for (let i = 0; i < alpha.length; i += 1) if (alpha[i] > 128) opaque += 1;
console.log(`  ${src}`);
console.log(`  ${im.w}x${im.h}  흰 배경 ${cleared}px 제거  →  남은 그림 ${opaque}px`);
console.log(`  -> ${out}`);
