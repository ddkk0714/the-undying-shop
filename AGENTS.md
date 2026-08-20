# AGENTS.md — Codex 작업 규약

프로젝트: **죽지 않는 가게 (undying-shop)** · Phaser 3.90.0 + TypeScript + Vite
마감: **2026-08-26**. 속도보다 **되돌릴 수 없는 실수를 안 하는 것**이 중요하다.

> ⚠️ **이 프로젝트는 Codex와 Claude Code가 동시에 개발한다.**
> 작업 시작 전 `Project_Project_docs/07-PARALLEL-DEV.md`를 반드시 읽어라. 소유권을 어기면 머지 충돌로 반나절이 날아간다.

---

## 0. 너의 영역 (Codex)

### 쓸 수 있는 파일
```
src/core/state.ts  reducer*.ts  store.ts  rng.ts  content.ts  sim.ts
src/core/systems/**        (economy, dive, opinion, roster, narrative)
content/*.json             (manifest.json 은 제외)
tests/**
Project_docs/CODEX_LOG.md
```

### 읽기만 가능 (수정 금지)
```
src/scenes/**  src/ui/**  src/render/**  src/platform/**  src/audio/**
src/main.ts  src/config.ts  index.html  tools/**  public/**
vite.config.ts  tsconfig.json  package.json  content/manifest.json
Project_docs/**  (CODEX_LOG.md 제외)
```

### 계약 파일 — CCR 절차 없이 수정 금지
```
src/core/types.ts
src/core/actions.ts
```
고쳐야 한다고 판단되면 **코드를 고치지 말고** `Project_Project_docs/02-DATA-SCHEMA.md`에 변경안을 적고 사람에게 보고해라. (`07-PARALLEL-DEV.md` §5-2)

### 한 줄
> **너는 게임의 규칙을 짠다. 화면은 짜지 않는다.**

---

## 1. 시작 전 반드시 읽을 것

1. `Project_Project_docs/00-OVERVIEW.md` — 게임 전체. 최우선 진실
2. **`Project_Project_docs/07-PARALLEL-DEV.md` — 소유권과 병렬 규약**
3. `Project_Project_docs/01-ARCHITECTURE.md` — 코어/렌더 분리 원칙
4. `Project_Project_docs/modules/M**.md` — 지금 작업할 모듈 1개. **「담당」행의 "Codex 파트"만 구현한다**
5. `Project_Project_docs/HANDOFF.md` — 상대가 너에게 요청한 게 있는지
6. `Project_Project_docs/05-PRIORITY.md` — 지금 이게 P0인지

문서와 코드가 다르면 **문서가 맞다.**

---

## 2. 절대 규칙 (위반 = 리뷰 거부)

1. **`phaser`를 import 하지 않는다.** 네 영역은 순수 TS다.
2. **자기 소유가 아닌 파일을 수정하지 않는다.** (§0)
3. **`Math.random()` 금지.** `src/core/rng.ts`의 시드 RNG만. 리듀서는 `state.rngCursor`로 소비한다.
4. **`Date.now()`를 리듀서 안에서 부르지 않는다.** 시간은 액션 페이로드로 들어온다.
5. **밸런스 숫자를 코드에 하드코딩하지 않는다.** 전부 `content/balance.json`.
6. **화면·연출·좌표에 관한 코드를 쓰지 않는다.** 그건 Claude Code 영역이다.
7. **새 npm 의존성을 추가하지 않는다.** 필요하면 먼저 물어봐라.
8. **P0가 전부 끝나기 전에 P1 코드를 쓰지 않는다.**
9. **`main`에서 직접 작업한다. 브랜치를 만들거나 전환하지 마라** — 작업 폴더를 상대와 공유하기 때문이다.
   작업 시작 전과 push 직전에 각각 `git pull --rebase origin main` 을 한다.
10. **`git add .` 금지.** `git add src/core content tests` 처럼 경로를 지정한다.
    `git reset --hard` / `git checkout -- .` / `git restore .` / `git stash` / `git clean -fd` /
    `git checkout <브랜치>` / `git switch` 도 **전부 금지** — 상대의 미커밋 작업이 사라진다.
    필요하면 실행하지 말고 사람에게 요청해라.

---

## 3. 작업 절차

```
1) 모듈 문서의 「담당」행에서 네 파트를 확인한다
2) 그 파트의 「수용 기준」중 로직 항목을 체크리스트로 옮겨 적는다
3) 구현한다 (화면 없이 동작해야 한다)
4) 체크리스트를 실제로 검증한다 — 추정 금지
5) npm run typecheck && npm test
6) Project_docs/CODEX_LOG.md 에 오늘 항목 추가
7) 검증 결과를 항목별로 보고한다
```

**네 결과물의 유일한 검증 수단은 테스트다.** 화면을 볼 수 없으므로, 테스트가 없으면 아무것도 증명되지 않는다.
`src/core/sim.ts`(헤드리스 8일 자동 플레이)를 D1에 최우선으로 만들어라. 이후 모든 검증이 여기 얹힌다.

---

## 4. 커밋 규약

```
[codex] M06: 갈림길 판정 + 거짓말 콜백 로직
[codex] M10: balance.json 소생 비용 계수 조정 (sim 1000회 검증)
[codex] fix: rngCursor가 fork 판정에서 두 번 증가하던 문제
```
접두어 `[codex]` + 모듈 ID. 한 커밋에 한 모듈.

---

## 5. 상대 영역이 필요할 때 — HANDOFF

직접 고치지 말고 `Project_Project_docs/HANDOFF.md`에 항목을 추가해라.

```md
## HO-00N  (from: Codex → to: Claude Code)  D3 14:00
**필요한 것**: 무엇을
**이유**: 왜
**상태**: [ ] 미처리
```

---

## 6. 막혔을 때

- 계약(`types.ts`)이 부족해 보이면 → **CCR**. 임의로 필드를 추가하지 마라
- 모듈 문서에 없는 결정이 필요하면 → **가장 단순한 쪽**을 고르고 무엇을 골랐는지 보고해라
- 밸런스가 이상하면 → 코드가 아니라 `content/balance.json`을 고쳐라
- 상대 영역이 아직 없어서 막히면 → 기다리지 마라. `sim.ts`로 검증하고 진행해라

---

## 7. 하지 말아야 할 것

- 리팩터링을 위한 리팩터링
- "나중에 확장하기 좋게" 만드는 추상화 (6일이다)
- 문서에 없는 기능 추가
- 테스트 없이 `core/` 수정
- `// TODO: implement` 로 채운 빈 구현 — 차라리 최소 동작을 넣어라
- Claude Code가 만들 예정인 씬/UI 파일을 "미리 만들어두기"
