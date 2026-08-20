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

## HO-002  (from: Claude Code → to: Codex)  D1 04:00
**필요한 것**: v3 계약 반영으로 컴파일이 깨진 `src/core/` 와 `tests/` 를 **기계적으로만** 살려 뒀다.
아래는 전부 자리만 채운 것이므로 M02/M05/M06 에서 진짜 규칙으로 다시 써야 한다.

- `reducer.ts` — 단계열 6단계(`REVIVE→OFFICE→LIVE→DEATH→AUTOPSY→ANNOUNCE`), `timeout()` 삭제.
  `CASTING/PICK`→`OFFICE/PICK_STAR`(이제 phase 를 바꾸지 않는다), `SHOP/*`→`OFFICE/*`, `DIVE/TICK`→`LIVE/TICK`.
  `startLive()` 의 도달층 산식에서 **아이템 항(depth)을 뺐다** — `ItemDef.depth` 가 사라졌기 때문.
  `OFFICE/CONTRACT_ACCEPT` `OFFICE/CONTRACT_REJECT` `COMBAT/CHOOSE` 는 `return state` 스텁.
  `TodayRun.hero` 는 `{hp:1,maxHp:1,atk:1,def:1}` 자리표시자, `encounter` 는 항상 `null`.
  `DEATH_FLASH` 는 `SIGNAL_LOST` 로 바꿔 뒀다.
- `state.ts` — `waitingSince:null` `visitors:[]` `rejectedStarIds:[]` `stats.appeals` `stats.contractsRejected` 추가.
- `content.ts` — `Star.honesty` 는 `stars.json` 에 필드가 없어 기본 1.0.
  `ItemDef` 의 `hp/atk/def` 는 `items.json` 이 아직 v2(depth) 라 **전부 0 으로 읽힌다.**
  → **M05 에서 `items.json` 12종을 hp/atk/def 로 재작성하면 그때 `assertNumber` 로 다시 조여라.**
  `content.forks` 는 아직 `left/right` 키다. `ForkRecord.truth` 는 `a/b` 로 바뀌었으니 `floors.json` 과 함께 정리 필요.
- `tests/reducer.spec.ts` — 액션 이름만 v3 로 바꾸고 `PHASE/TIMEOUT` 시퀀스를 명시 액션으로 폈다.
- `sim.ts` — `randomPolicy` 를 6단계에 맞춰 바꿨다. 1000회 시뮬은 통과한다.

**이유**: 계약 파일만 바꾸면 `main` 이 빨간 빌드로 올라가 Codex 쪽 `npm test` 가 통째로 막힌다.
**내가 하지 않은 이유**: 규칙·수식은 Codex 소유다. 그래서 **이름만 옮기고 값은 스텁으로 뒀다.**
**상태**: [x] 처리됨 — `items.json` hp/atk/def · `floors.json` a/b · `content.ts` 재검증(`cc4dfbd` `3afeb18`),
마지막 스텁이던 `OFFICE/PICK_STAR` 는 `systems/office.ts` `pickStar` 로 옮겨져 `createHero` 와 계약서 기반
`claimedCeiling` 이 실제로 채워졌다(`f96c761`). 스텁은 하나도 남지 않았다.

> **D1 04:40 · 동기화 메모 (Claude Code)**
> `SCENES.PHASE_*` 와 `src/scenes/phases/**` 는 **`754baa8` 로 이미 main 에 올라가 있다.**
> 이 때문에 typecheck 가 깨져 push 를 보류했다면 `git fetch origin main` 후 다시 판단해라.
> 보류 중이던 `5cd7b75` 도 그 커밋 아래 깔려 함께 올라갔다.
> 현재 `origin/main` 에서 typecheck · `npm test` 12/12 · `npm run build` 전부 통과한다.


## HO-003  (from: Claude Code → to: 사람 · Codex)  D1 05:00
**필요한 것**: 소생실 3택 중 **「폐기」에 해당하는 액션이 계약에 없다.**
`M04-revive.md` 는 되살린다 / 그대로 둔다 / **폐기**(몸 소멸 · 유품 확보 · 페르소나 승계 가능 · 팬덤 -15%)
3택인데 `actions.ts` 에는 `REVIVE/PAY` `REVIVE/SKIP` `REVIVE/INHERIT` 뿐이다.
→ `REVIVE/DISCARD; starId` 신설이 필요하다. **계약 파일이므로 CCR 승인 없이는 못 넣는다.**

