# 07 · Claude Code × Codex 병렬 개발 규약

> **목표: 두 에이전트가 같은 시간에 다른 파일을 건드려서, 합칠 때 충돌이 0에 수렴하게 한다.**
> 6일 일정에서 머지 충돌 한 번은 반나절이다. 아래 규칙은 취향이 아니라 **일정 방어선**이다.

---

## 1. 대원칙 — 모듈이 아니라 **레이어**로 나눈다

모듈(M01~M12) 단위로 사람을 나누면 반드시 충돌한다. 한 모듈이 `core`와 `scenes`를 동시에 건드리기 때문이다.

우리 아키텍처에는 이미 **단단한 경계**가 하나 있다:

> `src/core/`는 `phaser`를 import 하지 않는다. (`01-ARCHITECTURE.md`)

이 선을 그대로 **분담선**으로 쓴다.

```
        ┌──────────────────────────────────────────┐
        │  CODEX 영역                               │
        │  src/core/**   content/**   tests/**      │
        │  순수 TypeScript · 결정적 · 테스트로 검증  │
        └────────────────┬─────────────────────────┘
                         │  ← 계약(Contract): types.ts / actions.ts
                         │     이 선은 D1 오전에 얼린다
        ┌────────────────┴─────────────────────────┐
        │  CLAUDE CODE 영역                         │
        │  src/scenes/**  src/ui/**  src/render/**  │
        │  src/platform/** src/audio/**  tools/**   │
        │  Phaser · 화면 · 브라우저 실물 검증        │
        └──────────────────────────────────────────┘
```

**두 영역은 서로의 파일을 절대 열지 않는다.** 필요하면 계약을 통해서만 대화한다.

---

## 2. 왜 이렇게 나누는가 (각자의 강점)

| | **Codex** | **Claude Code** |
|---|---|---|
| 잘하는 것 | 스펙이 명확한 로직을 혼자 오래 파고들기, 순수 함수, 수식, 테스트 작성, 대량 데이터 파일 채우기 | 레포 전체를 훑으며 통합하기, 실행해보고 고치기, 브라우저로 눈으로 확인하기, 원인 추적 |
| 피드백 루프 | `npm test` (화면 불필요) | 개발 서버 + 브라우저 스크린샷 |
| 우리 프로젝트에서 | `core/`가 Phaser를 모르므로 **엔진 지식 없이도 정확한 코드**가 나온다 | 픽셀 정렬·폰트 뭉개짐·레이아웃 어긋남은 **직접 봐야만** 잡힌다 |
| 대회 관점 | 심사 항목 「Codex 협업」의 **증빙 본체**. 게임 규칙 전체를 Codex가 짠 것이 된다 | 통합·검증·제출물 준비를 맡아 **완주 가능성**을 지킨다 |

이 배치의 핵심은 **Codex에게 화면이 필요 없는 일만 준다**는 것이다.
Codex는 브라우저를 못 보므로 UI를 맡기면 "될 것 같은 코드"가 나오고, 그걸 검증하는 시간이 개발 시간보다 길어진다.

---

## 3. 파일 소유권 표 (이 표가 최종 권위)

| 경로 | 소유자 | 상대는 |
|---|---|---|
| `src/core/types.ts` | **계약 — 공유** | §5 절차 없이 수정 금지 |
| `src/core/actions.ts` | **계약 — 공유** | §5 절차 없이 수정 금지 |
| `src/core/state.ts` `reducer*.ts` `store.ts` `rng.ts` `content.ts` `sim.ts` | **Codex** | 읽기만 |
| `src/core/systems/**` (economy, dive, opinion, roster, narrative) | **Codex** | 읽기만 |
| `content/*.json` (balance, floors, items, stars, personas, chat, radio, narrative) | **Codex** | 읽기만 |
| `content/manifest.json` | **Claude Code** | Codex 건드리지 않음 |
| `tests/**` | **Codex** | 읽기만 |
| `src/main.ts` `src/config.ts` | **Claude Code** | 읽기만 |
| `src/scenes/**` | **Claude Code** | 읽기만 |
| `src/ui/**` | **Claude Code** | 읽기만 |
| `src/render/**` (palette, scaler, assets) | **Claude Code** | 읽기만 |
| `src/platform/**` `src/audio/**` | **Claude Code** | 읽기만 |
| `tools/**` `public/**` `index.html` | **Claude Code** | 읽기만 |
| `vite.config.ts` `tsconfig.json` `package.json` | **Claude Code** | 추가 필요 시 요청만 |
| `.github/workflows/**` | **Claude Code** | — |
| `Project_Project_docs/**` `AGENTS.md` `CLAUDE.md` | **사람(당신)** | 둘 다 제안만, 직접 수정 금지 |
| `Project_Project_docs/CODEX_LOG.md` | **Codex 우선** | Claude Code는 자기 항목만 추가 |

