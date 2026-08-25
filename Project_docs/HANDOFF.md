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
