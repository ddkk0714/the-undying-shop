#!/usr/bin/env node
/**
 * 반복되는 효과음에서 **한 번만** 잘라 낸다.
 *
 *   node tools/cut-sfx.mjs <원본.wav> <나갈경로.wav> [--ms=90] [--gate=0.06]
 *
 * 대사 타자음처럼 「띡띡띡띡…」이 여러 번 들어 있는 파일을 받았을 때,
 * 글자 하나에 하나씩 내려면 **첫 한 방**만 남겨야 한다. 통째로 재생하면
 * 글자마다 여덟 번씩 울린다.
 *
 * 하는 일은 셋뿐이다.
 *   1. 앞쪽 무음을 건너뛴다 (`--gate` 이상으로 처음 튀는 지점)
 *   2. 거기서 `--ms` 만큼 잘라 낸다
 *   3. 시작 4ms 를 밀어 올리고 끝 20ms 를 내린다 — 안 하면 잘린 자리에서 「딱」 소리가 난다
 *
 * 새 의존성을 쓰지 않는다 (node 기본 모듈만). 16bit PCM WAV 만 다룬다.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

function parseWav(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('WAV 가 아니다');
  }
  let p = 12;
  let fmt = null;
  let data = null;
  while (p + 8 <= buf.length) {
    const id = buf.toString('ascii', p, p + 4);
    const size = buf.readUInt32LE(p + 4);
    if (id === 'fmt ') {
      fmt = {
        format: buf.readUInt16LE(p + 8),
        channels: buf.readUInt16LE(p + 10),
        rate: buf.readUInt32LE(p + 12),
        bits: buf.readUInt16LE(p + 22),
      };
    }
    if (id === 'data') data = { offset: p + 8, length: size };
    p += 8 + size + (size % 2);
  }
  if (fmt === null || data === null) throw new Error('fmt/data 청크가 없다');
  if (fmt.format !== 1 || fmt.bits !== 16) throw new Error(`16bit PCM 만 다룬다 (format=${fmt.format} bits=${fmt.bits})`);
  return { fmt, data };
}

function writeWav(path, fmt, pcm) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(fmt.channels, 22);
  header.writeUInt32LE(fmt.rate, 24);
  header.writeUInt32LE(fmt.rate * fmt.channels * 2, 28);
  header.writeUInt16LE(fmt.channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.concat([header, pcm]));
}

const [src, out] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? fallback : Number(hit.split('=')[1]);
};
if (src === undefined || out === undefined) {
  console.error('사용법: node tools/cut-sfx.mjs <원본.wav> <나갈경로.wav> [--ms=90] [--gate=0.06]');
  process.exit(1);
}

const keepMs = arg('ms', 90);
const gate = arg('gate', 0.06);

const buf = readFileSync(src);
const { fmt, data } = parseWav(buf);
const frameBytes = fmt.channels * 2;
const frames = Math.floor(data.length / frameBytes);
const sampleAt = (frame, ch) => buf.readInt16LE(data.offset + frame * frameBytes + ch * 2) / 32768;

// ① 앞쪽 무음 건너뛰기
let start = 0;
for (; start < frames; start += 1) {
  let peak = 0;
  for (let c = 0; c < fmt.channels; c += 1) peak = Math.max(peak, Math.abs(sampleAt(start, c)));
  if (peak >= gate) break;
}
if (start >= frames) throw new Error(`--gate=${gate} 이상으로 튀는 지점이 없다`);

// ② 자르기
const keep = Math.min(Math.round(fmt.rate * keepMs / 1000), frames - start);
const pcm = Buffer.alloc(keep * frameBytes);

// ③ 앞뒤 페이드 — 안 하면 잘린 자리에서 「딱」 소리가 난다
const fadeIn = Math.round(fmt.rate * 0.004);
const fadeOut = Math.round(fmt.rate * 0.02);
for (let i = 0; i < keep; i += 1) {
  const inGain = fadeIn === 0 ? 1 : Math.min(1, i / fadeIn);
  const outGain = fadeOut === 0 ? 1 : Math.min(1, (keep - 1 - i) / fadeOut);
  const gain = inGain * outGain;
  for (let c = 0; c < fmt.channels; c += 1) {
    const v = buf.readInt16LE(data.offset + (start + i) * frameBytes + c * 2);
    pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * gain))), i * frameBytes + c * 2);
  }
}

writeWav(out, fmt, pcm);
console.log(`  ${src}`);
console.log(`  ${frames} 프레임 중 ${start} 부터 ${keep} 프레임 (${(keep / fmt.rate * 1000).toFixed(0)}ms)`);
console.log(`  -> ${out}   ${Math.round((44 + pcm.length) / 1024)}KB`);
