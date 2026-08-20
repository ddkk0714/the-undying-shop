# 08 · 에이전트 명령 대본 (복붙용)

> **문서를 `Project_docs/`에 넣은 직후부터, 매일 무엇을 어떤 순서로 시키는지.**
> 이 문서는 그대로 복사해서 붙여넣는 용도다. 요약하지 말고 통째로 붙여라 — 규칙이 빠지면 에이전트가 규칙을 어긴다.

---

## 0. 전제 — 폴더 구조

```
D:\Codex 게임개발대회\undying-shop\      ← 개발 폴더 (= 레포 루트)
├─ AGENTS.md            ★ 루트에 있어야 한다. Project_docs 안에 넣지 마라
├─ CLAUDE.md            ★ 루트에 있어야 한다. Project_docs 안에 넣지 마라
└─ Project_docs\
   ├─ 00-OVERVIEW.md  01-ARCHITECTURE.md  02-DATA-SCHEMA.md
   ├─ 03-ASSET-MODULES.md  04-UI-KIT.md  05-PRIORITY.md
   ├─ 06-SUBMISSION.md  07-PARALLEL-DEV.md  08-AGENT-COMMANDS.md
   ├─ CODEX_LOG.md  HANDOFF.md  README.md
   ├─ lore\WORLD.md
   └─ modules\M01~M12.md
```

**`AGENTS.md`와 `CLAUDE.md`만 루트다.** 두 도구가 레포 루트에서 자동으로 읽는 파일이라 위치를 바꾸면 안 읽힌다.
나머지 문서는 전부 `Project_docs/` 안에 둔다.

### 터미널 준비
```powershell
cd "D:\Codex 게임개발대회\undying-shop"
git init
git add . && git commit -m "docs: 기획서 세트 + 병렬 개발 규약"
```

---

## 1. 명령의 3층 구조

에이전트에게 주는 프롬프트는 항상 이 3층으로 만든다.

```
[1층] 규약 로드   — 어떤 문서를 읽고, 네 소유 영역이 어디인지
[2층] 오늘의 범위 — 어떤 모듈의 어느 파트인지
[3층] 완료 조건   — 무엇을 검증하고 어떻게 보고할지
```

**3층을 빼면 "다 됐습니다"라는 보고를 받고 다음날 안 되는 걸 발견한다.** 절대 빼지 마라.

---

## 2. 매번 앞에 붙이는 고정 헤더

### Codex 고정 헤더
```
레포 루트의 AGENTS.md 와 Project_docs/07-PARALLEL-DEV.md 를 먼저 읽어라.
너는 Codex 영역 담당이다.

쓸 수 있는 파일: src/core/(types.ts, actions.ts 제외 전부), content/*.json(manifest.json 제외), tests/**, Project_docs/CODEX_LOG.md
읽기만: 그 외 전부. 특히 src/scenes, src/ui, src/render 는 Claude Code 소유다.
계약 파일(src/core/types.ts, src/core/actions.ts)은 수정 금지 — 필요하면 CCR 절차로 보고만.

금지: phaser import / Math.random() / 리듀서 안의 Date.now() / 밸런스 숫자 하드코딩 /
      새 npm 의존성 / main 직접 push / git add .
```

### Claude Code 고정 헤더
```
레포 루트의 CLAUDE.md 와 Project_docs/07-PARALLEL-DEV.md 를 먼저 읽어라.
너는 Claude Code 영역 담당이다.

쓸 수 있는 파일: src/main.ts, src/config.ts, src/scenes/**, src/ui/**, src/render/**,
                src/platform/**, src/audio/**, tools/**, public/**, index.html,
                content/manifest.json, 빌드 설정, .github/workflows/**
읽기만: src/core/**, content/*.json(manifest 제외), tests/**
계약 파일(types.ts, actions.ts)은 D1 오전 동결 이후 CCR 없이 수정 금지.

금지: 게임 규칙·수식을 scenes/ui 에 구현 / 밸런스 숫자 하드코딩 / 팔레트 9색 외 색상 /
      소수 좌표 / 새 npm 의존성 / main 직접 push / git add . /
      Codex 소유 파일 수정 (막히면 Project_docs/HANDOFF.md 에 적어라)
```

---

