#!/usr/bin/env node
/**
 * 아트 발주서 — 스프레드시트 생성기
 *
 *   npm run art:sheet     (npm run art 가 자동으로 같이 돌린다)
 *
 * content/manifest.json 을 읽어 레포 최상단에 두 파일을 만든다.
 *   아트-발주서.xlsx   ← 엑셀
 *   아트-발주서.csv    ← 구글 시트 · 그 외
 *
 * public/ 이 아니라 레포 최상단인 이유 — public/ 은 통째로 배포물에 실린다.
 * 발주서는 사람에게 건네는 문서지 게임이 읽는 파일이 아니다.
 *
 * 손으로 쓴 표는 규격이 바뀌면 바로 낡는다. 정본은 매니페스트 하나뿐이다.
 * 「상태」열은 final 폴더를 실제로 훑어서 채운다 — 발주 진행 현황이 그대로 보인다.
 *
 * 새 의존성을 쓰지 않는다 (node:zlib 로 zip 을 직접 만든다).
 */
import { deflateRawSync } from 'node:zlib';
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const manifest = JSON.parse(readFileSync(join(ROOT, 'content', 'manifest.json'), 'utf8'));
const base = manifest.packs.placeholder;
const finalRoot = join(PUBLIC, manifest.packs.final.root);

/* ── 현황 파악 ─────────────────────────────────────────────── */
const IGNORE = /\.(md|txt|csv|xlsx|psd|clip|xcf|ai|kra|aseprite|db|ini)$/i;

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (!name.startsWith('.') && !IGNORE.test(name)) out.push(relative(finalRoot, full).split('\\').join('/'));
  }
  return out;
}
const arrived = new Set(walk(finalRoot));

function pngSize(path) {
  try {
    const fd = readFileSync(path);
    if (fd.length < 24 || fd.readUInt32BE(12) !== 0x49484452) return null;
    return [fd.readUInt32BE(16), fd.readUInt32BE(20)];
  } catch {
    return null;
  }
}

/**
 * 그리는 순서. 화면의 인상을 가장 크게 바꾸는 것부터.
 * 1 = 이것부터. 4 = 없어도 티가 안 난다.
 */
function priority(key) {
  if (key.startsWith('star.appeal.')) return 1;
  if (key.startsWith('star.body.') || key.startsWith('star.portrait.')) return 2;
  if (key === 'bg.shop.room' || key === 'bg.shop.bench' || key === 'bg.tower') return 2;
  if (key.startsWith('enemy.') || key.startsWith('ui.button.')) return 3;
  if (key.startsWith('bg.')) return 3;
  return 4;
}

const GROUP = [
  [/^bg\./, '배경'],
  [/^star\.appeal\./, '캐릭터 · 어필 컷'],
  [/^star\.body\./, '캐릭터 · 전신'],
  [/^star\.portrait\./, '캐릭터 · 초상'],
  [/^star\./, '캐릭터 · 기타'],
  [/^enemy\./, '적'],
  [/^ui\.button/, 'UI · 버튼'],
  [/^ui\.panel/, 'UI · 패널'],
  [/^ui\./, 'UI · 기타'],
  [/^prop\./, '소품'],
  [/^sfx\./, '소리'],
];
const groupOf = (key) => GROUP.find(([re]) => re.test(key))?.[1] ?? '기타';

const rows = [];
for (const [key, entry] of Object.entries(base.entries)) {
  const has = arrived.has(entry.file);
  const size = Array.isArray(entry.size)
    ? `${entry.size[0]}×${entry.size[1]}`
    : entry.frameWidth
      ? `${entry.frameWidth * 4}×${entry.frameHeight}`
      : '';
  let status = has ? '도착' : '대기';
  if (has && Array.isArray(entry.size) && entry.file.endsWith('.png')) {
    const actual = pngSize(join(finalRoot, entry.file));
    if (actual !== null && (actual[0] !== entry.size[0] || actual[1] !== entry.size[1])) {
      status = `크기 틀림 (${actual[0]}×${actual[1]})`;
    }
  }
  rows.push({
    순서: priority(key),
    구분: groupOf(key),
    파일: entry.file,
    크기: size,
    화면표시: entry.display ?? '1:1',
    설명: entry.desc ?? '',
    상태: status,
    키: key,
  });
}
rows.sort((a, b) => a.순서 - b.순서 || a.구분.localeCompare(b.구분, 'ko') || a.파일.localeCompare(b.파일));

