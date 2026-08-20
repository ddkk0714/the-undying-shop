# M03 · 로스터 · 페르소나 · 열화

| 항목 | 값 |
|---|---|
| 우선순위 | **P0** (페르소나 승계 연출만 P1) |
| 담당 | **Codex** (`systems/roster.ts`, `stars.json`, `personas.json`) · Claude Code (`ui/Portrait.ts`, 승계 화면) |
| 의존 | M02 |
| 예상 소요 | 3시간 |
| 담당 파일 | `src/core/systems/roster.ts` `content/stars.json` `content/personas.json` `src/ui/Portrait.ts` |

## 목적
"몸"과 "이름"을 분리한다. 이 분리 하나가 이 게임의 주제를 시스템으로 만든다.

## 개념
```
Star(몸)      : 스탯 · 열화 · 목격한 진실
Persona(이름) : 팬덤 · 인지도 · 굿즈 매출 · 대수
방송에 나가는 것 = Star + Persona 조합
```

## 초기 데이터 (`content/stars.json`)

| id | 본명 | grit | cha | luck | 비고 |
|---|---|---|---|---|---|
| `body_karin` | 카린 | 7 | 6 | 5 | 시작 시 `persona_rion` 장착 (3대) |
| `body_juno` | 주노 | 5 | 8 | 4 | 시작 보유. 페르소나 `persona_noname` |
| `body_sela` | 세라 | 8 | 4 | 6 | Day 3에 신인 풀 등장 |
| `body_ilan` | 일란 | 4 | 9 | 3 | Day 5에 신인 풀 등장 |
| `body_mor` | 모르 | 6 | 5 | 8 | 예비 |

`content/personas.json`

| id | 표시명 | 팬덤 | 인지도 | 굿즈/일 | 대수 | 계보 |
|---|---|---|---|---|---|---|
| `persona_rion` | 불꽃의 리온 | 12,400 | A | 8,200 | 3 | 미르(9F) → 세라(17F) → 카린 |
| `persona_noname` | 무명 | 900 | C | 300 | 1 | — |

> 시작 시점에 **리온은 이미 3대째다.** 플레이어는 Day 1에 이 사실을 프로필에서 볼 수 있다.
> 아무 설명도 하지 않는다. 나중에 스스로 승계를 실행할 때 의미가 돌아온다.

## 열화 (Degradation)

`reviveCount`가 오를수록:
| reviveCount | 스탯 배율 | 시각 표현 | 무전 대사 |
|---|---|---|---|
| 0 | 1.00 | 없음 | 정상 |
| 1 | 0.94 | 초상 우하단 균열 1 | 정상 |
| 2 | 0.87 | 균열 2 + 알파 0.95 | 가끔 말끝 흐림 |
| 3 | 0.78 | 균열 3 + 디더 노이즈 | 이름을 헷갈림 |
| 4 | 0.67 | 실루엣 일부 결손 | *"...제가 여기 왜 있죠?"* |
| 5+ | 0.55 | 초상이 반쯤 지워짐 | 문장이 끊김 |

**열화는 숫자로 표시하지 않는다.** 초상화와 대사로만 보여준다.
`reviveCount >= 4`가 되면 소생 비용이 감당 불가 수준이 되어 자연스럽게 세대교체가 일어난다.

## 페르소나 승계

트리거: 시체를 **완전 훼손**했고, 그 몸에 페르소나가 있었을 때 → 다른 몸에 씌울 수 있다.

```ts
export function inherit(state: GameState, personaId: PersonaId, toStarId: StarId): GameState;
```

효과:
- `persona.generation += 1`, `lineage.push({starId, diedFloor})`
- `persona.fandom *= 0.85` (팬 15% 이탈)
- `persona.suspicion += 35`
- 승계 후 3일간 채팅에 의심 라인 등장 확률 상승 (M07)
- `pendingFx.push({kind:'PERSONA_INHERIT'})`

### 승계 UI (한 화면에 끝낸다)
```
┌ 페르소나 승계 ────────────────────────┐
│  「불꽃의 리온」  3대 → 4대            │
│                                       │
│   [카린 초상]      →   [세라 초상]     │
│    9F·17F·31F         grit 8 cha 4    │
│                                       │
│  팬덤 12,400 → 10,540  (-15%)         │
│  팬들은 대부분 모른다.                 │
│                                       │
│        [ 씌운다 ]   [ 그만둔다 ]       │
└───────────────────────────────────────┘
```
마지막 줄 **"팬들은 대부분 모른다."** — 이 한 문장이 이 화면의 전부다. 반드시 넣는다.

## 신인 풀 고갈 규칙
```
recruitPoolSize = 2 - floor(falseAnnouncements / 2)
```
회수 실패를 2번 공표할 때마다 신인 1명이 줄어든다. 0이 되면 **캐스팅할 사람이 없어** 강제로 열화된 스타를 내보내야 한다.

## 수용 기준
- [ ] `roster.ts`는 순수 함수만 export (state in → state out)
- [ ] 열화 배율이 스탯에 반영되어 하강 시뮬 결과가 실제로 나빠짐
- [ ] 승계 후 팬덤이 15% 줄고 `generation`이 +1
- [ ] 회수 실패 4회 공표 시 신인 풀이 0이 되고 UI에 *"지원자가 없습니다"* 표시
- [ ] 초상화 균열 오버레이가 `reviveCount`에 따라 단계적으로 나타남
