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

function bounceAmount(t: number): number {
  const k = t < 0.25 ? t / 0.25 : (1 - (t - 0.25) / 0.75) ** 2;
  return COUNTER_BOUNCE * k;
}

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
const AUTO_TURN_MS = 900;
/** 체력이 이 아래로 내려가면 방어로 돌린다 */
const AUTO_DEFEND_RATIO = 0.4;
/** 이 위로 여유가 있으면 조우 첫 수는 어필로 번다 */
const AUTO_APPEAL_RATIO = 0.7;
/** 이 아래로 떨어지고 물약이 있으면 **플레이어에게 묻는다** */
const POTION_ASK_RATIO = 0.35;

function autoChoice(hero: { hp: number; maxHp: number }, turn: number): CombatChoice {
  const ratio = hero.maxHp <= 0 ? 0 : hero.hp / hero.maxHp;
  if (ratio < AUTO_DEFEND_RATIO) return 'DEFEND';
  if (turn === 0 && ratio >= AUTO_APPEAL_RATIO) return 'APPEAL';
  return 'ATTACK';
}

const CHOICE_LABEL: Record<CombatChoice, string> = {
  ATTACK: '공격한다',
  DEFEND: '방어한다',
  APPEAL: '어필한다',
};

/** 층을 하나 클리어하고 내려갈 때 화면이 이만큼 확대됐다가 돌아온다 */
const DIVE_ZOOM = 1.08;
const DIVE_ZOOM_MS = 200;

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

  /** 자동 전투 — 다음 한 수를 낼 시각. 방금 낸 수는 3택 자리에 적어 준다 */
  private autoAt = 0;
  private lastAuto: CombatChoice | null = null;
  /** 이번 조우에서 물약을 「그냥 싸운다」로 넘겼는가 — 넘겼으면 다시 묻지 않는다 */
  private potionDeclined = false;
  /** 조우가 끝나는 순간을 잡기 위한 직전 상태 */
  private wasFighting = false;

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
    this.lastHeroHp = -1;
    this.enemyBounce = null;
    this.autoAt = 0;
    this.lastAuto = null;
    this.potionDeclined = false;
    this.wasFighting = false;
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

  /**
   * 전투 중이든 갈림길 대기 중이든 틱은 계속 보낸다 — core 의 `tickLive` 가
   * 그 경우 하강 대신 지체 페널티만 계산한다. 목격 연출 동안만 화면이 멈춘다.
   */
  private step(): void {
    if (this.store.getState().phase !== 'LIVE') return;
    if (this.time.now < this.witnessUntil) return;
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

    const choice = autoChoice(run.hero, enc.turn);
    this.lastAuto = choice;
    this.autoAt = now + AUTO_TURN_MS;
    this.store.dispatch({ type: 'COMBAT/CHOOSE', choice });
  }

  override update(): void {
    super.update();
    const now = this.time.now;
    this.autoTurn(now);

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
      if (!this.reduced) this.cameras.main.shake(COUNTER_SHAKE_MS, COUNTER_SHAKE);
    }
    this.lastHeroHp = hp;

    // 조우가 끝나는 순간 = **층을 클리어하고 내려간다**. 층은 틱마다 바뀌므로
    // `currentFloor` 로 잡으면 0.35초마다 연출이 터진다 — 조우의 끝으로 잡아야 한 번이다
    const fighting = s.today?.encounter != null;
    if (this.wasFighting && !fighting && s.phase === 'LIVE' && hp > 0) this.diveTransition();
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

  /* ── ② 좌측 층수 게이지 — 아래로 깊어진다 (M06 §6) ──── */
  private buildFloors(s: Readonly<GameState>): void {
    const v = L.live.floors;
    this.rect(v.x, v.y, v.w, v.h, 'ink');
    this.sprite(v.x, v.y, 'ui.live.floors', v.w, v.h);

    const floor = s.today?.currentFloor ?? 0;
    const top = windowTop(floor);
    const rowH = Math.floor((v.h - 8) / WINDOW_ROWS);

    for (let i = 0; i < WINDOW_ROWS; i += 1) {
      const f = top + i;
      const y = v.y + 4 + i * rowH;
      const here = f === floor;
      if (here) this.rect(v.x + 2, y, v.w - 4, rowH, 'mid');
      this.text(v.x + 20, y + Math.floor((rowH - 36) / 2), String(f).padStart(2, '0'), here ? 'wax' : 'dust');

      // 최고 기록 눈금 — 넘어서는 순간 눈금이 부서진다
      if (f !== s.maxFloor) continue;
      if (floor > s.maxFloor) {
        this.rect(v.x + 8, y + rowH - 2, 28, L.line, 'bone');
        this.rect(v.x + v.w - 36, y + rowH - 2, 28, L.line, 'bone');
      } else {
        this.rect(v.x + 8, y + rowH - 2, v.w - 16, L.line, 'bone');
      }
    }
  }

  /* ── ③ 던전 지도 — 프로시저럴. 갈림길 정답은 그리지 않는다 ─ */
  private buildMap(s: Readonly<GameState>): void {
    const v = L.live.map;
    // 종이 아트가 오면 판을 깔지 않는다 — 찢어진 가장자리가 사각형에 갇힌다
    if (!this.hasArt('ui.live.map')) this.rect(v.x, v.y, v.w, v.h, 'ink');
    this.sprite(v.x, v.y, 'ui.live.map', v.w, v.h);
    this.label(v.x + 56, v.y + 56, '단면도', 'ink');

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
      else this.enemyBounce = { img, x: img.x, y: img.y, w: img.displayWidth, h: img.displayHeight };

      // 체력바는 적 스프라이트 **바로 아래**. 바 하나만 둔다 (사용자 확정) —
      // 이름·숫자·판까지 얹었더니 몬스터 발밑이 정보창이 됐다.
      // 배경이 밝든 어둡든 읽히도록 바 뒤에 ink 한 줄만 깔아 준다.
      const hy = e.y + e.h + 6;
      this.rect(e.x - L.line, hy - L.line, e.w + L.line * 2, 20, 'ink');
      this.bar(e.x, hy, e.w, enc.enemy.hp, enc.enemy.maxHp, 'wax');
      if (enc.guarding) this.textRight(e.x + e.w, hy + 26, '방어', 'wax');
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
      const usable = v.w - Math.round(v.w * 0.38);
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
    for (const situation of ['DUN_EVENT', 'DUN_HURT', 'DUN_LOW', 'DUN_MENTAL'] as const) {
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
          onClick: () => this.store.dispatch({ type: 'RADIO/ANSWER', dir: a.dir }),
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
        onClick: () => this.store.dispatch({ type: 'COMBAT/USE_ITEM', itemId: potion }),
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

    // 상태 한 줄은 **초상 안 우측 아래**에 작게 앉는다 (사용자 확정).
    // 그림 위에 바로 쓰면 머리카락에 묻히므로 글자 크기를 재서 ink 판을 깔고 그 위에 올린다.
    // 판을 먼저 그릴 수가 없다 — 폭을 알려면 글자가 먼저 있어야 해서, 만들고 재고 되올린다
    // 16px 라벨이므로 `clip` 에 'label' 을 준다 — 기본값(body, 32px)으로 재면
    // 폭을 두 배로 잡아 「땀. 눈썹이 ·」처럼 멀쩡한 글이 잘린다 (실측)
    const tag = this.label(0, 0, this.clip(mood.text, v.w - 24, 'label'), appealing ? 'wax' : 'dust');
    const tw = Math.ceil(tag.width);
    const th = Math.ceil(tag.height);
    const tx = v.x + v.w - 8 - tw;
    const ty = v.y + v.h - 8 - th;
    this.rect(tx - 6, ty - 4, tw + 12, th + 8, 'ink');
    tag.setPosition(tx, ty);
    this.children.bringToTop(tag);

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
    if (this.reduced) return;
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
    const plate = this.spriteObject(v.x, v.y, 'ui.live.superchat', v.w, v.h);
    const backing = plate === null ? this.rectObject(v.x, v.y, v.w, v.h, 'ink') : null;
    const border = plate === null ? this.frameObject(v.x, v.y, v.w, v.h, 'bone') : null;
    const line = this.label(
      v.x + 16, v.y + Math.round(v.h / 2) - 10,
      this.clip(`${msg.nick}  +${msg.amount} G`, v.w - 32, 'label'),
      'wax',
    );

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
      duration: 140,
      ease: 'Quad.easeOut',
      hold: 700,
      yoyo: true,
      onComplete: () => {
        for (const o of parts) {
          this.dropAlive(o);
          o.destroy();
        }
      },
    });
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
  private bar(x: number, y: number, w: number, value: number, max: number, color: 'wax' | 'bone'): void {
    this.rect(x, y, w, 24, 'ink');
    this.frame(x, y, w, 24);
    const ratio = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max));
    this.rect(x + L.line, y + L.line, Math.round((w - L.line * 2) * ratio), 24 - L.line * 2, color);
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