### 한 줄 요약
> **Codex는 `src/core/`, `content/`, `tests/`.
> Claude Code는 그 외 전부.
> `types.ts`와 `actions.ts`는 아무도 혼자 못 고친다.**

---

## 4. 모듈별 분해 (M01~M12를 두 갈래로)

| 모듈 | **Codex 파트** | **Claude Code 파트** |
|---|---|---|
| M01 App Shell | — | 전부 (셸·스케일·폰트·타이틀·프리로드) |
| M02 코어 상태머신 | 전부 (types/actions/reducer/store/rng/sim) | `DayScene` 호스트 + HUD 바인딩 |
| M03 로스터·페르소나 | `systems/roster.ts`, `stars.json`, `personas.json`, 열화 배율 | `ui/Portrait.ts` 균열 오버레이, 승계 화면 |
| M04 소생실 | `systems/economy.ts` 비용 산식 + 테스트 | `RevivePhase.ts` 화면·영액 연출 |
| M05 캐스팅·진열대 | 도달층 계산, `items.json` 12종 | `CastingPhase.ts` `ShopPhase.ts` 3칸 UI |
| M06 하강·무전 ★ | `systems/dive.ts` 전체, `floors.json`, `radio.ko.json`, 거짓말 콜백 로직 | `DivePhase.ts` 탑 단면도 렌더·무전 UI·타이머 |
| M07 채팅·슈퍼챗 | `systems/opinion.ts`, leak/역풍/payPool, `chat.ko.json` | `ui/Ticker.ts` 풀링, 삭제 버튼, 슈퍼챗 연출 |
| M08 사망·기록 | 팬 변동 계산, 정산 집계 | `DeathPhase.ts` RECORD_BREAK 연출 전부 |
| M09 검시·발표 | 4조합 판정 로직, 은닉 상태 전이, 유품 드랍 | `AutopsyPhase.ts` `AnnouncePhase.ts` `SealStamp.ts` |
| M10 경제·밸런스 | **전부 단독** (`balance.json` + 시뮬 튜닝) | — |
| M11 서사·엔딩 | 트리거 테이블, `judgeEnding`, `narrative.ko.json` | `EndingScene.ts` 연출, 성적표 화면 |
| M12 플랫폼·배포 | — | 전부 |

**규칙**: 같은 모듈을 동시에 작업해도 된다. 파일이 겹치지 않기 때문이다.
오히려 그게 이상적이다 — Codex가 `dive.ts`를 짜는 동안 Claude Code는 `DivePhase.ts`의 화면을 만든다.

---

## 5. 계약(Contract) — 유일한 위험 지점

`types.ts`와 `actions.ts`는 양쪽이 모두 의존한다. 여기만 관리하면 나머지는 안전하다.

### 5-1. 계약 동결 (D1 오전, 1회)
1. `Project_Project_docs/02-DATA-SCHEMA.md`를 그대로 `src/core/types.ts`에 옮긴다 — **Claude Code가 한다**
2. `Project_Project_docs/modules/M02`의 Action 유니온을 `src/core/actions.ts`에 옮긴다 — **Claude Code가 한다**
3. 이 두 파일을 커밋하고 **`main`에 먼저 올린다**
4. 이후 둘 다 이 커밋에서 갈라져 나간다

