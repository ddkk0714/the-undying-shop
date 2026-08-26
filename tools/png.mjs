/**
 * PNG 디코드·인코드 + 팔레트 상수 — `fit-art.mjs` 와 `check-art.mjs` 가 같이 쓴다.
 *
 * 두 도구가 **같은 팔레트 정의**를 봐야 한다. 한쪽이 만들고 한쪽이 검사하는데
 * 기준이 갈라지면 검사가 통과시키는 파일을 변환기가 못 만든다.
 *
 * 새 의존성을 쓰지 않는다 (node:zlib 만 사용).
 */
import { readFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';

/** 00-OVERVIEW §7-1 팔레트 5토큰 — src/render/palette.ts 와 같은 값이어야 한다 */
export const PALETTE = {
  // 배경·그림자는 **순수 검정**이다. 예전 0x0f1f17 로 구우면 아트의 검정이
  // 초록빛으로 밀려서, 받은 그림과 화면 색이 어긋났다 (사용자 확인)
  ink: [0x00, 0x00, 0x00],
  mid: [0x3a, 0x3c, 0x31],
  bone: [0xc2, 0xc8, 0xa5],
  dust: [0x68, 0x73, 0x5e],
  wax: [0xc0, 0x39, 0x2f],
};

/** 팔레트 색의 24비트 정수 집합 — 픽셀 검사용 */
export const PALETTE_RGB = new Set(Object.values(PALETTE).map(([r, g, b]) => (r << 16) | (g << 8) | b));

/** Bayer 4x4 임계 행렬 — 1비트 계조의 유일한 수단 */
export const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/**
 * PNG 를 [luma, alpha] 두 평면으로 편다.
 * 컬러타입 0/2/3/4/6, 비트뎁스 8, 논인터레이스만 읽는다 — 우리가 다루는 아트는 전부 여기 든다.
 * `rgb` 옵션을 주면 원본 RGB 도 같이 돌려준다 (팔레트 검사에 필요하다).
 */
export function decodePng(path, { rgb = false } = {}) {
  const b = readFileSync(path);
  let off = 8;
  let w = 0, h = 0, depth = 0, ctype = 0, interlace = 0;
  const idat = [];
  let plte = null, trns = null;
  while (off + 8 <= b.length) {
    const len = b.readUInt32BE(off);
    const type = b.toString('ascii', off + 4, off + 8);
    const data = b.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      depth = data[8]; ctype = data[9]; interlace = data[12];
    } else if (type === 'PLTE') plte = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (depth !== 8) throw new Error(`비트뎁스 ${depth} 는 못 읽는다 (8 만 지원): ${path}`);
  if (interlace !== 0) throw new Error(`인터레이스 PNG 는 못 읽는다: ${path}`);
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  if (ch === undefined) throw new Error(`컬러타입 ${ctype} 는 못 읽는다: ${path}`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[p++];
    const row = raw.subarray(p, p + stride);
    p += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0;
      const bb = prev ? prev[x] : 0;
      const c = prev && x >= ch ? prev[x - ch] : 0;
      let v = row[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += bb;
      else if (filter === 3) v += (a + bb) >> 1;
      else if (filter === 4) {
        const pp = a + bb - c;
        const pa = Math.abs(pp - a), pb = Math.abs(pp - bb), pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? bb : c;
      }
      cur[x] = v & 0xff;
    }
  }

  const luma = new Float64Array(w * h);
  const alpha = new Float64Array(w * h);
  const rgbOut = rgb ? new Int32Array(w * h) : null;
  for (let i = 0; i < w * h; i++) {
    let r, g, bl, al = 255;
    if (ctype === 3) {
      const idx = out[i];
      r = plte[idx * 3]; g = plte[idx * 3 + 1]; bl = plte[idx * 3 + 2];
      al = trns && idx < trns.length ? trns[idx] : 255;
    } else if (ctype === 0) { r = g = bl = out[i]; }
    else if (ctype === 4) { r = g = bl = out[i * 2]; al = out[i * 2 + 1]; }
    else if (ctype === 2) { r = out[i * 3]; g = out[i * 3 + 1]; bl = out[i * 3 + 2]; }
    else { r = out[i * 4]; g = out[i * 4 + 1]; bl = out[i * 4 + 2]; al = out[i * 4 + 3]; }
    luma[i] = 0.299 * r + 0.587 * g + 0.114 * bl;
    alpha[i] = al;
    if (rgbOut !== null) rgbOut[i] = (r << 16) | (g << 8) | bl;
  }
  return { w, h, luma, alpha, rgb: rgbOut };
}

/* ── PNG 인코드 (RGBA) ──────────────────────────────────────── */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

export function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    const o = y * (w * 4 + 1);
    raw[o] = 0;
    rgba.copy(raw, o + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
