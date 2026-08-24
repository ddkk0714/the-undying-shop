# Codex 활용 기록

> 대회 심사 항목 「Codex 협업」 가산점용 문서. **개발하면서 실시간으로 적는다.**
> 나중에 몰아 쓰려고 하면 못 쓴다. 매 모듈 완료 시 3분만 투자해라.

## 우리의 방법론 — "문서 → 모듈 → 검증 루프"

1. 게임 전체를 **12개 모듈 문서**로 먼저 분해했다 (`Project_docs/modules/M01~M12`)
2. 각 문서에 **인터페이스 · 데이터 스키마 · 수용 기준**을 미리 확정했다
3. Codex에는 "게임 만들어줘"가 아니라 **모듈 문서 1개 + 수용 기준 검증 요구**를 준다
4. 코어 로직을 Phaser에서 분리해서, Codex가 엔진 API를 몰라도 게임 규칙을 정확히 짜게 했다
5. 헤드리스 시뮬레이터로 **화면 없이 1000회 자동 플레이**를 돌려 밸런스를 검증했다

이 구조 덕분에 재작업이 거의 없었다. 아래가 그 기록이다.

---

## D0 · 8/20 — 설계
**프롬프트**: M03/M05/M06/M07/M10/M11 명세의 초기 콘텐츠 JSON을 작성하고, 구현 전 데이터 계약을 검증한다.
**산출**: `balance.json`, `items.json`, `stars.json`, `personas.json`, `floors.json`, `radio.ko.json`, `chat.ko.json`, `narrative.ko.json`.
**수정한 것**: 명세 표와 전문을 JSON 데이터로 옮겼다. 리온의 3대 계보, 4개 갈림길, 무전 27줄, 채팅 톤별 12줄 이상 코퍼스를 포함했다.
**배운 것**: JSON 단계에서 수량·수식·UTF-8을 먼저 검증하면 이후 코어 로직과 UI가 같은 데이터를 안정적으로 참조할 수 있다.

## D1 · 8/21 — M01 App Shell
**프롬프트**:
**산출**:
**수정한 것**:
**배운 것**:

## D1 · 8/21 — M02 코어 상태머신
**프롬프트**: M02 명세와 동결된 `types.ts`/`actions.ts` 계약에 맞춰, Phaser 없는 상태머신·시드 RNG·스토어·콘텐츠 검증·헤드리스 8일 시뮬을 구현한다.
**산출**: `state.ts`, `reducer.ts`, `store.ts`, `rng.ts`, `content.ts`, `sim.ts`, reducer/sim 테스트.
**수정한 것**: 모든 상태 전이는 순수 리듀서로 처리하고 RNG 소비를 `rngCursor`에 연결했다. `simulate(seed, randomPolicy)`가 8일을 끝내고 `RunStats`를 반환한다.
**배운 것**: UI와 독립된 시뮬레이터를 먼저 고정하면 1,000회 검증으로 결정성·수치 안정성을 빠르게 확인할 수 있다.

## D1 · 8/21 — CCR-001 v3 전투 데이터
**프롬프트**: CCR-001의 v3 M05/M06 명세에 맞춰 장비를 HP/ATK/DEF로 전환하고, 3층 주기 1인칭 전투의 순수 코어를 만든다.
**산출**: v3 `items.json`, v3 `floors.json`, 전투 밸런스 테이블, `systems/combat.ts`, 전투 테스트.
**수정한 것**: 장비 12종의 전투 스탯과 적 구역·갈림길 `a/b` 데이터를 검증 가능하게 이식했다. 공격·방어·어필을 시드 입력으로 결정적으로 계산한다.
**배운 것**: 적중 확률은 난수 호출 대신 RNG에서 받은 값을 입력으로 삼으면, 1,000개 표본 검증과 재현이 동시에 가능하다.

## D1 · 8/21 — M06 LIVE 하강 연결
**프롬프트**: 전투 코어를 LIVE 상태머신에 연결해, 3층 조우·선택 대기·지체 페널티·HP 0 사망을 Phaser 없이 실행한다.
**산출**: `systems/dive.ts`, LIVE 리듀서 연결, 하강 테스트.
**수정한 것**: 장비 스탯으로 영웅을 생성하고 3층마다 전투를 멈춰 세 선택을 기다리게 했다. 선택 대기 중 팬 이탈, 어필 통계·FX, 전투 사망의 `DEATH` 전이를 결정적으로 처리했다.
**배운 것**: 화면의 대기 상태도 `waitingSince`와 액션 `dt`만으로 모델링하면 프레임레이트와 무관하게 테스트할 수 있다.

