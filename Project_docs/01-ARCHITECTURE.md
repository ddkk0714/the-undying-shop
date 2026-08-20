# 01 · 기술 아키텍처

## 1. 기술 스택 확정

| 레이어 | 선택 | 버전 | 비고 |
|---|---|---|---|
| 엔진 | **Phaser** | `3.90.0` | 고정. `package.json`에 `"phaser": "3.90.0"` (캐럿 금지) |
| 언어 | TypeScript | `~6.0` | `strict: true` |
| 번들러 | Vite | `^8.2` | `base: './'` (상대경로 배포) |
| 테스트 | Vitest | `^4.1` | `src/core/**` 만 대상 |
| 린트 | ESLint + Prettier | — | 6일 일정상 `--fix` 자동만 |
| 폰트 | 네오둥근모(OFL) 또는 갈무리 | — | §5 참조 |
| 오디오 | Phaser WebAudio | — | `.ogg` + `.m4a` 폴백 |

**추가 런타임 의존성 금지.** 상태관리 라이브러리, DOM UI 프레임워크, 애니메이션 라이브러리 전부 넣지 않는다.
번들이 커지면 브라우저 즉시 실행이라는 대회 요건이 약해진다. 목표 번들: **gzip 1.5MB 이하 (Phaser 포함)**.

---

## 2. 폴더 구조 (이대로 만든다)

```
undying-shop/
├─ index.html
├─ vite.config.ts
├─ tsconfig.json
├─ package.json
├─ AGENTS.md              ← Codex용 규약
├─ CLAUDE.md              ← Claude Code용 규약
├─ Project_docs/          ← 본 문서들 (기획서·모듈 계획서)
├─ content/               ← ★ 게임 데이터 (JSON). 코드 아님
│  ├─ manifest.json       ← 에셋 모듈 매니페스트 (03-ASSET-MODULES)
│  ├─ balance.json        ← 모든 수치 (M10)
│  ├─ floors.json         ← 층 정의, 갈림길 그래프 (M06)
│  ├─ stars.json          ← 스타 몸 데이터 (M03)
│  ├─ personas.json       ← 페르소나 자산 (M03)
│  ├─ items.json          ← 장비/유품 (M05)
│  ├─ chat.ko.json        ← 채팅 코퍼스 (M07)
│  ├─ radio.ko.json       ← 무전 대사 (M06)
│  └─ narrative.ko.json   ← 유언/엔딩/컷신 (M11)
├─ public/
│  └─ assets/             ← 실제 이미지/사운드 파일
│     ├─ packs/
│     │  ├─ placeholder/  ← 회색 박스 더미 (개발 초기)
│     │  └─ final/        ← 최종 아트 (나중에 통째로 갈아끼움)
│     └─ fonts/
└─ src/
   ├─ main.ts             ← Phaser.Game 부트
   ├─ config.ts           ← 게임 설정 상수 (해상도, 스케일)
   ├─ core/               ← ★ Phaser import 절대 금지. 순수 TS
   │  ├─ types.ts
   │  ├─ state.ts         ← GameState 정의 + 초기값
   │  ├─ actions.ts       ← Action 유니온 타입
   │  ├─ reducer.ts       ← (state, action) => state
   │  ├─ store.ts         ← dispatch / subscribe / getState
   │  ├─ bus.ts           ← EventBus (연출용 일회성 이벤트)
   │  ├─ rng.ts           ← mulberry32 시드 RNG
   │  ├─ content.ts       ← content/*.json 로더 + 런타임 검증
   │  └─ systems/
   │     ├─ economy.ts    ← 소생비, 수입 계산 (M10)
   │     ├─ dive.ts       ← 하강 시뮬레이션 (M06)
   │     ├─ opinion.ts    ← 팬/평판/leak (M07)
   │     ├─ roster.ts     ← 스타/페르소나/열화 (M03)
   │     └─ narrative.ts  ← 트리거·엔딩 판정 (M11)
   ├─ scenes/             ← Phaser Scene = 사이클 단계 1:1
   │  ├─ BootScene.ts
   │  ├─ PreloadScene.ts
   │  ├─ TitleScene.ts
   │  ├─ DayScene.ts      ← 호스트 씬. HUD 소유 + 단계 씬 전환 관리
   │  ├─ phases/
   │  │  ├─ RevivePhase.ts
   │  │  ├─ CastingPhase.ts
   │  │  ├─ ShopPhase.ts
   │  │  ├─ DivePhase.ts
   │  │  ├─ DeathPhase.ts
   │  │  ├─ AutopsyPhase.ts
   │  │  └─ AnnouncePhase.ts
   │  └─ EndingScene.ts
   ├─ ui/                 ← 재사용 Phaser UI 컴포넌트 (04-UI-KIT)
   │  ├─ Panel.ts  Button.ts  Label.ts  ListView.ts
   │  ├─ Ticker.ts        ← 채팅 스크롤
   │  ├─ TimerBar.ts      ← 소프트 타이머
   │  └─ SealStamp.ts     ← 봉랍 연출
   ├─ render/
   │  ├─ palette.ts       ← PALETTE 상수 (9색)
   │  ├─ scaler.ts        ← 정수배 스케일 관리
   │  └─ assets.ts        ← Assets.key() — 매니페스트 조회 (03-ASSET-MODULES)
   ├─ platform/           ← M12. Hive 연동 대비 추상화
   │  ├─ IPlatform.ts
   │  ├─ LocalPlatform.ts
   │  └─ index.ts
   └─ audio/
      └─ Sfx.ts
```