## 3. D0 (오늘) — **Claude Code 단독.** Codex는 아직 켜지 마라

이유: 레포·빌드·배포가 없으면 Codex가 커밋할 곳이 없다. 계약 파일도 아직 없다.

### D0-1 · 스캐폴딩
```
[Claude Code 고정 헤더]

오늘은 D0다. Project_docs/05-PRIORITY.md 의 "D0" 항목만 한다.

1) Vite + TypeScript 프로젝트를 이 폴더에 스캐폴딩하고 phaser@3.90.0 을 설치해라.
   버전은 캐럿 없이 정확히 "3.90.0" 으로 고정한다.
2) Project_docs/01-ARCHITECTURE.md §2 의 폴더 구조를 그대로 만들어라.
   src/core/ 안은 빈 폴더로만 두고 파일을 만들지 마라 (Codex 소유다).
3) content/ 에 balance.json, floors.json, stars.json, personas.json, items.json,
   chat.ko.json, radio.ko.json, narrative.ko.json 을 빈 스켈레톤({} 또는 [])으로 만들어라.
   내용은 채우지 마라 — Codex 소유다.
4) content/manifest.json 은 Project_docs/03-ASSET-MODULES.md §2 형식으로 네가 직접 채워라.
5) vite.config.ts 에 base: './' 를 넣어라.
6) package.json 스크립트: dev, build, typecheck, test, sim

완료 조건:
- npm run dev 가 뜨고 브라우저에서 빈 화면이라도 열린다 (스크린샷으로 보여라)
- npm run build 가 통과하고 dist/ 가 생긴다
- src/core/ 안에 파일이 0개다
```

### D0-2 · 배포 URL 확보 ★ 오늘 안 하면 마감일에 터진다
```
[Claude Code 고정 헤더]

GitHub 레포를 만들고 GitHub Pages 자동 배포를 붙여라.
Project_docs/modules/M12-platform-deploy.md §5 의 워크플로 YAML 을 사용해라.

완료 조건:
- public 레포가 생성되고 첫 커밋이 push 되었다
- Actions 가 성공하고 실제 URL 이 나왔다
- 시크릿 창에서 그 URL 을 열어 빈 화면이라도 뜬다 (URL 을 알려줘라)
```

### D0-3 · 플레이스홀더 에셋
```
[Claude Code 고정 헤더]

Project_docs/03-ASSET-MODULES.md §4 대로 tools/gen-placeholder.mjs 를 만들고 실행해라.
manifest.json 의 모든 키에 대응하는 더미 파일이 public/assets/packs/placeholder/ 에 생겨야 한다.
더미도 팔레트 9색만 쓴다.

완료 조건:
- node tools/gen-placeholder.mjs 실행 후 누락 키 0개
- 폰트 파일(네오둥근모 또는 대체 픽셀 한글 폰트)을 public/assets/fonts/ 에 넣고
  라이선스를 Project_docs/CREDITS.md 에 기록했다
```

---

## 4. D1 오전 — **계약 동결.** 이게 끝나야 병렬이 시작된다

### D1-A · Claude Code에게 (Codex는 아직 대기)
```
[Claude Code 고정 헤더]

오늘 첫 작업은 「계약 동결」이다. Project_docs/07-PARALLEL-DEV.md §5-1 을 그대로 수행해라.

1) Project_docs/02-DATA-SCHEMA.md 의 타입 정의를 src/core/types.ts 에 그대로 옮겨라.
   임의로 필드를 추가하거나 이름을 바꾸지 마라. 문서가 정본이다.
2) Project_docs/modules/M02-core-state.md §2 의 Action 유니온을 src/core/actions.ts 에 옮겨라.
3) 이 두 파일만 커밋하고 main 에 push 해라. (계약 동결 커밋만 main 직접 push 가 허용된다)
   커밋 메시지: "[cc] contract: types/actions 동결"

완료 조건:
- npm run typecheck 통과
- 두 파일 외의 변경이 커밋에 섞이지 않았다 (git show --stat 으로 보여라)
- 이 커밋의 해시를 알려줘라 (Codex가 여기서 갈라져 나간다)
```

**이 커밋이 push되기 전에는 Codex를 켜지 마라.**

---

## 5. D1 오후 이후 — 양쪽 동시 가동

