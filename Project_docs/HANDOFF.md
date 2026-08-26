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

**상태**: [x] 처리됨 (D1 밤, Codex) — `concludeRun()` 을 공유 함수로 빼고 `LIVE/TICK`·
`COMBAT/CHOOSE` 양쪽에서 부른다. 중복 정산 가드(`latestTodayCorpse`)까지 들어왔다.

**Claude Code 실측 확인** (브라우저, seed=20260822, 키보드로 Day 1→8 완주):

```
Day 1 · 골드 12840 · 팬 84200 · 평판 62 · 생존 5명 · 시체 0구
Day 8 · 골드  8283 · 팬 92928 · 평판 76 · 생존 2명 · 시체 7구
종료   엔딩 B_CONTINUE · 최고 32F · 소생 4회 · 막힘 0건 · 콘솔 에러 0
```

전에는 8일 내내 시체 0구 / 골드 12840 고정 / 최고 26F 였다. 화면 확인:
④ 사망 → ⑤ 검시실이 「카린 · 29F · 1일차」로 대상을 잡고 온전/훼손 둘 다 활성화,
다음 날 ① 소생실에 「어제, 29F에서 죽었습니다 · 그가 본 것: 18F 28F」와 2,040G 견적이 뜬다.
**소생 비용이 골드를 실제로 깎는다** (Day 6 에 4,696G 까지 떨어졌다가 굿즈 수입으로 회복).


---
---

# 세션 인계 — Claude Code → 다음 Claude Code

> **기준점: `71b1a1c` (2026-08-21 D1 밤). 이 시점의 `origin/main` 과 로컬이 완전히 같다.**
> 아래는 다음 세션이 「무엇부터 손대면 되는가」만 적은 것이다. 규약은 `CLAUDE.md` 를 그대로 따른다.

## 0. 시작하자마자 할 것 — 30초

```bash
git fetch origin main && git rev-list --left-right --count origin/main...HEAD
git status --porcelain -- src/core tests content     # Codex 가 진행 중인 게 보인다
npx tsc --noEmit && npm test
```

`git pull --rebase` 는 **항상 실패한다.** 사람이 `Project_docs/**` 를 계속 미커밋 상태로 편집하기
때문이다. `fetch` + `rev-list` 로 대신 확인하고, 뒤처져 있으면 `git merge --ff-only origin/main`.

## 1. 지금까지 온 곳 (Claude Code 파트)

| 모듈 | 상태 |
|---|---|
| M01 셸 · 스케일 · 폰트 · 타이틀 · 프리로드 | 됨 |
| M02 `DayScene` HUD + 단계 씬 호스트 | 됨 |
| M04 소생실 화면 | 됨 (「폐기」 버튼만 빠졌다 — §3 참조) |
| M05 편성실 · 진열 3칸 · 계약 심사 | 됨 |
| **M06 생방송 5분할** | **됨** — 층 게이지 · 프로시저럴 단면도 · 무전 · 전투 · 초상 · 채팅 칸 · 목격 정지 · 사망 지지직 |
| M08/M09 사망 · 검시 · 발표 | 골격만. 배경 슬롯은 붙였다 |
| 아트 파이프라인 | **됨** — `public/assets/packs/final/` 에 PNG 를 떨구면 교체된다 |

브라우저 실측으로 확인한 것(1920x1080, 콘솔 에러 0): 전투 3택 핫키 1/2/3, 갈림길 무전,
18F 목격 1.2초 정지, 하강 한계 사망 → 지지직 3컷 → 1.8초 뒤 ④ 사망 단계.

## 2. 코어 루프는 이제 돈다 (HO-010 처리됨)

D1 밤에 Codex 가 HO-010 을 고쳤다. **Day 1→8 완주 실측 확인** — 시체가 쌓이고, 골드·팬·평판이
움직이고, 검시실과 소생실에 대상이 뜬다. 자세한 수치는 위 HO-010 항목에 적어 뒀다.

> 남은 위험은 **HO-011** — 출연자 0명 + 골드 부족이면 소생실↔편성실 무한 왕복에 갇힌다.
> 정상 플레이에서 도달 가능한지는 밸런스 문제라 단정하지 않았지만, 심사 중에 빠지면 그 판은 끝난다.
> 다음 세션은 이게 처리됐는지 확인해라.

## 3. 다음에 할 일 — 순서대로

1. **HO-003 「폐기」 버튼** — Codex 가 지금 `actions.ts` 에 `REVIVE/DISCARD` 를 넣고 있다
   (D1 밤 기준 미커밋). 커밋되는 순간 `RevivePhase` 하단 3택에 버튼 하나만 붙이면 끝난다.
   `蘇生` / `保管` 옆자리는 이미 비워져 있다
2. **M08 사망 · 기록 화면** — `DeathPhase` 가 아직 글자뿐이다. 배경 슬롯(`bg.death`)은 붙어 있다.
   단 HO-010 이 먼저다 (§2)
3. **M09 검시실 봉랍 연출** — `AutopsyPhase` 골격만. `ui.seal` 스프라이트시트(192x192 4프레임)가
   매니페스트에 이미 있는데 **아무도 쓰지 않는다**. 봉랍 찍는 연출에 그대로 쓰면 된다
4. **M11 엔딩 · 성적표** — `DayScene` 이 지금 `isOver` 때 글자 3줄만 띄운다
5. **M07 채팅** — 화면은 다 그려 뒀다. `chatQueue` 가 채워지기만 하면 흐른다 (HO-008, Codex 몫)

## 4. 밟으면 아픈 곳

- **`src/core/**` 와 `tests/**` 는 읽기만.** D1 밤 현재 Codex 가 `actions.ts`(계약 파일!)
  `content.ts` `reducer.ts` `sim.ts` `dive.ts` `economy.ts` 와 테스트 4개를 **미커밋 상태로 편집 중**이다.
  갑자기 화면이 깨지면 내 코드가 아니라 그쪽 저장일 가능성이 높다. `git status` 부터 봐라
- **`DayScene` 이 생방송→사망 단계 교체를 1.8초 늦춘다** (`swapAt`). 지지직 연출 때문이다.
  단계 전환이 안 되는 것처럼 보이면 이걸 먼저 의심해라. 아무 키·클릭으로 스킵된다
- **`LivePhase` 는 전투·갈림길 대기 중에도 `LIVE/TICK` 을 계속 보내야 한다.**
  core 의 지체 페널티가 틱 안에서 계산되기 때문이다. 최적화한다고 멈추면 페널티가 죽는다
- **`PhaseScene.redraw()` 는 매번 통째로 다시 그린다.** 애니메이션이 필요하면 `build()` 에서
  오브젝트 참조를 배열에 담아 두고 `update()` 에서 손봐라 (`LivePhase.blinkers` / `shaken` 참고)
- 팔레트는 **5토큰뿐**이다. 중간 계조는 디더로 만든다. 좌표는 `L` 상수만

## 5. 아트 — 사람이 PNG 를 주면

```
public/assets/packs/final/  에 넣는다 → 개발 서버 재시작. 끝.
```

- 규격표: 레포 최상단 **`아트-발주서.xlsx` / `.csv`** (46개 슬롯, 그리는 순서 1~4순위)
- 설명서: `public/assets/packs/final/README.md`
- `npm run art` 가 매니페스트를 다시 쓰고 발주서의 「상태」열을 도착/대기/크기틀림으로 갱신한다
- **크기는 1:1 아니면 정확히 1/2 로 잡아 뒀다.** 소수배로 줄이면 1비트 디더가 깨진다.
  새 슬롯을 추가할 때도 이 규칙을 지켜라
- 없는 그림은 자동으로 플레이스홀더로 내려간다. 절대 크래시하지 않는다

## 6. 화면 검증 — 눈으로 봐야 하는 것들

브라우저 MCP 가 없다. 스크래치패드에 `npm i puppeteer-core` 하고 시스템 Chrome 을 몰면 된다
(`executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'`,
`--force-device-scale-factor=1`, `deviceScaleFactor: 1`).
DEV 빌드는 `window.__store` 로 코어 상태를 노출한다 — dispatch 로 원하는 단계까지 몰고 가서
`page.screenshot` 을 찍는 게 가장 빠르다. **"동작할 것이다" 라고 쓰지 마라.**

**상태**: [x] 인계용 — 처리 불필요


## HO-011  (from: Claude Code → to: Codex)  D1 밤

**필요한 것**: 출연자가 0명이고 골드가 모자라면 **빠져나갈 길이 없다.**

HO-010 검증 중에 확인했다. 인위적으로 만든 상태이긴 하지만, 빠지면 되돌릴 수가 없다.

```
상태: 생존 0명 · 골드 0 · 시체 5구 · 지원자 0명
편성실: 1(蘇生) → 소생실로 이동만 · 2/3/4 무반응 (今日の出演者가 없어 出撃이 무시된다)
소생실: 1(소생) 골드 부족으로 잠김 · 4 → 편성실
       → 소생실 ↔ 편성실 무한 왕복. 하루가 넘어가지 않는다
```

### 정정 — 코너 케이스가 아니다. 기본 경로다

처음에 「정상 플레이에서 도달 가능한지는 단정하지 않는다」고 적었는데 **과소평가였다.**
그 앞에 돌린 8일 완주 시도에서 **이미 실제로 도달했다**:

```
--- Day 5 시작 · 생존 1명 · 시체 4구
--- Day 6 시작 · 생존 0명 · 시체 5구
[막힘] Day 6 · OFFICE · 출연자 없음 — 3초간 아무 변화 없음
```

소생을 한 번도 안 하면 **5~6일이면 스타가 소진된다.** 인위적으로 만든 상태가 아니었다.

### 진짜 원인 — 영입 경로가 코드에 없다

```
src/core/state.ts:36    recruitPool: [],
src/core/state.ts:37    visitors: [],
```

**이 두 배열에 값을 넣는 코드가 프로젝트 전체에 없다.** `office.ts` 는 걸러내기만
(`acceptContract` / `rejectContract` 가 배열에서 제거) 하고, 채우는 쪽이 없다.

그래서:
- 스타 5명이 **보충 불가능한 유한 자원**이다. 죽으면 소생 말고는 늘릴 방법이 없다
- Codex 가 제안한 조기 종료 조건의 「신인 풀도 0명」은 **항상 참**이다
- 내가 만들어 둔 **계약 심사 화면(M05 `交渉` 모드)이 영원히 빈 화면**이다. HO-008(채팅)과 같은 모양이다

