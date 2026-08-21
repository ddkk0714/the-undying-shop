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
**임시 조치**: `DayScene` 이 `content/balance.json` 을 직접 import 해서 등급표만 읽고 있었다.
**내가 하지 않은 이유**: `src/core/content.ts` 는 Codex 소유
**상태**: [x] 처리됨 (`15dd319`) — `Balance.reputation` 노출 + `reputationGrade()` 헬퍼.
`DayScene` 의 임시 import 는 제거하고 헬퍼로 갈아끼웠다.

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

## CCR-002 · 상점 화면 4택에서 ①소생으로 되돌아가기  ✅ 승인됨 (D1)

v3.1 아트 개편으로 ①소생과 ②편성이 **한 화면(상점)의 모드**가 됐다 (`00-OVERVIEW §8-2`).
그런데 리듀서의 단계는 여전히 단방향이라, 하단 4택의 `蘇生` 버튼에서 ①로 돌아갈 액션이 없었다.

```ts
// src/core/actions.ts 추가
| { type: 'PHASE/GOTO'; phase: PhaseId }   // 상점 화면(①↔②) 안에서만 오간다
```

**리듀서 제약** — `gotoPhase()` 가 `REVIVE ↔ OFFICE` 두 단계 사이만 허용한다.
그 밖의 점프(예: ANNOUNCE → LIVE)는 하루 사이클을 깨므로 `state` 를 그대로 돌려준다.
`PhaseId` 자체는 바뀌지 않았다. **6단계 구조는 그대로다.**

**상태**: [x] 반영됨 (D1, Claude Code) — `actions.ts` + `reducer.ts` `gotoPhase()` + `OfficePhase` 蘇生 버튼.
`reducer.ts` 는 Codex 소유라 **가드 한 함수만** 넣었다. 규칙을 바꾸고 싶으면 그쪽에서 다시 써라.

### CCR-002 변경 범위 — Codex 확인용 (D2, `1d29c62`)

M06(하강/무전)이 같은 리듀서를 만지므로, **Codex 소유 파일에 내가 남긴 자국의 전부**를 적어둔다.
아래 네 지점 밖에는 손대지 않았다. `git show 1d29c62 -- src/core/` 로 검증 가능.

| 파일 | 지점 | 내용 | M06과 겹치나 |
|---|---|---|---|
| `src/core/actions.ts` | L25 | `PHASE/GOTO { phase: PhaseId }` 유니온 1줄 추가 | 아니오 |
| `src/core/actions.ts` | L11–L16 | 파일 헤더 주석에 CCR-002 3줄 | 아니오 |
| `src/core/actions.ts` | L17 | import 에 `PhaseId` 추가 | 아니오 |
| `src/core/reducer.ts` | L14–L23 | `SHOP_PHASES` 상수 + `gotoPhase()` 신규 함수 (기존 코드 위 삽입) | 아니오 |
| `src/core/reducer.ts` | L63 | `switch` 에 `case 'PHASE/GOTO'` 1줄 (`PHASE/ADVANCE` 바로 아래) | **가능** |

**기존 함수는 하나도 고치지 않았다.** `advance()` `nextPhase()` `phaseOrder` `withPhase()`
`latestTodayCorpse()` 및 모든 기존 `case` 는 그대로다. 순수 추가(+19줄, -0줄).

**충돌 가능 지점은 `reducer.ts` L63 한 줄뿐**이다 — M06이 `LIVE/*` `RADIO/*` `COMBAT/*` case 를
같은 `switch` 에 넣으면 여기서 만난다. 그 경우 **내 줄을 지우지 말고 아래에 붙여라.**
`case 'PHASE/GOTO'` 가 사라지면 상점 화면의 `蘇生` 버튼이 무반응이 된다 (M05 수용 기준).

**M06 쪽에 거는 제약 없음.** `gotoPhase()` 는 `REVIVE`/`OFFICE` 밖에서는 `state` 를 그대로 반환하므로
`LIVE` 이후 단계의 흐름·강제 사망·목격 판정에 전혀 관여하지 않는다.
`SHOP_PHASES` 게이트를 다시 쓰고 싶으면 그쪽 판단대로 해라 — 다만 `REVIVE ↔ OFFICE` 양방향은 유지해야 한다.