const COLS = ['순서', '구분', '파일', '크기', '화면표시', '설명', '상태', '키'];
const WIDTHS = [6, 18, 26, 12, 34, 46, 16, 22];

/* ── CSV (엑셀이 한글을 깨뜨리지 않게 BOM 을 붙인다) ───────── */
const csvCell = (v) => {
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.split('"').join('""') + '"' : s;
};
const csv = [COLS.join(','), ...rows.map((r) => COLS.map((c) => csvCell(r[c])).join(','))].join('\r\n');
writeFileSync(join(ROOT, '아트-발주서.csv'), '\uFEFF' + csv, 'utf8');

/* ── XLSX — zip 을 직접 만든다 ─────────────────────────────── */
const CRC_T = (() => {
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
  for (let i = 0; i < buf.length; i++) c = CRC_T[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** 저장 항목 하나 → [로컬 헤더+본문, 중앙 디렉터리 항목] */
function zipEntry(name, content, offset) {
  const nameBuf = Buffer.from(name, 'utf8');
  const raw = Buffer.from(content, 'utf8');
  const deflated = deflateRawSync(raw);
  const crc = crc32(raw);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6); // UTF-8 파일명
  local.writeUInt16LE(8, 8); // deflate
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(deflated.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(deflated.length, 20);
  central.writeUInt32LE(raw.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt32LE(offset, 42);

  return {
    local: Buffer.concat([local, nameBuf, deflated]),
    central: Buffer.concat([central, nameBuf]),
  };
}

function zip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content] of files) {
    const e = zipEntry(name, content, offset);
    locals.push(e.local);
    centrals.push(e.central);
    offset += e.local.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

const esc = (v) =>
  String(v).split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;');
const colName = (i) => String.fromCharCode(65 + i);

function sheetXml() {
  const cell = (ci, ri, value, style) => {
    const ref = `${colName(ci)}${ri}`;
    const s = style === undefined ? '' : ` s="${style}"`;
    if (typeof value === 'number') return `<c r="${ref}"${s}><v>${value}</v></c>`;
    return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
  };
  const head = `<row r="1">${COLS.map((c, i) => cell(i, 1, c, 1)).join('')}</row>`;
  const body = rows
    .map((r, n) => `<row r="${n + 2}">${COLS.map((c, i) => cell(i, n + 2, r[c], r.상태 === '대기' ? 0 : 2)).join('')}</row>`)
    .join('');
  const cols = WIDTHS.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${cols}</cols>
<sheetData>${head}${body}</sheetData>
<autoFilter ref="A1:${colName(COLS.length - 1)}${rows.length + 1}"/>
</worksheet>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="3">
<font><sz val="11"/><name val="맑은 고딕"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="맑은 고딕"/></font>
<font><sz val="11"/><color rgb="FF1F6B3A"/><name val="맑은 고딕"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF2F3B33"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE8F0E2"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const files = [
  ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`],
  ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`],
  ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="아트 발주서" sheetId="1" r:id="rId1"/></sheets>
</workbook>`],
  ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`],
  ['xl/styles.xml', STYLES],
  ['xl/worksheets/sheet1.xml', sheetXml()],
];

writeFileSync(join(ROOT, '아트-발주서.xlsx'), zip(files));

/* ── 보고 ──────────────────────────────────────────────────── */
const done = rows.filter((r) => r.상태 === '도착').length;
const wrong = rows.filter((r) => r.상태.startsWith('크기')).length;
console.log('');
console.log('아트-발주서.xlsx / .csv  →  레포 최상단');
console.log(`  항목 ${rows.length}개 · 도착 ${done} · 대기 ${rows.length - done - wrong}` + (wrong > 0 ? ` · 크기 틀림 ${wrong}` : ''));
const byP = new Map();
for (const r of rows) byP.set(r.순서, (byP.get(r.순서) ?? 0) + 1);
console.log('  순서별: ' + [...byP.entries()].sort().map(([p, n]) => `${p}순위 ${n}개`).join(' · '));