<!-- 이하 모듈마다 반복 -->
## D1 8/21 · M05 office contract and shelf core

**Project**: Replaced the OFFICE/PICK_STAR placeholder with real combat stats and a meaningful claimed ceiling; added contract accept/reject and shelf-sale resolution.
**Deliverables**: `systems/office.ts`, reducer integration, `tests/office.spec.ts`.
**Validation**: `npm run typecheck` and `npm test` passed (5 files, 16 tests). Contract fees, honesty propagation, permanent rejection, relic leak, gold, and HP/ATK/DEF updates are covered.

## D1 8/21 · M04 revive economy core

**Project**: Added balance-driven revive quotes and connected payment to the reducer without touching the RevivePhase UI.
**Deliverables**: `systems/economy.ts`, balance validation, revive payment integration, and `tests/economy.spec.ts`.
**Validation**: The 12F/24F/31F reference costs, one-day decay, affordability, single-payment, and witness warning are covered by tests.

## D1 8/21 · M03 roster inheritance core

**Project**: Added pure persona inheritance and recruit-capacity rules without touching portrait or phase UI code.
**Validation**: Persona fandom/generation/lineage/FX and four-false-announcement capacity exhaustion are covered by tests.

## D1 8/21 · HO-004 reputation API

**Project**: Exposed and validated the balance reputation table in core, with a shared numeric-to-grade helper for HUD consumers.

## D2 8/21 쨌 M06 dive fork, witness, and descent-limit core

**Project**: Completed deterministic radio-fork resolution and witness/descent state transitions in the headless LIVE core.
**Deliverables**: `systems/dive.ts`, `reducer.ts` radio dispatch, `sim.ts` fork policy, balance validation, and dive acceptance tests.
**Validation**: `npm run typecheck` and `npm test` passed (7 files, 26 tests). Tests cover seed-stable fork-side swaps, single-fire 18/23/28F witnesses with 28F fatigue, and forced death at claimed ceiling + 3. The 1,000-seed headless simulation remains green.

## D2 8/21 · M06 delayed lie callback

**Project**: A shallow route deliberately ordered at a fork is retained as a per-star delayed consequence.
**Deliverables**: Seeded fork lie classification, `liesTold` accounting, one-shot next-LIVE `TRUTH_WHISPER` radio payload, and a regression test.
**Validation**: The test proves that a lied-to star emits exactly one callback after revival and never repeats it on a later LIVE start.

## D2 8/21 · CCR approved · REVIVE/DISCARD

**Project**: Added the approved discard action to the shared contract and implemented the revive-room discard outcome.
**Deliverables**: `REVIVE/DISCARD`, `discardReviveCorpse()`, reducer integration, inventory transfer, one-shot protection, and discarded-body persona inheritance tests.
**Validation**: `npm run typecheck` and `npm test` passed (7 files, 29 tests).

## D2 8/21 · HO-010 death conclusion and daily settlement

**Project**: Unified combat death and descent-limit death through one idempotent core conclusion path.
**Deliverables**: corpse creation, DEAD status, record/deepest-floor updates, record FX, fan settlement, goods income, and announcement reputation updates.
**Validation**: `npm run typecheck` and `npm test` passed (7 files, 31 tests). Eight-day headless runs now retain deaths and economic settlement instead of leaving all state at initial values.

## D2 8/21 · M05 contract visitors / HO-011

**Project**: Restored the daily applicant path so an all-dead roster can recover by signing a visitor contract instead of looping between the revive room and office.
**Decision**: Persona inheritance targets only a signed, ALIVE `stars` body; an applicant must be accepted first, then can receive a persona in the revive room.
**Deliverables**: Two initial stars plus three hidden applicants, seeded daily 0–2 visitor generation, balance-driven fees/claims/honesty, rejection exclusion, and a simulation policy that signs an affordable applicant before selecting a star.
**Validation**: `npm run typecheck` and `npm test` passed (7 files, 36 tests), including 1,000 seeds for both conservative and proactive recruitment policies. A survival-combat balance sweep measured conservative/proactive averages of 6,102G/9,181G and 29F/30F; their minimum final gold was 1,819G/1,925G.

