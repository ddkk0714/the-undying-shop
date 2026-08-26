import Phaser from 'phaser';
import { SCENES } from '../../config';
import { content } from '../../core/content';
import { dialogueCandidates, interpolateDialogue, pickDialogue, totalRevivals } from '../../core/systems/dialogue';
import { PALETTE } from '../../render/palette';
import { starArt, starExpression, key, slice } from '../../render/assets';
import { bustFrame } from '../../render/bustframe';
import { L } from '../../ui/layout';
import { Button } from '../../ui/Button';
import { Dialogue } from '../../ui/Dialogue';
import { Ticker } from '../../ui/Ticker';
import { createTooltip } from '../../ui/Tooltip';
import { playBgm, playSfx } from '../../audio/Sfx';
import { starVoice } from '../../audio/Voice';
// 입 움직임 연출은 폐지했다 (사용자 확정 — 받은 입 그림이 검사·마법사 모두 얼굴에 비해
// 크기가 안 맞았다). 나중에 다시 살릴 수 있게 표(`render/mouth.ts`)와 에셋은 그대로 두고
// **부르는 자리만 주석 처리**한다. 되살리려면 이 파일에서 「입 연출」 주석을 다 풀면 된다.
// import { mouthKey, mouthSpot } from '../../render/mouth';
import { reducedMotion, speedMul } from '../../ui/options';
import { PhaseScene } from './PhaseScene';
import type { WipeScene } from '../WipeScene';
import type { ChatMessage, CombatChoice, ForkRecord, GameState, ItemId } from '../../core/types';

/**
 * M06 생방송 — 5분할 화면 (04-UI-KIT §1 의 `L.live`).
 *
 * 이 화면만 HUD 를 덮는다. 104+496+744+576 = 1920, 64+1016 = 1080 으로 화면 전체를 채운다.
 *
 * ★ 규칙은 전부 core 에 있다. 여기서 하는 일은 세 가지뿐이다.
 *   1. `LIVE/TICK` 을 `balance.dive.floorSeconds` 간격으로 보낸다 (HO-001)
 *   2. state 를 읽어서 5칸을 그린다
 *   3. state 변화를 연출로 바꾼다 — 목격 1.2초 정지, 28F 채팅 침묵, 사망 지지직
 *
 * ★ 제한시간은 없다 (CCR-001 §2). 대신 core 가 `waitingSince` 로 지체 페널티를 계산하므로
 *   **전투·갈림길 대기 중에도 틱을 계속 보내야 한다.** 여기서 틱을 멈추면 페널티가 죽는다.
 */

/**
 * 지금 층에 맞는 던전 배경.
 *
 * **층 경계를 씬이 정하지 않는다.** `floors.json` 의 `enemiesByZone` 이 이미
 * 구간(22 / 30 / 40)을 갖고 있으므로 그 배열을 그대로 읽는다.
 * 조우 중이면 적 종류가 더 정확한 신호다 — 화염 적이 나오는 곳이 화염 구역이다.
 */
function zoneArt(s: Readonly<GameState>): string {
  const enemyKey = s.today?.encounter?.enemyKey ?? null;
  if (enemyKey === 'enemy.flame') return 'bg.live.flame';
  if (enemyKey === 'enemy.beast') return 'bg.live.ice';
  if (enemyKey === 'enemy.gatekeeper') return 'bg.live.final';
  if (enemyKey === 'enemy.rat' || enemyKey === 'enemy.husk') return 'bg.live.stone';

  const floor = s.today?.currentFloor ?? 0;
  const zones = content.floors.enemiesByZone;
  const i = zones.findIndex((z) => floor <= z.upTo);
  return ['bg.live.stone', 'bg.live.flame', 'bg.live.final'][i < 0 ? zones.length - 1 : i] ?? 'bg.live.stone';
}

/**
 * 같은 구역의 **방송화면 액자** (462x452). `배경-*` 와는 다른 그림이다 —
 * 배경은 벽면 한 컷이고, 이건 복도를 정면으로 잡은 모니터 컷이다 (V3 아트).
 * 적 스프라이트 뒤에 깔려 적이 복도 안에 선 것처럼 보이게 한다 (사용자 확정).
 */
function zoneScreen(s: Readonly<GameState>): string {
  return `${zoneArt(s)}`.replace('bg.live.', 'bg.live.screen.');
}

/** 층 게이지와 지도가 함께 보여주는 층 창(窓). 현재 층이 위에서 다섯 번째에 온다 */
const WINDOW_ROWS = 14;
const WINDOW_LEAD = 4;

/** 좌측 층계 게이지 — 층마다 한 장씩(`ui.live.floors.1`~`.40`), 내려갈수록 채워진 그림으로 갈아 끼운다 */
const FLOOR_FILL_FRAMES = 40;

/** M06 §8 사망 타임라인 (ms) */
const DEATH_HITSTOP = 150;
const DEATH_SCANLINE = 350;
/**
 * 잡음이 멎고 화면이 까매지는 시각. **3초쯤 지지직거리다 넘어간다** (사용자 확정) —
 * 1200ms 는 「어? 죽었나」 하는 사이에 지나가 버렸다.
 */
const DEATH_NOISE_END = 2600;
/**
 * DayScene 이 ④ 사망 단계로 넘어가는 것을 이만큼 늦춰 준다.
 * 잡음이 멎은 뒤 암전 0.4초를 두고 넘긴다 — 뚝 끊기는 것보다 한 박자 있는 편이 낫다
 */
export const DEATH_CURTAIN_MS = 3000;

/**
 * 채팅을 얼마나 자주 청하는가. **밸런스가 아니라 표시 박자다** —
 * 큐 상한(`balance.opinion.chatMaxVisible`)과 수명은 core 가 관리한다.
 * M07 수용 기준 「30초에 40~60개」 → 0.75초에 하나 = 30초에 40개. **범위의 느린 쪽 끝**이다
 * (사용자 확정 — 500ms 는 너무 빨랐다).
 *
 * ★ 채팅창에 **몇 줄이 남는지를 정하는 건 상한이 아니라 이 값이다.**
 *   core 는 `chatLifetimeSeconds` 지난 줄을 지우므로 살아있는 줄 = 수명 / 간격.
 *   600ms · 수명 6초 이면 10줄이라 상한을 12로 올려도 창이 안 찼다 (실측 — 채팅창연출222).
 *   지금은 750ms · 수명 9초 = 12줄. 빈도를 늦추면서도 창은 그대로 찬다.
 *   **이 값을 건드리면 수명도 같이 봐야 한다.** 둘 중 하나만 바꾸면 창이 다시 빈다.
 */
const CHAT_SPAWN_MS = 750;

/** M06 §9 — 목격 1.2초 정지, 28F 는 채팅이 3초 조용해진다 */
const WITNESS_HOLD_MS = 1200;
const CHAT_SILENCE_MS = 3000;

/**
 * 적 반격 — 스프라이트가 튕기듯 커졌다가 돌아오고 화면이 흔들린다 (사용자 확정).
 *
 * 커지는 건 앞 1/4 구간에서 단숨에, 돌아오는 건 나머지 3/4 에 걸쳐 제곱으로 잦아든다.
 * 좌우 대칭으로 하면 「부풀었다 꺼진다」가 되고, 이렇게 해야 「맞았다」로 읽힌다.
 *
 * 카메라 흔들림 세기는 화면 폭의 비율이다 — 0.004 × 1920 ≈ 7px.
 */
const COUNTER_MS = 240;
const COUNTER_BOUNCE = 0.18;
const COUNTER_SHAKE_MS = 180;
const COUNTER_SHAKE = 0.004;
const ENEMY_SPAWN_FADE_MS = 360;
const ENEMY_DEFEAT_SCATTER_MS = 460;
/** 처치 파편 개수 — 12는 허전하다는 요청으로 늘렸다 */
const ENEMY_DEFEAT_FRAGMENTS = 26;
/** 피격 순간 — `wax` 로 잠깐 물들고, 발밑을 고정한 채 잘게 튄다 (사용자 요청) */
const ENEMY_HIT_FX_MS = 180;
const ENEMY_HIT_SHAKE_PX = 5;

function bounceAmount(t: number): number {
  const k = t < 0.25 ? t / 0.25 : (1 - (t - 0.25) / 0.75) ** 2;
  return COUNTER_BOUNCE * k;
}

/**
 * 공격 명중 연출 — 적 체력이 줄어드는 순간(=명중, 반격과 대칭) 재생한다.
 *
 * `ui.live.fx.sword`(아트-발주서/아트_V3/전투화면/공격모션/칼.gif, 10프레임)를 한 번만
 * 재생하고 끈다 (사용자 확정). **GIF 원본 박자(70ms/프레임 · 700ms)는 안 쓴다** —
 * `sfx.combat.attack` 이 192ms 짜리라 그대로 쓰면 소리는 끝났는데 칼질이 계속 도는
 * 꼴이 됐다(사용자 확인 — 싱크 안 맞음). 소리 길이에 맞춰 20ms/프레임(=200ms)으로 당겼다.
 */
const SWORD_FX_FRAMES = 10;
const SWORD_FX_FRAME_MS = 30;
/** 적 머리 위로 뜨는 피해 숫자 — 떠오르며 옅어진다 */
const DAMAGE_TOAST_MS = 700;
const DAMAGE_TOAST_RISE = 40;

/**
 * 방어 연출 — **플레이어가 DEFEND 를 고른 순간** 재생한다 (명중과 달리 체력
 * 변화로 읽을 수 없다 — 막아도 완전히 무피해는 아니라서). `encounter.log`
 * 길이가 늘고 마지막 값이 DEFEND 일 때가 그 순간이다.
 *
 * `ui.live.fx.shield`(방패모션.gif, 15프레임 · 50ms 간격)를 용사 초상 위에 한 번만 재생한다.
 */
const SHIELD_FX_FRAMES = 15;
const SHIELD_FX_FRAME_MS = 60;

/**
 * 자동 전투 (사용자 확정) — 평범한 한 수는 씬이 알아서 낸다.
 * 플레이어는 **중요한 결정에만** 손을 댄다: 무전 갈림길, 그리고 체력이 바닥일 때 물약.
 *
 * 한 수 사이에 한 박자 쉰다. 즉시 처리하면 전투가 한 프레임에 끝나 무슨 일이
 * 일어났는지 볼 수 없다.
 *
 * ⚠️ **정책은 규칙이 아니다.** 무엇을 고르면 어떻게 되는지는 전부 `core/systems/combat.ts`
 *    가 정한다. 여기 있는 건 「사람 대신 버튼을 누르는 손」이고, 그 손이 어떤 순서로
 *    누르는지가 아래 세 줄이다. core 로 옮기는 편이 낫다고 판단되면 HANDOFF 로 넘긴다.
 */
const AUTO_TURN_MS = 1500;
/** 체력이 이 아래로 내려가면 방어를 섞는다 */
const AUTO_DEFEND_RATIO = 0.4;
/** 이 위로 여유가 있으면 조우 첫 수는 어필로 번다 */
const AUTO_APPEAL_RATIO = 0.7;
/** 이 아래로 떨어지고 물약이 있으면 **플레이어에게 묻는다** */
const POTION_ASK_RATIO = 0.35;
/**
 * 체력이 바닥일 때 **방어 한 턴 뒤 이만큼은 공격으로 되받는다** (사용자 확정).
 * 예전에는 체력이 낮으면 그냥 계속 방어했다 — 적 HP 가 줄지 않으니 조우가 끝나지 않고,
 * 방어는 매 턴 피해를 ×0.25 로 받기만 해서 **천천히 죽는 길**이었다.
 * 이제 방어1 + 공격3 의 네 턴 주기로 돈다.
 *
 * ⚠️ 사용자가 말한 「방어 효과 3턴 지속」은 **아직 core 에 없다.**
 *    `resolveCombatChoice` 의 DEFEND 는 그 턴 피해만 깎고, 남는 `Encounter.guarding`
 *    플래그는 다음 수에 곧바로 꺼지며 어떤 규칙도 읽지 않는다 (읽는 곳은 이 씬의 「방어」
 *    글자뿐). 지속을 진짜로 만들려면 core 규칙 변경이라 HANDOFF 로 넘긴다 → HO-031
 */
const AUTO_ATTACKS_PER_GUARD = 3;

/**
 * ⚠️ **턴 수를 `enc.turn` 으로 세지 않는다.** `createEncounter`(`core/systems/combat.ts`)가
 *    조우를 `turn: 1` 로 시작하기 때문에 예전의 `turn === 0` 은 영원히 거짓이었고,
 *    그래서 자동 전투가 어필을 **한 번도** 내지 않았다 — 어필이 없으면
 *    `resolveCombatChoice` 의 `superchat` 도 서지 않으니 전투 중 슈퍼챗이 통째로 죽는다.
 *    `log` 는 **낸 수만** 쌓이므로 기수가 0이든 1이든 같은 뜻이 된다. 주기도 여기서 읽는다.
 */