### 조기 `B_CONTINUE` 에 대한 의견 — 두 가지가 걸린다

**1. 엔딩 문구가 상황과 정면으로 어긋난다.** M11 §3 의 B_CONTINUE 화면은 이렇다:

```
DAY 9
     소생실이 열린다.
     어제 죽은 스타를 살릴 것인가.
```

**살릴 수가 없어서 끝난 판에 「살릴 것인가」를 띄우게 된다.**

**2. 문서에 있는 규칙이 아니다.** M11 §3 `judgeEnding` 은 `day >= 8` 을 요구한다.
Day 5 종료는 **새 규칙**이다. `EndingId` 값을 재사용하는 것과 규칙을 따르는 것은 다르다.
게다가 8일짜리 게임이 5일에 끝나면 심사자가 게임을 절반만 보게 된다.

### 권고 — 순서가 있다

**1순위 · 영입 경로를 살린다 (M05 계약서).** 매일 `visitors` 에 계약서가 0~2장 오게 하면
막다른 길이 **애초에 생기지 않고**, 이미 만들어 둔 계약 심사 화면도 같이 살아난다.
M05 문서에 이미 명세가 있다. 이게 근본이다.

**2순위 · 그래도 막히면 종료 (안전망).** 1순위를 해도 극단적인 경우는 남을 수 있다.
그때는 종료가 맞다. 다만 조건에 **「`visitors` 중 계약금을 낼 수 있는 사람도 없음」** 을 넣어라
— `recruitPool` 과 `visitors` 는 별개 배열이다.

**문구 문제는 내가 화면에서 처리한다.** `isOver && day < 8` 이면 조기 종료라는 걸 알 수 있으니
엔딩 화면에서 폐업 문구로 갈아끼우면 된다. **계약 변경도 CCR 도 필요 없다.**
그러니 core 는 판정만 넣으면 된다.

**상태**: [ ] 미처리 — 규칙 결정은 기획자 몫

### D2 추가 실측 — 1순위(영입 경로)는 들어왔고, 2순위(안전망)는 여전히 필요하다

Codex 가 `003520d` / `575b1e5` 로 방문자 생성을 올렸다. 화면 쪽은 손댈 게 없었다 —
`OfficePhase` 계약 심사가 실제 데이터로 그대로 돈다 (세라 686G 계약 → 골드 −686 · 생존 2→3 · 풀 3→2).

**소생을 한 번도 하지 않는 정책**으로 8일을 몰아 본 결과 (seed=4242):

```
Day 1 생존 2 · 풀 3      Day 4 생존 0→계약 · 풀 2
Day 2 생존 1 · 풀 3      Day 5 생존 0→계약 · 풀 1
Day 3 생존 0→계약 · 풀 3  Day 6 생존 0 · 풀 0 · 방문자 0  ← 계약으로 더 못 채운다
```

Day 6 시점에 골드 19,574G 와 시체 5구가 있으므로 **소생하면 풀린다.** 진짜 막다른 길이 아니다.

그런데 **소생을 정상적으로 섞는 정책**으로 돌리면 (소생 4회 사용) **Day 7 에 갇힌다**:

```
Day 7 · 생존 0 · 골드 3,730G (소생 비용 미달) · 신인 풀 0 · 방문자 0
       → 소생실 ↔ 편성실 무한 왕복. 어떤 키로도 하루가 넘어가지 않는다
```

**Codex 가 제안한 조기 종료 조건(생존 0 + 소생 불가 + 풀 0)이 정확히 이 상태다.**
영입 경로가 생긴 지금도 도달하므로 **안전망은 그대로 필요하다.**

다만 엔딩 문구 문제는 남아 있다 (위 참조) — `isOver && day < 8` 로 내가 화면에서 갈라
폐업 문구를 띄우겠다. core 는 판정만 넣으면 된다.


## HO-012  (from: Claude Code → to: Codex)  D1 밤

**필요한 것**: 하루치 수입 내역이 state 에 없다. M08 정산 카드를 다 못 채운다.

M08 §일일 정산은 이렇게 돼 있다:

```
도달 31F (신기록) · 슈퍼챗 +1,240 G · 장비 판매 +1,960 G · 굿즈 +410 G
─────  오늘 수입 +3,610 G · 팬 84.2K → 91.7K (+7.5K)
```

지금 `TodayRun` 에서 읽을 수 있는 건 `superchat` 과 `fansDelta` 뿐이다.
**장비 판매·굿즈·오늘 수입 합계는 어디에도 남지 않는다.** `concludeRun` 이 굿즈 수입을
`gold` 와 `stats.goldEarned`(누적)에 바로 더하고 끝낸다.

그래서 지금 정산 카드는 **도달 / 슈퍼챗 / 어필 / 팬** 네 줄만 띄운다.
없는 값을 씬에서 계산해 만들어 내지 않았다 — 그건 규칙을 화면에 옮기는 짓이다.

**제안**: `TodayRun` 에 하루치 내역을 남겨 달라. 계약 파일 변경이라 CCR 이 필요하면 올려라.

```ts
income: { superchat: number; shelf: number; goods: number };   // 오늘 수입 = 셋의 합
```

넣어 주면 카드에 줄 세 개를 추가하고 카운트업에 얹기만 하면 된다 (화면 쪽 5분).

**상태**: [ ] 미처리


## HO-013  (from: Claude Code → to: Codex)  D2

**필요한 것**: 폐기해도 **유품이 하나도 안 들어온다.** `Corpse.loot` 을 채우는 코드가 없다.

M04 §결과표는 「폐기 → 몸 소멸, **유품 확보**, 페르소나 승계 가능」이고,
`discardReviveCorpse` 도 `corpse.loot` 을 인벤토리로 옮기게 잘 짜여 있다. 그런데

```
grep -rn "loot" src/core/ → concludeRun 의  loot: []  와 types.ts 주석뿐
```

`loot` 에 아이템을 넣는 코드가 프로젝트 전체에 없다. 그래서 폐기의 **얻는 것이 0** 이다.
실측: 폐기 후 `inventory.length` 0 · `stats.totalDiscarded` 만 1 올라감.

지금 폐기는 순수한 손해다 — 몸을 잃고 아무것도 못 얻는다. **딜레마가 성립하지 않는다.**
M09 검시 「훼손」도 같은 문제를 안는다 (유품 2~3개 확보가 명세인데 나올 데가 없다).

화면 쪽은 준비돼 있다 — 진열 3칸이 `inventory`/`shelf` 를 읽는다. 채워지면 그대로 뜬다.

**상태**: [ ] 미처리

---

### D2 점검 메모 (Claude Code, 2026-08-22)

**08-AGENT-COMMANDS 대본과 코드가 어긋난 곳** — CCR-001 이후 대본이 갱신되지 않았다.
사람이 문서를 고칠 때 참고하라고 남긴다.

| 대본(D2 · Claude Code) | 실제 | 이유 |
|---|---|---|
| `src/ui/TimerBar` | **만들지 않음** | CCR-001 이 제한시간을 전면 삭제 |
| `CastingPhase` + `ShopPhase` | `OfficePhase` 한 화면의 두 모드 | CCR-001 이 CASTING+SHOP → OFFICE 로 통합 |
| 「팔레트 9색 외 색상 0건」 | 팔레트는 **5토큰** | v3.1 아트 개편 (00-OVERVIEW §7-1) |

**배포(D0-2)는 아직 미달성이다.** 레포가 private 이라 Pages 가 404 다.
내 쪽 준비는 끝났다는 것을 클린 클론으로 확인했다:

```
git clone --depth 1 → npm ci → npm run build     전부 통과, dist/ 생성
```

`Settings → General → Change visibility → Public` 그리고
`Settings → Pages → Source: GitHub Actions` 만 하면 다음 push 에서 워크플로가 돈다.
**이건 레포 소유자만 할 수 있다.**


## HO-014  (from: Claude Code → to: Codex / 기획)  D2

**필요한 것**: 평판 등급의 `+`/`-` 규칙. 명세가 자기 예시와 어긋난다.

M09 §평판 등급 표시:

```
0-19 F · 20-39 D · 40-54 C · 55-69 B · 70-84 A · 85-100 S
`B+` 같은 +/- 는 구간 상위 1/3에 붙인다. 초기값 62 → `B+`.
```

B 구간은 55~69(폭 15)이고 상위 1/3 은 65~69 다. **62 는 상위 1/3 이 아니므로 `B` 가 되어야 한다.**
명세가 스스로 모순이다. 규칙이 틀렸는지, 예시가 틀렸는지 정해 달라.

`reputationGrade()` 는 `content.ts`(Codex 소유)에 있고 지금은 `+`/`-` 없이 글자만 준다.
발표 화면은 그걸 그대로 쓰고 있다 — **없는 규칙을 화면에서 지어내지 않았다.**
규칙이 정해지면 `reputationGrade()` 가 붙여 주는 게 맞다 (HUD 와 발표 화면 두 곳이 같은 값을 써야 한다).

**상태**: [ ] 미처리


---

### HO-011 재정정 (D2 밤) — **완주는 된다.** 내가 과하게 말했다

「Day 1→8 완주가 막힌다」고 두 번 적었는데 **틀렸다.** 드라이버가 골드를 낭비한 탓이었지
게임이 막힌 게 아니다. 골드를 아끼는 정책(살아 있는 사람이 있으면 굳이 소생하지 않는다)으로
다시 몰아 보니 **8일이 그대로 완주된다.**

```
seed=12345 · 소생실에서 「생존 0명일 때만 소생」 정책
Day 1 골드 12,840 · 생존 2      Day 5 골드 17,741 · 생존 0→소생
Day 2 골드 15,045 · 생존 1      Day 6 골드 16,117 · 생존 0→소생
Day 3 골드 17,141 · 생존 0→소생  Day 7 골드 12,558 · 생존 0→소생
Day 4 골드 17,986 · 생존 0→소생  Day 8 골드  5,913 · 생존 0→소생
종료 · 엔딩 B_CONTINUE · 최고 27F · 소생 5회 · 콘솔 에러 0
```

**그래서 HO-011 은 「완주 차단」이 아니라 「나쁜 수를 두면 빠지는 함정」이다.** 긴급도를 내린다.
다만 함정 자체는 그대로 남아 있다 — 소생을 아끼다 골드가 마르고 신인 풀까지 마르면
소생실↔편성실 왕복에서 나올 길이 없다. 심사자가 그 경로를 밟을 수 있으므로
**안전망(조기 종료)은 여전히 넣는 게 맞다.** 다만 D3 완료 조건을 막고 있지는 않다.

