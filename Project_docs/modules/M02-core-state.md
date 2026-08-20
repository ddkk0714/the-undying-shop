# M02 · 코어 상태머신 (하루 사이클 · 스토어 · 시드 RNG)

| 항목 | 값 |
|---|---|
| 우선순위 | **P0** |
| 담당 | **Codex** (core 전부) · Claude Code (`DayScene` 호스트 + HUD) |
| 의존 | M01 |
| 예상 소요 | 4~5시간 |
| 담당 파일 | `src/core/types.ts` `state.ts` `actions.ts` `reducer.ts` `store.ts` `rng.ts` `content.ts` `src/scenes/DayScene.ts` |

## 목적
**Phaser 없이도 게임이 끝까지 진행되는 두뇌**를 만든다. 화면이 하나도 없어도 `dispatch`만으로 Day 1 → Day 8 → 엔딩까지 도달해야 한다.

## 할 일

### 1. 타입 이식
`Project_Project_docs/02-DATA-SCHEMA.md`의 타입을 `src/core/types.ts`에 **그대로** 옮긴다. 임의로 필드를 추가하지 않는다.

### 2. 액션 정의
```ts
export type Action =
  | { type: 'GAME/NEW'; seed: number }
  | { type: 'GAME/LOAD'; state: GameState }
  | { type: 'PHASE/ADVANCE' }                                   // 다음 단계로
  | { type: 'PHASE/TIMEOUT' }                                   // 소프트 타이머 만료 → 기본 선택 적용
  | { type: 'REVIVE/PAY'; starId: StarId }
  | { type: 'REVIVE/SKIP'; starId: StarId }
  | { type: 'REVIVE/INHERIT'; personaId: PersonaId; toStarId: StarId }
  | { type: 'CASTING/PICK'; starId: StarId }
  | { type: 'SHOP/PLACE'; slot: number; itemId: ItemId | null }
  | { type: 'SHOP/CONFIRM' }
  | { type: 'DIVE/TICK'; dt: number }
  | { type: 'RADIO/ANSWER'; dir: 'LEFT' | 'RIGHT' | 'UNKNOWN' }
  | { type: 'CHAT/SPAWN' }
  | { type: 'CHAT/DELETE'; id: string }
  | { type: 'CHAT/BAN'; id: string }
  | { type: 'AUTOPSY/DECIDE'; grade: CorpseGrade }
  | { type: 'ANNOUNCE/DECLARE'; as: 'SUCCESS' | 'FAILURE' }
  | { type: 'FX/CONSUME' }
  | { type: 'OPTION/SET'; key: string; value: number | boolean };
```

### 3. 리듀서
- **순수 함수.** `Date.now()`, `Math.random()`, `console`, DOM 접근 금지
- 시간은 액션 페이로드로 들어온다 (`DIVE/TICK`의 `dt`)
- 난수는 `state.rngCursor`를 증가시키며 소비:
```ts
function draw(s: GameState): [number, GameState] {
  const r = mulberry32(s.seed + s.rngCursor)();
  return [r, { ...s, rngCursor: s.rngCursor + 1 }];
}
```
- 각 단계별 리듀서를 `reducer/phase*.ts`로 분리하되, 진입점은 `reducer.ts` 하나

### 4. 단계 전이 규칙
```
REVIVE → CASTING → SHOP → DIVE → DEATH → AUTOPSY → ANNOUNCE → (day+1) REVIVE
```
- `ANNOUNCE` 종료 시 `day === 8` 이면 → `isOver = true`, `ending` 계산 (M11)
- `maxFloor >= 40`에 도달하는 즉시 → 남은 단계를 마치고 엔딩 A로 강제 분기

### 5. 소프트 타이머 기본값
`PHASE/TIMEOUT` 수신 시 단계별 기본 선택:
| 단계 | 기본 |
|---|---|
| REVIVE | 가장 싼 선택(소생 안 함) |
| CASTING | 인기 1위 스타 |
| SHOP | 현재 진열 상태 그대로 확정 |
| DIVE(무전) | `UNKNOWN` |
| AUTOPSY | `INTACT` |
| ANNOUNCE | `SUCCESS` |

### 6. DayScene (Phaser 측)
- HUD 소유, 하위 Phase 씬을 `scene.launch/stop`으로 교체
- `store.subscribe`로 HUD 갱신
- `state.pendingFx`를 매 프레임 확인 → 연출 재생 → `FX/CONSUME`
- **Phase 씬은 절대 state를 직접 수정하지 않는다.** `dispatch`만.

### 7. 헤드리스 시뮬레이터
`src/core/sim.ts` — 랜덤/고정 정책으로 8일을 자동 플레이.
```ts
export function simulate(seed: number, policy: Policy): RunStats;
```
이게 있으면 밸런싱을 **초 단위**로 돌릴 수 있다. **P0다.** 미루지 마라.

## 수용 기준
- [ ] `vitest`에서 Phaser 없이 `simulate(1, randomPolicy)`가 8일을 완주하고 `RunStats`를 반환
- [ ] 같은 seed + 같은 액션 시퀀스 → 항상 동일한 최종 state (해시 비교)
- [ ] 리듀서 전체에 `Math.random` / `Date.now` 0건 (`grep`으로 확인)
- [ ] `src/core/**`에 `from 'phaser'` 0건
- [ ] 1000회 시뮬에서 NaN, Infinity, 음수 골드로 인한 크래시 0건
- [ ] `JSON.parse(JSON.stringify(state))`가 손실 없이 왕복

## Codex 프롬프트 시드
> `Project_Project_docs/02-DATA-SCHEMA.md`와 `Project_Project_docs/modules/M02-core-state.md`를 읽고 `src/core/`를 구현해라. **`phaser`를 import 하면 안 된다.** 리듀서는 순수 함수여야 하고 난수는 `state.rngCursor`를 통해서만 소비한다. 마지막에 `src/core/sim.ts`와 `tests/sim.spec.ts`를 만들어 1000회 시뮬이 통과하는 것을 보여라.