function autoChoice(hero: { hp: number; maxHp: number }, log: readonly CombatChoice[]): CombatChoice {
  const ratio = hero.maxHp <= 0 ? 0 : hero.hp / hero.maxHp;

  if (ratio < AUTO_DEFEND_RATIO) {
    // 마지막 방어 이후 몇 수를 냈는가. 아직 한 번도 안 막았으면 지금이 그 자리다
    const lastGuard = log.lastIndexOf('DEFEND');
    const sinceGuard = lastGuard === -1 ? Number.POSITIVE_INFINITY : log.length - 1 - lastGuard;
    return sinceGuard >= AUTO_ATTACKS_PER_GUARD ? 'DEFEND' : 'ATTACK';
  }

  if (log.length === 0 && ratio >= AUTO_APPEAL_RATIO) return 'APPEAL';
  return 'ATTACK';
}

const CHOICE_LABEL: Record<CombatChoice, string> = {
  ATTACK: '공격한다',
  DEFEND: '방어한다',
  APPEAL: '어필한다',
};

/** 슈퍼챗 판(`ui.live.superchat`) 안쪽 검은 칸의 세로 중심 — 판 위쪽 기준 (아트 실측) */
const SUPERCHAT_TEXT_CY = 40;

/** 층을 하나 클리어하고 내려갈 때 화면이 이만큼 확대됐다가 돌아온다 */
const DIVE_ZOOM = 1.08;
const DIVE_ZOOM_MS = 200;
/** 적 처치 뒤 다음 층으로 이동하기 전, 잔상과 파편을 보여 주는 짧은 숨 고르기. */
const DESCENT_PAUSE_MS = 600;

/**
 * 무전 대사 사이의 **최소 간격** (사용자 확정 — 「연출이 충분히 나오도록 빈도를 줄여줘」).
 *
 * core 는 전투 한 수마다 새 줄을 물린다. 자동 전투가 0.9초 간격이라 그대로 두면
 * 타자가 두 글자 나오고 다음 줄로 갈아 끼워진다. 이만큼 지나야 다음 줄을 받는다.
 */
const RADIO_GAP_MS = 4200;
/**
 * 무전 한 글자 사이 간격. `Dialogue` 기본값은 42ms 인데 생방송은 흐름이 빨라서
 * 조금 당겼다 (사용자 확정). 말줄임 뒤 한 박자 쉬는 건 `Dialogue` 가 알아서 한다
 */
const RADIO_CHAR_MS = 30;

export class LivePhase extends PhaseScene {
  private ticker: Phaser.Time.TimerEvent | null = null;
  private chatPump: Phaser.Time.TimerEvent | null = null;
  /** 04-UI-KIT — Text 12개를 미리 만들어 두고 내용만 갈아끼운다 */
  private chat!: Ticker;
  /** 이미 날려 보낸 슈퍼챗 — 같은 메시지로 두 번 연출하지 않는다 */
  private flownSuperchats = new Set<string>();
  /** 34F 문지기 컷신 (M11 §2). 한 방송에 한 번만 뜬다 */
  private gatekeeperOpen = false;
  private gatekeeperSeen = false;

  /** 연출 상태 — 화면을 다시 그려도 살아남아야 한다 */
  private reduced = false;
  private seenWitness: number[] | null = null;
  private witnessFloor: number | null = null;
  private witnessUntil = 0;
  private chatSilentUntil = 0;
  private deathAt: number | null = null;
  private lastFans = -1;
  private fanDropUntil = 0;
  /** 적이 한 대 먹인 순간 (반격 연출 시작 시각). 끝나면 null */
  private counterAt: number | null = null;
  /** 용사 체력을 지켜보다 **줄어드는 순간**을 반격으로 읽는다 (아래 build 참조) */
  private lastHeroHp = -1;
  /** 튕길 적 스프라이트와 원래 자리·크기. build 가 매번 다시 채운다 */
  private enemyBounce: { img: Phaser.GameObjects.Image; x: number; y: number; w: number; h: number } | null = null;

  /** 적 체력을 지켜보다 **줄어드는 순간**을 명중으로 읽는다 (반격과 대칭) */
  private lastEnemyHp = -1;
  /** 공격 슬래시 연출 재생 시작 시각. 끝나면 null — keepAlive 로 redraw 를 견딘다 */
  private attackFxAt: number | null = null;
  private attackFxImg: Phaser.GameObjects.Image | null = null;
  /** 적이 맞은 순간(=명중 순간과 같다). 끝나면 null. `enemyBounce` 가 매번 갈아 끼워져도
   * update() 가 프레임마다 다시 태우므로 750ms 간격 redraw 를 견딘다 (반격 부풀림과 같은 수법) */
  private enemyHitAt: number | null = null;
  /** 떠 있는 피해 숫자들 */
  private damageToasts: { obj: Phaser.GameObjects.Text; startAt: number; baseY: number }[] = [];

  /** 조우 로그 길이를 지켜보다 **DEFEND 가 막 추가된 순간**을 읽는다 */
  private lastLogLength = -1;
  private defendFxAt: number | null = null;
  private defendFxImg: Phaser.GameObjects.Image | null = null;

  /** 자동 전투 — 다음 한 수를 낼 시각. 방금 낸 수는 3택 자리에 적어 준다 */
  private autoAt = 0;
  private lastAuto: CombatChoice | null = null;
  /** 이번 조우에서 물약을 「그냥 싸운다」로 넘겼는가 — 넘겼으면 다시 묻지 않는다 */
  private potionDeclined = false;
  /** 조우가 끝나는 순간을 잡기 위한 직전 상태 */
  private wasFighting = false;
  /** 마지막으로 하강 연출을 낸 층. 실제 층이 바뀔 때마다 한 번만 확대한다. */
  private displayedFloor: number | null = null;
  /** 처치 연출을 마칠 때까지 다음 LIVE/TICK을 잠시 멈춘다. */
  private descentPauseUntil = 0;
  /** 새 조우의 등장음은 한 번만 낸다. */
  private lastEncounterKey: string | null = null;
  private enemySpawnAt: number | null = null;

  /** 지금 떠 있는 무전 줄 — 다시 그려도 살아남는다 (`stageRadio` 참조) */
  private radioText = '';
  private radioObj: Dialogue | null = null;
  private radioAt = 0;
  /** 지금 줄이 끝까지 나왔는가. 끝나기 전에는 다음 줄을 받지 않는다 */
  private radioDone = true;
  /** 이 줄에 붙은 표정. 줄이 떠 있는 동안 초상이 이걸 쓴다 */
  /** 이 줄에 붙은 표정. 줄이 떠 있는 동안 초상이 이걸 쓴다 */
  private radioFace: string | null = null;
  /** 흉상이 스프라이트를 어디에 놓았는지 — 입을 같은 좌표계로 얹기 위해 기억한다 */
  // 입 연출 — 폐지. 되살릴 때 함께 푼다
  // private bustOrigin: { x: number; y: number; cx: number; cy: number; cw: number; ch: number } | null = null;
  // 입 연출 — 폐지. 이 배우의 입이 스프라이트 어디까지 내려오는가 (흉상 crop 이 참고했다)
  // private mouthBottom: number | null = null;

  /** 프레임마다 손보는 오브젝트 — build() 가 매번 다시 채운다 */
  private blinkers: (Phaser.GameObjects.Rectangle | Phaser.GameObjects.Image)[] = [];
  private shaken: { obj: Phaser.GameObjects.GameObject & { x: number; y: number }; x: number; y: number }[] = [];
  private noiseLayer: Phaser.GameObjects.Graphics | null = null;
  /** 신호 두절 잡음 — 받은 아트 한 장을 뒤집어 가며 쓴다 (DeathPhase 와 같은 수법) */
  private noiseArt: Phaser.GameObjects.Image | null = null;

  constructor() {
    super(SCENES.PHASE_LIVE);
  }

  override create(): void {
  /**
   * ★ Phaser 씬 인스턴스는 stop/launch 를 거쳐도 **살아남는다.**
   * 어제 남긴 필드를 지우지 않으면 다음 날 화면이 어제 상태로 시작한다.
   */
    this.flownSuperchats = new Set();
    this.gatekeeperOpen = false;
    this.gatekeeperSeen = false;
    this.seenWitness = null;
    this.witnessFloor = null;
    this.witnessUntil = 0;
    this.chatSilentUntil = 0;
    this.deathAt = null;
    this.lastFans = -1;
    this.counterAt = null;
    // 어제 방송은 「방송사고」로 끝났다. 오늘 켜지는 소리가 그 짝이다
    playSfx(this, 'sfx.signal.back', 0.55);
    this.lastHeroHp = -1;
    this.enemyBounce = null;
    this.lastEnemyHp = -1;
    this.attackFxAt = null;
    this.attackFxImg = null;
    this.enemyHitAt = null;
    this.damageToasts = [];
    this.lastLogLength = -1;
    this.defendFxAt = null;
    this.defendFxImg = null;
    this.autoAt = 0;
    this.lastAuto = null;
    this.potionDeclined = false;
    this.wasFighting = false;
    this.displayedFloor = null;
    this.descentPauseUntil = 0;
    this.lastEncounterKey = null;
    this.enemySpawnAt = null;
    this.radioText = '';
    this.radioObj = null;
    this.radioAt = 0;
    this.radioDone = true;
    this.radioFace = null;
    this.fanDropUntil = 0;

    this.chat = new Ticker(this, { x: L.live.chat.x + L.pad, y: L.live.chat.y + 58, w: L.live.chat.w - L.pad * 2, h: L.live.chat.h - 80 },
      (id) => this.store.dispatch({ type: 'CHAT/DELETE', id }));
    this.keepAlive(...this.chat.objects());

    // 버튼 툴팁. 채팅이 들어올 때마다 화면을 다시 그리므로 **살려 둬야** 한다 —
    // 매번 새로 만들면 커서를 올려 둔 채로 툴팁이 깜빡인다
    this.keepAlive(...createTooltip(this).objects());

    super.create();
    playBgm(this, 'bgm.live');
    this.playBroadcastNoiseIntro();
    // 방송 진입 직후에는 조우/무전이 아직 없어서 buildDialogue()가 빈다.
    // 대사집의 DUN_START를 이 첫 프레임에 직접 무전 배너로 올린다.
    this.stageOpeningDialogue();
    const stepMs = Math.round((content.balance.dive.floorSeconds * 1000) / speedMul(this.registry));
    this.ticker = this.time.addEvent({ delay: stepMs, loop: true, callback: () => this.step() });

    // 채팅은 core 에 청하기만 한다. 무슨 말이 나올지는 core 가 정한다 (M07)
    //
    // ★ 배속을 나눠 준다. 채팅 수명(`chatLifetimeSeconds`)은 **게임 시간** 기준인데
    //   (`LIVE/TICK` 이 `phaseStartedAt` 을 밀고, `expireChats` 가 그걸로 잰다)
    //   펌프만 실시간이면 2배속에서 게임 시간 1.0초에 하나가 되어 줄이 절반으로 준다.
    //   `stepMs` 와 같은 식으로 나눠야 배속과 무관하게 같은 줄 수가 유지된다.
    this.chatPump = this.time.addEvent({
      delay: Math.max(1, Math.round(CHAT_SPAWN_MS / speedMul(this.registry))),
      loop: true,
      callback: () => {
        if (this.store.getState().phase !== 'LIVE') return;
        if (this.time.now < this.chatSilentUntil) return; // 28F 침묵
        this.store.dispatch({ type: 'CHAT/SPAWN' });
        playSfx(this, 'sfx.text', 0.08);
      },
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.ticker?.remove();
      this.chatPump?.remove();
      this.ticker = null;
      this.chatPump = null;
    });
  }

  /** TV를 눌러 방송으로 전환되는 순간에만 짧은 신호 잡음을 덮었다가 걷어 낸다. */
  private playBroadcastNoiseIntro(): void {
    if (reducedMotion(this.registry)) return;
    const noise = this.spriteObject(0, 0, 'ui.live.noise', L.W, L.H);
    const overlay = noise ?? this.add.rectangle(0, 0, L.W, L.H, PALETTE.ink, 0.78).setOrigin(0, 0);
    overlay.setDepth(5000).setAlpha(0.9);
    this.tweens.add({
      targets: overlay,
      alpha: 0,
      duration: 360,
      ease: 'Steps(4)',
      onComplete: () => overlay.destroy(),
    });
  }

