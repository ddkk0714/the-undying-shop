#!/usr/bin/env node
/**
 * 03-ASSET-MODULES §2 — 본 아트 자동 인식
 *
 *   npm run art
 *
 * public/assets/packs/final/ 안에 있는 파일을 훑어서 content/manifest.json 의
 * `final` 팩 엔트리를 다시 쓴다. **사람이 JSON 을 손댈 일이 없다.**
 *
 * 규칙은 하나뿐이다 — placeholder 팩과 **같은 경로·같은 파일명**으로 넣으면 교체된다.
 * 없는 것은 `inherit` 로 placeholder 가 그대로 나온다. 30%만 도착해도 게임은 100% 돈다.
 *
 * 새 의존성을 쓰지 않는다 (node 표준 모듈만).
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const MANIFEST = join(ROOT, 'content', 'manifest.json');

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const base = manifest.packs.placeholder;
const target = manifest.packs.final;
if (base === undefined || target === undefined) throw new Error('manifest 에 placeholder/final 팩이 있어야 한다');

const finalRoot = join(PUBLIC, target.root);

/** 아트가 아닌 파일 — 설명서·메모는 세지 않는다 */
const IGNORE = /\.(md|txt|psd|clip|xcf|ai|kra|aseprite|db|ini)$/i;

/** 파일 하나의 크기 — PNG 헤더만 읽는다 */
function pngSize(path) {
  try {
    const fd = readFileSync(path);
    if (fd.length < 24 || fd.readUInt32BE(12) !== 0x49484452) return null; // 'IHDR'
    return [fd.readUInt32BE(16), fd.readUInt32BE(20)];
  } catch {
    return null;
  }
}

/** final 폴더 안의 모든 파일을 팩 루트 기준 상대경로로 (슬래시 통일) */
function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (!name.startsWith('.') && !IGNORE.test(name)) out.push(relative(finalRoot, full).split('\\').join('/'));
  }
  return out;
}

const found = new Set(walk(finalRoot));
const byFile = new Map(Object.entries(base.entries).map(([key, entry]) => [entry.file, { key, entry }]));

const replaced = [];
const waiting = [];
const unknown = [];
const wrongSize = [];

const entries = {};
for (const [key, entry] of Object.entries(base.entries)) {
  if (!found.has(entry.file)) {
    waiting.push({ key, file: entry.file, desc: entry.desc ?? '' });
    continue;
  }
  found.delete(entry.file);
  // placeholder 엔트리를 그대로 복사한다 — type·slice·frame 크기는 코드가 의존하는 계약이다
  entries[key] = { ...entry };
  replaced.push({ key, file: entry.file });

  if (Array.isArray(entry.size) && entry.file.endsWith('.png')) {
    const actual = pngSize(join(finalRoot, entry.file));
    if (actual !== null && (actual[0] !== entry.size[0] || actual[1] !== entry.size[1])) {
      wrongSize.push({ key, file: entry.file, want: entry.size, got: actual });
    }
  }
}

// 남은 것 = 매니페스트에 자리가 없는 파일. 대개 파일명/폴더 오타다
for (const file of found) {
  const name = file.split('/').pop();
  const hint = [...byFile.keys()].find((f) => f.split('/').pop() === name);
  unknown.push({ file, hint: hint ?? null });
}

target.entries = entries;
manifest.activePack = 'final';

// 내용이 같으면 쓰지 않는다. 매번 덮어쓰면 줄바꿈만 바뀐 채 git 이 「수정됨」으로 잡고,
// 같은 폴더를 쓰는 상대 에이전트가 「미커밋 변경이 있다」고 오해한다. 실제로 한 번 겪었다.
const nextText = JSON.stringify(manifest, null, 2) + '\n';
const sameAsDisk = readFileSync(MANIFEST, 'utf8').split('\r\n').join('\n') === nextText;
if (!sameAsDisk) writeFileSync(MANIFEST, nextText, 'utf8');

/* ── 보고 ──────────────────────────────────────────────────── */
const pad = (s, n) => String(s).padEnd(n);
const total = Object.keys(base.entries).length;
console.log('');
console.log(`본 아트 ${replaced.length} / ${total}  ·  public/${target.root}`);
console.log('');

if (replaced.length > 0) {
  console.log('교체됨');
  for (const r of replaced) console.log('  + ' + pad(r.key, 24) + r.file);
  console.log('');
}

if (wrongSize.length > 0) {
  console.log('크기가 다르다 — 게임은 돌지만 늘어나거나 잘린다');
  for (const w of wrongSize) {
    console.log('  ! ' + pad(w.key, 24) + w.file + '  기대 ' + w.want.join('x') + ' / 실제 ' + w.got.join('x'));
  }
  console.log('');
}

if (unknown.length > 0) {
  console.log('자리를 못 찾은 파일 — 경로나 이름을 확인해라');
  for (const u of unknown) {
    console.log('  ? ' + u.file + (u.hint ? '   → ' + u.hint + ' 로 넣어야 한다' : '   (매니페스트에 없는 이름)'));
  }
  console.log('');
}

if (waiting.length > 0) {
  console.log(`아직 플레이스홀더 ${waiting.length}개 — 넣으면 바로 바뀐다`);
  for (const w of waiting) console.log('  · ' + pad(w.file, 26) + w.desc);
  console.log('');
}

console.log('activePack = final  (없는 것은 placeholder 로 자동 폴백)');