여기부터는 두 창을 동시에 띄운다. 아래는 날짜별 대본이다.

### D1 · Codex
```
[Codex 고정 헤더]

브랜치 codex/m02-core 를 만들고 작업해라.
오늘 할 일: Project_docs/modules/M02-core-state.md 의 「담당」행에서 Codex 파트 전부.
  - src/core/state.ts, reducer.ts(및 분리 파일), store.ts, rng.ts, content.ts
  - src/core/sim.ts  ← 최우선. 이게 있어야 이후 모든 검증이 가능하다
  - tests/reducer.spec.ts, tests/sim.spec.ts
이어서 Project_docs/modules/M10-economy.md 의 content/balance.json 전문을 작성해라.

types.ts 와 actions.ts 는 이미 main 에 있다. 읽되 수정하지 마라.

완료 조건 (하나씩 실제로 검증하고 결과를 항목별로 보고):
- simulate(1, randomPolicy) 가 Phaser 없이 8일을 완주하고 RunStats 를 반환한다
- 같은 seed + 같은 액션 시퀀스 → 항상 동일한 최종 state
- src/core/** 에 "from 'phaser'" 가 0건 (grep 결과를 붙여라)
- 리듀서에 Math.random / Date.now 가 0건
- sim 1000회에서 NaN/Infinity/크래시 0건
- JSON.parse(JSON.stringify(state)) 왕복 무손실

끝나면 Project_docs/CODEX_LOG.md 에 오늘 항목을 추가해라.
main 에 직접 push 하지 마라.
```

### D1 · Claude Code (계약 동결 직후 이어서)
```
[Claude Code 고정 헤더]

브랜치 cc/m01-shell 을 만들고 작업해라.
오늘 할 일: Project_docs/modules/M01-app-shell.md 전부 (이 모듈은 네 단독이다).

src/core/ 는 Codex가 지금 작업 중이다. 절대 건드리지 마라.
core 가 필요하면 Project_docs/07-PARALLEL-DEV.md §5-3 의 FakeStore 를 만들어 써라.

완료 조건 (M01 문서의 수용 기준 6개를 하나씩 브라우저에서 확인하고 스크린샷으로 보고):
- 1920×1080 전체화면에서 zoom=4, 완전 선명
- 창 크기를 바꿔도 정수배 유지 + 중앙 정렬
- "죽지 않는 가게" 한글이 계단 현상 없이 또렷
- 폰트 파일을 지워도 게임이 뜬다
- 타이틀 → 새로 시작 → DayScene 진입까지 클릭 2회
- npm run build 후 dist/ 를 로컬 서버로 열어도 동작
```

---

## 6. D2~D5 — 날짜별 명령 대본

매일 **아침 10시**에 아래를 각각 던진다. 고정 헤더는 매번 붙인다.

### D2 · Codex
```
[Codex 고정 헤더]
브랜치 codex/d2 . 오늘 할 일 — 각 문서의 「담당」행 Codex 파트만:
  1) Project_docs/modules/M06-dive-radio.md  ← 오늘의 절반을 여기에 써라
     src/core/systems/dive.ts, content/floors.json, content/radio.ko.json, tests/dive.spec.ts
  2) Project_docs/modules/M04-revive.md  — reviveCost 산식 + tests/economy.spec.ts
  3) Project_docs/modules/M05-casting-shop.md — 도달층 계산 + content/items.json 12종

완료 조건:
- economy.spec.ts 가 기준 3행(12F/760, 24F/4250, 31F/12120)을 ±5% 이내로 통과
- 갈림길 좌우가 시드에 따라 스왑되고, 같은 시드면 항상 같은 결과
- 하강이 반드시 사망으로 끝난다 (targetCeiling+3 강제 사망)
- 18/23/28F 목격 이벤트가 각 1회만 발생
- 위 전부를 화면 없이 sim 으로 검증한 로그를 붙여라
Project_docs/CODEX_LOG.md 갱신. main 직접 push 금지.
```