  /**
   * 전투 중이든 갈림길 대기 중이든 틱은 계속 보낸다 — core 의 `tickLive` 가
   * 그 경우 하강 대신 지체 페널티만 계산한다. 목격 연출 동안만 화면이 멈춘다.
   */
  private step(): void {
    if (this.store.getState().phase !== 'LIVE') return;
    if (this.time.now < this.witnessUntil) return;
    if (this.time.now < this.descentPauseUntil) return;
    if (this.gatekeeperOpen) return; // 문지기 앞에서는 아무도 내려가지 않는다
    this.store.dispatch({ type: 'LIVE/TICK', dt: content.balance.dive.floorSeconds });
  }

  /**
   * 지금 플레이어에게 물약을 물어야 하는가 — 물어야 하면 그 물약의 id.
   *
   * 조건을 core 의 `useCombatItem` 이 실제로 받아 주는 것과 **같게** 맞춘다.
   * 물어봐 놓고 눌렀는데 아무 일도 안 일어나는 게 제일 나쁘다.
   */
  private potionAsk(s: Readonly<GameState>): ItemId | null {
    const run = s.today;
    if (run === null || run === undefined || run.encounter === null || this.potionDeclined) return null;
    if (run.hero.maxHp <= 0 || run.hero.hp >= run.hero.maxHp) return null;
    if (run.hero.hp / run.hero.maxHp > POTION_ASK_RATIO) return null;
    const id = s.shelf[content.balance.equipment.utilitySlot] ?? null;
    if (id === null) return null;
    const item = content.items.find((c) => c.id === id && c.kind === 'POTION' && c.healing > 0);
    if (item === undefined) return null;
    return s.inventory.some((c) => c.id === id && c.qty > 0) ? id : null;
  }

  /**
   * 자동 전투 한 수. 조우 중이고 **플레이어에게 물어볼 게 없을 때만** 낸다.
   * 갈림길이 걸려 있으면 조우가 없으므로 여기까지 오지 않는다.
   */
  private autoTurn(now: number): void {
    const s = this.store.getState();
    const run = s.today;
    const enc = run?.encounter ?? null;
    if (s.phase !== 'LIVE' || run === null || run === undefined || enc === null) {
      this.autoAt = 0;
      return;
    }
    if (this.gatekeeperOpen || now < this.witnessUntil) return;
    if (this.potionAsk(s)) return;           // 물약을 물어보는 중 — 손을 뗀다
    if (this.autoAt === 0) {
      this.autoAt = now + AUTO_TURN_MS;      // 조우가 막 시작됐다. 한 박자 두고 시작한다
      return;
    }
    if (now < this.autoAt) return;

    const choice = autoChoice(run.hero, enc.log);
    this.lastAuto = choice;
    this.autoAt = now + AUTO_TURN_MS;
    // 어필은 소리를 내지 않는다 — 카메라를 보는 동작이지 부딪는 동작이 아니다
    if (choice === 'ATTACK') playSfx(this, 'sfx.combat.attack', 0.55);
    else if (choice === 'DEFEND') playSfx(this, 'sfx.combat.guardBlock', 0.5);
    this.store.dispatch({ type: 'COMBAT/CHOOSE', choice });
  }

  override update(): void {
    super.update();
    const now = this.time.now;
    this.autoTurn(now);
    // 연출 감소·목격 정지와 무관하게 항상 밀어준다 — 안 그러면 슬래시가 안 꺼지거나
    // 피해 숫자가 화면에 박제된다
    this.stepAttackFx(now);
    this.stepDefendFx(now);

    // 목격 정지가 끝나는 순간 한 번만 다시 그린다 (오버레이 제거)
    if (this.witnessFloor !== null && now >= this.witnessUntil) {
      this.witnessFloor = null;
      this.redraw();
      return;
    }
    if (this.reduced) return;

    const on = Math.floor(now / 400) % 2 === 0;
    for (const obj of this.blinkers) obj.setVisible(on);

    if (this.shaken.length > 0) {
      const dx = Math.round(Math.sin(now / 40) * 4);
      const dy = Math.round(Math.sin(now / 27) * 3);
      for (const s of this.shaken) {
        s.obj.x = s.x + dx;
        s.obj.y = s.y + dy;
      }
    }

    // 반격 — 매 프레임 크기를 다시 먹인다. 트윈을 쓰면 채팅이 들어올 때마다(750ms)
    // 화면을 다시 그리면서 스프라이트가 파괴돼 연출이 중간에 끊긴다
    if (this.counterAt !== null) {
      const t = (now - this.counterAt) / COUNTER_MS;
      if (t >= 1) {
        this.counterAt = null;
        this.applyBounce(0);
      } else {
        this.applyBounce(bounceAmount(t));
      }
    }
    this.stepEnemyHitFx(now);

    if (this.noiseArt !== null) {
      // 잡음은 뒤집어도 잡음이다 — 1182x936 텍스처를 여러 장 물고 있을 이유가 없다
      const step = Math.floor(now / 110);
      this.noiseArt.setFlipX((step & 1) === 1).setFlipY((step & 2) === 2);
    }
    if (this.noiseLayer !== null && this.deathAt !== null) this.drawNoise(now - this.deathAt);
  }

  protected build(s: Readonly<GameState>): void {
    this.reduced = reducedMotion(this.registry);
    this.blinkers = [];
    this.shaken = [];
    this.noiseLayer = null;
    this.noiseArt = null;
    this.enemyBounce = null;

    const currentFloor = s.today?.currentFloor ?? null;
    if (currentFloor !== null) {
      if (this.displayedFloor !== null && currentFloor > this.displayedFloor) this.diveTransition();
      this.displayedFloor = currentFloor;
    }

    /**
     * 적이 반격했는지는 **용사 체력이 줄었는가**로 읽는다.
     *
     * `pendingFx` 로는 알 수 없다 — `HIT`/`GUARD`/`APPEAL_POSE` 는 플레이어가 무엇을
     * 골랐는지를 말할 뿐, 적이 실제로 맞혔는지는 담고 있지 않다 (`core/systems/combat.ts`:
     * 공격은 `counterChance`, 어필은 `hitChance` 로 갈린다). 새 fx 종류를 넣으려면
     * `types.ts` 를 고쳐야 하는데 그건 동결된 계약 파일이다.
     * 조우 중일 때만 본다 — 층 이동 중 피해까지 반격으로 읽지 않기 위해서다.
     */
    const hp = s.today?.hero.hp ?? -1;
    if (this.lastHeroHp >= 0 && hp >= 0 && hp < this.lastHeroHp && s.today?.encounter != null) {
      this.counterAt = this.time.now;
      if (s.today.encounter.enemyKey === 'enemy.flame') {
        playSfx(this, 'sfx.combat.flameCast', 0.32);
        this.time.delayedCall(110, () => playSfx(this, 'sfx.combat.flameHit', 0.6));
      } else playSfx(this, 'sfx.combat.hit', 0.6);
      if (!this.reduced) this.cameras.main.shake(COUNTER_SHAKE_MS, COUNTER_SHAKE);
    }
    this.lastHeroHp = hp;

    /**
     * 명중 — **적 체력이 줄었는가**로 읽는다 (위 반격 판정과 대칭). `resolveCombatChoice`
     * 에서 ATTACK 은 빗나가는 경우가 없으므로(`core/systems/combat.ts`) 이 신호만으로 충분하다.
     *
     * 연출은 여기서 바로 띄우지 않고 값만 기억해 둔다 — `spawnAttackFx` 가 여기서
     * 오브젝트를 만들면 뒤이어 그려지는 던전 배경·적 스프라이트에 깔린다.
     * **build() 맨 끝, 다른 레이어를 전부 그린 뒤**에 띄워야 위에 얹힌다.
     */
    const enemyHp = s.today?.encounter?.enemy.hp ?? -1;
    const justHit = this.lastEnemyHp >= 0 && enemyHp >= 0 && enemyHp < this.lastEnemyHp && s.today?.encounter != null
      ? this.lastEnemyHp - enemyHp
      : null;
    this.lastEnemyHp = enemyHp;

    /**
     * 방어 — **로그가 늘고 마지막 값이 DEFEND** 인 순간을 그 턴으로 읽는다.
     * 위 명중과 같은 이유로 여기서는 표시하지 않고 build() 맨 끝에서 띄운다.
     */
    const log = s.today?.encounter?.log ?? null;
    const justDefended = log !== null && this.lastLogLength >= 0 && log.length > this.lastLogLength
      && log.at(-1) === 'DEFEND';
    this.lastLogLength = log?.length ?? -1;

    // 조우가 끝나는 순간 = **층을 클리어하고 내려간다**. 층은 틱마다 바뀌므로
    // `currentFloor` 로 잡으면 0.35초마다 연출이 터진다 — 조우의 끝으로 잡아야 한 번이다
    const encounterKey = s.today?.encounter?.enemyKey ?? null;
    const priorEncounterKey = this.lastEncounterKey;
    if (encounterKey !== null && priorEncounterKey === null) {
      this.enemySpawnAt = this.time.now;
      playSfx(this, 'sfx.combat.monsterSpawn', 0.42);
    }
    const fighting = s.today?.encounter != null;
    if (this.wasFighting && !fighting && s.phase === 'LIVE' && hp > 0) {
      playSfx(this, 'sfx.combat.monsterDeath', 0.56);
      if (priorEncounterKey !== null) this.scatterEnemyDefeat(priorEncounterKey);
      this.descentPauseUntil = this.time.now + DESCENT_PAUSE_MS;
    }
    this.lastEncounterKey = encounterKey;
    if (!fighting) {
      this.potionDeclined = false;   // 다음 조우에서는 다시 묻는다
      this.lastAuto = null;
    }
    this.wasFighting = fighting;
    this.watch(s);

    // 상단 144 는 DayScene 의 HUD 다 — 목업(전투화면.png)에서도 방송 중에 그대로 떠 있다.
    // 예전에는 여기서 화면 전체를 ink 로 덮고 자체 바를 그렸다. 그러면 HUD 아트가 가려진다.
    this.rect(L.stage.x, L.stage.y, L.stage.w, L.stage.h, 'ink');
    this.spriteCover(L.stage, ['bg.live']);

    // 「이 순간이 게임 전체에서 가장 중요한 30초다」 (M11 §2).
    // 덮기만 하면 아래 3택이 그대로 눌리므로 다른 것을 아예 그리지 않는다.
    if (this.gatekeeperOpen) {
      // 채팅 티커는 keepAlive 라 redraw 로 지워지지 않는다 — 직접 내린다.
      // 한 컷을 위해 화면을 비우기로 한 이상 오른쪽에 채팅이 흐르면 안 된다
      this.chat.hideAll();
      this.buildGatekeeper();
      return;
    }

    // 그리는 순서가 곧 레이어다 (목업 기준):
    //   책상 판 → 층계 → 지도 → 무전기  |  던전 → 랜턴 팔 → LIVE → 채팅 → 초상 → 대사 → 3택
    this.sprite(L.live.desk.x, L.live.desk.y, 'bg.live.desk', L.live.desk.w, L.live.desk.h);
    this.buildCombat(s);
    this.buildFloors(s);
    this.buildMap(s);
    this.buildRadio(s);
    this.buildLantern();
    this.buildLiveBar(s);
    this.buildPortrait(s);
    this.buildChat(s);
    this.buildDialogue(s);
    this.buildChoices(s);

    // 위 레이어를 전부 그린 다음에 띄운다 — 던전·적 스프라이트 위에 와야 한다
    if (justHit !== null) this.spawnAttackFx(justHit);
    if (justDefended) this.spawnDefendFx();

    // 상시 팁은 걷어냈다 (사용자 확정). 전투 중에 화면 한 구석에 한 줄이 계속 떠 있으면
    // 거슬리기만 한다. 설명은 이제 **버튼에 마우스를 올렸을 때만** 커서 우측 위에 뜬다
    // (`Tooltip`, `buildChoices` 의 `tip`). 다른 화면의 `onboard` 는 그대로 둔다.

    if (this.witnessFloor !== null) this.buildWitness(this.witnessFloor);
    if (this.deathAt !== null) {
      // 방송이 끊기는 순간 — 던전 칸 위에 잡음을 덮는다. 절차적 주사선은 그 위에 겹친다
      const c = L.live.combat;
      this.noiseArt = this.spriteObject(c.x, c.y, 'ui.live.noise', c.w, c.h);
      this.noiseLayer = this.add.graphics();

      // ★ 살려 둔 것들(`keepAlive`)은 `redraw()` 가 **맨 위에** 다시 얹는다.
      //   그래서 채팅과 무전 줄이 잡음 위로 떠올라, 화면이 바뀔 때까지 남아 있었다
      //   (「전환 때 채팅창이 조금 늦게 꺼진다」의 정체). 방송이 끊겼으면 먼저 내린다
      this.chat.hideAll();
      this.clearRadio();
    }
  }