**왜 Claude Code가 하나**: 계약 파일은 화면 쪽 요구사항(HUD가 뭘 읽는지)까지 반영해야 하고, 통합을 맡은 쪽이 정하는 게 맞다.

### 5-2. 계약 변경 절차 (CCR — Contract Change Request)
계약을 고쳐야 한다고 판단되면 **코드를 고치기 전에**:

```
1) 작업을 멈추고 `Project_Project_docs/02-DATA-SCHEMA.md`에 변경안을 적는다
2) 사람에게 보고한다: "무엇을, 왜, 상대 영역에 어떤 영향"
3) 사람이 승인하면 → Claude Code가 계약 파일 수정 + main에 push
4) 양쪽이 rebase 후 작업 재개
```

**둘 중 누구도 계약 파일을 임의로 고치지 않는다.** 이 규칙 하나가 충돌의 90%를 막는다.

### 5-3. 계약이 없을 때의 임시 대응
Codex의 `core`가 아직 없어도 Claude Code는 화면을 만들 수 있어야 한다.

```ts
// src/scenes/__fake/FakeStore.ts   (Claude Code 소유, 최종 빌드에서 제외)
export const fakeStore: Store = { getState: () => FAKE_STATE, dispatch: () => {}, subscribe: () => () => {} };
```
`FAKE_STATE`는 `types.ts`만 참조한다. 실제 `core`가 도착하면 import 한 줄만 바꾼다.

**반대 방향도 마찬가지다.** Codex는 화면 없이 `sim.ts`로 검증한다. 서로를 기다리지 않는다.

---

## 6. Git 운용 — **한 폴더, 한 브랜치(main)**

두 에이전트가 **같은 작업 폴더를 공유한다.** git 브랜치는 폴더 단위라서, 한쪽이 브랜치를 바꾸면
같은 폴더에서 작업 중인 상대의 파일까지 통째로 바뀐다. **그래서 브랜치를 나누지 않는다.**
파일 소유권(§3)이 이미 충돌을 막고 있으므로, 브랜치는 이 구성에서 이득 없는 위험이다.

### 규칙
1. 둘 다 **`main`에서 직접 작업한다.** 브랜치를 만들거나 전환하지 않는다.
2. **작업 시작 전** `git pull --rebase origin main`
3. 한 덩어리가 끝날 때마다 **자기 소유 파일만** 커밋하고 **즉시 push** 한다.
   `git add <자기 경로만>` — 예: `git add src/core content tests`
4. **push 직전에 다시** `git pull --rebase origin main`
5. 빌드가 깨진 상태로 push 하지 않는다 — `npm run typecheck && npm test` 통과 후에만
6. force push 절대 금지

### ⛔ 파괴적 명령 금지 — 상대의 미커밋 작업이 사라진다
```
git add .              git commit -a
git reset --hard       git checkout -- .      git restore .
git stash              git clean -fd
git checkout <브랜치>   git switch
```
이 중 하나가 필요하다고 판단되면 **실행하지 말고 사람에게 요청해라.**

### 커밋 접두어에 주체를 남긴다 (CODEX_LOG 작성용)
```
[codex] M06: 갈림길 판정 + 거짓말 콜백 로직
[cc]    M06: 탑 단면도 프로시저럴 렌더링
[cc]    contract: GameState에 viewerFatigue 추가 (CCR-002 승인)
```

### 정말 격리하고 싶다면 (선택 — 6일 일정엔 과하다)
```
git worktree add ../ws-codex -b codex-track
```
폴더가 분리되어 브랜치를 따로 쓸 수 있다. 다만 `node_modules` 를 따로 설치해야 하고
머지 단계가 하나 더 늘어난다. **기본은 한 폴더 / main 이다.**

---

## 7. 하루 리듬 — 동기화 3회

| 시각 | 할 일 |
|---|---|
| **10:00 · 아침 동기화** | 양쪽이 main에서 rebase → 오늘 각자 맡을 파일 목록을 서로에게 선언 |
| 10:00~14:00 | 각자 작업 (서로 안 건드림) |
| **14:00 · 점심 머지** | Codex 브랜치 먼저 main에 → Claude Code가 rebase 후 통합 확인 → 브라우저에서 실행 |
| 14:00~21:00 | 각자 작업 |
| **21:00 · 저녁 머지 + 점검** | 같은 순서로 머지 → `05-PRIORITY.md` 매일 밤 점검 5항목 실행 |

