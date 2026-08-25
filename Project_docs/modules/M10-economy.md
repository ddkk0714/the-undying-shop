# M10 · 경제 & 밸런스 테이블

| 항목 | 값 |
|---|---|
| 우선순위 | **P0** |
| 담당 | **Codex 단독** (`balance.json` + 시뮬 튜닝) |
| 의존 | M02 |
| 예상 소요 | 2시간 + 최종일 튜닝 2시간 |
| 담당 파일 | `src/core/systems/economy.ts` `content/balance.json` `tests/economy.spec.ts` |

## 원칙
**모든 숫자는 `content/balance.json`에 있다.** 코드에 숫자 리터럴을 쓰지 마라. 튜닝을 코드 수정 없이 하기 위해서다.

## `content/balance.json` 전문

```jsonc
{
  "start": {
    "gold": 12840, "fans": 84200, "reputation": 62,
    "maxFloor": 26, "days": 8, "targetFloor": 40
  },
  "revive": {
    "base": 400, "floorExp": 1.055,
    "gradeMul": { "INTACT": 1.0, "DAMAGED": 1.5 },
    "degradeExp": 1.4,
    "decayPerDay": 1.08,          // 미루면 하루당 +8%
    "roundTo": 10
  },
  "degrade": {
    "statMul": [1.0, 0.94, 0.87, 0.78, 0.67, 0.55]   // index = reviveCount, 5+ 는 마지막 값
  },
  "dive": {
    "floorSeconds": 0.35,
    "encounterEvery": 3,
    "delayGraceSeconds": 3,
    "delayFanLossPerSec": 0.0015,
    "delayFanLossCap": 0.08
  },
  "combat": {
    "hero":  { "hpBase": 40, "hpPerGrit": 6, "atkBase": 6, "atkPerGrit": 1, "defBase": 2 },
    "enemy": { "hpBase": 18, "hpPerFloor": 1.6, "atkBase": 5, "atkPerFloor": 0.55 },
    "attack":  { "varMin": 0.9, "varMax": 1.1, "counterChance": 0.55 },
    "defend":  { "damageMul": 0.25, "fanPenalty": 0.004 },
    "appeal":  { "fanBase": 300, "charismaMul": 0.08, "floorMul": 0.0333,
                 "hitChance": 0.55, "damageMul": 1.4, "leakRiskMul": 1.5, "leakFromFloor": 18 },
    "hazardAtkMul": { "NONE": 1.0, "FLAME": 1.25, "COLLAPSE": 1.2, "BEAST": 1.3, "GATEKEEPER": 1.6 }
  },
  "contract": {
    "visitorsPerDay": [0, 1, 2],
    "visitorWeights": [0.35, 0.45, 0.20],
    "honestyRange": [0.6, 1.3],
    "feeBase": 400, "feePerFandomK": 60, "feeHonestyBias": -300,
    "claimTiers": 3
  },
  "fans": {
    "base": 800, "depthPivot": 15, "depthMul": 0.08,
    "recordBonus": 1.5, "shallowLiePenalty": -0.4,
    "unusedDecayPerDay": 0.03,
    "inheritLoss": 0.15
  },
  "income": {
    "goodsPerFan": 0.02,
    "superchat": {
      "poolPerFan": 0.004,
      "fork":   [40, 120],
      "record": [200, 400],
      "death":  [80, 250],
      "witness":[150, 350],
      "charismaMul": 0.05,
      "depletedMul": 0.2
    }
  },
  "opinion": {
    "leakPerWitnessRevive": { "18": 15, "23": 20, "28": 30 },
    "leakPerIgnoredChat": 1,
    "leakPerTruthRelicSale": 10,
    "leakPerFakeSuccess": 8,
    "leakEndingThreshold": 70,
    "moderationFreeCount": 5,
    "moderationRepPenalty": 1,
    "viewerFatigueOn28F": 25
  },
  "reputation": {
    "onSuccessAnnounce": 2,
    "onFailureAnnounce": -5,
    "grades": [[0,"F"],[20,"D"],[40,"C"],[55,"B"],[70,"A"],[85,"S"]]
  },
  "recruit": { "baseSlots": 2, "lossPerFailures": 2 }
}
```

## 소생 비용 (정본은 M04, 여기는 구현)

```ts
export function reviveCost(b: Balance, c: Corpse, s: Star, daysHeld: number): number {
  const raw = b.revive.base
    * Math.pow(b.revive.floorExp, c.diedFloor)
    * b.revive.gradeMul[c.grade]
    * Math.pow(b.revive.degradeExp, s.reviveCount)
    * Math.pow(b.revive.decayPerDay, daysHeld);
  return Math.round(raw / b.revive.roundTo) * b.revive.roundTo;
}
```

### 반드시 통과해야 하는 테스트
| floor | grade | reviveCount | 기대값 | 허용 |
|---|---|---|---|---|
| 12 | INTACT | 0 | 760 | ±5% |
| 24 | DAMAGED | 2 | 4,250 | ±5% |
| 31 | DAMAGED | 4 | 12,120 | ±5% |