  /* ── state 변화를 연출 타이머로 옮긴다 ────────────────── */
  private watch(s: Readonly<GameState>): void {
    const now = this.time.now;

    // 목격 (18/23/28F) — core 가 seenWitnessFloors 에 넣는 순간이 신호다
    if (this.seenWitness === null) this.seenWitness = [...s.seenWitnessFloors];
    const fresh = s.seenWitnessFloors.find((f) => !this.seenWitness?.includes(f));
    if (fresh !== undefined) {
      this.seenWitness = [...s.seenWitnessFloors];
      if (fresh === deepestWitnessFloor()) this.chatSilentUntil = now + CHAT_SILENCE_MS;
      if (!this.reduced) {
        this.witnessFloor = fresh;
        this.witnessUntil = now + WITNESS_HOLD_MS;
      }
    }

    // 34F 문지기 — core 가 flags.gatekeeperCutscene 을 세우는 순간이 신호다 (M11 §2)
    if (s.flags.gatekeeperCutscene === true && !this.gatekeeperSeen) {
      this.gatekeeperSeen = true;
      this.gatekeeperOpen = true;
    }

    // 사망 — DayScene 이 단계 교체를 DEATH_CURTAIN_MS 만큼 늦춰 준다 (M06 §8)
    // 「소리가 절반이다」 — 지지직과 함께 방송이 끊기는 소리가 난다
    if (s.phase !== 'LIVE' && this.deathAt === null) {
      this.deathAt = now;
      playSfx(this, 'sfx.death', 0.9);
    }

    // 지체 페널티는 수치로 알리지 않는다. 시청자 수 옆 ▼ 한 글자만 (M06 §3)
    if (this.lastFans >= 0 && s.fans < this.lastFans) this.fanDropUntil = now + 900;
    this.lastFans = s.fans;
  }

  /**
   * 방송 제목·시청자 수는 목업에서 사라졌다 — 상단 HUD 가 그 자리를 쓴다.
   * 대신 이 방송이 누구 것인지는 우상단 초상 아래에 적는다 (`buildPortrait`).
   */

  /**
   * ── ② 좌측 층수 게이지 — 아래로 깊어진다 (M06 §6) ────
   *
   * 숫자 목록 대신 **그림 한 장을 통째로 갈아 끼운다** (사용자 확정). `ui.live.floors`
   * 는 아무 층도 못 간 상태(0층)이고, 한 층 내려갈 때마다 `ui.live.floors.<층>`
   * (1~40, `아트-발주서/아트_V3/타워`)로 바뀐다 — 그림 안의 붉은 칸이 위에서부터
   * 하나씩 차오르는 것으로 진행을 보여준다.
   */
  private buildFloors(s: Readonly<GameState>): void {
    const v = L.live.floors;
    const floor = Math.max(0, Math.min(FLOOR_FILL_FRAMES, s.today?.currentFloor ?? 0));
    this.rect(v.x, v.y, v.w, v.h, 'ink');
    this.sprite(v.x, v.y, floor === 0 ? 'ui.live.floors' : `ui.live.floors.${floor}`, v.w, v.h);
  }

  /* ── ③ 던전 지도 — 프로시저럴. 갈림길 정답은 그리지 않는다 ─ */
  private buildMap(s: Readonly<GameState>): void {
    const v = L.live.map;
    // 종이 아트가 오면 판을 깔지 않는다 — 찢어진 가장자리가 사각형에 갇힌다
    if (!this.hasArt('ui.live.map')) this.rect(v.x, v.y, v.w, v.h, 'ink');
    this.sprite(v.x, v.y, 'ui.live.map', v.w, v.h);

    // 방·복도는 **씬이 그린다.** 받은 종이 아트에는 눈금과 접힌 자국뿐이다 —
    // 지도는 매 다이브마다 달라야 하므로 그게 맞는 설계다.
    // 밝은 종이 위라 선은 전부 ink 다. dust/mid 는 종이에 묻힌다.
    const floor = s.today?.currentFloor ?? 0;
    const top = windowTop(floor);
    const gridY = v.y + 116;
    const rowH = Math.floor((v.h - 200) / WINDOW_ROWS);
    const innerX = v.x + 72;
    const innerW = v.w - 144;
    const roomH = Math.max(18, rowH - 10);
    const wall = L.line * 2;   // 종이가 어수선해서 2px 선은 묻힌다

    let prev: { cx: number; bottom: number } | null = null;
    for (let i = 0; i < WINDOW_ROWS; i += 1) {
      const f = top + i;
      const y = gridY + i * rowH;
      // 방 모양은 시드에 묶는다 — 다시 그려도 지도가 흔들리지 않는다
      const a = hash2(s.seed, f);
      const b = hash2(s.seed ^ 0x5bf03635, f);
      const w = 88 + Math.floor(b * (innerW - 200));
      const x = innerX + Math.floor(a * (innerW - w));
      const cx = x + Math.floor(w / 2);
      const visited = f > 0 && f <= floor;

      // 지나온 층은 벽을 그은 방, 아직 안 간 층은 점선 — 「거긴 아직 모른다」
      if (visited) this.frame(x, y, w, roomH, 'ink');
      else this.dashedBox(x, y, w, roomH);

      // 복도 — 앞 방 바닥에서 이 방 천장으로. 꺾이는 자리는 ㄱ 자로 잇는다
      if (visited && prev !== null) {
        const kink = y - Math.floor((y - prev.bottom) / 2);
        this.rect(prev.cx, prev.bottom, wall, kink - prev.bottom, 'ink');
        if (prev.cx !== cx) {
          this.rect(Math.min(prev.cx, cx), kink, Math.abs(cx - prev.cx) + wall, wall, 'ink');
        }
        this.rect(cx, kink, wall, y - kink, 'ink');
      }
      if (visited) prev = { cx, bottom: y + roomH };

      // 지금 있는 층 — 방 안에서 붉은 점이 깜빡인다
      if (f === floor) {
        this.blinkers.push(this.dot(cx - 7, y + Math.floor(roomH / 2) - 7, 14, 'wax'));
      }
    }
  }

  /** 점선 사각형 — 아직 안 가 본 방. 종이 위에 연필로 그어 둔 것처럼 보여야 한다 */
  private dashedBox(x: number, y: number, w: number, h: number): void {
    const dash = 8;
    for (let i = 0; i < w; i += dash * 2) {
      const d = Math.min(dash, w - i);
      this.rect(x + i, y, d, L.line, 'mid');
      this.rect(x + i, y + h - L.line, d, L.line, 'mid');
    }
    for (let j = 0; j < h; j += dash * 2) {
      const d = Math.min(dash, h - j);
      this.rect(x, y + j, L.line, d, 'mid');
      this.rect(x + w - L.line, y + j, L.line, d, 'mid');
    }
  }

  /* ── ④ 무전기 — 진짜 지도는 여기에만 (M06 §5) ────────── */
  private buildRadio(s: Readonly<GameState>): void {
    const v = L.live.radio;
    if (!this.hasArt('ui.live.radio')) this.rect(v.x, v.y, v.w, v.h, 'ink');
    // 지도 위에 툭 던져 둔 물건이라 살짝 기울인다. 회전축은 기기 가운데다
    const radio = this.spriteObject(v.x, v.y, 'ui.live.radio', v.w, v.h);
    radio?.setOrigin(0.5).setPosition(v.x + v.w / 2, v.y + v.h / 2).setAngle(-11);

    const inner = v.w - L.pad * 2;
    const fork = pendingFork(s);
    if (fork === null) {
      // 글자로 「잡음뿐」이라고 쓰지 않는다 — 디더 잡음이 이미 그 말을 하고 있다 (사용자 확정)
      this.dither(v.x + L.pad, v.y + 200, inner, 160, 'mid', 8);
      return;
    }

    // 질문은 여기 안 쓴다 — 3택 바로 위 대사창으로 나간다 (`buildDialogue`, V3 목업).
    // 무전기에 남는 건 **플레이어만 보는 진짜 지도**뿐이다. 그게 이 물건의 용도다.
    //
    // ★ 판을 ink 로 꽉 채운 뒤에 글을 얹는다. 무전기 몸통이 밝은 그림이라
    //   그 위에 dust 글자를 바로 쓰면 읽히지 않는다 (실측 — 지도 우하단으로 옮기고 드러났다).
    //   판은 무전기 **위쪽 지도 위**에 따로 놓는다 — 몸통을 가리지 않는다.
    //   폭 440 은 눈대중이 아니다. `floors.json` 의 가장 긴 갈림길 이름
    //   「안전 · 17F에서 막힘」이 접두사 「A · 」까지 32px 폰트로 400px 이라 그걸 담는 최소값이다
    const plate = { x: v.x - 380, y: v.y - 176, w: 440, h: 152 };
    this.rect(plate.x, plate.y, plate.w, plate.h, 'ink');
    this.frame(plate.x, plate.y, plate.w, plate.h, 'bone');
    this.label(plate.x + 12, plate.y + 10, `${fork.floor}F · 진짜 지도`, 'dust');
    const line = plate.w - 24;
    this.text(plate.x + 12, plate.y + 40, this.clip(`A · ${fork.truth.a.label}`, line), 'bone');
    this.text(plate.x + 12, plate.y + 96, this.clip(`B · ${fork.truth.b.label}`, line), 'bone');
  }

  /* ── ⑤ 1인칭 전투 ──────────────────────────────────── */
  private buildCombat(s: Readonly<GameState>): void {
    const v = L.live.combat;
    this.rect(v.x, v.y, v.w, v.h, 'ink');
    // 갈림길을 묻는 동안에는 문 두 짝 — 「어느 쪽입니까」가 그림으로 보인다
    const backdrop = pendingFork(s) !== null ? 'ui.live.door' : zoneArt(s);
    this.spriteCover(v, [backdrop, 'bg.tower']);
    const run = s.today ?? null;
    if (run === null) {
      this.text(v.x + L.pad, v.y + L.pad, '방송 준비 중', 'dust');
      return;
    }
    const enc = run.encounter;

    const e = L.live.enemy;

    if (enc !== null) {
      // 적 CG — 512x512 원본을 정확히 1/2 로. 소수배로 줄이면 디더가 깨진다
      const img = this.spriteFitObject(e, [enc.enemyKey]);
      if (img === null) this.enemyShape(e.x - 32, e.y - 20, 320, 300, enc.enemyKey);
      // 반격 때 여기서 잡아 둔 원래 자리·크기를 기준으로 튕긴다
      else {
        if (this.enemySpawnAt !== null) img.setAlpha(Math.max(0, Math.min(1, (this.time.now - this.enemySpawnAt) / ENEMY_SPAWN_FADE_MS)));
        this.enemyBounce = { img, x: img.x, y: img.y, w: img.displayWidth, h: img.displayHeight };
      }

      // 체력바는 적 스프라이트 **머리 위**, 폭을 줄여 작게 (사용자 확정 — 발밑에
      // 있던 걸 위로 옮기고 크기도 줄였다). 바 하나만 둔다 — 이름·숫자·판까지
      // 얹었더니 정보창이 됐다. 배경이 밝든 어둡든 읽히도록 바 뒤에 ink 한 줄만 깐다.
      const barW = Math.round(e.w * 0.7);
      const barH = 14;
      const bx = e.x + Math.round((e.w - barW) / 2);
      const hy = e.y - barH - 10;
      this.rect(bx - L.line, hy - L.line, barW + L.line * 2, barH + L.line * 2, 'ink');
      this.bar(bx, hy, barW, enc.enemy.hp, enc.enemy.maxHp, 'wax', barH);
      if (enc.guarding) this.label(bx + barW + 8, hy - 1, '방어', 'wax');
    }

    // 용사의 이름·공·방·체력은 초상 바로 아래에 붙는다 (`buildPortrait`).
    // 여기서 또 그리면 같은 숫자가 화면 두 곳에 있게 된다.
  }

  /* ── ⑥ 공격 / 방어 / 어필 ──────────────────────────── */
  /** 우하단 전경 — 랜턴 든 팔. 던전 위에 겹쳐 「보고 있다」는 거리감을 만든다 */
  private buildLantern(): void {
    const v = L.live.lantern;
    this.sprite(v.x, v.y, 'ui.live.lantern', v.w, v.h);
  }