**상태**: [x] 정보 제공 — 처리 불필요


---

## HO-005  (from: Claude Code → to: Codex)  D2

**필요한 것**: `Encounter.line` 을 채워 달라. 그리고 `content/radio.ko.json` 에 전투 대사 배열.

M06 §4-5 는 턴마다 용사가 상황에 맞는 한 줄을 던지게 돼 있다. 계약에 자리(`Encounter.line`)는
있는데 `createEncounter` 가 `''` 로 두고 `resolveCombatChoice` 도 그대로 흘린다. 그래서 지금은
**전투 칸에 대사가 한 줄도 안 나온다.**

`radio.ko.json` 에도 전투 대사가 없다 (`forkAsk` `lieCallback` `degrade4` `witness` `deathCry`
`unknownReply` 뿐). 문서 표의 5가지 상황이 필요하다:

```jsonc
"combat": {
  "hpHigh":     ["사장님, 이 정도는 갑니다. 갈까요?"],
  "hpMid":      ["좀... 버거운데요. 어떡할까요?"],
  "hpLow":      ["사장님. 저 지금 죽으면 회수해주시는 거 맞죠?"],
  "afterAppeal":["이거면... 오늘 좀 벌었나요?"]
}
```
`degrade4` 는 이미 있으니 열화 4+ 일 때 그걸 쓰면 된다.

**이유**: 씬에서 대사를 고르면 안 된다 — 고르려면 RNG 가 필요하고 RNG 는 core 것이다.
층·턴으로 결정적으로 고르는 것도 해봤지만, 그건 규칙을 화면에 옮기는 짓이라 하지 않았다.
`LivePhase` 는 `line` 이 비면 아무것도 그리지 않는다. 채워지는 즉시 화면에 뜬다.

**곁들여** — `enemiesByZone` 은 에셋 키(`enemy.husk`)만 준다. 지금 전투 칸 제목이 `HUSK` 로
나온다. 한글 표시명이 필요하다 (`content` 소유라 내가 못 만든다).

**상태**: [ ] 미처리

## HO-006  (from: Claude Code → to: Codex)  D2

**필요한 것**: 「지연된 죄책감」이 발생할 수 있게 해 달라. 지금은 **구조적으로 불가능하다.**

M06 §5 의 최고 장치 — 거짓말한 용사를 되살리면 다음 방송 첫 무전에서 콜백 대사가 나온다.
두 가지가 막고 있다:

1. `answerRadio` 가 `wasLie: false` 를 하드코딩한다. 거짓말 판정이 아예 없다
2. `TodayRun.forks` 는 하루가 끝나면 사라진다 (`office.ts` 가 매일 `forks: []` 로 새로 만든다).
   어제 무엇을 말했는지 아무 데도 남지 않는다

`Star` 나 `GameState` 에 「이 몸에게 한 거짓말」이 남아야 한다. 계약 변경이 필요하면 CCR 로 올려라
— 내가 `types.ts` 를 고칠 일이라면 그때 하겠다.

`radio.ko.json` 의 `lieCallback` 5줄은 이미 있는데 **아무도 읽지 않는다.**

**상태**: [ ] 미처리

## HO-007  (from: Claude Code → to: Codex)  D2

**필요한 것**: 「나도 몰라」의 대가. M06 §5 는 *50% 랜덤 + 팬 -0.5% + 채팅 "사장 왜 저럼"* 이다.

지금 `answerRadio(state, 'UNKNOWN')` 은 `reachDelta 0` 으로 아무 일도 일어나지 않는다.
게다가 `told` 가 `'UNKNOWN'` 인 채로 남아서 **그 갈림길이 답한 것으로 기록되지 않는다.**
(가드가 `record.told !== 'UNKNOWN'` 이라, 같은 기록에 다시 답할 수도 있다)

화면 쪽은 `waitingSince` 로 무전창을 여닫으므로 당장 깨지지는 않는다. 기록만 어긋난다.

**상태**: [ ] 미처리

## HO-008  (from: Claude Code → to: Codex)  D2

**필요한 것**: `CHAT/SPAWN` `CHAT/DELETE` `CHAT/BAN` 이 전부 `return state` 다 (M07).