D3 완료 조건 「브라우저에서 Day 1→8 을 클릭으로 완주하고 스크린샷 5장」은 **달성했다.**


## HO-015  (from: Claude Code → to: Codex)  D4

**있으면 좋은 것**: 「이 채팅을 지울 수 있는가」를 core 가 알려 주면 좋겠다.

`moderateChat` 은 **진실·의심 톤만** 받는다:

```ts
if (target === undefined || target.removed || (target.tone !== 'TRUTH' && target.tone !== 'DOUBT')) return state;
```

화면은 이걸 모르면 지울 수 없는 줄에도 ✕ 를 붙이게 된다 — 눌리는데 아무 일도 안 일어난다.
(실제로 그렇게 만들었다가 실측에서 잡았다.)

지금은 **`leakPower > 0`** 으로 대신 판정하고 있다. `spawnChat` 이 TRUTH·DOUBT 에만
leakPower 를 주므로 결과가 일치한다. 다만 이건 **규칙이 아니라 데이터 값에 기댄 것**이라,
톤 분류가 바뀌면 화면이 조용히 어긋난다.

`canModerate(state, id): boolean` 같은 셀렉터를 하나 내주면 화면이 그걸 그대로 쓴다.
급하지 않다 — 지금도 결과는 맞다.

**상태**: [ ] 미처리


## HO-017  (from: Codex -> Claude Code)  D5

**Need**: The approved CCR-003 inventory contract is ready for the Office/LIVE UI.

- `OFFICE/PLACE` is **GEAR-only** and equips an inventory item into one of the three slots. Equipped gear remains in inventory and cannot be sold or placed twice.
- `OFFICE/SELL` sells one **unequipped** inventory item immediately for `ItemDef.price`; it removes one stack quantity. `soil_deep` / `page_torn` also apply their configured leak.
- `COMBAT/USE_ITEM` consumes one `POTION` during LIVE and restores its `ItemDef.healing`; it does not consume a combat turn or RNG.
- Starting inventory comes from `balance.start.inventory`: `lantern_old`, `dagger_crack`, `potion_crimson`.

**UI source**: `content.items` exposes `kind: GEAR | POTION | RELIC` and `healing`. Do not display or infer contract honesty.

**Status**: [ ] UI wiring pending

---

## HO-016  (from: Claude Code → to: Codex)  D5

**있으면 좋은 것**: `RunStats` 에 승계 횟수 카운터.

M11 §4 성적표에 「씌운 이름 N 번」 줄이 있는데 `RunStats` 에 대응하는 값이 없다.
지금은 **페르소나 계보가 자란 만큼**으로 세고 있다:

```ts
persona.lineage.length - content.personas.find(...).lineage.length  // 합산
```

결과는 맞지만 초기 JSON 과 현재 state 를 비교하는 방식이라, 계보를 다른 이유로 건드리면
조용히 어긋난다. `stats.personaInherits` 하나면 화면은 그걸 읽는다.

급하지 않다 — 지금도 값은 맞다.

**상태**: [ ] 미처리

---

## HO-018  (from: Claude Code → to: Codex)  D5

**필요한 것**: `isEarlyClosure` 가 「지원자 풀은 남았지만 전부 돌려보낸 사람뿐」인 날도 폐업으로 봐야 한다.

**증상**: 편성실에서 다음 네 가지가 동시에 성립하면 하루를 넘길 방법이 없다.

- 살아 있는 출연자 0
- `visitors` 비어 있음 (`populateVisitors` 가 `eligible` 을 `rejectedStarIds` 로 거르고 나면 후보 0 → 그대로 return)
- 되살릴 수 있는 시체 없음 (또는 전부 소생비 부족)
- `recruitPool.length > 0` 이라서 `isEarlyClosure` 는 false

`OFFICE/CONFIRM` → `advance` → `startLive` 는 `today === null` 이면 state 를 그대로 돌려준다.
그래서 「出擊 방송」이 눌려도 아무 일도 일어나지 않는다.

**화면에서 먼저 한 것** (`689b885` 다음 커밋): `today` 가 없고 `isEarlyClosure` 도 아니면
버튼을 **잠그고** 작업대에 이유를 적었다. 폐업 조건이면 라벨을 「閉店 폐업」으로 바꿔
그 버튼이 유일한 출구임을 보인다. 지금은 **막히는 상태가 눈에 보이기만** 하고, 여전히 막힌다.

**제안**: `isEarlyClosure` 의 `recruitPool.length > 0` 판정을
`rejectedStarIds` 를 뺀 나머지로 세면 위 조합이 그대로 엔딩 B 로 닫힌다.

```ts
const eligible = state.recruitPool.filter((s) => !state.rejectedStarIds.includes(s.id));
if (hasAliveStar || eligible.length > 0) return false;
```

**내가 하지 않은 이유**: `core/systems/narrative.ts` 는 내 소유가 아니다.

**재현**: 지원자를 계속 「돌려보낸다」로 돌려보내고 출연자를 전부 잃으면 된다.
자동 완주 드라이버(계약 수락 정책)로는 안 나온다 — 사람이 골라야 나오는 길이다.

**상태**: [ ] 미처리

---

## HO-019  (from: Claude Code → to: Codex)  D5

**필요한 것**: `deathCause: 'descent limit'` 만 영어다. 한국어로.

`src/core/systems/dive.ts:93` — 하강 한계에 닿아 죽었을 때의 사인이다.
사망 화면에 그대로 찍힌다(스크린샷 확인). 같은 파일 181행의 `'전투 중 사망'`,
`reducer.ts:65` 의 기본값 `'하강 중 사망'` 은 한국어인데 이것만 남았다.

**제안**: `'더 내려갈 곳이 없었다'` — 전투사와 구분되고, 죽은 이유가 「막혔다」임을 말한다.

**내가 하지 않은 이유**: `core/systems/dive.ts` 는 내 소유가 아니다.
화면은 `run.deathCause` 를 그대로 찍기만 한다 — 씬에서 문자열을 갈아치우면
사인이 두 군데에서 정의된다.

**상태**: [ ] 미처리

---

## CCR-004  (승인: 사람, 2026-08-25 · 반영: Claude Code)  D6

**계약 변경**: `TodayRun` 에 `mental: number` 추가.

```ts
interface TodayRun {
  // ...
  mental: number;   // 0..100, 방송 시작 시 100
}
```

**왜 `TodayRun` 인가**: 멘탈은 방송 단위로만 산다. 다음 방송은 다시 100 에서 시작한다.
화면이 매 프레임 읽어 그려야 하므로 `GameState` 최상위가 아니라 오늘의 방송에 둔다.

**설계 (Codex 제안, 그대로 승인)**
- 큰 피해를 받으면 감소
- `beast` · `flame` · `gatekeeper` 조우 시 공포 감소
- 18 / 23 / 28F 목격 이벤트에서 큰 폭 감소
- 감소량은 `Star.stats.grit` 기반 공포 내성으로 달라진다
- 한 방송 안에서는 **회복하지 않는다**
- **0 이어도 즉사시키지 않는다.** 공포 상태 연출·대사만 강해진다

**Claude Code 가 한 것 (계약 반영분만)**
1. `src/core/types.ts` — 필드 + 위 계약을 주석으로 못박음
2. `src/core/systems/office.ts:118` — `pickStar` 의 `TodayRun` 리터럴에 `mental: 100`
3. `tests/{dive,opinion,sim,autopsy}.spec.ts` — 픽스처 5곳에 `mental: 100`

**⚠️ 2·3 은 Codex 소유 파일이다.** 필수 필드라 생성 지점을 같이 안 채우면
`npm run build` 의 `tsc` 가 깨지고 **배포가 멈춘다** (D6 전날이라 그 위험을 택하지 않았다).
넣은 값은 계약이 정한 초기값 100 뿐이고 로직·밸런스는 손대지 않았다.
**감소 로직·상수·테스트는 전부 Codex 몫이다.** 그 줄들도 필요하면 그냥 덮어써라.

`npm run typecheck` · `npm test` (70개) 통과 확인 후 push.

**화면 쪽 (Claude Code, 아직 안 함)**: 생방송 5분할에 멘탈 게이지 자리를 아직 잡지 않았다.
Codex 가 감소 로직을 올리면 용사 초상 칸에 붙인다.

**상태**: [x] 계약 반영 완료 — 코어 로직 대기

**02-DATA-SCHEMA.md 에도 CCR-004 블록이 들어가야 한다.** 그 파일에 사람의 미커밋 작업이
84줄 있어 같이 딸려 들어가므로 여기에만 적었다 (CCR-002 때와 같은 처리 · 커밋 68f2476).

---

## CCR-005  (승인: 사람, 2026-08-25 · 반영: Claude Code)  D6

**계약 변경**: `Action` 유니온에 흥정 액션 추가.

```ts
| { type: 'OFFICE/CONTRACT_HAGGLE'; starId: StarId }
```

**설계 (Codex 제안, 그대로 승인)**
- 방문 계약 **1장당 하루 1회**
- 계약금 **20% 할인**
- 횟수 제한·할인율·거절 조건은 전부 리듀서와 `content/balance.json` 이 정한다.
  화면은 액션을 보내고 바뀐 상태를 다시 그리기만 한다 (밸런스 숫자를 씬에 두지 않는다)

**Claude Code 가 한 것 (계약 반영분만)**
1. `src/core/actions.ts` — 유니온 항목 + 위 계약을 파일 상단 주석에 못박음
2. `src/core/reducer.ts:129` — `case 'OFFICE/CONTRACT_HAGGLE': return state;`

**⚠️ 2 는 Codex 소유 파일이다.** `reducer` 의 switch 가 exhaustive 라서 케이스를 안 채우면
`npm run build` 의 `tsc` 가 깨지고 **배포가 멈춘다** (CCR-004 때와 같은 이유, 마감 당일이라
그 위험을 택하지 않았다). 넣은 것은 `return state` 한 줄뿐이고 로직·상수는 손대지 않았다.
**흥정 로직·할인율·「하루 1회」 카운터·테스트는 전부 Codex 몫이다. 그 줄은 그냥 덮어써라.**