**현재 상태**: `RevivePhase` 는 되살린다 / 그대로 둔다 2택만 그린다. 폐기 버튼은 아예 그리지 않았다
(누르면 아무 일도 없는 버튼을 두는 것보다 낫다). 승인되면 버튼 한 개 추가로 끝난다.
**내가 하지 않은 이유**: `src/core/actions.ts` 는 계약 파일 (07-PARALLEL-DEV §5-2)
**상태**: [ ] 미처리

## HO-004  (from: Claude Code → to: Codex)  D1 05:40
**필요한 것**: `src/core/content.ts` 의 `Balance` 타입에 `reputation` 섹션을 노출해 달라.
지금은 `start` / `dive` / `combat` 만 선언돼 있어 `balance.json` 의 `reputation.grades` 를 코드에서 못 읽는다.
가능하면 수치→등급 변환도 core 에 두는 게 맞다 (`reputationGrade(reputation): 'S'|'A'|...`).

**이유**: HUD 는 평판을 **수치가 아니라 등급 문자**로 보여야 한다 (02-DATA-SCHEMA §1).
**임시 조치**: `DayScene` 이 `content/balance.json` 을 직접 import 해서 등급표만 읽고 있다.
core 에 함수가 생기면 그 import 를 지우고 갈아끼운다.
**내가 하지 않은 이유**: `src/core/content.ts` 는 Codex 소유
**상태**: [ ] 미처리

---

# CCR — 계약 변경 요청 대장

계약 파일(`src/core/types.ts`, `src/core/actions.ts`)은 사람 승인 없이 고칠 수 없다.
승인된 변경만 아래에 기록되고, **Claude Code가** 계약 파일에 반영한 뒤 즉시 push 한다.

## CCR-001 · v3 기획 변경  ✅ 승인됨 (D0)

기획자 결정으로 코어 루프가 바뀌었다. **승인 완료. 즉시 반영한다.**

### 1) 하루 사이클 7단계 → **6단계**
```ts
// before
type PhaseId = 'REVIVE'|'CASTING'|'SHOP'|'DIVE'|'DEATH'|'AUTOPSY'|'ANNOUNCE';
// after
type PhaseId = 'REVIVE'|'OFFICE'|'LIVE'|'DEATH'|'AUTOPSY'|'ANNOUNCE';
```
`CASTING`+`SHOP` → `OFFICE`(편성실, 계약심사 포함). `DIVE` → `LIVE`.

### 2) 제한시간 전면 삭제
- `PHASE/TIMEOUT` 액션 **삭제**
- `GameState.waitingSince: number | null` **추가** (생방송 지체 페널티용)
- `ui/TimerBar.ts` 삭제

### 3) 1인칭 턴제 전투 추가
- `CombatChoice`, `Combatant`, `Encounter` 타입 신규
- `COMBAT/CHOOSE` 액션 신규
- `TodayRun`에 `hero`, `encounter`, `appealCount` 추가
- `TodayRun.targetCeiling` → `claimedCeiling` 으로 의미 변경 (계약서상 자기 신고값)

### 4) 계약서 추가
- `Contract` 타입 신규, `GameState.visitors: Contract[]`, `rejectedStarIds: StarId[]`
- `Star.honesty: number` 추가 — **UI 노출 절대 금지**
- `OFFICE/CONTRACT_ACCEPT` `OFFICE/CONTRACT_REJECT` 액션 신규

### 5) 아이템이 `depth` → `hp`/`atk`/`def`
- `ItemDef.depth` **삭제**, `hp`/`atk`/`def` 추가
- `content/items.json` 12종 전부 재작성 (M05 표 참조)

### 6) 기타
- `ForkRecord.truth` 의 `left/right` → `a/b` (좌우는 시드로 스왑되므로)
- `FxEvent.kind` 에 `SIGNAL_LOST` `HIT` `GUARD` `APPEAL_POSE` `CONTRACT_SIGN` 추가, `DEATH_FLASH` 삭제
- `RunStats` 에 `appeals`, `contractsRejected` 추가

**정본은 `Project_docs/02-DATA-SCHEMA.md` 다.** 반영 후 이 항목을 `[x]` 로 바꿔라.

**상태**: [x] 반영됨 (D1, Claude Code) — `types.ts` `actions.ts` 갱신, `ui/layout.ts` 에 `L.live`/`L.office` 추가.
`ui/TimerBar.ts` 는 애초에 생성된 적이 없어 삭제할 것이 없었다.
계약 갱신으로 깨진 `core`/`tests` 의 최소 이식 내역은 **HO-002** 참조.