## D2 8/22 · M11 early-closure safety guard

**Project**: Added the last-resort terminal guard for an unwinnable shop loop without changing the shared action/state contract.
**Decision**: When no ALIVE star remains, no dead body has an affordable revive quote, and the recruit pool is empty, core ends with the existing `B_CONTINUE` ID. Scenes can distinguish the early closure by `isOver && day < 8` and own the bankruptcy copy.
**Deliverables**: `isEarlyClosure()` in narrative core, common REVIVE/OFFICE transition coverage, and three regression cases.
**Validation**: `npm run typecheck` and `npm test` passed (10 files, 53 tests), including both 1,000-seed simulation policies. The tests prove the blocked Day 5 state exits, while an affordable revival or a remaining applicant remains playable.

## D2 8/22 · HO-009 reduced-motion core option

**Project**: Connected the approved `OPTION/SET` action to the core-only delay-penalty flag.
**Deliverables**: Reducer support for boolean `reducedMotion` and a LIVE wait-penalty regression test.
**Validation**: The test proves the flag preserves fans during a 10-second unresolved encounter, then resumes the configured penalty when turned off. `npm run typecheck` and `npm test` passed (10 files, 54 tests), including both 1,000-seed policies.

## D3 8/22 · M11 gatekeeper trigger

**Project**: Added the core-side signal for the 34F gatekeeper cutscene without extending the shared state or action contract.
**Deliverables**: The gatekeeper fork records `flags.gatekeeperCutscene` exactly when first entered; the scene can consume that state to present its cutscene.
**Validation**: A deterministic dive test reaches the configured gatekeeper fork, verifies the selection wait state and signal, and prevents numeric floor duplication in core. `npm run typecheck` and `npm test` passed (10 files, 55 tests).

## D3 8/22 · HO-012 daily income ledger (CCR approved)

**Project**: Added the approved `TodayRun.income` contract for exact day-end settlement values.
**Deliverables**: `income: { superchat, shelf, goods }`, initialized when a star is selected and incremented only at the corresponding payment source.
**Validation**: Shelf-sale, superchat, and goods-income tests each verify their own ledger field; death settlement verifies goods plus superchat equals the actual gold increase. `npm run typecheck` and `npm test` passed (10 files, 55 tests), including both 1,000-seed policies.

## D3 8/22 · HO-013 direct-discard relic loot

**Project**: Restored the material reward for discarding an ordinary dead body, while retaining M09 damage-autopsy's existing 2–3 relic reward.
**Deliverables**: Balance-driven `revive.discardLoot`, deterministic unique relic selection, inventory transfer, and a direct-discard regression test.
**Validation**: Tests prove an empty corpse receives the configured number of valid, non-duplicated relics; the result is seed-stable, advances only `rngCursor`, and cannot be claimed twice. `npm run typecheck`, `npm test` (56 tests), and `npm run build` passed.

## D3 8/22 · HO-005 combat dialogue

**Project**: Filled `Encounter.line` with seeded, contextual combat dialogue so the live battle has a speaker from entry through each surviving turn.
**Deliverables**: Localized healthy/half-health/danger/appeal dialogue arrays, degradation-4 reuse, content validation, seeded selection on encounter entry and combat resolution, and regression tests.
**Validation**: `npm run typecheck`, all 58 tests, and `npm run build` passed after the parallel UI edit settled. Tests cover healthy entry, appeal, and degradation dialogue; all selection is seeded through `rngCursor`.

## D4 8/22 · M05 truth relic depth gate

**Project**: Bound the two truth relics to the deep-body condition specified for M05, so their high cash value and leak tradeoff cannot appear on shallow runs.
**Deliverables**: Balance-driven 28F threshold and truth-relic IDs, content validation, depth-aware direct-discard and autopsy loot pools, plus shallow/deep drop tests.
**Validation**: Shallow bodies cannot produce either truth relic; deterministic deep-body runs do produce them. The full suite passed 59 tests, including both 1,000-seed policies; `npm run typecheck` and `npm run build` passed.

## D3 audit · M08 shallow-death settlement