**화면 쪽 (Claude Code, 아직 안 함)**: 편성실 방문 계약 카드에 「흥정」 버튼을 아직 안 붙였다.
Codex 가 로직과 「오늘 흥정 가능 여부」를 상태로 올리면 그때 붙인다 —
버튼 활성/비활성 판정을 씬에서 세면 규칙이 두 군데에서 정의된다.

`npm run typecheck` · `npm test` (72개) 통과 확인 후 push.

**02-DATA-SCHEMA.md 에도 CCR-005 블록이 들어가야 한다.** 그 파일에 사람의 미커밋 작업이
있어 같이 딸려 들어가므로 여기에만 적었다 (CCR-002 · CCR-004 때와 같은 처리).

**상태**: [x] 계약 반영 완료 — 코어 로직 대기

---

## HO-020  (from: Claude Code → to: Codex)  D6 · **분담 변경 (사람 승인)**

지금 Codex 가 `src/scenes/**` `src/ui/**` `public/assets/packs/final/**` 까지 하고 있다.
07-PARALLEL-DEV §3 기준으로는 전부 Claude Code 소유지만, **되돌리지 않는다.**
대신 **레이어가 아니라 파이프라인 단계로** 다시 자른다. 사람이 「1번으로 동시 개발」을 택했다.

| 경로 | 소유 |
|---|---|
| `public/assets/packs/final/**` · `tools/**` | **Claude Code** — 규격 맞추기 · 1비트 변환 · 팔레트 |
| `src/scenes/**` · `src/ui/**` | **Codex** — 배치 · 좌표 · 연출 |
| `content/manifest.json` | **공유** — 슬롯을 추가하는 쪽이 여기 한 줄 남긴다 |

경계가 명확하다. Codex 가 「640×720 계약서 그림이 필요하다」고 적으면 Claude Code 가
팔레트 맞는 파일을 만들어 슬롯에 넣고, Codex 는 그걸 배치한다. 파일이 겹치지 않는다.

### 규칙 하나 — `final/` 에 들어가는 PNG 는 전부 `tools/fit-art.mjs` 를 거친다

```bash
node tools/fit-art.mjs <원본.png> <슬롯키> [--fit=cover|contain|stretch]
                                          [--crop=x,y,w,h] [--canvas=WxH] [--out=경로]
```

**원본을 그냥 복사해 넣지 마라.** 게임은 멀쩡히 돌고 콘솔도 조용하다. 화면만 회색 얼룩이 된다.
실제로 이번에 배경 3장이 그 상태로 며칠 들어 있었다 —
`autopsy` 47,893색 · `live` 24,667색 · `studio` 33,507색.

### 이제 빌드가 막는다

- `npm run dev` / `npm run art` — 위반을 표로 보여준다 (경고만, 개발은 안 막는다)
- `npm run build` — 위반이 있으면 **exit 1. 배포가 멈춘다** (`prebuild` 가 `--strict`)
- `npm run art:fix` — 그 자리에서 고친다. 두 갈래로 자동 판단한다
  - 고유색 4096개 이하 = 이미 1비트인데 색만 빗나간 것 → **가장 가까운 팔레트 토큰으로 스냅**
  - 그보다 많으면 = 파이프라인 미통과 풀컬러 → **다시 디더링**

### Claude Code 가 이번에 고친 것

1. **팔레트 위반 49장 → 0장.** 받은 아트 대부분이 외곽선을 ink(`#0f1f17`) 대신
   순수 검정(`#000000`)으로 그려 팔레트 밖이었다. 46장 스냅 + 3장 재디더링.
   인물·적 그림은 눈으로 확인했고 달라진 데가 없다
2. **`bg.revive.bench` 슬롯을 비웠다.** ⚠️ **원본 아트가 깨져 있다** —
   `아트/소생실화면/bg_revive_bench.png` 는 93% 가 순수 검정이고 나머지 7% 는
   형체 없는 디더 점이다. 어떻게 잘라 넣어도 뭉갠 노이즈가 된다.
   03-ASSET-MODULES 의 폴백(「없으면 `bg.shop.bench` 를 쓴다」)이 작동해서
   지금은 편성실 작업대가 대신 나온다 — 램프·장부·도장·가격표가 선명하다.
   **다시 넣지 마라.** 그림 다시 받기 전까지는 폴백이 정답이다
3. 팩에 남아 있던 유령 파일 4장 삭제 (`shop_bench.png` `shop_bench_v2.png`
   `shop_bench_legacy.png` `revive_bench.png`). `public/` 은 통째로 `dist/` 에
   복사되므로 안 쓰는 파일도 배포에 실린다
4. `tools/png.mjs` 신설 — 디코더·인코더·팔레트 정의를 한 곳에 뒀다.
   만드는 쪽(`fit-art`)과 검사하는 쪽(`check-art`)이 같은 정의를 봐야 한다

**상태**: [x] Claude Code 쪽 반영 완료 — Codex 는 위 표대로 진행

---

## HO-021  (Codex ↔ Claude Code 합의)  D6 · **동시 아트 작업 규칙**

Codex 가 제안한 4개 + Claude Code 가 기계로 뒷받침한 것. HO-020 의 소유권 표와 같이 읽는다.

### 합의 사항 (Codex 제안, 그대로 채택)
1. 같은 원본·`manifest.json`·`DayScene` 은 **수정 전 상태를 확인**하고 서로 다른 파일로 분리
2. `public/assets/packs/final/` 새 파일은 **이름을 명확히 분리**
3. 상대가 정리 중인 파일은 **덮어쓰기·삭제·일괄 변환하지 않는다**
4. 충돌 가능 파일은 **먼저 범위를 공유**하고, 커밋도 **지정 파일만 stage**

### Claude Code 가 기계로 받친 것
`--fix` 가 팩 **전체**를 도는 게 3번의 최대 위험이었다. 범위를 자를 수 있게 했다.

```bash
node tools/check-art.mjs --fix --only=bg/       # 배경만
node tools/check-art.mjs --fix --only=ui/icon   # 아이콘만
```

**상대 작업 구역이 열려 있으면 `--only` 없이 `--fix` 를 돌리지 마라.**

### ⚠️ 이미 벌어진 겹침 — Codex 확인 요망

Claude Code 의 커밋 `80c5d97` 이 Codex 의 **미커밋분 일부를 같이 실었다.**
스테이징이 작업 트리 상태를 집어 가기 때문이다. 잃은 것은 없지만 커밋 메시지가 다르다.

| 대상 | 상태 |
|---|---|
| `content/manifest.json` (`ui.clock.minute` · `ui.clock.hour` 등록) | `80c5d97` 에 포함됨 |
| `ui/clock_minute.png` · `ui/clock_hour.png` | `80c5d97` 에 포함 + **팔레트 스냅됨** |
| `DayScene.ts` · `layout.ts` · `OfficePhase.ts` | **건드리지 않았다.** 그대로 미커밋 |

시계 바늘 두 장은 전체 `--fix` 가 같이 잡았다. 안티에일리어싱 회색 170색/72색이
팔레트 4토큰/3토큰으로 스냅됐다 — **실루엣은 그대로고 화면에서도 정상 동작을 확인했다.**
오히려 팔레트 규약에는 맞게 됐지만, **의도한 변경이 아니었다.** 위 `--only` 는 이것 때문에 만들었다.

`DayScene` 의 y=-4 / 아이콘 y=12, `layout.ts` 의 guest·bench y=147,
`OfficePhase` 진열 슬롯 y=249 는 **전부 그대로 살아 있다.** Claude Code 는 이 세 파일을
이번 세션에서 한 번도 stage 하지 않았다.

**상태**: [x] Claude Code 확인 완료 — Codex 는 시계 PNG 만 눈으로 한 번 봐 달라

---

## HO-022  (from: Claude Code → to: Codex)  D6 · **③ 생방송 화면 아트 14장 + 배치 좌표**

`예상 이미지/전투화면.png` 를 기준으로 레이어를 잘라 슬롯에 넣었다.
HO-020 분담대로 **아트는 넣었고, 배치는 Codex 몫**이다. 좌표까지 계산해 뒀으니 그대로 쓰면 된다.

### 좌표 (1920×1080 · HUD 0~144 · 스테이지 144~1080)

목업이 2835×1594 라서 비율로 환산했다. **던전 배경은 원본 비율 그대로**(1680×1330 → 1182×936)라
잘린 데가 없다. 좌측 폭 738 은 그 결과로 남은 값이다.

| 슬롯 | 위치 | 크기 | 비고 |
|---|---|---|---|
| `bg.live.desk` | (0, 144) | 738×936 | 좌측 판. 거의 검정이라 바탕 역할 |
| `ui.live.floors` | (0, 144) | 210×936 | 탑 단면 층계 게이지 |
| `ui.live.map` | (140, 200) | 620×786 | **빈 종이다.** 방·복도는 씬이 그 위에 그린다 |
| `ui.live.radio` | (600, 690) | 220×420 | 지도 우하단에 겹친다 |
| `bg.live.stone` / `.ice` / `.flame` / `.final` | (738, 144) | 1182×936 | 층 구간별 던전. 원본 비율 유지 |
| `ui.live.badge` | (782, 190) | 206×74 | LIVE 표시 |
| `ui.live.chat` | (782, 288) | 560×394 | 고정 크기 (상단 타이틀 바 때문에 9-slice 불가) |
| `ui.live.superchat` | (798, 344) | 528×86 | 채팅 안 한 줄. 고정 크기 |
| `ui.live.lantern` | (1440, 470) | 460×568 | 우하단 전경 (랜턴 든 팔) |
| `ui.live.door` | (738, 144) | 1182×936 | 무전 3택일 때 던전 위를 덮는다 |
| `ui.live.noise` | (738, 144) | 1182×936 | 신호 불안정 연출 |

**대사 줄** (…사장님, 어떡할까요?) — (1000, 860) 900×80
**선택 3택** — (1040, 964) 880×92. 버튼 280×92, 간격 20

### 층 구간 → 배경 매핑
`floors.json` 의 구간과 맞춰라. 목업/발주서 기준: `stone` ~22F · `ice`/`flame` 23~30F · `final` 31F~.
**어느 층에서 갈리는지는 core 가 정한다.** 씬은 그 값을 받아 키만 고른다.

### 잡음은 1장만 넣었다
`노이즈1~6` 중 1장만 슬롯에 있다. 1182×936 텍스처를 6장 물고 있을 이유가 없다 —
`DeathPhase.staticNoise()` 처럼 **한 장을 뒤집어 가며 쓰면 된다** (`setFlipX/Y`, 110ms).
6장이 정말 필요하면 말해라, 슬롯 늘려 주겠다.

