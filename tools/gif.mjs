/**
 * 최소 GIF 디코더 — 애니메이션 프레임을 RGBA 캔버스 배열로 푼다.
 *
 * 받은 연출 원본(공격모션 등)이 GIF 로 온다. 이 프로젝트는 새 npm 의존성을
 * 쓰지 않으므로(CLAUDE.md §2-7) 직접 판독한다. LZW 압축은 zlib 과 무관한
 * GIF 고유 방식이라 `node:zlib` 로는 못 푼다 — 여기서 손으로 짠다.
 *
 * 디스포절(disposal) 처리까지 포함해 **매 프레임을 전체 캔버스로 합성**해
 * 돌려준다 — 그래야 뒤에서 프레임마다 크기가 다른 부분 갱신을 신경 안 써도 된다.
 *
 * 새 의존성을 쓰지 않는다.
 */
import { readFileSync } from 'node:fs';

/** LSB-first 비트 리더 — GIF LZW 는 바이트 안에서 하위 비트부터 채운다 */
class BitReader {
  constructor(bytes) {
    this.bytes = bytes;
    this.byteIndex = 0;
    this.bitBuf = 0;
    this.bitCount = 0;
  }
  readCode(size) {
    while (this.bitCount < size) {
      if (this.byteIndex >= this.bytes.length) return null; // 데이터 끝
      this.bitBuf |= this.bytes[this.byteIndex] << this.bitCount;
      this.byteIndex += 1;
      this.bitCount += 8;
    }
    const code = this.bitBuf & ((1 << size) - 1);
    this.bitBuf >>= size;
    this.bitCount -= size;
    return code;
  }
}

/** 서브블록(길이 바이트 + 데이터, 0으로 종료) 스트림을 하나의 바이트 배열로 편다 */
function readSubBlocks(buf, off) {
  const chunks = [];
  let o = off;
  for (;;) {
    const len = buf[o];
    o += 1;
    if (len === 0) break;
    chunks.push(buf.subarray(o, o + len));
    o += len;
  }
  return { data: Buffer.concat(chunks), next: o };
}

/** GIF LZW 압축 해제 — indices 는 컬러 테이블 인덱스 스트림 (expectedLen 개) */
function lzwDecode(data, minCodeSize, expectedLen) {
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let dict = [];
  let dictSize = 0;
  const resetDict = () => {
    dict = new Array(clearCode);
    for (let i = 0; i < clearCode; i += 1) dict[i] = [i];
    dict[clearCode] = null; // clear
    dict[endCode] = null;   // end
    dictSize = endCode + 1;
    codeSize = minCodeSize + 1;
  };
  resetDict();

  const reader = new BitReader(data);
  const out = new Uint8Array(expectedLen);
  let outPos = 0;
  let prev = null;

  for (;;) {
    if (outPos >= expectedLen) break;
    const code = reader.readCode(codeSize);
    if (code === null || code === endCode) break;
    if (code === clearCode) {
      resetDict();
      prev = null;
      continue;
    }
    let entry;
    if (code < dictSize && dict[code] !== null && dict[code] !== undefined) {
      entry = dict[code];
    } else if (code === dictSize && prev !== null) {
      entry = prev.concat([prev[0]]);
    } else {
      break; // 손상된 스트림 — 여기까지만 쓴다
    }
    for (let i = 0; i < entry.length && outPos < expectedLen; i += 1) out[outPos++] = entry[i];
    if (prev !== null) {
      dict[dictSize] = prev.concat([entry[0]]);
      dictSize += 1;
      if (dictSize === (1 << codeSize) && codeSize < 12) codeSize += 1;
    }
    prev = entry;
  }
  return out;
}

/**
 * GIF 바이트를 디코드해 전체 캔버스로 합성한 프레임 배열을 돌려준다.
 * @returns {{ width:number, height:number, frames: Array<{ delayCs:number, rgba:Buffer }> }}
 */