**push 순서는 항상 Codex → Claude Code다.** 로직이 먼저 들어오고 화면이 그것에 맞춘다. 반대로 하면 화면이 두 번 고쳐진다.
한 폴더를 공유하므로 실제로는 «Codex가 커밋·push → Claude Code가 pull --rebase → 통합 확인 → 커밋·push» 순서다.

---

## 8. 6일 일정에 대입

| 날 | Codex (`core`/`content`/`tests`) | Claude Code (`scenes`/`ui`/배포) |
|---|---|---|
| **D0 8/20** | 대기 (문서 숙지) | 스캐폴딩, 레포, **배포 URL 확보**, 폰트, 빈 JSON 스켈레톤 |
| **D1 8/21** | ★ M02 전부 + `sim.ts` + 테스트 / M10 `balance.json` | **계약 동결(오전)** → M01 셸·스케일·폰트·타이틀, 플레이스홀더 생성기 |
| **D2 8/22** | M06 `dive.ts` ★, M04 비용 산식, M05 도달층·`items.json` | M04 소생실 화면, M05 캐스팅·진열대 화면, `DayScene` HUD |
| **D3 8/23** | M09 판정 로직, M08 팬 계산, M11 트리거·`judgeEnding` | M06 `DivePhase` 탑 단면도·무전 UI ★, M08 사망 연출, M09 봉랍 |
| **D4 8/24** | M07 `opinion.ts`·`chat.ko.json`, M06 거짓말 콜백, M03 로스터 | M07 채팅 UI·슈퍼챗 연출, M03 승계 화면·초상 균열, 온보딩 |
| **D5 8/25** | **밸런스 튜닝 전담** (`sim` 1000회 × 노브 조정) | 아트 팩 교체, 사운드, 34F 컷신, 엔딩 씬, 버그 |
| **D6 8/26** | `CODEX_LOG.md` 정리 | 12시 코드 동결 → 배포 → 영상·썸네일·제출 |

**D5가 이 분담의 최대 이득 지점이다.** Codex가 화면 없이 밸런스를 1000회 돌리는 동안, Claude Code는 아트와 연출을 만진다. 같은 파일을 만지지 않으므로 완전 병렬이다.

---

## 9. 절대 금지 목록

### 양쪽 공통
- 상대 소유 파일 수정 (읽기는 자유, 쓰기는 금지)
- 계약 파일(`types.ts` `actions.ts`) 임의 수정
- `main`에 직접 push
- `git add .` / `git commit -a`
- 새 npm 의존성 추가
- 상대가 아직 안 만든 파일을 "미리 만들어두기"

### Codex 전용 금지
- `phaser` import (`src/core/`는 순수 TS)
- 화면·연출·좌표에 대한 코드 작성
- "브라우저에서 잘 보일 것"이라는 판단

### Claude Code 전용 금지
- 게임 규칙·수식을 `scenes/`나 `ui/`에 구현 (전부 `core`로 보내라)
- 밸런스 숫자를 씬에 하드코딩
- Codex가 만들 예정인 `systems/*.ts`를 "임시로" 채우기 → **`FakeStore`를 써라**

---

## 10. 막혔을 때 인계 프로토콜

한쪽이 상대 영역의 변경이 필요하다고 판단하면:

```md
<!-- Project_docs/HANDOFF.md 에 추가 -->
## HO-003  (from: Codex → to: Claude Code)  D3 14:00
**필요한 것**: `DivePhase`에서 `DIVE/TICK`을 60fps가 아니라 고정 0.35s 간격으로 보내야 함
**이유**: 층 판정이 프레임레이트에 의존하면 시드 재현이 깨짐
**내가 하지 않은 이유**: `scenes/`는 내 소유가 아님
**상태**: [ ] 미처리 / [x] 처리됨
```