---

## 3. 핵심 원칙: 코어와 렌더의 완전 분리

```
┌─────────────────────────────────────────┐
│  src/core/   (순수 TypeScript, 테스트됨)  │
│  GameState + reducer + systems           │
└──────────┬──────────────────▲───────────┘
           │ state 변경 통지    │ dispatch(action)
           ▼                   │
┌─────────────────────────────────────────┐
│  src/scenes/ + src/ui/   (Phaser)        │
│  화면을 그리고 입력을 액션으로 바꾼다      │
└─────────────────────────────────────────┘
```

**왜 이렇게 하는가 (6일 일정 관점):**
- Codex가 게임 로직을 짤 때 Phaser API를 몰라도 된다 → 헛다리 코드가 급감
- 밸런스 검증을 화면 없이 스크립트로 1000회 시뮬 가능 → 6일차 밸런싱이 몇 분에 끝남
- Phaser 버전/API 문제로 막혀도 로직 진도는 안 멈춤

### 3-1. Store 계약

```ts
// src/core/store.ts
export type Unsubscribe = () => void;

export interface Store {
  getState(): Readonly<GameState>;
  dispatch(action: Action): void;
  subscribe(fn: (s: Readonly<GameState>, prev: Readonly<GameState>) => void): Unsubscribe;
}
```

- reducer는 **순수 함수**. 부작용(사운드, 연출, 저장) 금지.
- 연출이 필요한 일회성 사건은 reducer가 `state.pendingFx: FxEvent[]`에 쌓고, 씬이 소비 후 `FX_CONSUMED` 액션으로 비운다.
  (또는 미들웨어 `bus.emit()`. 둘 중 하나로 통일 — **`pendingFx` 방식 채택**. 리플레이/테스트가 쉬워서다.)

### 3-2. Action 명명 규약

`DOMAIN/VERB` 대문자 스네이크. 예: `PHASE/ADVANCE`, `REVIVE/PAY`, `RADIO/ANSWER`, `CHAT/DELETE`, `AUTOPSY/DECIDE`, `ANNOUNCE/DECLARE`.

---

## 4. Phaser 설정 — **1920×1080** (v3.1 아트 개편)

> **왜 바뀌었나**: 아트가 「저해상도 도트」에서 **「고해상도 1비트 디더」** 로 바뀌었다.
> 디더 격자가 1~2px 단위라 480×270 캔버스에는 담기지 않는다. 캔버스를 아트 해상도에 맞춘다.

```ts
// src/config.ts
export const BASE_W = 1920;
export const BASE_H = 1080;

// src/main.ts
new Phaser.Game({
  type: Phaser.AUTO,
  width: BASE_W,
  height: BASE_H,
  parent: 'game',
  backgroundColor: '#12100E',
  pixelArt: true,          // antialias off + roundPixels 유도
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.NONE,   // ★ FIT 쓰지 않는다. 정수배만 허용
    autoCenter: Phaser.Scale.CENTER_BOTH,
    zoom: 1,                   // scaler.ts가 런타임에 정수로 재설정
  },
  scene: [BootScene, PreloadScene, TitleScene, DayScene, EndingScene],
});
```

### 4-1. 스케일러 — 확대는 정수배, **축소는 1/n 단계**

기준이 1920×1080이 되면서 **대부분의 창은 기준보다 작다.** 확대만 정수로 묶으면 화면이 잘린다.
그래서 규칙을 한 줄 넓힌다: **배율은 정수 n 또는 1/n 만 허용한다.** 그 사이 값은 쓰지 않는다.

```ts
// src/render/scaler.ts
export function applyIntegerScale(game: Phaser.Game) {
  const fit = () => {
    const raw = Math.min(window.innerWidth / BASE_W, window.innerHeight / BASE_H);
    // raw >= 1 → 정수 확대(1,2,3...) / raw < 1 → 1/n 축소(1/2, 1/3...)
    const z = raw >= 1 ? Math.floor(raw) : 1 / Math.ceil(1 / raw);
    game.scale.setZoom(z);
    game.scale.refresh();
  };
  fit();
  window.addEventListener('resize', fit);  // 100ms 디바운스
}
```

1/2·1/3 축소는 디더 격자가 **정확히 2px·3px 단위로 병합**되므로 모아레가 생기지 않는다.
`Phaser.Scale.FIT`(임의 실수 배율)은 여전히 금지다.

**주의**: 1920×1080 창(브라우저 크롬 포함)에서는 세로가 모자라 zoom=1/2(960×540)가 된다.
전체화면(F11)이면 zoom=1로 붙는다. 여백은 `#0A0908` 액자로 둔다.