export function decodeGif(buf) {
  if (buf.toString('ascii', 0, 3) !== 'GIF') throw new Error('GIF 시그니처가 아니다');
  const width = buf.readUInt16LE(6);
  const height = buf.readUInt16LE(8);
  const packed = buf[10];
  const gctFlag = (packed & 0x80) !== 0;
  const gctSize = 2 << (packed & 0x07);
  let off = 13;
  let gct = null;
  if (gctFlag) {
    gct = [];
    for (let i = 0; i < gctSize; i += 1) {
      gct.push([buf[off], buf[off + 1], buf[off + 2]]);
      off += 3;
    }
  }

  const canvas = new Uint8ClampedArray(width * height * 4); // 투명(0,0,0,0)으로 시작
  const frames = [];

  let gce = null; // 다음 이미지에 적용할 그래픽 제어 확장
  let prevCanvasSnapshot = null; // disposal=3 복원용
  let prevRegion = null;

  const applyDisposal = () => {
    if (prevRegion === null) return;
    const { disposal, left, top, w, h } = prevRegion;
    if (disposal === 2) {
      // 배경(=투명)으로 되돌린다
      for (let y = top; y < top + h; y += 1) {
        for (let x = left; x < left + w; x += 1) {
          const o = (y * width + x) * 4;
          canvas[o] = 0; canvas[o + 1] = 0; canvas[o + 2] = 0; canvas[o + 3] = 0;
        }
      }
    } else if (disposal === 3 && prevCanvasSnapshot !== null) {
      canvas.set(prevCanvasSnapshot);
    }
    prevRegion = null;
    prevCanvasSnapshot = null;
  };

  for (;;) {
    if (off >= buf.length) break;
    const sep = buf[off];
    off += 1;
    if (sep === 0x3b) break; // trailer
    if (sep === 0x21) {
      const label = buf[off];
      off += 1;
      if (label === 0xf9) {
        const blockSize = buf[off]; // 항상 4
        const p = buf[off + 1];
        const delayCs = buf.readUInt16LE(off + 2);
        const transparentIndex = buf[off + 4];
        off += 1 + blockSize + 1; // size바이트 + 본문 + 종료 0
        gce = {
          disposal: (p >> 2) & 0x07,
          transparent: (p & 0x01) !== 0,
          transparentIndex,
          delayCs,
        };
      } else {
        const r = readSubBlocks(buf, off);
        off = r.next;
      }
      continue;
    }
    if (sep === 0x2c) {
      applyDisposal();

      const left = buf.readUInt16LE(off);
      const top = buf.readUInt16LE(off + 2);
      const w = buf.readUInt16LE(off + 4);
      const h = buf.readUInt16LE(off + 6);
      const ipacked = buf[off + 8];
      off += 9;
      const lctFlag = (ipacked & 0x80) !== 0;
      const interlaced = (ipacked & 0x40) !== 0;
      const lctSize = 2 << (ipacked & 0x07);
      let lct = null;
      if (lctFlag) {
        lct = [];
        for (let i = 0; i < lctSize; i += 1) {
          lct.push([buf[off], buf[off + 1], buf[off + 2]]);
          off += 3;
        }
      }
      const table = lct ?? gct;
      const minCodeSize = buf[off];
      off += 1;
      const r = readSubBlocks(buf, off);
      off = r.next;
      const indices = lzwDecode(r.data, minCodeSize, w * h);

      // disposal=3 이면 그리기 전 캔버스를 스냅샷 해 둔다
      const disposal = gce?.disposal ?? 0;
      if (disposal === 3) prevCanvasSnapshot = Uint8ClampedArray.from(canvas);

      const rows = [];
      if (interlaced) {
        // 인터레이스 순서: 0,8,16,... / 4,12,... / 2,6,10,... / 1,3,5,...
        const passes = [[0, 8], [4, 8], [2, 4], [1, 2]];
        let y = 0;
        for (const [start, step] of passes) {
          for (let yy = start; yy < h; yy += step) rows[yy] = y++;
        }
      }

      for (let yy = 0; yy < h; yy += 1) {
        const srcRow = interlaced ? rows[yy] : yy;
        for (let xx = 0; xx < w; xx += 1) {
          const idx = indices[srcRow * w + xx];
          if (gce?.transparent === true && idx === gce.transparentIndex) continue; // 투명 — 밑그림 유지
          const c = table?.[idx];
          if (c === undefined) continue;
          const cx = left + xx;
          const cy = top + yy;
          if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue;
          const o = (cy * width + cx) * 4;
          canvas[o] = c[0]; canvas[o + 1] = c[1]; canvas[o + 2] = c[2]; canvas[o + 3] = 255;
        }
      }

      frames.push({ delayCs: gce?.delayCs ?? 0, rgba: Buffer.from(canvas) });
      prevRegion = { disposal, left, top, w, h };
      gce = null;
      continue;
    }
    // 알 수 없는 구획 — 더 못 읽는다
    break;
  }

  return { width, height, frames };
}

export function decodeGifFile(path) {
  return decodeGif(readFileSync(path));
}