### D2 · Claude Code
```
[Claude Code 고정 헤더]
브랜치 cc/d2 . 오늘 할 일 — 각 문서의 「담당」행 Claude Code 파트만:
  1) src/scenes/DayScene.ts — HUD(DAY/GOLD/FANS/REP/n·40) + 단계 씬 전환 호스트
  2) Project_docs/modules/M04-revive.md — RevivePhase 화면 (spirit 색은 여기서만)
  3) Project_docs/modules/M05-casting-shop.md — CastingPhase, ShopPhase 3칸 UI
  4) src/ui/layout.ts 에 Project_docs/04-UI-KIT.md §1 의 L 상수 그대로 옮기기
  5) src/ui/ 기본 컴포넌트: Panel, Button(핫키 1/2/3), Label, TimerBar

core 가 아직 없으면 FakeStore 로 진행해라. Codex 파일을 임시로 채우지 마라.

완료 조건: 각 화면을 브라우저에서 띄우고 스크린샷으로 보고.
- 모든 좌표가 L 상수를 쓴다 (하드코딩 좌표 0건, grep 결과 첨부)
- 팔레트 9색 외 색상 0건
- 숫자키 1/2/3 으로 선택이 된다
```

### D3 · Codex
```
[Codex 고정 헤더]
브랜치 codex/d3 . Codex 파트만:
  1) M09-autopsy-announce.md — 검시 2택 판정, 발표 4조합, 은닉(HIDDEN) 전이, 유품 드랍
  2) M08-death-record.md — 팬 변동 계산, 일일 정산 집계
  3) M11-narrative.md — 트리거 테이블, judgeEnding, content/narrative.ko.json

완료 조건:
- 발표 4조합이 모두 다른 state 변화를 만든다 (테스트 4개)
- 「온전 → 실패 공표」 시 스타가 HIDDEN 이 되고 캐스팅 목록에서 빠진다
- 훼손 시 목격 기록이 suppressed=true 가 되고 leak 이 오르지 않는다
- leak≥70 + day8 → B_REVEAL, 미만 → B_CONTINUE, maxFloor≥40 → A_OPEN
- 얕은 층 사망 시 fansDelta 가 음수가 된다
```

### D3 · Claude Code
```
[Claude Code 고정 헤더]
브랜치 cc/d3 . Claude Code 파트만:
  1) M06 DivePhase ★ — 탑 단면도 프로시저럴 렌더링(풀 배경 아트 만들지 마라),
     무전 3택 UI, 「당신만 보는 진짜 지도」 박스, 소프트 타이머
  2) M08 DeathPhase — RECORD_BREAK 연출 (Project_docs/modules/M08 의 연출 사양대로)
  3) M09 AutopsyPhase / AnnouncePhase + src/ui/SealStamp.ts 봉랍 연출
  4) 옵션 메뉴 (타이머 끄기 / 속도 1x·1.5x·2x / 연출 감소)

완료 조건: 브라우저에서 Day 1→8 을 클릭으로 완주하고 그 과정을 스크린샷 5장으로 보고.
- 진짜 지도 박스가 스타 무전 말풍선과 시각적으로 명확히 구분된다
- 신기록 시 게이지가 n/40 으로 차오른다
- 봉랍 도장에 hitStop + 흔들림이 들어갔다
```

### D4 · Codex
```
[Codex 고정 헤더]
브랜치 codex/d4 . Codex 파트만:
  1) M07-chat-superchat.md — src/core/systems/opinion.ts, content/chat.ko.json
     (leak 누적, 과잉 삭제 역풍, payPool 고갈)
  2) M06 거짓말 지연 콜백 — 거짓말한 스타를 부활시키면 다음 런 첫 무전에서 언급.
     훼손했으면 나오지 않아야 한다
  3) M03-roster-persona.md — systems/roster.ts, stars.json, personas.json, 열화 배율

완료 조건:
- 방치 6초 후 leak 증가 / 삭제 시 증가 없음 (테스트)
- 6회 이상 삭제 시 역풍 + 평판 감소
- leak≥70 에서 삭제해도 TRUTH 가 계속 나온다
- 거짓말→부활 시 콜백 발생, 거짓말→훼손 시 미발생 (테스트 2개)
- 승계 후 팬덤 -15%, generation +1
```