`LivePhase` 의 채팅 칸은 다 그려 놨다 — `chatQueue` 를 읽고, `TRUTH` 톤은 `wax` 로 칠하고,
28F 통과 후 3초 침묵도 걸어 뒀다. 큐가 채워지는 순간 그대로 흐른다. 지금은 항상
`채팅이 조용하다` 만 뜬다. `content/chat.ko.json` 은 이미 톤별로 다 들어와 있다.

**상태**: [ ] 미처리

## HO-009  (from: Claude Code → to: Codex)  D2

**필요한 것**: `OPTION/SET` 이 `return state` 라 `flags.reducedMotion` 을 켤 방법이 없다.

`dive.ts` 의 `waitingPenalty` 는 `state.flags.reducedMotion === true` 면 지체 페널티를 건너뛴다.
그런데 그 플래그를 세우는 길이 리듀서에 없다. M06 수용 기준
「옵션 `연출 감소` 를 켜면 지체 페널티가 꺼진다」가 지금은 **불가능하다.**

화면 흔들림·지지직·깜빡임은 내가 registry(`opt.reducedMotion`)로 이미 끄고 있다.
규칙에 걸린 페널티만 core 가 필요하다.

**상태**: [ ] 미처리


## HO-010  (from: Claude Code → to: Codex)  D2  ★ D2 완주를 막는 유일한 버그

**필요한 것**: **실제 사망이 `Corpse` 를 만들지 않는다.** `reducer.ts` `finishLive()` 첫 줄.

```ts
function finishLive(state: GameState): GameState {
  if (state.today === null || state.today.diedFloor !== null) return withPhase(state, 'DEATH');
  //                          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ 진짜로 죽으면 여기서 빠져나간다
```

`diedFloor` 를 세우는 쪽은 **전투 사망(`chooseCombat`)과 하강 한계(`tickLive`) 둘 다**이고,
그 둘이 이미 `phase: 'DEATH'` 로 바꿔 놓는다. 그래서 `DeathPhase` 의 「검시실로」가
`PHASE/ADVANCE` 를 보내면 `advance()` 는 `DEATH → AUTOPSY` 로 단계만 넘긴다 —
`finishLive` 는 아예 호출되지 않는다.

`finishLive` 안에만 있는 것들이 **전부 실행되지 않는다**:
- `corpses` 에 시체 추가
- `star.status = 'DEAD'`
- `maxFloor` 갱신
- `stats.deepestFloor` 갱신
- `RECORD_BREAK` FX

### 실측 (브라우저, seed=20260822, 키보드로 Day 1→8 완주)

```
Day 1 시작 · 골드 12840 · 팬 84200 · 평판 62 · 생존 5명 · 시체 0구
Day 8 시작 · 골드 12840 · 팬 84200 · 평판 62 · 생존 5명 · 시체 0구
결산 · 최고 26F (실제로는 매일 29F 까지 내려갔다) · 소생 0 · 폐기 0
```

8일 내내 **시체가 한 구도 안 생기고, 아무도 죽지 않고, 골드가 1G 도 안 움직인다.**
그래서 검시실은 매일 "검시할 시체가 없다" 를 띄우고(핫키 1·2 가 잠긴다),
소생실은 되살릴 대상이 없고, M10 경제는 돌 일이 없다.
D2 목표 「못생겼지만 Day 1→8 을 클릭으로 완주」는 **화면상으로는 통과**하지만
게임은 8일 동안 아무 일도 일어나지 않는다.

**제안**: 시체 생성을 `finishLive` 밖으로 빼서 `chooseCombat`·`tickLive` 의 사망 분기와
공유하는 한 함수(`concludeRun(state, diedFloor, cause)`)로 만들어라. 그러면
`PHASE/ADVANCE` 경로로 죽든 전투로 죽든 같은 결과가 나온다.

**화면 쪽은 준비돼 있다** — `DeathPhase`·`AutopsyPhase`·`RevivePhase` 는 이미 `corpses` 를
읽고 그린다. 시체가 생기는 순간 그대로 흐른다. 내가 고칠 수 있는 부분이 없다 (`reducer.ts`
는 Codex 소유이고, 이건 가드 한 줄이 아니라 규칙이다).

**상태**: [ ] 미처리