**Project**: Completed the last unproven D3 acceptance condition for death settlement.
**Decision**: The forced-descent minimum is 4F, so the documented 15F depth pivot could not produce a negative shallow result. The balance pivot is therefore 18F; the documented formula itself is unchanged.
**Validation**: A forced 4F descent now records a negative `fansDelta` and lowers fans. M09's four announcement paths, HIDDEN transition, damaged-witness suppression, and M11's A/B ending thresholds already have regression coverage. `npm run typecheck`, all 60 tests (including 1,000-seed policies), and `npm run build` passed.

## D5 audit · M10 appeal economy simulation

**Project**: Added deterministic policy pairs that isolate the economic tension between attacking and always appealing.
**Deliverables**: `lowAppealPolicy`, `alwaysAppealPolicy`, and a 1,000-seed regression asserting that constant appeal produces more gold while yielding a lower maximum floor and never reaches 40F.
**Measured result**: Low appeal averaged 8,161G / 28.67F; always appeal averaged 48,273G / 26F. Neither policy hit an early closure.
**Validation**: `npm run typecheck`, all 61 tests, and `npm run build` passed.

## D4 8/22 — M07 moderation and M06 damaged-body callback

**Project**: Closed the remaining core regressions without altering scene/UI ownership or the shared action/state contracts.
**Deliverables**: High-leak moderation now has an explicit regression proving deletion does not lower leak and the next chat remains `TRUTH`; damaged autopsy disposal clears that body's deferred lie callback.
**Validation**: The D4 target suites pass (31 tests). `npm run typecheck`, the full suite (10 files, 62 tests), and `npm run build` all passed. Existing coverage also proves six-second ignored-chat leak, deletion preventing that leak, six-plus moderation backlash/reputation loss, pay-pool depletion, lied-to revived callback, and inheritance fandom -15% / generation +1.

## D5 8/22 — M10 balance audit (no balance change retained)

**Method**: Ran the existing conservative headless policy for 1,000 fixed seeds after each single-knob trial; no repository test or core code was added.
**Trials**: `revive.floorExp 1.055 → 1.060` kept completion at 100% but Day 5 was still +3,307G and violated all three M04 reference-cost upper bounds. `1.055 → 1.056` preserved M04 and produced Day 5 +3,361G. `balance.combat.enemy.atkPerFloor 0.55 → 0.80` produced no state change because combat reads `content.floors.enemy`, not the balance field; it was immediately restored.
**Blocker**: The target curve requires ~6,100G Day-5 revival cost and 20–38F runs. The current policy averages 6–9F combat deaths and a 1,432G Day-5 revival cost at the highest M04-safe exponent. Its Day-5 income is 2,494G goods + 2,300G superchat. Therefore no `balance.json`-only, M04-safe adjustment can both retain the Day-1 income target and reach the required Day-5 -1,700G pivot. The baseline was restored pending authorization to align the active combat source / simulation policy with M10.

## D5 8/22 — approved floors.json scope trial (no content change retained)

**Scope**: With approval, tested the active combat data source one field at a time and restored every non-qualifying value.
**Trials**: `floors.enemy.atkPerFloor 0.55 → 0.15` made the conservative policy Day-5 +4,325G; low-appeal reached Day-5 -1,803G but only 89.4% completion. `floors.enemy.hpPerFloor 1.60 → 0.80` yielded conservative 100% completion / Day-5 +3,258G and low-appeal 98.6% completion / Day-5 -1,819G. Economy and existing 1,000-seed sim tests remained green on each trial.
**Remaining blocker**: No committed sim policy ever chooses `AUTOPSY/DECIDE: DAMAGED` or `REVIVE/DISCARD`. Therefore the acceptance pair “100% completion” and “70% of runs cannot continue without damage” has no executable policy path: an unaffordable intact revival only causes the existing policy to skip it. A small, approved simulation-policy addition is required before the 70% condition can be measured and balance-tuned honestly.

## D5 8/22 — M10 damage-aware simulation policy (approved scope)

**Project**: Added the approved headless-only policy that exercises M09 disposal when consecutive intact revivals cannot be funded after baseline goods income, then sells only the immediately preceding damaged body's loot.
**Deliverables**: `damageAwarePolicy`, deterministic two-revival affordability forecast, one-day-only damaged-loot placement, and unit regressions for immediate insolvency, forecast insolvency, and no repeated sale.
**Tuning record**: With temporary `goodsPerFan=0.010`, `start.gold=8,000`, the policy completed 1,000/1,000 seeds, had zero pre-Day-5 closures, Day-5 average -1,629G, and reached a damaged-recovery decision in 93.8% of runs on Days 5–7. The M10 target table still diverges on Days 2–4 because the existing headless loop lacks its assumed early shelf income / progressive daily depth; these temporary balance values were restored rather than retained.
**Validation**: `npm run typecheck` and the full 63-test suite passed. The policy and tests are ready as a separate local M10 commit; production build follows before commit.