### D4 · Claude Code
```
[Claude Code 고정 헤더]
브랜치 cc/d4 . Claude Code 파트만:
  1) M07 채팅 UI — src/ui/Ticker.ts (텍스트 객체 12개 풀링), 삭제/차단 버튼(클릭영역 16×16 이상),
     슈퍼챗 연출 (+340G 가 HUD GOLD 로 날아가 흡수)
  2) M03 페르소나 승계 화면 + 초상 균열 오버레이 (reviewCount 단계별)
  3) M11 28F 침묵 연출 — 채팅 3초 정지 후 재개
  4) Project_docs/04-UI-KIT.md §7 의 Day 1 온보딩 오버레이 6줄

완료 조건: 브라우저 확인 + 스크린샷.
- 30초 동안 40~60개 메시지가 흐른다
- TRUTH 톤이 wax 색이라 즉시 눈에 띈다
- 텍스트 객체가 12개를 초과 생성되지 않는다 (성능 확인 결과 첨부)
- 승계 화면에 "팬들은 대부분 모른다." 문구가 있다
```

### D5 · Codex — 밸런스 전담
```
[Codex 고정 헤더]
브랜치 codex/d5-balance . 오늘은 코드를 새로 짜지 마라. content/balance.json 만 튜닝한다.

목표: Project_docs/modules/M10-economy.md §"의도된 경제 곡선" 표에 ±25% 이내로 수렴시켜라.
특히 Day 5 가 처음으로 순 골드 마이너스가 되어야 한다.

방법: M10 §"튜닝 노브 우선순위" 순서대로 **한 번에 하나만** 바꾸고 sim 1000회를 돌려라.
두 개 이상 동시에 바꾸면 원인을 잃는다.

완료 조건:
- sim 1000회 8일 완주율 100%
- Day 5 이전 파산율 5% 미만
- Day 5~7 구간에서 훼손 없이 유지 불가능한 런이 70% 이상
- 각 튜닝 시도의 (바꾼 값 → 결과) 로그를 표로 보고해라
```

### D5 · Claude Code — 아트/폴리시
```
[Claude Code 고정 헤더]
브랜치 cc/d5-polish . 오늘은 보이는 것만 만진다.
  1) content/manifest.json 의 activePack 을 "final" 로 전환할 준비 (inherit 동작 확인)
  2) 사운드 8종 연결 (도장/슈퍼챗/사망/부활/클릭/신기록/BGM 2)
  3) 34F 문지기 컷신, 엔딩 A(40F), 엔딩 성적표 화면
  4) 봉랍 커서, 디더 와이프 씬 전환

완료 조건:
- 에셋 키 하나를 일부러 지워도 게임이 끝까지 플레이된다
- 배포 URL 에서 처음부터 엔딩까지 3회 연속 완주, 콘솔 에러 0건
- 성적표에 "그들은 아무도 모른다." 가 나온다
```

---

## 7. 동기화 시각 명령 (10:00 / 14:00 / 21:00)

### 먼저 Codex에게
```
[Codex 고정 헤더]
동기화 시간이다.
1) npm run typecheck && npm test 를 돌려 녹색인지 확인해라
2) 네 브랜치를 main 에 rebase 하고 PR(또는 머지)을 준비해라
3) Project_docs/HANDOFF.md 에 Claude Code 에게 요청할 항목이 있으면 지금 추가해라
4) 오늘 한 일을 Project_docs/CODEX_LOG.md 에 기록해라
빌드가 깨져 있으면 머지하지 말고 보고해라.
```

### 그 다음 Claude Code에게 (**순서 지켜라**)
```
[Claude Code 고정 헤더]
동기화 시간이다. Codex 브랜치가 main 에 먼저 들어갔다.
1) main 에서 rebase 하고 통합이 깨지지 않았는지 확인해라
2) FakeStore 를 쓰던 곳을 실제 core 로 교체할 수 있으면 교체해라
3) 개발 서버를 띄워 Day 1 부터 끝까지 한 번 플레이하고 스크린샷으로 보고해라
4) Project_docs/HANDOFF.md 의 미처리 항목 중 네 것을 처리해라
5) 네 브랜치를 main 에 머지해라
빌드가 깨진 채 main 에 올라가 있으면 고치지 말고 즉시 revert 해라.
```

---

## 8. 규칙 위반이 보일 때 쓰는 교정 명령