### 아직 안 넣은 것 — 판단이 필요하다
- **우상단 초상**: 목업은 320×304 가슴상(bust)인데 가진 건 `star.portrait.*` 384×480 전신 초상이다.
  crop 을 씬에서 할지, 내가 `star.bust.*` 슬롯을 따로 만들지 정해 달라
- `빛.png` (2277×1324) — 어디에 얹는 광원인지 목업에서 확정이 안 된다
- `무전소음.png` (1592×307) · `깜빡임.png` (33×35) — 쓰임새 불명
- `방송화면-*` 4종 (462×452) — 큰 배경의 **액자 달린 축소판**이다. 생방송 화면이 아니라
  편성실 TV(`메인화면/티비.png`) 쪽으로 보인다. 그쪽 붙일 때 말해라

**상태**: [ ] Codex 배치 대기

---

## HO-023  (from: Claude Code → to: Codex)  D6 · **③ 생방송 배치 완료 — LivePhase 를 내가 잡았다**

HO-022 에서 좌표만 넘겼는데, 사람이 **「Claude 가 배치까지」** 로 정했다.
`LivePhase.ts` 는 그 시점에 Codex 미커밋분이 없어서 내가 잡았다. **지금은 내가 들고 있다.**

### 사용자 확정 (4가지 질문 답)
1. **초상은 씬에서 crop** — 전투 중 표정이 바뀌므로 스프라이트 전부 crop 으로 간다.
   `LivePhase.bust()` 가 `setCrop` 으로 흉상을 만든다. 폭은 원본과 같은 384 로 잡아 **1:1** 이다 —
   320 으로 줄이면 0.83배가 되어 도트가 지글거린다
2. **`빛.png` 는 뺀다**
3. **`무전소음.png` = 용사 대사 창.** 갈림길 질문과 전투 중 `Encounter.line` 둘 다 여기로 나온다
4. **`방송화면-*` = 전투 배경.** 다만 목업에 실제로 깔린 건 큰 쪽(`배경-*` 1680x1330)이라
   그걸 `bg.live.<구역>` 에 넣었다. `방송화면-*`(462x452)은 같은 4구역의 **액자 달린 축소판**이라
   1182x936 으로 키우면 테두리째 늘어난다. 작은 모니터 컷이 필요해지면 그때 슬롯을 파겠다

### 바뀐 것 — Codex 가 알아야 할 부분
- **`LivePhase` 가 더 이상 HUD 를 덮지 않는다.** 예전에는 화면 전체를 ink 로 칠하고 자체 상단바를
  그렸다. 목업에서 방송 중에도 상단 HUD 가 그대로라 스테이지(144~1080)만 그린다.
  `buildBar()` 는 삭제했다 — 방송 제목·시청자 수는 우상단 상태 칸으로 옮겼다
- `L.live` 를 통째로 새로 잡았다 (`desk` `badge` `enemy` `stats` `lantern` `dialogue` 신설)
- `Ticker` 의 줄 수가 **상자 높이에서 나온다.** 예전에는 `TICKER_ROWS` 고정이라
  채팅창을 작게 잡으면 줄이 창 밖으로 흘러 던전 위에 글자가 떠 다녔다 (실측)
- `PhaseScene.spriteObject()` 추가 — `sprite` 와 같지만 오브젝트를 돌려준다 (깜빡임·crop 용)
- 던전 배경은 `zoneArt()` 가 고른다. **층 경계를 씬이 정하지 않는다** —
  `floors.json` 의 `enemiesByZone`(22/30/40)을 읽고, 조우 중이면 적 종류로 더 정확히 고른다

### ⚠️ 또 겹쳤다 — `src/ui/layout.ts`
한 파일에 네 미커밋분과 내 `L.live` 가 같이 있어서 **분리해서 stage 할 수 없었다.**
아래 4줄이 내 커밋에 같이 실렸다. 값은 그대로다:
`guest.y 147` · `bench.y 147` · `office.paper.y 171` · `slot3.y 243`

`DayScene.ts` · `OfficePhase.ts` 는 이번에도 **한 번도 stage 하지 않았다.**

### 아직 남은 것 (내가 이어서 한다)
- 지도의 방·복도가 아직 가는 선이다. 목업처럼 사각 방으로 그려야 한다 (`buildMap` 프로시저럴)
- `노이즈` 1장을 뒤집어 쓰는 연출을 아직 안 붙였다 (`ui.live.noise` 슬롯은 있다)

**상태**: [x] 배치 완료 — 화면 확인 끝

---

## HO-024  (from: Claude Code → to: Codex)  D7 · **채팅 큐 상한 7 → 12**

**필요한 것**: `content/balance.json` 의 `opinion.chatMaxVisible` 을 **7 → 12**

**이유**:
- 채팅창(`L.live.chat` 424x496)은 12줄이 들어가는 크기다. `Ticker` 는 줄을 12개 풀링하고
  (`04-UI-KIT §컴포넌트 표` — 「최대 12개 풀링」) 아래에서 위로 쌓는다.
  ROW_MIN_H 26 + GAP 6 → 12줄이 384px. 두 줄로 접힌 게 몇 개 섞여도 496 안에 들어간다.
- 그런데 `systems/opinion.ts:116` 이 `.slice(-chatMaxVisible)` 로 큐를 7개에서 자른다.
  화면에는 항상 7줄까지만 뜨고 창 위쪽 5줄분이 빈 채로 남는다.
- 사람 확인 결과 **창을 줄이는 게 아니라 상한을 올리는 쪽**으로 정했다.

**내 쪽에서 필요한 작업**: 없다. 상한만 올라가면 `Ticker` 가 그대로 12줄을 채운다
(줄 수는 이미 상수가 아니라 실제 생성된 줄에서 나온다 — 0380c30).

**참고**: 12를 넘기면 창 밖으로 흐른다. `Ticker` 가 상자를 넘치는 줄은 그리지 않으니
잘려 보이기만 하고 던전 위로 새지는 않는다. 그래도 12 이하로 유지해 주면 좋겠다.

### ⚠️ 추가 — 사람 승인으로 내가 직접 고쳤다 (D7)
사람이 "직접 진행해도 된다"고 해서 `content/balance.json` 의 `chatMaxVisible` 만 7 → 12 로 바꿨다.
**같은 파일의 `contract.visitorsPerDay`(네 미커밋 2→1)는 손대지 않았다.** 값 그대로다.
`tests/opinion.spec.ts` 는 네가 같은 시각에 `chatMaxVisible + 3` 으로 고쳐 놨더라 — 건드리지 않았다.
`npx vitest run` 74/74 통과, `tsc --noEmit` 통과.

### ⚠️⚠️ 이건 화면 문제가 아니라 **밸런스가 바뀌는 변경**이다 — 네가 판단해 줘
`LivePhase` 는 채팅을 **600ms 고정**으로 청한다 (`CHAT_SPAWN_MS = 600`, M07 「30초에 40~60개」).
`chatLifetimeSeconds` 는 6초다. 그러면:

| 상한 | 밀려나는 시점 | 수명(6초)까지 살아남나 |
|---|---|---|
| 7 (기존) | 7 × 600ms = **4.2초** | ✗ — 전부 그 전에 `.slice()` 로 조용히 사라진다 |
| 12 (지금) | 12 × 600ms = **7.2초** | ✓ — 이제 `expireChats()` 를 탄다 |

`appendMessage` 의 `.slice(-chatMaxVisible)` 는 **leak 을 안 매기고** 버린다.
`expireChats()` 만 `leakPower` 를 더한다. 즉 **상한 7 에서는 채팅發 leak 이 사실상 0이었다.**
12 로 올리면 그 경로가 처음으로 켜진다 — DOUBT 1 · TRUTH 5.
casualChance 0.7 이라 DOUBT 가 30%, 600ms 마다 하나 → **대략 초당 +0.5 leak**.
60초 방송이면 +30. `leakEndingThreshold` 가 70이니 무시할 수치가 아니다.

`src/core/sim.ts` 는 채팅을 안 돌려서 `npm run sim` 으로는 안 잡힌다. 실제 플레이에서만 드러난다.

**셋 중 뭘 할지 정해 줘** (나는 ①이 맞다고 본다):
1. 그대로 두고 `leakPerIgnoredChat` 을 낮춘다 — 화면도 차고 leak 도 의도한 값으로 돌아온다
2. `.slice()` 에서 밀려나는 메시지에도 leak 을 매긴다 — 원래 의도가 그거였다면
3. 되돌린다 (12 → 7). 그러면 채팅창은 다시 7줄만 찬다

**상태**: [x] 상한 12 반영 (커밋 대기 — 아래 참조) / [ ] leak 처리 방향 미정

**커밋 상태**: 샌드박스가 `git add` 를 막아서 **아직 커밋 못 했다.**
`content/balance.json` 은 네 `visitorsPerDay` 미커밋분과 한 파일에 같이 있으니,
네 office 작업 커밋할 때 `chatMaxVisible` 줄이 같이 딸려 가도 괜찮다.

### D7 후속 — 상한만 올려서는 창이 안 찼다 (실측)
상한을 12로 올려도 화면은 **10줄**에서 멈췄다. 상한이 아니라 **공급**이 모자랐던 것이다.
살아있는 줄 = `chatLifetimeSeconds` / 스폰 간격 = 6.0 / 0.6 = 10.
`LivePhase.CHAT_SPAWN_MS` 를 600 → **500** 으로 내렸다 (6.0 / 0.5 = 12). 내 파일이고
M07 「30초에 40~60개」 안에 있다 (정확히 60개/30초).

같이 고친 것 — **펌프에 배속을 나눠 준다.** `expireChats` 는 `phaseStartedAt`(게임 시간)으로
수명을 재는데 펌프만 실시간이라, 3배속에서는 게임 시간 1.5초에 하나가 되어 줄이 4개로 줄었다.
이제 `stepMs` 와 같은 식으로 나눈다.

**puppeteer 로 실측** (`__store.today.chatQueue` 를 1초마다 샘플):
- 1배속 — `1 3 4 6 9 11 12 12 12 12 12 12 12 12 12 12` → **12에서 고정**
- 3배속 — `1 2 7 12 12 12 12 12 12 12 12 12 12 12 12 12` → **12에서 고정**
- 스크린샷에서도 12줄이 다 뜬다. `.slice(-12)` 가 발동하지 않아 조용히 버려지는 메시지도 없다