## D5 8/22 — CCR-003 starter stock and shop economy simulation

**Decision**: Approved inventory contract separates persistent `GEAR`, consumable `POTION`, and sell-only `RELIC` behavior. The initial shop holds `lantern_old`, `dagger_crack`, and one `potion_crimson`.

**Deliverables**: `OFFICE/PLACE` now equips only an owned, unique gear item; `OFFICE/SELL` removes one unequipped stock item for its configured price; `COMBAT/USE_ITEM` consumes a potion during LIVE without RNG or turn cost. Every item carries content-defined `kind` and `healing`; two potion definitions were added. The headless policy equips starter gear, uses the potion at half health, sells recovery stock when required, and sells stock to fund an otherwise unaffordable contract.

**Balance trial retained**: One income knob changed: `income.goodsPerFan 0.020 -> 0.005`. The unchanged `start.gold` trial at 20,000 was measured and restored because it was not needed for terminal completion.

**1,000-seed result**: 1,000/1,000 terminal endings; B_CONTINUE 625, A_OPEN 213, B_REVEAL 162. Average final gold 6,631G, max floor 36.10, revivals 4.84, damaged disposals 2.20. Income per run: superchat 6,098G (60.8%), goods 3,559G (35.5%), stock sales 369G (3.7%); potion uses: 1,000. This makes superchat the primary income source while stock sales remain an emergency/relic path.

**Validation**: `npm run typecheck`, full `npm test` (10 files, 66 tests), and `npm run build` all passed. HO-017 documents the new action semantics for Claude's UI wiring.

## D5 8/22 — M10 realistic superchat-first acceptance (approved)

**Decision**: Replace the incompatible fixed daily-income curve with a realistic mixed-income target: Superchat is the primary, volatile live-event income; goods remain the stable floor; stock/relic sales remain an exceptional recovery path. The superseded calendar-specific Day-5 deficit condition is not used as the completion gate.

**Acceptance**: Across 1,000 seeded `damageAwarePolicy` runs, every run reaches a terminal ending; Superchat is 50–70% of all counted income, goods are 25–40%, and stock sales are at most 15%.

**Validation**: Added a 1,000-seed regression that records settlement income plus pre-run stock sales. It passed with the retained balance at Superchat 60.8%, goods 35.5%, stock 3.7% and 1,000/1,000 terminal endings. `npm run typecheck` and `tests/sim.spec.ts` passed (9 tests).

## D5 8/24 — M07 contextual chat and superchat reaction signal

**Project**: Made LIVE chat react to the actual broadcast state instead of using only generic chatter, without changing the shared core contracts.
**Deliverables**: Contextual combat/fork/danger chat corpora; superchat copy keyed to fork, record, death, witness, and appeal; deterministic `SUPERCHAT_POP` payload fields `reaction` (spoken line) and `expression` (`FOCUSED`, `TRIUMPH`, `SHOCK`, `UNEASY`, or `SMILE`) for the portrait/UI to consume.
**Validation**: Regression coverage proves a waiting fork selects the fork-specific HYPE/DOUBT corpus and a witness superchat emits both its matching message and its streamer reaction payload. `npm run typecheck`, full `npm test` (10 files, 68 tests), and `npm run build` passed.

## D5 8/24 — M07 broadcast audience pacing and nickname corpus

**Project**: Added a deterministic presentation model for a quiet broadcast opening that gains viewers and chat density from depth, appeal, superchat, record progress, and danger.
**Deliverables**: Balance-configured `audienceSnapshot()` returns current viewers and recommended chat interval without mutating game state; 40 seeded fantasy/comedy nicknames; early-broadcast copy; and expanded combat, fork, and danger chat sets. Bans still suppress the same nickname deterministically.
**Validation**: Regressions prove a strong broadcast has more viewers and a shorter chat interval than its opening, and banned fantasy nicknames do not return. `npm run typecheck`, full `npm test` (10 files, 70 tests), and `npm run build` passed.
