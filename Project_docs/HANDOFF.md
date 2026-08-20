# HANDOFF — 에이전트 간 인계 대장

> 상대 영역의 변경이 필요할 때 **직접 고치지 말고** 여기에 적는다. (`07-PARALLEL-DEV.md` §10)
> 동기화 시각(10:00 / 14:00 / 21:00)에 양쪽이 이 파일을 먼저 읽는다.
> 처리한 항목은 지우지 말고 `[x]`로 바꾼다 — `CODEX_LOG.md` 작성 재료가 된다.

## 작성 형식

```md
## HO-00N  (from: A → to: B)  D<일> <시각>
**필요한 것**: 한 문장으로. 파일 경로를 명시할 것
**이유**: 왜 필요한지. 안 하면 무엇이 깨지는지
**내가 하지 않은 이유**: (보통 "내 소유가 아님")
**상태**: [ ] 미처리
```

---

## HO-001  (예시 — 실제 항목이 생기면 이 아래에 추가)
**필요한 것**: `DivePhase`가 `DIVE/TICK`을 프레임마다가 아니라 고정 0.35s 간격으로 dispatch
**이유**: 층 판정이 프레임레이트에 의존하면 같은 seed에서 결과가 달라져 재현이 깨진다
**내가 하지 않은 이유**: `src/scenes/`는 Claude Code 소유
**상태**: [x] 예시 항목 (처리 불필요)

---

## HO-002  (from: Claude Code → to: Codex)  8/20
**필요한 것**: `PHASE/TIMEOUT`이 살아있는 스타가 0명일 때 `SHOP`에서 영구히 멈춘다. 막다른 길이 없도록 고쳐달라.

**재현** (브라우저 `?seed=12345`, DayScene에서 `다음 단계`만 계속 누름 = `PHASE/TIMEOUT` 반복):
```
step 35  day 6  REVIVE    alive 0  dead 5  today null
step 36  day 6  CASTING   alive 0  dead 5  today null
step 37  day 6  SHOP      alive 0  dead 5  today null   ← 여기서 무한 정지
```

**원인** (`src/core/reducer.ts`):
1. `timeout()`의 `CASTING` 분기 → `popularStar()`가 `undefined` (ALIVE 0명) → `advance()`
2. `advance()`는 `nextPhase`로 `SHOP` 진입. 이때 `today`는 여전히 `null`
3. `timeout()`의 `SHOP` 분기 → `SHOP/CONFIRM` → `startDive()`의 첫 줄
   `if (state.today === null) return state;` → **상태가 바뀌지 않는다**
4. 다음 `PHASE/TIMEOUT`도 같은 경로 → 영원히 `SHOP`

**왜 테스트에 안 잡혔나**: `sim.ts`의 `randomPolicy`는 `REVIVE/PAY`를 확률적으로 섞어서 ALIVE를 되살린다.
그런데 M02 §5의 소프트 타이머 기본값 표는 `REVIVE = 가장 싼 선택(소생 안 함)`이라,
**심사자가 아무것도 안 하고 타이머만 흘려보내면 결정적으로 이 막다른 길에 빠진다.** P0 위험이다.

**제안** (택1, 판단은 Codex):
- `startDive()`가 `today === null`이면 그 날을 스킵하고 `ANNOUNCE`/다음 날로 흘려보낸다
- 또는 `timeout()`의 `REVIVE` 기본값을 "ALIVE가 0명이면 가장 싼 시체 1구 소생"으로 바꾼다
- 또는 `advance()`가 `SHOP`에서 `today === null`이면 하루를 공치고 `day+1`

**내가 하지 않은 이유**: `src/core/**`는 Codex 소유 (07-PARALLEL-DEV §3). 게임 규칙 판단이라 씬에서 우회하지 않았다.

**상태**: [ ] 미처리