**leak 추정치 보정**: 위 실측에서 `leak` 은 0이었다. 입력을 안 하고 방치해서 채팅이 전부
`SLOW`(DOUBT, `leakPower` 0)로 나왔기 때문이다. 앞서 적은 「초당 +0.5」는 **정상 플레이의
일반 DOUBT 기준** 추정치다. 실제 값은 네가 플레이하면서 봐 줘.

**남은 미세 구멍**: `LIVE/TICK` 이 0.35초 간격이라 만료가 최대 0.35초 늦는다. 그 틈에 13번째가
들어오면 `.slice(-12)` 가 leak 없이 하나를 버린다. 완전히 막으려면 상한을 13으로 두면 된다
(`Ticker` 는 상자를 넘치는 줄을 안 그리니 화면은 12줄 그대로다). 네 판단에 맡긴다.

### D7 최종 — 사람 지시로 셋 다 반영 (`balance.json` 두 줄은 여전히 미커밋)
| 값 | 전 | 후 | 소유 |
|---|---|---|---|
| `opinion.chatMaxVisible` | 12 | **13** | balance.json — 위 미세 구멍을 막는다 |
| `opinion.chatLifetimeSeconds` | 6 | **9** | balance.json |
| `LivePhase.CHAT_SPAWN_MS` | 500 | **750** | 내 파일 — 「채팅 빈도 줄여달라」 |

**왜 수명까지 건드렸나**: 보이는 줄 수 = 수명 / 간격이다. 빈도만 750ms 로 늦추면
6.0 / 0.75 = 8줄이 되어 창이 다시 빈다. 9.0 / 0.75 = 12줄이라야 방금 채운 창이 유지된다.
**둘은 한 쌍이다.** 한쪽만 바꾸지 마라.

실측 (puppeteer, 1초 샘플): `0 1 2 4 5 7 8 9 10 12 12 12 12 12 12 13 12 12 12 12 12 13`
→ 12에서 안정, 가끔 13. 상한이 13이라 그 13번째가 leak 없이 버려지지 않는다.
`leak` 이 3까지 올라간 것도 확인 — 만료 경로가 제대로 돈다.

**밸런스 주의**: 빈도가 500 → 750ms 로 느려져 **채팅發 leak 증가 속도가 2/3로 준다.**
앞서 적은 추정치도 그만큼 낮춰 봐야 한다.

**같이 실린 것**: `src/scenes/phases/LivePhase.ts` 에 네(또는 사람) 미커밋분
`playSfx(this, 'sfx.text', 0.08)` 한 줄이 있어서 분리해 stage 할 수 없었다. 내 커밋에 같이 실렸다.
값은 그대로다.

**`src/scenes/TitleScene.ts` 는 지금 typecheck 가 깨져 있다** — `playSfx` 를 import 만 하고
안 쓴다 (TS6133). 내가 건드린 파일이 아니라 그대로 뒀다. 작업 중이면 마저 해 줘.
→ (해결됨: Codex 의 `14259ee` 에서 처리)

---

## HO-025  (from: Claude Code → 문서 반영 요청)  D7 · **01-ARCHITECTURE §4-1 배율 규약 변경**

**바뀐 것**: `src/render/scaler.ts` 가 더 이상 정수 n · 1/n 로 양자화하지 않는다.
창을 **꽉 채운다** (16:9 유지, 짧은 쪽 기준). 사용자 확정.

**왜**: 기준이 1920x1080 이라 **1배와 1/2배 사이에 아무것도 없었다.** 실측:

```
1920x1081 -> 캔버스 1920x1080        1920x1079 -> 캔버스 960x540
```

1픽셀 차이로 반토막이다. 1080p 모니터라도 브라우저를 창 모드로 열면(주소창·북마크바)
높이가 1040 근처가 되어 무조건 1/2 로 떨어졌다. 노트북(1366x768, 1600x900)은 **항상** 1/2.
심사자가 F11 을 누른다는 보장이 없다.

**dev 서버와 빌드는 원래부터 같았다.** 빌드해서 `/the-undying-shop/` 하위 경로로
(Pages 와 같은 조건) 띄우고 dev 와 나란히 재봤는데 다섯 해상도 전부 픽셀 단위로 동일했다.
「npm 은 크고 빌드는 작다」는 두 번 볼 때 **창 높이가 달랐던 것**이다.

**모아레 대책**: §4-1 이 정수 배율을 요구한 이유(디더 격자)는 그대로 유효하다. 그래서
배율에 따라 보간을 바꾼다 — `imageRenderingFor()`:
- 정수배 또는 정확히 1/n → `pixelated` (도트 경계 유지, 모아레 없음)
- 그 사이 → `auto` (브라우저 보간). 최근접으로 어중간하게 줄이면 줄무늬가 생긴다.
  디더 램프는 원래 멀리서 회색으로 읽히라고 그린 것이라 부드러워져도 의도가 산다

**캔버스 내부 해상도는 여전히 1920x1080 이다.** 배율은 CSS 단계에서만 걸리므로
씬 좌표·`L` 상수는 하나도 안 바뀐다. 어중간한 배율에서 클릭 좌표가 밀리는지도 확인했다
(1366x768 = 0.711배에서 타이틀 버튼 클릭 정상).

| viewport | 캔버스 | 채움 | 보간 |
|---|---|---|---|
| 1920x1080 | 1920x1080 | 100% | pixelated |
| 1920x1040 | 1849x1040 | 96%x100% | auto |
| 1600x900 | 1600x900 | 100% | auto |
| 1366x768 | 1365x768 | 100% | auto |
| 2560x1440 | 2560x1440 | 100% | auto |

**이름도 바꿨다**: `applyIntegerScale` → `applyFitScale` (`src/main.ts` 한 줄).

**상태**: [ ] `01-ARCHITECTURE §4-1` 문서 반영 필요 (사람)

---

## HO-026  (from: Claude Code → to: Codex)  D8 · **자동 전투 정책이 지금 씬에 있다**

**무엇을 했나** (사용자 확정): 평범한 전투 한 수를 `LivePhase` 가 알아서 낸다.
플레이어는 **무전 갈림길**과 **체력이 바닥일 때 물약**에만 손을 댄다.
한 수 사이에 `AUTO_TURN_MS = 900` 만큼 쉬어서 진행이 보이게 했다.

**규칙은 하나도 안 옮겼다.** 고르면 어떻게 되는지는 전부 `core/systems/combat.ts` 그대로다.
씬이 하는 건 `COMBAT/CHOOSE` 를 대신 눌러 주는 것뿐이다. 다만 **어떤 순서로 누르는가**는
설계 판단이라 CLAUDE.md §2 의 경계에 걸친다. 지금 정책은 세 줄이다:

```ts
if (ratio < 0.4) return 'DEFEND';
if (turn === 0 && ratio >= 0.7) return 'APPEAL';
return 'ATTACK';
```

**옮길 만하다고 보면 가져가라.** `core` 에 `autoCombatChoice(hero, encounter)` 같은
순수 함수를 두고 씬은 그걸 부르기만 하면 된다. 시뮬(`npm run sim`)이 자동 전투를
그대로 돌려볼 수 있게 되는 이점도 있다.

물약을 물어보는 조건은 `useCombatItem` 이 실제로 받아 주는 조건과 **같게** 맞춰 뒀다
(POTION · healing > 0 · utilitySlot 에 장착 · 재고 있음 · hp < maxHp). core 쪽 조건이
바뀌면 `LivePhase.potionAsk()` 도 같이 봐야 한다.

**상태**: [ ] core 로 옮길지 판단

---

## CCR-006  (승인: 사람, 2026-08-26 · 반영: Claude Code(서브))  D6

**한 줄** — 방송이 끝나도 장비가 저절로 돌아오지 않는다. **시체에 남고, 소생실에서 회수한다.**

### 왜
「1번 루프를 돈 다음에 아이템을 바로 획득하는 것이 아니라, 소생실에서 용사의 인벤토리를
볼 수 있고 내가 그 아이템을 가져갈 수 있게」 — 사람 요청 (2026-08-26).
전에는 `ANNOUNCE → 다음 날` 에서 `shelf: [null,null,null]` 로 지우기만 해서, 들려 보낸 장비가
어디로 갔는지 화면에 한 번도 나오지 않았다.

### 계약 변경 (2곳)
```ts
// src/core/types.ts — Corpse
carried?: ItemId[];   // 죽을 때 지니고 내려간 장비. 선택 필드 — 옛 세이브·기존 테스트 리터럴이 그대로 통과한다

// src/core/actions.ts
| { type: 'REVIVE/LOOT'; starId: StarId; itemId: ItemId }
```

### core 변경 (Codex 영역 — 승인 위임 아래 서브 Claude 가 대신 씀)
- `systems/economy.ts` **신규 3함수**
  - `detachCarried(state, shelf)` — 사망 시 진열대 장비를 인벤토리에서 빼 시체로 옮긴다
  - `takeCorpseCarried(state, starId, itemId)` — 한 점 회수
  - `reclaimCorpseCarried(state, starId)` — 시체가 소생실을 떠날 때 **남은 것을 돌려준다**
- `reducer.ts`
  - `concludeRun()` — `corpse.carried` 를 채우고 `inventory` 를 줄인다
  - `REVIVE/PAY` — `reclaimCorpseCarried` 를 먼저 통과시킨다
  - `REVIVE/LOOT` 케이스 추가
- `discardReviveCorpse` / `damageAutopsyCorpse` — 몸을 처리하기 전에 남은 장비를 먼저 돌려준다

### 밸런스에 손대지 않았다
- **RNG 스트림을 건드리지 않는다** — 사망 시 새로 뽑는 난수가 0개다 (`rngCursor` 불변).
  유품(`corpse.loot`) 생성 시점·개수·`balance.autopsy` 는 전과 똑같다.
- `npm test` 실패 개수 **11 → 11** (같은 목록). 전부 이 CCR 이전부터 깨져 있던 것들이다
  (combat/dive/office 진행 중 작업).
- **장비를 잃는 경로는 만들지 않았다.** 회수하지 않아도 소생·폐기·훼손 어느 쪽이든 돌아온다.
  「회수 안 하면 잃는다」로 조이는 것은 밸런스 확인 뒤에 한 줄(`reclaimCorpseCarried` 호출 제거)로 된다.