| 증상 | 명령 |
|---|---|
| Codex가 `scenes/`를 건드림 | `Project_docs/07-PARALLEL-DEV.md §3 소유권 표를 다시 읽어라. src/scenes/ 변경을 전부 되돌리고, 필요한 내용은 Project_docs/HANDOFF.md 에 항목으로 적어라.` |
| Claude Code가 `core/systems`를 채움 | `src/core/systems/ 는 Codex 소유다. 네 변경을 되돌리고 FakeStore 로 대체한 뒤, 필요한 스펙을 HANDOFF.md 에 적어라.` |
| 계약 파일이 임의로 수정됨 | `types.ts/actions.ts 변경을 되돌려라. 변경이 필요하면 Project_docs/02-DATA-SCHEMA.md 에 변경안을 적고 CCR 로 보고만 해라.` |
| 밸런스 숫자가 코드에 박힘 | `grep 으로 src/ 안의 3자리 이상 숫자 리터럴을 찾아 전부 content/balance.json 으로 옮겨라.` |
| 팔레트 밖 색상 사용 | `src/render/palette.ts 의 9색 외 색상값을 전부 찾아 교체해라. spirit 은 RevivePhase 에서만 허용된다.` |
| "될 것 같다"는 보고 | `추정으로 보고하지 마라. 각 수용 기준을 실제로 실행해서 확인한 증거(테스트 출력 또는 스크린샷)를 붙여라.` |
| 2시간 이상 막힘 | `그 기능을 P3 로 강등하고 다음 항목으로 넘어가라. Project_docs/05-PRIORITY.md §4 위험 신호 대응대로 한다.` |

---

## 9. D6 (마감일) 명령

### 오전 · Claude Code
```
[Claude Code 고정 헤더]
오늘은 마감일이다. 12시에 코드를 동결한다. **신기능 금지.** 크리티컬 버그만 고쳐라.
크리티컬의 정의: 완주를 막는 크래시, 화면이 안 뜨는 문제, 배포 실패. 그 외는 전부 무시해라.

12시에:
1) main 에 최종 머지 → 배포
2) 시크릿 창에서 처음부터 엔딩까지 3회 연속 완주
3) 콘솔 에러 0건 확인
4) Project_docs/06-SUBMISSION.md §7 최종 점검 10항목을 하나씩 검증해서 보고
```

### 오전 · Codex
```
[Codex 고정 헤더]
오늘은 코드를 짜지 마라.
Project_docs/CODEX_LOG.md 를 제출 가능한 문서로 정리해라.

- git log 에서 [codex] 접두어 커밋을 전부 추출해 모듈별로 묶어라
- 각 항목에 "프롬프트 / 산출 / 수정한 것 / 배운 것" 네 줄을 채워라
- 문서 맨 앞에 "문서 → 모듈 → 검증 루프" 방법론 요약을 3~5문장으로 써라
- "AI가 다 짜줬다" 가 아니라 "검증 가능한 분업 구조를 설계했다" 로 서술해라

완료 조건: 심사위원이 3분 안에 읽고 우리 방법론을 이해할 수 있는 분량(A4 2장 이내)
```

---

## 10. 요약 카드 (이것만 기억해도 된다)

| 시점 | Codex | Claude Code |
|---|---|---|
| D0 | **끄고 있어라** | 스캐폴딩 · 배포 URL · 플레이스홀더 |
| D1 오전 | 대기 | **계약 동결** → main push |
| D1 오후 | M02 코어 + sim + balance.json | M01 셸 · 폰트 · 타이틀 |
| D2 | M06 dive.ts · M04 산식 · M05 items | DayScene HUD · 소생실 · 캐스팅 · 진열대 |
| D3 | M09 판정 · M08 팬 · M11 트리거 | **DivePhase** · 사망 연출 · 봉랍 · 옵션 |
| D4 | M07 opinion · 거짓말 콜백 · M03 | 채팅 UI · 슈퍼챗 · 승계 화면 · 온보딩 |
| D5 | **밸런스 튜닝 전담** | 아트 · 사운드 · 컷신 · 엔딩 |
| D6 | CODEX_LOG 정리 | 동결 · 배포 · 영상 · 제출 |

**매일 3번**: 10:00 아침 / 14:00 점심 머지 / 21:00 저녁 머지+점검
**머지 순서는 항상 Codex → Claude Code.**