- 인계는 **파일로 남긴다.** 대화로만 하면 다음 세션에서 사라진다
- 상대는 아침·점심·저녁 동기화 때 `HANDOFF.md`를 먼저 읽는다
- **직접 고치고 싶은 유혹을 참는 것**이 이 프로토콜의 전부다

---

## 11. 충돌이 났을 때

| 상황 | 대응 |
|---|---|
| 같은 파일 충돌 | **소유자 버전이 이긴다.** 비소유자는 자기 변경을 버리고 HANDOFF로 요청한다 |
| 상대의 미커밋 파일이 내 커밋에 섞임 | `git reset HEAD <그 파일>` 로 스테이지에서만 빼라. `git checkout`/`reset --hard` 로 되돌리지 마라 |
| 계약 파일 충돌 | 둘 다 버리고 `Project_Project_docs/02-DATA-SCHEMA.md` 기준으로 사람이 다시 작성 |
| `content/*.json` 충돌 | Codex 버전 채택 |
| `package.json` 충돌 | Claude Code 버전 채택 후 Codex가 rebase |
| 빌드가 깨진 채 main에 올라감 | **즉시 revert.** 고치려 하지 말고 되돌리고 나서 고친다 |

---

## 12. 각자에게 주는 시작 프롬프트 템플릿

### Codex
```
이 레포의 Project_docs/07-PARALLEL-DEV.md 를 먼저 읽어라. 너는 Codex 영역 담당이다.
너가 쓸 수 있는 파일은 src/core/**, content/** (manifest.json 제외), tests/** 뿐이다.
src/core/types.ts 와 src/core/actions.ts 는 계약 파일이라 수정할 수 없다.

오늘 할 일: Project_docs/modules/M06-dive-radio.md 의 "Codex 파트"만 구현해라.
- src/core/systems/dive.ts
- content/floors.json
- content/radio.ko.json
- tests/dive.spec.ts

phaser 를 import 하지 마라. Math.random() 을 쓰지 마라.
끝나면 M06 문서의 수용 기준 중 로직에 해당하는 항목을 하나씩 검증한 결과를 보고하고,
Project_docs/CODEX_LOG.md 에 오늘 항목을 추가해라.
브랜치는 codex/m06-dive 를 쓰고 main 에 직접 push 하지 마라.
```

### Claude Code
```
Project_docs/07-PARALLEL-DEV.md 를 먼저 읽어라. 너는 Claude Code 영역 담당이다.
너가 쓸 수 있는 파일은 src/scenes/**, src/ui/**, src/render/**, src/platform/**,
src/audio/**, tools/**, public/**, index.html, 빌드 설정이다.
src/core/** 와 content/*.json 은 Codex 소유이므로 읽기만 해라.

오늘 할 일: Project_docs/modules/M06-dive-radio.md 의 "Claude Code 파트"만 구현해라.
core/systems/dive.ts 가 아직 없으면 FakeStore 로 진행해라.

브라우저에서 실제로 띄워서 확인하고 스크린샷으로 보고해라.
core 쪽 변경이 필요하면 직접 고치지 말고 Project_docs/HANDOFF.md 에 항목을 추가해라.
브랜치는 cc/m06-dive-scene 을 쓰고 main 에 직접 push 하지 마라.
```

---

## 13. 이 분담이 대회 점수에 주는 효과

- 심사 항목 「Codex 협업」: **게임 규칙 전체(`src/core/`)를 Codex가 작성**한 구조가 된다. `Project_Project_docs/modules/*.md` 12개 + `CODEX_LOG.md` + 커밋 접두어 `[codex]`가 그대로 증빙이다.
- 심사 항목 「플레이 가능성」: 통합·브라우저 검증·배포를 Claude Code가 전담하므로, **완주 가능한 빌드**가 매일 존재한다.
- 발표에서 쓸 한 문장:
  > *"엔진에 의존하지 않는 순수 로직 레이어를 만들어, 게임 규칙 전체를 Codex가 화면 없이 작성하고 1000회 자동 시뮬레이션으로 검증했습니다."*