  /**
   * 방송 오버레이 바 — 진짜 생방송 화면처럼 **ON AIR · 방송 이름 · 시청자 수**를 한 줄에 건다.
   *
   * 예전에는 LIVE 표시만 덩그러니 떠 있고, 층·적 이름은 그 아래 별도 창에 있었다.
   * 그 창은 뺐다 (사용자 확정) — 방송 화면에 「지금 몇 층 · 무슨 적」을 띄우는 방송국은 없다.
   * 적 이름은 적 체력바 옆으로 갔고, 층은 왼쪽 층계 게이지와 HUD 가 이미 말한다.
   *
   * 붉은 마름모만 깜빡인다 (`blinkers`). 액자까지 깜빡이면 방송이 끊긴 것처럼 보인다.
   */
  private buildLiveBar(s: Readonly<GameState>): void {
    const v = L.live.liveBar;
    const b = L.live.badge;
    this.rect(v.x, v.y, v.w, v.h, 'ink');
    this.rect(v.x, v.y + v.h - L.line, v.w, L.line, 'bone');

    if (this.spriteObject(b.x, b.y, 'ui.live.badge', b.w, b.h) === null) {
      this.frame(b.x, b.y, b.w, b.h, 'bone');
      this.text(b.x + 56, b.y + 18, 'ON AIR', 'bone');
    }
    // 배지 세로 중앙. 글자를 중앙에 앉히면서 이 마름모만 아래에 남아 있었다 —
    // b.h 로 계산하니 배지 높이를 또 바꿔도 따라온다
    const dy = Math.round((b.h - 28) / 2);
    const dot = this.spriteObject(b.x + 12, b.y + dy, 'ui.live.blink', 26, 28);
    this.blinkers.push(dot ?? this.dot(b.x + 18, b.y + dy + 6, 16, 'wax'));

    // 방송 제목 — 페르소나 이름과 자기 신고 목표층. 계약서에 적힌 그대로다
    const persona = s.personas.find((p) => p.id === s.today?.personaId);
    const title = `${persona?.displayName ?? '무명 방송'}  ·  ${s.today?.claimedCeiling ?? 0}층 도전`;
    const mid = v.y + Math.round(v.h / 2);
    this.text(b.x + b.w + 32, mid, this.clip(title, 560), 'bone').setOrigin(0, 0.5);

    // 시청자 수 — 빠지는 중이면 ▼ 가 붙는다 (core 의 지체 페널티가 만든 변화)
    const dropping = this.time.now < this.fanDropUntil;
    this.textRight(v.x + v.w - 24, mid,
      `시청자 ${dropping ? '▼ ' : ''}${fmtFans(s.fans)}`, dropping ? 'wax' : 'dust').setOrigin(1, 0.5);
  }

  /**
   * 용사 대사 배너 — **용사가 플레이어에게 말할 때만** 뜬다 (사용자 확정).
   * 목업의 「…사장님, 어떡할까요?」 자리다.
   *
   * 두 경우가 여기로 온다: 갈림길 질문(무전)과 전투 중 한 마디(`Encounter.line`).
   * 둘 다 core 가 문장을 만든다 — 씬은 지어내지 않는다 (HO-005).
   */
  private buildDialogue(s: Readonly<GameState>): void {
    const spoken = this.spokenDialogue(s);
    if (spoken.text === '') return;

    const v = L.live.dialogue;
    if (this.spriteObject(v.x, v.y, 'ui.live.dialogue', v.w, v.h) === null) {
      this.rect(v.x, v.y, v.w, v.h, 'ink');
      this.frame(v.x, v.y, v.w, v.h, 'bone');
    }
    this.stageRadio(spoken);
  }

  /** 대사집의 하강 시작 멘트. 이후 조우/갈림길 대사가 같은 배너를 자연스럽게 교체한다. */
  private stageOpeningDialogue(): void {
    const s = this.store.getState();
    const run = s.today;
    const star = s.stars.find((candidate) => candidate.id === run?.starId);
    if (run === null || star === undefined) return;
    const line = pickDialogue(star.id, 'DUN_START', {
      floor: run.currentFloor,
      revives: totalRevivals(star.id, star.reviveCount),
      mental: run.mental,
      viewers: s.fans,
      deaths: s.stats.totalDiscarded,
      generation: s.personas.find((persona) => persona.id === star.personaId)?.generation,
    }, ((s.day * 13 + run.currentFloor) % 100) / 100);
    if (line !== null) this.stageRadio({ text: line.text, expression: line.expression, effects: line.effects });
  }

  /**
   * 무전 한 줄을 **연출과 함께** 띄운다 (사용자 확정).
   *
   * ★ 여기서 `new Dialogue` 를 매번 만들면 안 된다. 생방송 화면은 채팅이 들어올 때마다
   *   (750ms) 통째로 다시 그려서, 타자 연출이 매번 처음으로 되감긴다 — 줄이 끝까지
   *   나오는 걸 볼 수가 없다. 그래서 **줄이 바뀔 때만** 만들고 `keepAlive` 로 살려 둔다.
   *
   * ★ 빈도도 줄인다. core 는 전투 한 수마다 새 줄을 물리는데 자동 전투가 0.9초 간격이라
   *   연출이 늘 중간에 끊겼다. `RADIO_GAP_MS` 만큼 지나야 다음 줄로 넘어간다.
   */
  private stageRadio(spoken: { text: string; expression: string | null; effects: readonly string[] }): void {
    if (spoken.text === this.radioText) return;                 // 같은 줄 — 하던 걸 계속한다
    const now = this.time.now;
    // **끝까지 나오기 전에는 다음 줄로 넘어가지 않는다** (사용자 확정).
    // 간격만 재던 때는 긴 줄이 아직 타자 중인데 새 줄이 덮어써서 문장이 잘려 보였다
    if (!this.radioDone) return;
    if (this.radioObj !== null && now - this.radioAt < RADIO_GAP_MS) return; // 아직 이르다

    this.clearRadio();
    this.radioText = spoken.text;
    this.radioFace = spoken.expression;
    this.radioAt = now;
    this.radioDone = false;

    const v = L.live.dialogue;

    const start = (): void => {
      // 기다리는 사이에 줄이 바뀌었다 — 잠금은 풀어 준다
      if (this.radioText !== spoken.text) { this.radioDone = true; return; }
      // 배너가 사선으로 잘린 그림이라 글은 가운데 검은 띠 안에만 놓는다.
      // 여백을 **상자 폭의 비율**로 잡는다 — 900 기준의 200/330 을 그대로 두면
      // 상자를 넓혔을 때 글이 사선 부분까지 밀려 나간다
      // 배너 왼쪽 위가 사선으로 잘려 있어서, 첫 줄을 너무 올리거나 왼쪽에 붙이면
      // 밝은 쐐기에 글자 윗부분이 먹힌다 (실측). 안쪽으로 한 칸 더 들여 앉힌다
      const inset = Math.round(v.w * 0.24);
      // 오른쪽을 더 비운다 (0.38 → 0.455). 배너의 검은 띠가 오른쪽으로 갈수록 사선으로
      // 좁아져서, 꽉 채우면 첫 줄 끝과 ▼ 가 띠 밖으로 삐져나왔다 (사용자 확인)
      const usable = v.w - Math.round(v.w * 0.455);
      const line = new Dialogue(this, {
        x: v.x + inset,
        y: v.y + Math.round(v.h / 2) - 6,                       // 사용자 확정 — 10px 내려 앉힌다
        w: usable,
        line: `"${spoken.text}"`,                               // 자르지 않는다 — 넘치면 접힌다
        size: 'body',
        charMs: RADIO_CHAR_MS,
        effects: spoken.effects,
        voice: starVoice(this.store.getState().today?.starId),
        // 입은 `build()` 에서만 붙였다 떼므로, 줄이 끝나는 순간 한 번 다시 그린다.
        // 안 그러면 채팅이 들어올 때까지(최대 750ms) 입이 남아 있다.
        // 같은 이유로 줄이 **시작할 때도** 한 번 다시 그린다 — 초상은 대사보다 먼저 그려져서
        // 시작 프레임에는 아직 `radioDone` 이 true 다. delayedCall(0) 이라 재귀하지 않는다
        onComplete: () => {
          this.radioDone = true;
          this.time.delayedCall(0, () => this.redraw());
        },
      });
      this.radioObj = line;
      this.keepAlive(line);
      this.time.delayedCall(0, () => this.redraw());
    };

    // `pause`·`blackout`·`silent` 는 이제 `Dialogue` 안에 있다 — 세 화면이 같이 쓴다
    start();
  }

  /**
   * 떠 있던 무전 줄을 걷는다.
   * **`radioDone` 을 반드시 되돌린다** — 타자 도중에 걷으면 `onComplete` 가 오지 않아
   * 「끝날 때까지 기다린다」가 영영 안 풀린다 (다음 줄이 하나도 안 뜬다)
   */
  private clearRadio(): void {
    this.radioDone = true;
    if (this.radioObj === null) return;
    this.dropAlive(this.radioObj);
    this.radioObj.destroy();
    this.radioObj = null;
  }


  private spokenDialogue(s: Readonly<GameState>): { text: string; expression: string | null; effects: readonly string[] } {
    const run = s.today;
    const star = s.stars.find((candidate) => candidate.id === run?.starId);
    if (run === null || star === undefined) return { text: '', expression: null, effects: [] };
    const context = {
      floor: run.currentFloor,
      revives: totalRevivals(star.id, star.reviveCount),
      mental: run.mental,
      viewers: s.fans,
      deaths: s.stats.totalDiscarded,
      generation: s.personas.find((persona) => persona.id === star.personaId)?.generation,
    };
    const fork = pendingFork(s);
    if (fork !== null) {
      const line = pickDialogue(star.id, 'DUN_RADIO', context, (fork.floor % 10) / 10);
      return line === null
        ? { text: pick(content.radio.forkAsk, fork.floor), expression: null, effects: [] }
        : { text: line.text, expression: line.expression, effects: line.effects };
    }
    const encounterText = run.encounter?.line ?? '';
    if (encounterText === '') return { text: '', expression: null, effects: [] };
    for (const situation of [
      'DUN_EVENT', 'DUN_HURT', 'DUN_LOW', 'DUN_MENTAL',
      'DUN_BROADCAST_ATTACK_SUCCESS', 'DUN_BROADCAST_ATTACK_FAIL',
      'DUN_BROADCAST_DEFEND_SUCCESS', 'DUN_BROADCAST_DEFEND_FAIL',
      'DUN_BROADCAST_PLEAD_SUCCESS', 'DUN_BROADCAST_PLEAD_FAIL',
    ] as const) {
      const line = dialogueCandidates(star.id, situation, context)
        .find((candidate) => interpolateDialogue(candidate.text, context) === encounterText);
      if (line !== undefined) return { text: encounterText, expression: line.expression, effects: line.effects };
    }
    return { text: encounterText, expression: null, effects: [] };
  }

  /**
   * 3택 — **전투와 무전이 같은 자리를 쓴다** (V3 목업, 사용자 확정).
   *
   * 예전에는 갈림길 3택이 무전기 패널 안 48px 짜리 작은 버튼이었고, 전투 3택은
   * 오른쪽 아래에 따로 있었다. 같은 「지금 무엇을 시킬까」인데 손이 화면 양끝을 오갔다.
   * 이제 둘 다 여기로 온다 — 갈림길이 걸려 있으면 무전 3택이, 아니면 전투 3택이 뜬다.
   */
  private buildChoices(s: Readonly<GameState>): void {
    const v = L.live.choices;
    this.scrimRow(v.x - 16, v.y - 12, v.w + 32, v.h + 24);

    const gap = 16;
    const pad = 8;
    const buttonW = Math.floor((v.w - pad * 2 - gap * 2) / 3);
    const place = (i: number): { x: number; y: number; w: number; h: number } => ({
      x: v.x + pad + i * (buttonW + gap), y: v.y + pad, w: buttonW, h: v.h - pad * 2,
    });

    if (pendingFork(s) !== null) {
      const answers: { label: string; dir: 'A' | 'B' | 'UNKNOWN'; hotkey: string; tip: string }[] = [
        { label: 'A 로 가', dir: 'A', hotkey: '1', tip: 'A 쪽으로 내려보낸다. 더 위험한 길이면 슈퍼챗이 붙는다.' },
        { label: 'B 로 가', dir: 'B', hotkey: '2', tip: 'B 쪽으로 내려보낸다. 더 위험한 길이면 슈퍼챗이 붙는다.' },
        { label: '나도 몰라', dir: 'UNKNOWN', hotkey: '3', tip: '아무 쪽도 일러주지 않는다. 층은 그대로다.' },
      ];
      answers.forEach((a, i) => {
        new Button(this, {
          ...place(i),
          label: a.label, hotkey: a.hotkey, tip: a.tip,
          variant: a.dir === 'UNKNOWN' ? 'ghost' : 'default',
          onClick: () => {
            playSfx(this, 'sfx.radio.fork', 0.5);
            this.store.dispatch({ type: 'RADIO/ANSWER', dir: a.dir });
          },
        });
      });
      return;
    }

    // 체력이 바닥나고 물약이 있으면 **여기서 멈추고 묻는다** (사용자 확정).
    // 자동 전투가 알아서 마셔 버리면 물약을 언제 쓰느냐는 판단이 사라진다
    const potion = this.potionAsk(s);
    if (potion !== null) {
      const item = content.items.find((c) => c.id === potion);
      const healing = item?.healing ?? 0;
      new Button(this, {
        ...place(0), w: buttonW * 2 + gap,
        label: '물약을 쓴다', hotkey: '1',
        tip: `체력을 ${healing} 회복한다. 진열대에 올려 둔 한 병이 사라진다.`,
        onClick: () => {
          playSfx(this, 'sfx.potion', 0.7);
          this.store.dispatch({ type: 'COMBAT/USE_ITEM', itemId: potion });
        },
      });
      new Button(this, {
        ...place(2),
        label: '그냥 싸운다', hotkey: '2', variant: 'ghost',
        tip: '물약을 아낀다. 이번 조우에서는 다시 묻지 않는다.',
        onClick: () => { this.potionDeclined = true; },
      });
      return;
    }

    // 평범한 한 수는 씬이 낸다 (사용자 확정). 버튼 대신 **방금 무엇을 냈는지**를 적는다 —
    // 누를 수 없는 버튼을 세 개 띄워 두면 눌러도 되는 줄 안다
    const fighting = s.phase === 'LIVE' && s.today?.encounter != null;
    const line = !fighting ? '자동 전투 대기'
      : this.lastAuto === null ? '자동 전투 — 살피는 중'
      : `자동 전투 — ${CHOICE_LABEL[this.lastAuto]}`;
    this.label(v.x + pad + 8, v.y + Math.round(v.h / 2) - 10, line, fighting ? 'bone' : 'dust');
  }