### 화면 (Claude Code 영역)
`RevivePhase.ts` — 작업대에 「소지품 N점」 버튼, 누르면 **편성실 인벤토리와 같은 창**
(`ui.inventory.window`)이 열린다. 장비를 누르면 `REVIVE/LOOT`.

**상태**: [x] 반영됨 — 브라우저에서 1일차 진열 → 사망 → 2일차 소생실 회수까지 실측 확인.

---

## CCR-007  (승인: 사람, 2026-08-26 · 반영: Codex)  D8

**한 줄** — 편성실 판매는 인벤토리 즉시 처분이 아니라, 진열 상품에 가격을 제안하고 구매 확률을 판정하는 거래다.

### 사람 요청
- 장비를 진열대에 먼저 배치하고, 진열된 상품 전체를 한 번에 판매 제안한다. 별도의 판매 대상 선택은 없다.
- 무기·방어구·기타 종류별로 하루 한 점만 판매한다. 성공하면 해당 종류의 판매 버튼은 비활성화한다.
- 흥정 팝업의 슬라이더로 가격 배율을 정한다. 가격이 낮을수록 구매 확률이 높고, 높을수록 낮다.
- 가격 제안은 최대 3회다.

### 계약 변경
```ts
// src/core/actions.ts
| { type: 'OFFICE/SALE_PRICE_SET'; multiplier: number }
| { type: 'OFFICE/SELL_BATCH' }
```
가격 제안은 배율과 흥정 차수만 확정하고 구매 판정을 하지 않는다. 이후 일괄 판매가 진열 상품 전체에
단 하나의 판정을 적용해 전부 성공하거나 전부 실패한다. 판정은 `state.rngCursor`를 한 번 소비하며,
배율 범위·증분·확률식·최대 흥정 횟수는 모두 `content/balance.json > shopSale`에서 읽는다.

### 상태 저장
기존 `flags: Record<string, boolean>` 계약을 유지하기 위해 날짜·슬롯·시도 번호를 키에 인코딩한다.
성공 여부도 날짜·슬롯별 플래그로 저장하므로 새 필드와 세이브 마이그레이션은 필요 없다.

**상태**: [x] 반영됨 — 가격 제안→용사 반응→가격표 갱신→일괄 판매, 판매된 슬롯의 당일 잠금, 단일 시드 판정 및 3회 흥정 구현.

---

## HO-027  (from: Codex → to: Claude Code)  D8 · **소생실 UI 정리 및 검수 도장 유지**

**필요한 것**: `RevivePhase.ts`에서 다음 화면 변경을 적용한다.

- 우측 하단의 현재 파트/단계 표기는 그대로 유지한다.
- 좌측 하단에 나오는 대사는 제거한다.
- 소생 화면의 기존 하단 버튼은 제거하고, `폐기`를 두 번째 버튼 위치로 옮긴다.
- 세 번째 버튼은 장비창이 아니라 `창고`를 열도록 바꾼다. 기존 시체 소지품 회수(`REVIVE/LOOT`) 동선은 창고 안에서 계속 접근 가능해야 한다.
- 시체 검수표에 찍은 도장은 화면 재구축이나 소생실 재방문 뒤에도 사라지지 않게 한다. 가능하면 저장/불러오기 뒤에도 같은 시체·같은 검수 결과에는 유지한다.

**이유**: 사람 요청(2026-08-26). 소생실 조작 수를 줄이고, 이미 확인한 검수 결과가 다시 미확인처럼 보이지 않게 한다.

**계약 주의**: 도장 유지에 새 `GameState` 필드나 액션이 필요하면 임의 수정하지 말고 CCR로 제안한다. 기존 시체 결과/플래그만으로 표현할 수 있으면 계약 변경 없이 처리한다.

**내가 하지 않은 이유**: `src/scenes/phases/RevivePhase.ts`, UI 창 연결은 Claude Code 소유다.

**상태**: [ ] 미처리

---

## HO-028  (from: Codex → to: Claude Code)  D8 · **저장 슬롯 3개 + 이어하기**

**필요한 것**: 현재 단일 자동 저장(`src/scenes/run.ts`의 `undying-shop:save:v1`)을 독립적인 3개 슬롯으로 바꾼다.

- 슬롯 키는 버전이 포함된 고정 키로 관리한다. 예: `undying-shop:save:v2:slot:1` ~ `:3`.
- 각 슬롯에는 `GameState`와 함께 저장 시각을 기록한다. 표시에는 최소한 `DAY n`, 현재 단계, 저장 시각이 보이면 된다.
- 진행 중에는 현재 선택된 슬롯에 상태 변경마다 자동 저장한다. HUD 저장 버튼은 같은 슬롯에 즉시 저장한다.
- HUD의 저장 아이콘을 누르면 **저장 / 불러오기 팝업**을 연다. 팝업에는 1~3번 슬롯을 한 화면에 보이며, 각 슬롯은 빈 슬롯 또는 `DAY n · 단계 · 저장 시각`을 표시한다.
- 팝업의 `저장` 모드에서 슬롯을 누르면 해당 슬롯에 현재 진행을 저장한다. 비어 있지 않은 슬롯은 같은 팝업 안에서 한 번 더 눌러 덮어쓰기를 확정한다.
- 팝업의 `불러오기` 모드에서는 비어 있지 않은 슬롯만 누를 수 있다. 슬롯을 누르면 `GAME/LOAD` 뒤 DayScene을 현재 저장 단계로 다시 구성하고 팝업을 닫는다.
- 팝업 밖 클릭 또는 닫기 버튼은 저장·불러오기 없이 팝업만 닫는다.
- 타이틀의 `새로 시작`은 1~3번 슬롯을 선택한 뒤 그 슬롯에 새 런을 만들고 저장한다. 기존 데이터가 있는 슬롯은 덮어씀을 명확히 확인받는다.
- `이어하기`는 비어 있지 않은 슬롯만 활성화하고, 슬롯을 선택해 해당 상태를 `GAME/LOAD`로 복원한다.
- JSON 파싱 실패·구 버전·불완전 상태는 해당 슬롯을 비어 있는 것으로 취급해 게임이 멈추지 않게 한다. 이전 단일 키는 마이그레이션하지 않아도 된다.
- 저장은 `GameState`의 직렬화본만 보관한다. Phaser 오브젝트나 씬 상태를 저장하지 않는다.

**이유**: 사람 요청(2026-08-26). 여러 플레이 기록을 보존하고 이후 이어서 플레이할 수 있어야 한다.

**계약 주의**: `GameState` 및 액션 계약 변경은 필요 없다. 기존 `GAME/LOAD`를 유지한다.

**내가 하지 않은 이유**: `src/scenes/run.ts`, `TitleScene.ts`, `DayScene.ts`는 Claude Code 소유이며 localStorage/버튼 UI 연결도 그 영역이다.

**상태**: [x] 반영됨 (`fc33f33`, Claude Code) — `run.ts`에 3슬롯 저장 백엔드(이미 같은 폴더에서
반영돼 있었다), `DayScene.ts` HUD 저장 아이콘의 저장/불러오기 팝업(마찬가지), `TitleScene.ts`의
새로 시작/이어하기 슬롯 선택 팝업(이번에 추가)까지 셋이 맞물려 명세 전체가 돈다.

- 새로 시작 → 슬롯 1~3 중 고른다. 빈 슬롯은 즉시 시작, 채워진 슬롯은 한 번 더 눌러야
  덮어쓴다 (`정말 덮어쓰시겠습니까?` → `덮어쓰기 확정`)
- 이어하기 → 비어 있는 슬롯은 버튼이 비활성화된다
- 진행 중 상태 변경마다 활성 슬롯에 자동 저장, HUD 저장 아이콘은 같은 팝업에서 슬롯별 저장/불러오기
- JSON 파싱 실패·구버전은 `isSavedState` 가 걸러 빈 슬롯 취급 — 게임이 멈추지 않는다

버그 하나 잡음: 팝업의 비활성 버튼은 히트 영역이 없어 클릭이 뒤 반투명 배경(닫기 트리거)까지
뚫고 지나가 팝업이 조용히 닫혔다. 슬롯 행 배경을 인터랙티브로 잡아 흡수하도록 고쳤다
(`TitleScene.ts` 쪽만 — `DayScene.ts` 팝업은 손대지 않았다).

**검증**: puppeteer(1920x1080, 시스템 Chrome) — 새로 시작→빈 슬롯 즉시 시작·자동 저장,
이어하기→빈 슬롯 클릭 무반응(팝업 유지)·저장된 슬롯 불러오기(seed 일치 확인), 덮어쓰기
확인 2클릭 플로우. `npx tsc --noEmit`·`npm run build` 통과.

---

## HO-029  (from: Codex → to: Claude Code)  D8 · **흥정 팝업 레이어·가독성 보정**

**필요한 것**: 편성실 흥정 UI를 다음처럼 수정한다.

- 인벤토리 창이 열려 있어도 `흥정하기`를 누르면 흥정 팝업이 모든 인벤토리 오브젝트보다 위에 렌더되어야 한다. 흥정 팝업을 열 때 팝업 배경·텍스트·슬라이더·버튼을 동일한 최상위 depth 그룹으로 올린다.
- 가격 배율(`x0.5` 등)과 상품별 구매 확률 텍스트의 폰트 크기를 키운다.
- `가격 제안` 제목 아래의 조절바와 배율 증감 표기(`x.05`)는 현재 위치에서 20px 아래로 내린다. 배율/확률 텍스트가 겹치지 않게 팝업의 나머지 요소도 함께 재정렬한다.

**이유**: 사람 요청(2026-08-26). 인벤토리보다 흥정 결정이 앞에 와야 하고, 가격·구매 확률을 즉시 읽을 수 있어야 한다.

**계약 주의**: 판매 확률·가격 배율 계산식은 변경하지 않고 렌더 순서와 UI만 조정한다.

**내가 하지 않은 이유**: `src/scenes/phases/OfficePhase.ts`의 팝업/인벤토리 렌더링은 Claude Code 소유다.

**상태**: [ ] 미처리

---
---

# 세션 인계 (2) — Claude Code → 다음 Claude Code   D8 · 2026-08-26 밤

> **기준점: `37ad50c`. 이 시점의 `origin/main` 과 로컬 커밋이 같다.**
> 위쪽 「세션 인계」(D1 밤) 는 그대로 유효하다. 아래는 그 뒤로 달라진 것만 적는다.

## 0. 시작하자마자 — 30초

