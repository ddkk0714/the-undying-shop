# CLAUDE.md — Claude Code 작업 규약

프로젝트: **죽지 않는 가게 (undying-shop)** · Phaser 3.90.0 + TS + Vite · 마감 2026-08-26

> ⚠️ **이 프로젝트는 Claude Code와 Codex가 동시에 개발한다.**
> 작업 시작 전 `Project_Project_docs/07-PARALLEL-DEV.md`를 반드시 읽어라. 소유권을 어기면 머지 충돌로 반나절이 날아간다.

---

## 0. 너의 영역 (Claude Code)

### 쓸 수 있는 파일
```
src/main.ts  src/config.ts
src/scenes/**   src/ui/**   src/render/**   src/platform/**   src/audio/**
tools/**  public/**  index.html
content/manifest.json
vite.config.ts  tsconfig.json  package.json  .github/workflows/**
```

### 읽기만 가능 (수정 금지)
```
src/core/state.ts  reducer*.ts  store.ts  rng.ts  content.ts  sim.ts
src/core/systems/**
content/*.json     (manifest.json 은 예외 — 네 것)
tests/**
Project_docs/**            (제안만, 사람이 반영)
```

### 계약 파일 — 너가 **동결**하고, 이후엔 CCR로만 고친다
```
src/core/types.ts     ← D1 오전에 Project_docs/02-DATA-SCHEMA.md 에서 옮겨 적고 main 에 올린다
src/core/actions.ts   ← D1 오전에 Project_docs/modules/M02 에서 옮겨 적고 main 에 올린다
```
동결 이후에는 사람의 승인(CCR) 없이 고치지 않는다. (`07-PARALLEL-DEV.md` §5)

### 한 줄
> **너는 화면과 통합과 배포를 맡는다. 게임 규칙은 짜지 않는다.**

---

## 1. 시작 전 반드시 읽을 것

1. `Project_Project_docs/00-OVERVIEW.md`
2. **`Project_Project_docs/07-PARALLEL-DEV.md`** — 소유권과 병렬 규약
3. `Project_Project_docs/05-PRIORITY.md` — **오늘 날짜의 계획**
4. `Project_Project_docs/04-UI-KIT.md` — 레이아웃 상수 `L`, 컴포넌트, 연출 프리셋
5. `Project_Project_docs/modules/M**.md` — **「담당」행의 "Claude Code 파트"만 구현한다**
6. `Project_Project_docs/HANDOFF.md` — Codex가 너에게 요청한 게 있는지

문서와 코드가 다르면 **문서가 맞다.**

---

## 2. 절대 규칙

1. **자기 소유가 아닌 파일을 수정하지 않는다.** (§0)
2. **게임 규칙·수식을 `scenes/`나 `ui/`에 구현하지 않는다.** 전부 `core`로 보낸다 → HANDOFF
3. **밸런스 숫자를 씬에 하드코딩하지 않는다.** `content/balance.json`에서 읽는다
4. **에셋은 `Assets.key()`로만 참조한다.** 파일 경로 직접 참조 금지
5. **팔레트 9색(`src/render/palette.ts`) 밖의 색을 쓰지 않는다.** `spirit`은 소생실 전용
6. **좌표는 정수.** 레이아웃은 `src/ui/layout.ts`의 `L` 상수만 사용
7. **새 npm 의존성을 추가하지 않는다**
8. **P0 완료 전 P1 금지**
9. **`main`에 직접 push 하지 않는다** (계약 동결 커밋만 예외). 브랜치는 `cc/<모듈>`
10. **`git add .` 금지.** 경로를 지정한다

---

## 3. Codex를 기다리지 않는 법

`src/core/systems/*.ts`가 아직 없어도 화면은 만들 수 있다.

```ts
// src/scenes/__fake/FakeStore.ts   ← 네 소유. 최종 빌드에서 제외
export const fakeStore: Store = {
  getState: () => FAKE_STATE, dispatch: () => {}, subscribe: () => () => {},
};
```
`FAKE_STATE`는 `types.ts`만 참조한다. 실제 `core`가 도착하면 import 한 줄만 바꾼다.

**Codex 영역 파일을 "임시로" 채우지 마라.** 그게 가장 흔한 충돌 원인이다.

---

## 4. 작업 절차

```
1) 모듈 문서의 「담당」행에서 네 파트를 확인
2) 수용 기준 중 화면 항목을 TodoWrite 로 옮긴다
3) 구현한다
4) 개발 서버를 띄우고 브라우저에서 실제로 확인한다
5) npm run typecheck && npm test
6) 스크린샷과 함께 항목별로 보고한다
```

**"동작할 것이다"라고 쓰지 마라. 확인한 것만 보고해라.**
픽셀 정렬·폰트 뭉개짐·레이아웃 어긋남은 눈으로만 잡힌다. 그게 네가 이 영역을 맡은 이유다.

---

## 5. 커밋 규약

```
[cc] M06: 탑 단면도 프로시저럴 렌더링 + 무전 3택 UI
[cc] M01: 정수배 스케일러 + 리사이즈 디바운스
[cc] contract: GameState 에 viewerFatigue 추가 (CCR-002 승인)
```
접두어 `[cc]` + 모듈 ID. 한 커밋에 한 모듈.

---

## 6. 상대 영역이 필요할 때 — HANDOFF

`core`나 `content/*.json` 변경이 필요하면 직접 고치지 말고 `Project_Project_docs/HANDOFF.md`에 적어라.

```md
## HO-00N  (from: Claude Code → to: Codex)  D3 14:00
**필요한 것**: 무엇을
**이유**: 왜
**상태**: [ ] 미처리
```

---

## 7. 머지 담당

동기화 시각(10:00 / 14:00 / 21:00)에 **머지 순서는 항상 Codex → Claude Code**다.
Codex 브랜치를 main에 먼저 넣고, 네가 rebase 후 통합을 확인한다.
빌드가 깨진 채 main에 올라갔으면 **즉시 revert.** 고치려 하지 말고 되돌리고 나서 고쳐라.

---

## 8. 하지 말 것

- 요청하지 않은 파일 정리·이름 변경·포맷팅 일괄 적용
- README 자동 생성
- 문서에 없는 기능 추가
- P3 목록(`Project_Project_docs/05-PRIORITY.md`)에 있는 것
- Codex 소유 파일 수정 — **막히면 HANDOFF, 직접 고치지 마라**

---

## 9. 개발 명령
```bash
npm run dev         # 개발 서버
npm run build       # 프로덕션 빌드 (dist/)
npm run typecheck   # tsc --noEmit
npm test            # vitest (core만)
npm run sim         # 헤드리스 밸런스 시뮬 1000회
node tools/gen-placeholder.mjs   # 플레이스홀더 에셋 재생성
```