  /* ── ⑦ 용사 초상 — 상태에 따라 변한다 (M06 §7) ──────── */
  private buildPortrait(s: Readonly<GameState>): void {
    const v = L.live.portrait;
    const info = L.live.stats;
    const run = s.today ?? null;
    const star = s.stars.find((x) => x.id === run?.starId);
    if (run === null || star === undefined) {
      this.scrimBlock(info.x, info.y, info.w, 80);
      this.text(info.x + L.pad, info.y + 20, '출연자 없음', 'dust');
      return;
    }
    const ratio = run.hero.maxHp <= 0 ? 0 : run.hero.hp / run.hero.maxHp;
    const appealing = run.encounter?.log.at(-1) === 'APPEAL';
    const spoken = this.spokenDialogue(s);
    // 상태 한 줄과 **표정 스프라이트를 같은 사다리에서 뽑는다** (사용자 확정).
    // 글과 그림이 따로 놀면 「평상」이라고 써 놓고 우는 얼굴이 뜬다.
    const mood = appealing ? { text: '카메라를 본다', face: 'smile' }
      : ratio >= 0.7 ? { text: '평상', face: 'neutral' }
      : ratio >= 0.4 ? { text: '땀. 눈썹이 처졌다', face: 'sad' }
      : ratio >= 0.15 ? { text: '피. 숨이 가쁘다', face: 'pain' }
      : { text: '초점이 없다', face: 'empty' };
    if (spoken.expression !== null) mood.face = spoken.expression;

    // 어필 중에는 어필 컷으로 갈아낀다 (M06 §7 "이 게임의 썸네일")
    const art = starArt(star.id);
    const before = this.children.list.length;
    this.rect(v.x, v.y, v.w, v.h, 'ink');
    this.screenBackdrop(v, zoneScreen(s));
    /**
     * 표정 → 어필 컷 → 기본 초상 순으로 **있는 것을 쓴다.**
     *
     * 표정 스프라이트는 752x792 전신이라 초상 판형(384x480)과 다르다.
     * `bust()` 가 판형을 보고 잘라내기를 바꾼다 (`render/bustframe.ts`) —
     * 전신이면 얼굴 상자를 1/2 로, 초상이면 예전처럼 1:1 로.
     *
     * 무전 줄이 떠 있는 동안에는 **그 줄에 붙은 표정**이 이긴다 (사용자 확정).
     * 체력에서 뽑은 표정은 줄이 없을 때의 기본값으로 남는다.
     */
    const keys = [
      ...(this.radioFace === null ? [] : [starExpression(star.id, this.radioFace)]),
      starExpression(star.id, mood.face),
      ...(appealing ? [art.appeal] : []),
      art.portrait,
    ];
    // 입 연출 — 폐지
    // this.bustOrigin = null;
    // const spot = mouthSpot(star.id);
    // this.mouthBottom = spot === null ? null : spot.y + spot.h;
    if (!this.bust(v, keys, star.id)) this.dither(v.x, v.y, v.w, v.h, 'mid', ratio < 0.15 ? 12 : 8);
    // 입 연출 — 폐지. 대사가 나오는 동안에만 입을 얹던 자리
    // if (!this.radioDone) this.buildMouth(v, star.id);
    this.frame(v.x, v.y, v.w, v.h, appealing ? 'wax' : 'bone');

    // 열화 3+ — 균열 오버레이. 위 모든 상태에 겹친다
    if (star.reviveCount >= 3) {
      for (let i = 0; i < 5; i += 1) {
        const y = v.y + 24 + Math.floor(hash2(star.reviveCount, i) * (v.h - 96));
        this.rect(v.x + 8 + i * 12, y, v.w - 32 - i * 24, L.line, 'dust');
      }
    }

    // 상태 한 줄(예: 「땀. 눈썹이 처졌다」)은 초상 안에 그리지 않는다 (사용자 확정).
    // 표정은 `mood.face` 가 이미 그림으로 보여준다 — 글자는 겹쳐 적지 않는다.

    // HP 15% 이하 — 초상만 미세하게 흔들린다
    if (ratio < 0.15 && !this.reduced) {
      for (const obj of this.children.list.slice(before)) {
        const o = obj as Phaser.GameObjects.GameObject & { x: number; y: number };
        if (typeof o.x === 'number') this.shaken.push({ obj: o, x: o.x, y: o.y });
      }
    }

    // 초상 **바로 아래** — **체력바와 멘탈 아이콘뿐**이다 (사용자 확정).
    // 검은 판과 흰 테두리는 걷어냈다. 바도 아이콘도 각자 ink 바탕을 갖고 있어서
    // 랜턴 팔의 밝은 그림 위에서도 그대로 읽힌다 — 판을 한 겹 더 깔 이유가 없다.
    // 상태 한 줄은 초상 안으로 들어갔다 (위 참조).
    const iconSize = 24;
    const barW = info.w - iconSize - 8;
    this.bar(info.x, info.y, barW, run.hero.hp, run.hero.maxHp, 'bone');
    this.mentalIcon(info.x + info.w - iconSize, info.y, run.mental);
  }

  /**
   * 멘탈 아이콘 — 체력바 **오른쪽**에 24x24 한 칸 (사용자 확정).
   *
   * core 가 정한 임계는 `balance.mental.panicThreshold` **하나뿐**이다 (그 아래로
   * 내려가면 대사 톤이 `MENTAL_BREAK` 로 바뀐다 — `dive.combatLineTone`).
   * 가운데 「흔들림」 단계는 그 값의 두 배를 쓰는 **표시용 눈금**이라 규칙이 아니다.
   * 숫자는 balance 에서 읽는다 — 씬에서 지어내지 않는다.
   *
   * 아이콘은 절차적으로 그린다. 멘탈용 아트가 아직 없고, 색만으로도 세 단계가 갈린다
   * (bone → dust → wax 는 이 프로젝트가 쓰는 심각도 순서다).
   */
  private mentalIcon(x: number, y: number, mental: number): void {
    const panic = content.balance.mental.panicThreshold;
    const s = 24;
    const tone = mental <= panic ? 'wax' : mental <= panic * 2 ? 'dust' : 'bone';

    this.rect(x, y, s, s, 'ink');
    this.frame(x, y, s, s, tone);
    if (tone === 'wax') {
      // 평평해진 한 줄 — 더는 버티지 못한다
      this.rect(x + 5, y + 11, s - 10, L.line, 'wax');
      return;
    }
    // 채워진 눈. 흔들리는 동안에는 가운데에서 어긋난다
    const off = tone === 'dust' ? 3 : 0;
    this.rect(x + 7 + off, y + 7 + off, 10, 10, tone);
  }

  /**
   * 층을 클리어하고 내려가는 순간 — **화면이 확대되면서 디더 와이프로 넘어간다** (사용자 확정).
   *
   * 와이프는 `WipeScene` 을 그대로 쓴다 (04-UI-KIT — 씬 전환은 디더 와이프).
   * 페이드를 쓰면 팔레트에 없는 중간 계조가 생긴다. 점이 차오르며 덮는 200ms 와
   * 확대 200ms 를 겹쳐 놔서, 가장 크게 당겨진 순간에 화면이 덮인다.
   */
  private diveTransition(): void {
    if (this.reduced) return;
    this.tweens.add({
      targets: this.cameras.main,
      zoom: DIVE_ZOOM,
      duration: DIVE_ZOOM_MS,
      ease: 'Quad.easeIn',
      yoyo: true,
      onComplete: () => this.cameras.main.setZoom(1),
    });
    const wipe = this.scene.get(SCENES.WIPE) as WipeScene | null;
    // 덮인 순간에 할 일은 없다 — 층은 core 가 이미 넘겼다. 연출만 얹는다
    wipe?.run(() => {});
  }

  /**
   * 명중 순간 — 슬래시 연출을 적 위에 한 번 얹고, 피해 숫자를 띄운다.
   * 프레임 진행은 `update()` 가 매 실제 프레임마다 밀어준다 — `build()` 는
   * 채팅 등 다른 이유로도 자주 다시 불려서, 거기서 프레임을 넘기면 뚝뚝 끊긴다.
   */
  private spawnAttackFx(damage: number): void {
    this.attackFxAt = this.time.now;
    if (this.attackFxImg !== null) {
      this.dropAlive(this.attackFxImg);
      this.attackFxImg.destroy();
      this.attackFxImg = null;
    }
    // 적이 맞은 순간 — 피격음 + 스프라이트 충격 반응 (사용자 요청)
    this.enemyHitAt = this.time.now;
    playSfx(this, 'sfx.combat.monsterHit', 0.6);
    const e = L.live.enemy;
    if (!this.reduced && this.hasArt('ui.live.fx.sword')) {
      const size = Math.round(e.w * 1.3);
      const img = this.add.image(e.x + e.w / 2, e.y + e.h / 2, key('ui.live.fx.sword'), 0)
        .setOrigin(0.5)
        .setDisplaySize(size, size);
      this.keepAlive(img);
      this.attackFxImg = img;
    }
    const toast = this.title(e.x + e.w / 2, e.y - 4, `-${damage}`, 'wax').setOrigin(0.5, 1);
    this.keepAlive(toast);
    this.damageToasts.push({ obj: toast, startAt: this.time.now, baseY: toast.y });
  }

  /** 슬래시 프레임과 피해 숫자를 매 실제 프레임 밀어준다 (`update()` 에서 호출) */
  private stepAttackFx(now: number): void {
    if (this.attackFxAt !== null) {
      const frame = Math.floor((now - this.attackFxAt) / SWORD_FX_FRAME_MS);
      if (frame >= SWORD_FX_FRAMES) {
        if (this.attackFxImg !== null) {
          this.dropAlive(this.attackFxImg);
          this.attackFxImg.destroy();
          this.attackFxImg = null;
        }
        this.attackFxAt = null;
      } else {
        this.attackFxImg?.setFrame(frame);
      }
    }

    if (this.damageToasts.length === 0) return;
    const keep: typeof this.damageToasts = [];
    for (const t of this.damageToasts) {
      const dt = now - t.startAt;
      if (dt >= DAMAGE_TOAST_MS) {
        this.dropAlive(t.obj);
        t.obj.destroy();
        continue;
      }
      const p = dt / DAMAGE_TOAST_MS;
      t.obj.y = t.baseY - DAMAGE_TOAST_RISE * p;
      t.obj.setAlpha(1 - p);
      keep.push(t);
    }
    this.damageToasts = keep;
  }

  /** 방어 순간 — 방패 연출을 용사 초상 위에 한 번 얹는다 (명중과 같은 이유로 build() 맨 끝에서 호출) */
  private spawnDefendFx(): void {
    this.defendFxAt = this.time.now;
    if (this.defendFxImg !== null) {
      this.dropAlive(this.defendFxImg);
      this.defendFxImg.destroy();
      this.defendFxImg = null;
    }
    if (this.reduced || !this.hasArt('ui.live.fx.shield')) return;
    // 초상이 아니라 **몬스터 앞** — 1인칭 시점이라 「내가 든 방패가 몬스터를 막는다」로
    // 읽혀야 한다 (사용자 확정). sword fx 와 같은 자리를 쓴다
    const v = L.live.enemy;
    const size = Math.round(v.w * 1.6);
    const img = this.add.image(v.x + v.w / 2, v.y + v.h / 2, key('ui.live.fx.shield'), 0)
      .setOrigin(0.5)
      .setDisplaySize(size, size);
    this.keepAlive(img);
    this.defendFxImg = img;
  }