## 수입 3종

| 항목 | 식 | 성격 |
|---|---|---|
| **장비 판매** | Σ 진열 아이템 `price` | 주 수입. 재고는 시체에서 나오므로 매입비 0 |
| **굿즈** | `fans × 0.02` | 인기 비례, 안정적 |
| **슈퍼챗** | 이벤트별 범위 × 계수 | 극적인 순간에만. payPool 소모 |

## 지출 2종 (v3)

| 항목 | 식 | 성격 |
|---|---|---|
| **소생 비용** | 위 산식 | 주 지출. 매일 목을 조인다 |
| **계약금** | `feeBase + fandom/1000 × feePerFandomK + (1-honesty) × feeHonestyBias` | v3 신규. **과장형일수록 비싸게 부른다** |

`feeHonestyBias`가 음수라는 점이 중요하다 — `honesty`가 낮을수록(과장) 계약금이 **올라간다.**
즉 **비싸게 부르는 지원자는 대체로 과장형이다.** 플레이어는 이 상관을 스스로 알아채야 한다. 설명하지 마라.

## 어필의 경제학 (v3) — 이 게임의 새 중심

```
어필 1회 수익  = fanBase 300 × (1 + charisma×0.08) × (1 + floor/30)  +  슈퍼챗 1회
어필 1회 비용  = 55% 확률로 enemyAtk × 1.4 피해
              → 죽는 층이 얕아짐 → 다음날 수입 감소
              → 단, 소생비는 사망 층 기준이므로 얕게 죽으면 오히려 싸다
```

**여기에 함정이 하나 있다.** 어필해서 얕게 죽으면 소생비가 싸다.
그래서 「어필 남발 → 얕게 죽음 → 싸게 부활」이 단기적으로는 이득처럼 보인다.
그러나 **최고 도달 층이 안 오르므로 `n/40` 게이지가 멈추고, 엔딩에 도달하지 못한다.**

플레이어는 결국 깊이 가야 하고, 깊이 가려면 어필을 참아야 한다.
**이 긴장이 게임 전체를 굴린다.** 밸런싱 시 이 관계를 깨뜨리지 마라.

## 의도된 경제 곡선 (8일)

| Day | 예상 도달 | 수입 | 소생비 | 순 골드 | 플레이어 심리 |
|---|---|---|---|---|---|
| 1 | ~20F | 2,400 | 800 | +1,600 | 여유롭다 |
| 2 | ~23F | 3,100 | 1,400 | +1,700 | 아직 괜찮다 |
| 3 | ~26F | 3,900 | 2,600 | +1,300 | 슬슬 |
| 4 | ~28F | 4,600 | 4,200 | +400 | **28F. 팬 증가가 꺾인다** |
| 5 | ~30F | 4,400 | 6,100 | **-1,700** | 처음으로 훼손을 고려 |
| 6 | ~32F | 5,200 | 8,900 | **-3,700** | 훼손 없이는 불가능 |
| 7 | ~35F | 5,800 | 12,000 | **-6,200** | 페르소나 승계 강제 |
| 8 | ~38F | 6,500 | — | — | 마지막 판단 |

**Day 5가 변곡점이다.** 여기서 처음으로 "살릴 수 없다"가 된다.
이 표를 `sim.spec.ts`가 자동 검증하게 한다 (±25% 허용).

## 튜닝 노브 우선순위 (밸런스가 안 맞을 때 이 순서로 건드려라)
1. `revive.floorExp` (1.05~1.06) — 압박 강도 전체
2. `combat.enemy.hpPerFloor` / `atkPerFloor` — **도달 층 분포. v3에서 가장 강력한 노브**
3. `combat.appeal.fanBase` — 어필의 매력도. 너무 높으면 전원이 어필만 한다
4. `income.goodsPerFan` — 안정 수입 총량
5. `fans.depthMul` — 깊이 보상
6. `contract.feeBase` — 계약금 부담
7. `start.gold` — 초반 여유

**한 번에 하나만 바꾸고 `sim` 1000회를 돌려라.** 두 개 이상 동시에 바꾸면 원인을 잃는다.

## 수용 기준
- [ ] 코드에 밸런스 숫자 리터럴 0건 (`grep -nE "[^a-zA-Z][0-9]{3,}" src/core/systems/`)
- [ ] `economy.spec.ts` 3행 통과
- [ ] `sim.spec.ts` 1000회에서 Day 5 이전 파산율 < 5%
- [ ] `sim.spec.ts` 1000회에서 8일 완주율 100%
- [ ] 「항상 어필」 정책의 평균 최고 도달 층이 「거의 어필 안 함」 정책보다 **낮다** (핵심 긴장 검증)
- [ ] 「항상 어필」 정책이 8일차 골드는 더 많지만 40F 에 도달하지 못한다
- [ ] 과장형(`honesty<0.85`) 계약금 평균이 겸손형보다 높다
- [ ] `balance.json`의 `revive.base`를 2배로 바꾸면 시뮬 결과가 즉시 달라짐 (핫 리로드 확인)
