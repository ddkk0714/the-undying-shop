# M01 · App Shell & 픽셀 스케일링 & 한글 폰트

| 항목 | 값 |
|---|---|
| 우선순위 | **P0 — 0순위. 이게 안 되면 아무것도 못 함** |
| 담당 | Claude Code 단독 |
| 의존 | 없음 |
| 예상 소요 | 3~4시간 |
| 담당 파일 | `index.html` `vite.config.ts` `src/main.ts` `src/config.ts` `src/render/scaler.ts` `src/render/palette.ts` `src/scenes/BootScene.ts` `src/scenes/PreloadScene.ts` `src/scenes/TitleScene.ts` |

## 목적
480×270 픽셀 게임이 **어떤 창 크기에서도 흐려지지 않고** 뜨고, **한글이 픽셀 폰트로 선명하게** 나오고, 타이틀에서 게임으로 들어간다.

## 할 일

### 1. 프로젝트 스캐폴딩
```bash
npm create vite@latest undying-shop -- --template vanilla-ts
npm i phaser@3.90.0
npm i -D vitest @types/node
```
`vite.config.ts`에 `base: './'` **필수** (GitHub Pages 하위 경로 배포 대비).

### 2. index.html
- `<div id="game">` 하나만
- `@font-face` 선언
- CSS: `image-rendering: pixelated`, 배경 `#0A0908`, `overflow:hidden`
- `<noscript>` 안내문
- **로딩 중 검은 화면 금지** — 순수 HTML/CSS로 된 로딩 인디케이터 (봉랍 도장 1개가 맥박치는 애니메이션)를 Phaser 부팅 전에 띄우고, `BootScene`에서 제거

### 3. 정수배 스케일러
`01-ARCHITECTURE.md §4-1` 코드 그대로. 추가 요구:
- `resize` 이벤트는 **디바운스 100ms** (창 드래그 중 렉 방지)
- 모바일 세로 화면이면 "가로로 돌려주세요" 오버레이 (심사자가 폰으로 열 수 있다)

### 4. 폰트 로딩
```ts
// BootScene.preload
const fontReady = Promise.race([
  document.fonts.load('16px NeoDunggeunmo').then(() => true),
  new Promise(r => setTimeout(() => r(false), 3000)),
]);
```
결과를 `registry.set('fontOk', ok)`. 실패해도 진행한다.

### 5. PreloadScene
- `Assets.queuePack(this.load)` 호출 (M-ASSET / `03-ASSET-MODULES`)
- `content/*.json` 전부 로드 + 검증
- 로딩바는 봉랍이 차오르는 형태 (`wax` 채움)
- **최소 표시 시간 400ms** — 너무 빨리 지나가면 로고를 못 본다

### 6. TitleScene
```
        죽 지  않 는  가 게
        THE UNDYING SHOP

     [ 새로 시작 ]   [ 이어하기 ]
     [ 옵션 ]        [ 조작 안내 ]

  당신은 한 세계를 속이고 있다.
```
- 배경: 어두운 가게 내부 1컷 + 촛불 깜빡임(2프레임 루프)
- `조작 안내`는 **대회 제출 요건**(조작법 안내 필수)을 충족시키는 화면이다. 반드시 만든다.

## 인터페이스
```ts
// src/config.ts
export const BASE_W = 480, BASE_H = 270;
export const SCENES = { BOOT:'Boot', PRELOAD:'Preload', TITLE:'Title', DAY:'Day', ENDING:'Ending' } as const;

// src/render/palette.ts
export const PALETTE = { soot:0x12100E, ash:0x1E1A17, clay:0x2C2622, line:0x3D342E,
                         bone:0xE6DCC8, dust:0x8A8073, wax:0xC0392F, tallow:0xE0A63C, spirit:0x5F8C7B } as const;
export type PaletteName = keyof typeof PALETTE;
export const hex = (n: PaletteName) => PALETTE[n];
export const css = (n: PaletteName) => '#' + PALETTE[n].toString(16).padStart(6,'0');
```

## 수용 기준
- [ ] 1920×1080 브라우저 전체화면에서 zoom=4, 캔버스 1920×1080, 완전 선명
- [ ] 창을 임의 크기로 줄여도 흐려지거나 잘리지 않고 정수배 유지 + 중앙 정렬
- [ ] 한글 텍스트 "죽지 않는 가게"가 계단 현상 없이 또렷
- [ ] 폰트 파일을 일부러 지워도 게임이 뜬다 (폴백)
- [ ] 타이틀 → `새로 시작` → DayScene 진입까지 클릭 2회
- [ ] `npm run build` 후 `dist/`를 `python3 -m http.server`로 열어도 동작 (상대경로 확인)

## Codex 프롬프트 시드
> `Project_Project_docs/01-ARCHITECTURE.md`와 `Project_Project_docs/modules/M01-app-shell.md`를 읽고 M01을 구현해라. Phaser 3.90.0, TypeScript strict. `src/core/`는 아직 만들지 마라. 스케일러는 반드시 정수배만 허용하고 `Phaser.Scale.FIT`을 쓰지 마라. 완료 후 수용 기준 체크리스트를 하나씩 검증한 결과를 보고해라.