  /** 방패 프레임을 매 실제 프레임 밀어준다 (`update()` 에서 호출) */
  private stepDefendFx(now: number): void {
    if (this.defendFxAt === null) return;
    const frame = Math.floor((now - this.defendFxAt) / SHIELD_FX_FRAME_MS);
    if (frame >= SHIELD_FX_FRAMES) {
      if (this.defendFxImg !== null) {
        this.dropAlive(this.defendFxImg);
        this.defendFxImg.destroy();
        this.defendFxImg = null;
      }
      this.defendFxAt = null;
    } else {
      this.defendFxImg?.setFrame(frame);
    }
  }

  /**
   * 반격 순간의 부풀림. **발밑을 고정한 채** 위·좌우로만 커진다 —
   * 가운데를 기준으로 키우면 몬스터가 바닥을 뚫고 내려간다.
   */
  private applyBounce(amount: number): void {
    const b = this.enemyBounce;
    if (b === null) return;
    const w = Math.round(b.w * (1 + amount));
    const h = Math.round(b.h * (1 + amount));
    b.img
      .setDisplaySize(w, h)
      .setPosition(Math.round(b.x - (w - b.w) / 2), Math.round(b.y - (h - b.h)));
  }

  /**
   * 피격 반응 — 매 프레임 `enemyBounce` (`buildCombat` 이 매번 다시 채운다)를 다시 물들이고
   * 튕긴다. 트윈이 아니라 반격 부풀림(`applyBounce`)과 같은 이유 — 채팅이 들어와 750ms 마다
   * 다시 그려도 스프라이트 참조만 갈아 끼워질 뿐 타이머는 살아 있어야 끊기지 않는다.
   * 반격의 `applyBounce` 뒤에 불러 크기는 그쪽에, 색·미세한 흔들림은 이쪽에 맡긴다.
   */
  private stepEnemyHitFx(now: number): void {
    const b = this.enemyBounce;
    if (this.enemyHitAt === null) {
      b?.img.clearTint();
      return;
    }
    if (b === null) return;
    const t = (now - this.enemyHitAt) / ENEMY_HIT_FX_MS;
    if (t >= 1) {
      this.enemyHitAt = null;
      b.img.clearTint();
      return;
    }
    // update() 는 `this.reduced` 면 이 지점까지 오지 않는다 (반격 부풀림과 같은 가드) —
    // 여기서 다시 검사할 필요가 없다.
    b.img.setTint(PALETTE.wax);
    const decay = (1 - t) ** 2;
    b.img.x += Math.round(Math.sin(t * 50) * ENEMY_HIT_SHAKE_PX * decay);
  }

  /** 처치된 적이 그 자리에 남지 않도록, 실루엣 크기의 도트 파편으로 흩어진다. */
  private scatterEnemyDefeat(enemyKey: string): void {
    if (this.reduced) return;
    const e = L.live.enemy;
    const seed = strHash(enemyKey);
    for (let i = 0; i < ENEMY_DEFEAT_FRAGMENTS; i += 1) {
      const angle = hash2(seed, i) * Math.PI * 2;
      const distance = 46 + Math.round(hash2(seed ^ 0x9e3779b9, i) * 110);
      const size = 8 + Math.floor(hash2(seed ^ 0x85ebca6b, i) * 13);
      const x = e.x + e.w / 2 + Math.round((hash2(seed ^ 0x27d4eb2d, i) - 0.5) * e.w * 0.45);
      const y = e.y + e.h / 2 + Math.round((hash2(seed ^ 0x165667b1, i) - 0.5) * e.h * 0.45);
      const fragment = this.add.rectangle(x, y, size, size, i % 3 === 0 ? PALETTE.wax : i % 2 === 0 ? PALETTE.bone : PALETTE.mid).setOrigin(0.5);
      this.keepAlive(fragment);
      this.tweens.add({
        targets: fragment,
        x: x + Math.round(Math.cos(angle) * distance),
        y: y + Math.round(Math.sin(angle) * distance),
        alpha: 0,
        angle: Math.round((hash2(seed ^ 0xc2b2ae35, i) - 0.5) * 180),
        duration: ENEMY_DEFEAT_SCATTER_MS,
        ease: 'Quad.easeOut',
        onComplete: () => {
          this.dropAlive(fragment);
          fragment.destroy();
        },
      });
    }
  }

  /**
   * 용사 흉상 **뒤에 깔리는 방송화면 액자** (사용자 확정).
   *
   * 받은 `방송화면-*` 은 462x452 인데 초상 칸은 256x248 이다. 덮어 맞추면 0.554배 —
   * 소수배 축소라 디더가 모아레를 낸다. 그래서 **1:1 로 놓고 칸만큼 잘라낸다** (`bust` 와 같은 수법).
   * 액자의 둥근 테두리는 잘려 나가는데 그게 맞다 — 초상 칸에는 이미 `frame()` 이 있어서
   * 두 겹으로 두르면 액자 안의 액자가 된다. 남는 건 복도 그림뿐이다.
   */
  private screenBackdrop(v: { x: number; y: number; w: number; h: number }, key: string): void {
    const img = this.spriteObject(v.x, v.y, key);
    if (img === null) return;
    const src = img.texture.getSourceImage() as { width: number; height: number };

    const cw = Math.min(src.width, v.w);
    const ch = Math.min(src.height, v.h);
    const cx = Math.round((src.width - cw) / 2);
    const cy = Math.round((src.height - ch) / 2);
    img.setPosition(v.x - cx, v.y - cy).setCrop(cx, cy, cw, ch);
  }

  /**
   * 초상을 흉상으로 잘라 칸에 넣는다 (사용자 확정 — 씬에서 crop).
   *
   * 원본 384x480 을 **1:1 로** 놓고 세로만 자른다. 줄이면 0.8배 같은 소수배가 되어
   * 도트가 지글거린다. 머리 위 여백 24px 을 버리고 가슴까지 `v.h` 만큼만 보인다.
   * 전투 중 표정이 바뀌어도 같은 crop 이 그대로 적용된다.
   */
  private bust(v: { x: number; y: number; w: number; h: number }, keys: string[], starId = ''): boolean {
    const img = keys.reduce<Phaser.GameObjects.Image | null>(
      (hit, k) => hit ?? this.spriteObject(v.x, v.y, k), null,
    );
    if (img === null) return false;
    const src = img.texture.getSourceImage() as { width: number; height: number };

    // 전신 표정 스프라이트(752x792)면 **얼굴 상자를 뽑아 정확히 1/2 로** 줄인다.
    // 초상 판형(384x480)이면 아래 예전 방식(1:1 잘라내기)으로 내려간다
    const face = bustFrame(starId, src.width, src.height);
    if (face !== null) {
      const scale = v.w / face.w;                     // 256 / 512 = 0.5
      img.setScale(scale)
        .setPosition(Math.round(v.x - face.x * scale), Math.round(v.y - face.y * scale))
        .setCrop(face.x, face.y, face.w, face.h);
      return true;
    }

    const cw = Math.min(src.width, v.w);
    const ch = Math.min(src.height, v.h);
    const cx = Math.round((src.width - cw) / 2);
    // 머리 위 여백 24px 을 버린다.
    // 입 연출을 쓰던 동안에는 입이 창 밖으로 안 나가게 창을 더 내렸다 (karin 기준 51).
    // 폐지하면서 원래 값으로 되돌린다 — 되살리려면 아래 두 줄을 바꿔 끼우면 된다
    // const need = this.mouthBottom === null ? 0 : this.mouthBottom + 8 - ch;
    // const cy = Math.max(0, Math.min(Math.max(24, need), src.height - ch));
    const cy = Math.min(24, Math.max(0, src.height - ch));
    img.setPosition(v.x - cx, v.y - cy).setCrop(cx, cy, cw, ch);
    // 입을 얹을 때 쓰던 변환 — 스프라이트 좌표 (sx, sy) 는 화면 (v.x - cx + sx, v.y - cy + sy)
    // this.bustOrigin = { x: v.x - cx, y: v.y - cy, cx, cy, cw, ch };
    return true;
  }

  /* ── 입 연출 (폐지) — 되살리려면 아래를 통째로 푼다 ──────── */
  // /**
  // * 말하는 동안 얼굴에 얹는 입 (사용자 확정).
  // *
  // * 흉상은 표정 스프라이트를 **1:1 로 놓고 잘라** 쓰므로, 입도 같은 1:1 좌표에
  // * 그대로 얹으면 맞는다 (`render/mouth.ts` 의 표가 그 좌표계다).
  // * 흉상 창 밖으로 나가는 부분은 잘라 낸다 — 안 그러면 초상 틀 밖에 입이 떠 있다.
  // */
  // private buildMouth(v: { x: number; y: number; w: number; h: number }, starId: string): void {
  // const o = this.bustOrigin;
  // const spot = mouthSpot(starId);
  // if (o === null || spot === null) return;
  // const img = this.spriteObject(o.x + spot.x, o.y + spot.y, mouthKey(starId));
  // if (img === null) return;
  //
  // // 흉상이 보이는 창(= v 상자)과 겹치는 부분만 남긴다
  // const left = Math.max(0, v.x - (o.x + spot.x));
  // const top = Math.max(0, v.y - (o.y + spot.y));
  // const right = Math.max(0, (o.x + spot.x + spot.w) - (v.x + v.w));
  // const bottom = Math.max(0, (o.y + spot.y + spot.h) - (v.y + v.h));
  // const cw = spot.w - left - right;
  // const chh = spot.h - top - bottom;
  // if (cw <= 0 || chh <= 0) {
  // img.destroy();
  // return;
  // }
  // img.setPosition(o.x + spot.x, o.y + spot.y).setCrop(left, top, cw, chh);
  // }
  //

  /* ── ⑧ 채팅 ────────────────────────────────────────── */
  private buildChat(s: Readonly<GameState>): void {
    const v = L.live.chat;
    if (this.hasArt('ui.live.chat')) {
      // **9-slice 다.** 통짜 이미지로 늘리면 상단 타이틀 바(원본 42px)까지 같이 늘어나
      // 창을 키울수록 머리가 두꺼워진다. 위아래 테두리는 두께를 지키고 가운데만 늘린다
      const [left, right, top, bottom] = slice('ui.live.chat');
      this.add
        .nineslice(v.x, v.y, key('ui.live.chat'), undefined, v.w, v.h, left, right, top, bottom)
        .setOrigin(0, 0);
    } else {
      this.rect(v.x, v.y, v.w, v.h, 'ink');
      this.label(v.x + L.pad, v.y + 16, '채팅', 'dust');
    }

    // 28F 를 지나면 3초간 완전히 조용해진다. 침묵이 가장 강한 연출이다 (M06 §9)
    if (this.time.now < this.chatSilentUntil) {
      this.chat.hideAll();
      this.text(v.x + L.pad, v.y + 88, '· · ·', 'dust');
      return;
    }
    const queue = s.today?.chatQueue ?? [];
    this.chat.render(queue);
    if (queue.filter((m) => !m.removed).length === 0) {
      this.text(v.x + L.pad, v.y + 88, '채팅이 조용하다', 'dust');
    }
    this.flySuperchats(queue);
  }

  /**
   * M07 §슈퍼챗 연출 — 금액이 날아가 흡수된다.
   *
   * 명세는 「HUD GOLD 로」인데 **생방송 중에는 HUD 가 이 화면에 덮여 보이지 않는다**
   * (M06 §2 의 5분할이 화면 전체를 쓴다). 그래서 초상 칸의 누적 슈퍼챗 표시로 날린다 —
   * 지금 이 방송이 얼마를 벌었는지가 거기 적혀 있다.
   */
  private flySuperchats(queue: readonly ChatMessage[]): void {
    for (const msg of queue) {
      if (msg.tone !== 'SUPERCHAT' || msg.amount === undefined) continue;
      if (this.flownSuperchats.has(msg.id)) continue;
      this.flownSuperchats.add(msg.id);

      playSfx(this, 'sfx.superchat', 0.5);
      this.superchatPopup(msg);
      const from = { x: L.live.chat.x + L.pad, y: L.live.chat.y + L.live.chat.h - 60 };
      // 초상 아래 한 줄(체력바·멘탈)로 빨려 든다. 예전엔 +216 이었는데 그건 정보 칸이
      // 200 높이였을 때의 값이라, 칸이 24 로 줄면서 화면 밖 엉뚱한 자리를 가리키고 있었다
      const to = { x: L.live.stats.x, y: L.live.stats.y };
      const label = this.text(from.x, from.y, `+${msg.amount} G`, 'wax');
      // 날아가는 동안 화면이 다시 그려지면 파괴된다. 도착할 때까지 살려 둔다
      this.keepAlive(label);
      this.tweens.add({
        targets: label,
        x: to.x,
        y: to.y,
        alpha: { from: 1, to: 0.2 },
        duration: 700,
        ease: 'Cubic.easeIn',
        onComplete: () => {
          this.dropAlive(label);
          label.destroy();
        },
      });
    }
  }