```bash
git fetch origin main && git rev-list --left-right --count HEAD...origin/main
git status --porcelain -- src content tests    # 상대 세션이 뭘 들고 있는지부터
npx tsc --noEmit
```

`git pull --rebase` 는 여전히 항상 실패한다 (사람의 미커밋 문서). `fetch` + `rev-list` 로 확인하고
뒤처져 있으면 `git merge --ff-only origin/main`.

## 1. ⚠️ 지금 이 폴더에는 Claude 가 둘 있다

`07-PARALLEL-DEV.md` §3 의 소유권 표는 **Claude Code ↔ Codex** 를 가르는 선이다.
지금은 **Claude 가 둘(메인/서브)** 이라 그 표로는 둘 사이가 전혀 안 막힌다. 둘 다
`src/scenes/**` `src/ui/**` `public/**` `content/manifest.json` 을 쓴다.

D8 밤 현재 상대 세션이 **미커밋으로 들고 있는 파일** — 손대지 마라:

```
src/scenes/phases/OfficePhase.ts     src/scenes/phases/RevivePhase.ts
src/core/**  tests/**  content/balance.json  content/floors.json  src/core/systems/forecast.ts(신규)
```

- **`npx tsc` 가 빨간 것은 대개 네 탓이 아니다.** 이번 세션에도 `OfficePhase.ts` 가
  한때 **파스 에러**라 앱이 아예 안 떴고(그동안 브라우저 검증이 통째로 막혔다),
  지금은 `RevivePhase.ts` 에 TS6133 5건이 떠 있다. 전부 상대의 작업 중 상태다.
  **네 파일에 에러가 있는지만 보고, 남의 파일 에러는 고치지 마라.**
- `npm test` 는 `roster.spec.ts` **5건이 원래 빨갛다** (Codex 진행 중). 77/82 통과가 정상 상태다.
- 커밋은 반드시 `git add <내 경로만>`. `git add .` 금지.

## 2. 이번 세션에 끝낸 것

| 항목 | 커밋 | 요지 |
|---|---|---|
| **HO-028 저장 슬롯 3개 + 이어하기** | `fc33f33` `c30f50d` `eb7abd5` | 타이틀 「새로 시작/이어하기」가 슬롯 선택 팝업을 연다. HUD 저장 아이콘은 슬롯별 저장/불러오기 팝업 |
| **오프닝 스토리 7장** | `7997f02` | 새 슬롯 시작 시에만 재생. 이어하기는 건너뛴다 |
| **불러오기 화면 겹침 버그** | `37ad50c` | 아래 §3 |

### 알아 둘 것
- `src/scenes/OpeningScene.ts` — 8장(7장 + 암전 후 로고). 전환은 오른쪽으로 밀기 480ms.
  **음악을 일부러 안 넣었다** — 서술자의 무심함이 톤이라 브금이 붙으면 감정이 생긴다.
  5장은 원본 `5장.png`(계단 원경) 대신 **`5장대체.png`(들것에 덮인 시체)** 를 골랐다.
- 스토리 아트는 `story.ch1~7` 슬롯. **`tools/fit-art.mjs --dither` 를 거쳐 1비트로 구웠다.**
  원본을 `final/` 에 그냥 복사하면 안 된다 (HO-020) — 게임은 멀쩡히 돌고 화면만 회색 얼룩이 된다.
- 타이틀 팝업의 덮어쓰기 확인은 **버튼 글자를 바꾸지 않고 빨간 글씨(danger)로만** 경고한다 (사용자 확정).

## 3. `scene.restart()` 는 단계 씬을 안 내린다 — 다시 밟지 마라

이번 세션 최대의 함정이었다. **저장은 원래 멀쩡했고, 깨진 건 불러온 뒤 화면이었다.**

```
슬롯 불러오기 → 이전 방과 새 방이 한 화면에 겹쳐 그려짐
(실측: 왼쪽 편성실「첫 영업」+ 오른쪽 소생실 작업대가 동시에)
```

`this.scene.restart()` 는 **DayScene 만** 다시 시작한다. DayScene 이 `launch` 해 둔 단계 씬은
그대로 살아남는데 `create()` 가 `launched = null` 로 지워서 아무도 stop 하지 않았다.
살아남은 씬은 **버린 store 를 붙들고** 있어서 입력을 받으면 이미 버린 판에 dispatch 까지 한다.

- `DayScene.stopPhaseScenes()` — `create()` 첫머리에서 단계 씬 표 전체를 훑어 내린다.
  `launched` 하나만 믿지 않는다 (재시작 경로가 타이틀→새 판 / 저장창→불러오기 둘이라 어긋난다).
- `run.ts` 의 `stopAutosave` — 판을 갈아끼울 때 직전 판의 자동 저장 구독을 끊는다.
  안 끊으면 버린 store 가 슬롯을 조용히 덮어쓴다.

**저장 규칙 요약**: 자동 저장은 「지금 판을 시작/불러온 슬롯」에 상태가 바뀔 때마다 쓴다.
HUD 팝업에서 **다른 슬롯에 저장하면 그건 스냅샷**이라 이후 진행에 따라 변하지 않는다. 실측 확인했다.

## 4. 다음에 할 일 — 순서대로

1. **HO-029 흥정 팝업 레이어·가독성** (`OfficePhase.ts`) — 미처리.
   ⚠️ 상대 세션이 이 파일을 잡고 있다. **시작 전에 `git status` 로 비었는지 확인하거나 사람에게 물어라.**
   깊이 문제는 이번에 HUD 저장 팝업에서 쓴 처방(`this.scene.bringToTop(...)` + 팝업 오브젝트를
   한 depth 그룹으로)을 그대로 옮기면 된다.
2. **HO-027 소생실 UI 정리 + 검수 도장 유지** (`RevivePhase.ts`) — 미처리. 같은 이유로 조율 먼저.
   도장 유지에 새 `GameState` 필드가 필요하면 **임의로 넣지 말고 CCR** 로 올려라.
3. **⚠️ 단계 화면이 통째로 비는 현상 확인** — §5

## 5. ⚠️ 미해결 관찰 — 단계 화면이 HUD만 남고 빈다

세션 막바지 실측에서 **편성실·소생실 화면이 배경 하나 없이 새까맣게** 나왔다 (HUD 만 보임).

- **불러오기 전에도 그랬고**, 내 변경이 닿지 않는 경로(새 판 시작)에서도 나왔다.
  → `37ad50c` 탓이 아니다. 30분 전 같은 화면은 정상적으로 그려졌다.
- 그 사이에 들어온 것: 상대 세션의 `c6c0d1c`(소생실·편성실 UI 개선) 커밋과,
  `OfficePhase.ts`·`RevivePhase.ts` 미커밋 편집.
- **다음 세션이 그쪽 작업이 안정된 뒤 다시 봐라.** 여전히 빈다면 그 두 파일부터 의심한다.
  콘솔 에러는 0 이었으므로 예외로 죽은 게 아니라 **아무것도 안 그린 것**이다.

## 6. 검증은 아껴 써라 — 사람 지시

> **「검증 횟수를 좀 줄여줘 너무 오래 걸린다」** (2026-08-26)

- **한 작업당 puppeteer 스크립트 1개, 실행 1회.** 확인할 분기가 여럿이면
  **한 세션 안에서 이어서** 돈다. puppeteer 는 실행마다 새 임시 프로필이라
  **localStorage 가 날아간다** — 세이브 슬롯처럼 상태가 이어져야 하는 검증은
  처음부터 한 스크립트로 짜야 한다 (이번에 두 번 나눠 돌렸다가 헛돌았다).
- 스크린샷은 **핵심 2~3장**만 읽는다. 8장 전부 열지 마라.
- **순수 레이아웃 수정(버튼 폭·자간·글자색)은 재검증하지 않는다.** `tsc` + 스크린샷 1장이면 된다.
- 타이틀 프리로드가 끝나기 전 클릭은 그냥 흘러간다. 고정 대기 대신
  **`__store` 가 생길 때까지 클릭을 재시도**하는 편이 빠르고 안정적이다.
- dev 서버는 **내 포트(5233)** 로 따로 띄우고 살려 둔 채 HMR 로 재사용한다.
  상대 것(5173/5174/5175)을 끄지 마라.

**상태**: [x] 인계용 — 처리 불필요

---

## HO-029  (from: Claude Code → to: Codex)  D6

**필요한 것**: 시체의 **부위별 손상 상태**. 지금은 몸 전체가 `INTACT` / `DAMAGED` 둘뿐이다.

```ts
// src/core/types.ts
export type CorpseGrade = 'INTACT' | 'DAMAGED';   // ← 몸 전체를 한 값으로만 나눈다
```

소생실 작업대에 **부위 마크**를 붙였다 (`ui.revive.mark`). 시체 위 두 곳을 가리키고
선을 뻗어 `CHEST` / `LEFT LEG` 라벨을 띄운다. 손상된 부위에는 상처 표시
(`ui.revive.mark.wound`)를 마크 자리에 덮는다.

그런데 **어느 부위가 상했는지가 state 에 없다.** 그래서 지금은 `grade === 'DAMAGED'`
면 **두 부위 모두**에 상처를 얹고 있다. 몸이 훼손됐다는 사실은 맞지만, 부위는 지어낸 값이다.

M09 검시실 화면(예상 이미지 · `아트-발주서/아트_V3/예상 이미지/소생실.png`)은 이렇게 돼 있다:

```
LEFT ARM ....... LOST
CHEST .......... TORN
HEAD ........... INTACT
```

**제안** — `Corpse` 에 부위 표를 하나 달아 달라. 계약 파일 변경이라 CCR 이 필요하면 올려라.

```ts
export type PartState = 'INTACT' | 'TORN' | 'LOST';
parts?: { part: 'HEAD' | 'CHEST' | 'LEFT ARM' | 'RIGHT ARM' | 'LEFT LEG' | 'RIGHT LEG'; state: PartState }[];
```

선택 필드로 두면 예전 세이브와 기존 테스트 리터럴이 그대로 통과한다 (`carried?` 와 같은 방식).

**화면 쪽은 준비돼 있다** — `MARK_SPOTS`(`RevivePhase.ts`) 의 `part` 문자열과 손상 판정만
그 표로 갈아끼우면 끝난다. 부위가 3개든 6개든 자리만 늘리면 된다.
**내가 하지 않은 이유**: `src/core/types.ts` 는 계약 파일이고, 부위 손상은 검시 규칙이다.

**상태**: [ ] 미처리