CSS 보강 (index.html):
```css
html,body { margin:0; height:100%; background:#0A0908; overflow:hidden; }
#game { display:grid; place-items:center; height:100%; }
#game canvas { image-rendering: pixelated; image-rendering: crisp-edges; }
```

**주의**: 1080p에서 zoom=4 → 1920×1080 정확히 채움. 1366×768에서는 zoom=2 (960×540) → 여백 발생. 여백은 `soot`보다 어두운 `#0A0908`로 두어 "액자" 느낌을 낸다. 늘리지 않는다.

---

## 5. 한글 픽셀 폰트 — 가장 흔한 함정

Phaser `BitmapText`는 BMFont(`.fnt` + png)를 요구한다. **한글 2,350자 아틀라스는 6일 일정에 맞지 않는다.**

**확정 방식: 웹폰트(TTF) + Phaser `add.text`**

1. `public/assets/fonts/`에 픽셀 한글 TTF 배치
   - 1순위: **네오둥근모(Neo둥근모, OFL 라이선스)** — 상업 사용/재배포 명확, 안전
   - 2순위: 갈무리 9/11 — 사용 시 **배포 조건을 반드시 확인하고 `Project_docs/CREDITS.md`에 기재**
2. `index.html`에 `@font-face` 선언 + `document.fonts.ready`를 `BootScene`에서 await
3. Phaser Text 스타일 고정:
```ts
// v3.1 — 캔버스가 1920 이 되면서 3단계. 전부 네오둥근모 native 16px 의 정수배다.
export const FONT_PX = { label: 16, body: 32, title: 48 } as const;
export const FONT = {
  body:  { fontFamily: 'NeoDunggeunmo', fontSize: '32px', resolution: 1, padding: {x:0,y:4} },
  label: { fontFamily: 'NeoDunggeunmo', fontSize: '16px', resolution: 1, padding: {x:0,y:2} },
  title: { fontFamily: 'NeoDunggeunmo', fontSize: '48px', resolution: 1, padding: {x:0,y:6} },
};
```

**정수배 외 크기를 쓰지 않는다.** 24px·40px 같은 값은 픽셀 폰트를 뭉갠다.
위계는 크기 3단계 + 색(`bone`/`dust`)으로만 만든다.
4. **fontSize는 폰트의 네이티브 픽셀 크기의 정수배만 사용한다.** 네오둥근모는 16px 기준. → 16px만 쓴다. 작은 글씨가 필요하면 폰트를 바꾸는 게 아니라 **정보를 줄인다.**
5. `resolution: 1` 필수. 기본값(devicePixelRatio)이면 흐려진다.

**폰트 로딩 실패 대비**: `BootScene`에서 3초 타임아웃 후 `monospace` 폴백. 게임이 멈추면 안 된다.

---

## 6. 시드 RNG

```ts
// src/core/rng.ts
export function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- 런 시작 시 `state.seed` 결정 → 모든 난수는 `state.rngCursor`를 증가시키며 소비
- 리듀서가 난수를 쓸 땐 커서를 state에 되돌려 저장한다 (순수성 유지)
- URL에 `?seed=12345` 지원 → 버그 재현 및 심사 시연에서 결정적 플레이 가능 (**시연 안정성 카드**)

---

## 7. 저장

- 키: `undying-shop:save:v1`
- 매 단계 종료 시 `JSON.stringify(state)` 저장 (state가 전부 직렬화 가능해야 함 → 함수/클래스 인스턴스 금지)
- 스키마 버전 불일치 → 조용히 폐기하고 새 게임 (6일 일정에 마이그레이션 없음)
- 타이틀 화면에 `이어하기 / 새로 시작` + **`처음부터(심사용)`** 버튼

---

## 8. 테스트 전략 (6일용 최소)

Vitest, `src/core/**`만. 목표 20~30개 케이스.

| 테스트 | 목적 |
|---|---|
| `economy.spec.ts` | 소생 비용 산식이 기준표 3행과 ±5% 이내 일치 |
| `reducer.spec.ts` | 7단계가 순환하고 Day가 올바르게 증가 |
| `dive.spec.ts` | 무전 답변별 도달층 분포가 의도대로 |
| `narrative.spec.ts` | leak 임계값에서 엔딩이 갈림 |
| `sim.spec.ts` | 8일 자동 플레이 1000회 — 파산/무한루프/NaN 없음 |

`sim.spec.ts`가 제일 중요하다. 밸런스 튜닝 루프를 여기서 돌린다.

---

## 9. 성능 가드

- 채팅 텍스트 객체는 **풀링** (최대 12개 재사용, 매 프레임 생성 금지)
- 파티클은 Phaser ParticleEmitter 1개만, 동시 60개 제한
- 타깃: **60fps @ zoom 4, 중급 노트북 통합 그래픽**
- `DivePhase`가 프레임 드랍의 유일한 위험 구간 → 여기만 프로파일링한다