  /**
   * 슈퍼챗이 터진 순간 채팅창 오른쪽에 판이 **잠깐 떴다 사라진다** (사용자 확정).
   *
   * 페이드는 짧게 — 들어오는 데 140ms, 머무는 700ms, 나가는 260ms. 길게 끌면
   * 슈퍼챗이 연달아 터질 때 판이 겹쳐 쌓인다.
   * 판과 글자는 `keepAlive` 로 살려 둔다. 채팅이 들어올 때마다(750ms) 화면을
   * 다시 그리므로 그냥 두면 뜨자마자 파괴된다.
   */
  private superchatPopup(msg: ChatMessage): void {
    const v = L.live.superchat;
    this.superchatBurst(v, msg.id);
    const plate = this.spriteObject(v.x, v.y, 'ui.live.superchat', v.w, v.h);
    const backing = plate === null ? this.rectObject(v.x, v.y, v.w, v.h, 'ink') : null;
    const border = plate === null ? this.frameObject(v.x, v.y, v.w, v.h, 'bone') : null;
    // `ui.live.superchat` 아트는 위쪽 테두리가 두꺼워 **검은 안쪽 칸이 판 한가운데보다 아래**다.
    // 판 높이의 절반에 맞추면 글자가 안쪽 칸 위 모서리에 걸터앉는다 (실측 → 40)
    const textCy = plate === null ? Math.round(v.h / 2) : SUPERCHAT_TEXT_CY;
    const line = this.label(
      v.x + 16, v.y + textCy,
      this.clip(`${msg.nick}  +${msg.amount} G`, v.w - 32, 'label'),
      'wax',
    ).setOrigin(0, 0.5);

    const parts: (Phaser.GameObjects.Graphics | Phaser.GameObjects.Text | Phaser.GameObjects.Image)[] = [];
    if (plate !== null) parts.push(plate);
    if (backing !== null) parts.push(backing);
    if (border !== null) parts.push(border);
    parts.push(line);
    for (const o of parts) o.setAlpha(0);
    this.keepAlive(...parts);

    this.tweens.add({
      targets: parts,
      alpha: 1,
      duration: 120,
      ease: 'Quad.easeOut',
      hold: 420,
      yoyo: true,
      onComplete: () => {
        for (const o of parts) {
          this.dropAlive(o);
          o.destroy();
        }
      },
    });
  }

  /** 슈퍼챗이 뜨는 순간, 팝업 중심에서 금빛 도트가 짧게 터진다. */
  private superchatBurst(v: { x: number; y: number; w: number; h: number }, messageId: string): void {
    if (this.reduced) return;
    const seed = strHash(messageId);
    const cx = v.x + Math.round(v.w / 2);
    const cy = v.y + Math.round(v.h / 2);
    for (let i = 0; i < 16; i += 1) {
      const angle = hash2(seed, i) * Math.PI * 2;
      const distance = 28 + Math.round(hash2(seed ^ 0x9e3779b9, i) * 68);
      const size = 5 + Math.floor(hash2(seed ^ 0x85ebca6b, i) * 8);
      const particle = this.add.rectangle(cx, cy, size, size, i % 3 === 0 ? PALETTE.bone : PALETTE.wax).setOrigin(0.5);
      this.keepAlive(particle);
      this.tweens.add({
        targets: particle,
        x: cx + Math.round(Math.cos(angle) * distance),
        y: cy + Math.round(Math.sin(angle) * distance),
        alpha: { from: 1, to: 0 },
        angle: (hash2(seed ^ 0x27d4eb2d, i) - 0.5) * 280,
        duration: 380,
        ease: 'Quad.easeOut',
        onComplete: () => {
          this.dropAlive(particle);
          particle.destroy();
        },
      });
    }
  }

  /** `rect` 와 같지만 알파를 만질 수 있게 오브젝트를 돌려준다 */
  private rectObject(x: number, y: number, w: number, h: number, color: 'ink' | 'bone'): Phaser.GameObjects.Graphics {
    const g = this.add.graphics();
    g.fillStyle(PALETTE[color], 1);
    g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    return g;
  }

  /** `frame` 과 같지만 오브젝트를 돌려준다 */
  private frameObject(x: number, y: number, w: number, h: number, color: 'ink' | 'bone'): Phaser.GameObjects.Graphics {
    const g = this.add.graphics();
    g.fillStyle(PALETTE[color], 1);
    const t = L.line;
    g.fillRect(x, y, w, t);
    g.fillRect(x, y + h - t, w, t);
    g.fillRect(x, y, t, h);
    g.fillRect(x + w - t, y, t, h);
    return g;
  }

  /**
   * M11 §2 — 34F 문지기 컷신.
   * **선택지가 「무전을 끈다」 하나뿐이다.** 플레이어에게 다른 길을 주지 않는다.
   */
  private buildGatekeeper(): void {
    const cut = gatekeeperText();
    const cx = Math.round(L.W / 2);

    // 문지기 1컷 — 적 아트를 그대로 쓴다. 지금 눈앞에 있는 그 문지기다
    const art = { x: cx - 192, y: 120, w: 384, h: 384 };
    if (!this.spriteFit(art, ['enemy.gatekeeper'])) this.enemyShape(art.x + 32, art.y, 320, 320, 'enemy.gatekeeper');
    this.frame(art.x, art.y, art.w, art.h, 'dust');

    let y = 560;
    this.text(cx - 420, y, this.clip(cut.narration, 840), 'dust');
    y += 80;
    this.title(cx - 420, y, this.clip(`"${cut.line}"`, 840, 'title'), 'bone');
    y += 100;
    this.rect(cx - 420, y, 840, L.line, 'mid');
    y += 40;
    this.text(cx - 420, y, this.clip(`무전  "${cut.radio}"`, 840), 'wax');

    new Button(this, {
      x: cx - 264, y: L.H - 160, w: 528, h: 88,
      label: cut.choice, hotkey: '1', variant: 'danger',
      onClick: () => {
        this.gatekeeperOpen = false;
        this.redraw();
      },
    });
  }

  /* ── 목격 이벤트 — 하강이 멈추고 유언이 뜬다 (M06 §9) ── */
  private buildWitness(floor: number): void {
    this.rect(0, 400, L.W, 200, 'ink');
    this.rect(0, 400, L.W, L.line, 'bone');
    this.rect(0, 600 - L.line, L.W, L.line, 'bone');
    this.label(L.pad, 424, `${floor}F`, 'dust');
    const index = witnessFloors().indexOf(floor);
    this.title(L.pad, 472, this.clip(content.radio.witness?.[index] ?? '', L.W - L.pad * 2, 'title'), 'bone');
  }

  /** M06 §8 — 지지직. 팔레트 3색(ink·dust·bone) 만 쓴다. 셰이더 없음 */
  private drawNoise(elapsed: number): void {
    const g = this.noiseLayer;
    if (g === null) return;
    g.clear();
    if (this.reduced || elapsed < DEATH_HITSTOP) return;

    // t=1.20 화면 암전, 낮은 험만 남는다
    if (elapsed >= DEATH_NOISE_END) {
      g.fillStyle(PALETTE.ink, 1);
      g.fillRect(0, 0, L.W, L.H);
      return;
    }

    const full = elapsed >= DEATH_SCANLINE;
    const frame = Math.floor(elapsed / 33);
    const rows = full ? 60 : 8;
    for (let i = 0; i < rows; i += 1) {
      const y = Math.floor(hash2(frame, i) * (L.H - 16));
      const h = 4 + Math.floor(hash2(frame ^ 0x9e3779b9, i) * 14);
      const tear = Math.round((hash2(frame, i * 7) - 0.5) * (full ? 240 : 40));
      g.fillStyle(i % 3 === 0 ? PALETTE.bone : PALETTE.dust, full ? 1 : 0.6);
      g.fillRect(tear, y, L.W, h);
    }
    if (full) {
      g.fillStyle(PALETTE.ink, 1);
      for (let y = 0; y < L.H; y += 8) g.fillRect(0, y, L.W, 4);
    }
  }

  /* ── 작은 그리기 도구 ─────────────────────────────── */

  /** 정사각 점 하나 — 깜빡임 대상으로 쓰려고 오브젝트를 돌려준다 */
  private dot(x: number, y: number, size: number, color: 'wax' | 'bone'): Phaser.GameObjects.Rectangle {
    return this.add
      .rectangle(Math.round(x), Math.round(y), size, size, PALETTE[color])
      .setOrigin(0, 0);
  }

  /** 적 실루엣 — 키에서 뽑은 해시로 블록을 쌓는다. 본 아트가 오면 sprite 로 갈아끼운다 */
  private enemyShape(x: number, y: number, w: number, h: number, enemyKey: string): void {
    const seed = strHash(enemyKey);
    const cols = 8;
    const rows = 10;
    const cw = Math.floor(w / cols);
    const ch = Math.floor(h / rows);
    for (let r = 0; r < rows; r += 1) {
      const spread = 1 + Math.floor(hash2(seed, r) * (cols / 2));
      for (let c = 0; c < cols; c += 1) {
        if (Math.abs(c - (cols - 1) / 2) > spread) continue;
        this.dither(x + c * cw, y + r * ch, cw, ch, hash2(seed, r * 31 + c) > 0.35 ? 'bone' : 'mid', 4);
      }
    }
  }

  /** 값 게이지 — 2px 테두리 안을 채운다 */
  private bar(x: number, y: number, w: number, value: number, max: number, color: 'wax' | 'bone', h = 24): void {
    this.rect(x, y, w, h, 'ink');
    this.frame(x, y, w, h);
    const ratio = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max));
    this.rect(x + L.line, y + L.line, Math.round((w - L.line * 2) * ratio), h - L.line * 2, color);
  }
}

/* ── 순수 함수 — 규칙이 아니라 표시 계산이다 ──────────── */

/**
 * 아직 대답하지 않은 갈림길.
 * core 는 갈림길을 만들 때 `waitingSince` 를 세우고 답을 받으면 지운다 — 그게 유일한 신호다.
 * 전투도 같은 필드를 쓰므로 encounter 가 없을 때만 무전으로 본다 (M06 §5 "교대로 발생한다").
 */
function pendingFork(s: Readonly<GameState>): ForkRecord | null {
  const run = s.today;
  const last = run?.forks.at(-1);
  if (run === null || run === undefined || last === undefined) return null;
  if (s.waitingSince === null || run.encounter !== null) return null;
  return last.floor === run.currentFloor ? last : null;
}

function windowTop(floor: number): number {
  return Math.max(1, floor - WINDOW_LEAD);
}

function witnessFloors(): number[] {
  return Object.keys(content.balance.opinion.leakPerWitnessRevive).map(Number).sort((a, b) => a - b);
}

function deepestWitnessFloor(): number {
  return witnessFloors().at(-1) ?? 0;
}

/** 층마다 고정된 대사를 고른다 — RNG 는 core 것이다. 여기서 뽑으면 재현이 깨진다 */
function pick(lines: readonly string[] | undefined, n: number): string {
  if (lines === undefined || lines.length === 0) return '';
  return lines[Math.abs(n) % lines.length] ?? '';
}

function strHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 결정적 0..1 — 같은 (a,b) 면 언제 그려도 같은 모양이 나온다 */
function hash2(a: number, b: number): number {
  let x = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x2545f491) >>> 0;
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
}

/** narrative.ko.json 의 문장을 그대로 읽는다. 씬이 대사를 짓지 않는다 */
function gatekeeperText(): { narration: string; line: string; radio: string; choice: string } {
  const raw = (content.narrative as { gatekeeper34?: Record<string, unknown> }).gatekeeper34 ?? {};
  const pick = (k: string, fallback: string): string => (typeof raw[k] === 'string' ? (raw[k] as string) : fallback);
  return {
    narration: pick('narration', ''),
    line: pick('line', ''),
    radio: pick('radio', ''),
    choice: pick('choice', '무전을 끈다'),
  };
}

/** 표시는 84.2K 형태 (02-DATA-SCHEMA §1) */
function fmtFans(n: number): string {
  return n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n);
}
