import Phaser from 'phaser';
import { SCENES } from '../../config';
import { content } from '../../core/content';
import { PALETTE } from '../../render/palette';
import { starArt, key, slice } from '../../render/assets';
import { L } from '../../ui/layout';
import { Button } from '../../ui/Button';
import { Ticker } from '../../ui/Ticker';
import { onboard } from '../../ui/Onboarding';
import { playBgm, playSfx } from '../../audio/Sfx';
import { reducedMotion, speedMul } from '../../ui/options';
import { PhaseScene } from './PhaseScene';
import type { ChatMessage, CombatChoice, ForkRecord, GameState } from '../../core/types';

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

/** 층 게이지와 지도가 함께 보여주는 층 창(窓). 현재 층이 위에서 다섯 번째에 온다 */
const WINDOW_ROWS = 14;
const WINDOW_LEAD = 4;

/** M06 §8 사망 타임라인 (ms) */
const DEATH_HITSTOP = 150;
const DEATH_SCANLINE = 350;
const DEATH_NOISE_END = 1200;
/** DayScene 이 ④ 사망 단계로 넘어가는 것을 이만큼 늦춰 준다 */
export const DEATH_CURTAIN_MS = 1800;

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
    this.fanDropUntil = 0;

    this.chat = new Ticker(this, { x: L.live.chat.x + L.pad, y: L.live.chat.y + 58, w: L.live.chat.w - L.pad * 2, h: L.live.chat.h - 80 },
      (id) => this.store.dispatch({ type: 'CHAT/DELETE', id }));
    this.keepAlive(...this.chat.objects());

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

  override update(): void {
    super.update();
    const now = this.time.now;

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

    // 5분할이 화면을 꽉 채워 빈 띠가 없다. 온보딩은 방송 정보 바에 태운다 (04-UI-KIT §7)
    if (s.today !== null) {
      const asking = pendingFork(s) !== null;
      if (asking || s.today.encounter !== null) {
        // 위쪽은 HUD 와 방송 바가 다 쓴다. 지도 아래 책상 빈 띠에 태운다
        onboard(this, s.day, asking ? 'LIVE_RADIO' : 'LIVE_COMBAT', { x: 160, y: 1000, w: 560 });
      }
    }

    if (this.witnessFloor !== null) this.buildWitness(this.witnessFloor);
    if (this.deathAt !== null) {
      // 방송이 끊기는 순간 — 던전 칸 위에 잡음을 덮는다. 절차적 주사선은 그 위에 겹친다
      const c = L.live.combat;
      this.noiseArt = this.spriteObject(c.x, c.y, 'ui.live.noise', c.w, c.h);
      this.noiseLayer = this.add.graphics();
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

    this.label(v.x + L.pad, v.y + 52, `${fork.floor}F`, 'dust');
    // 용사의 질문은 두 줄까지 흘린다 — 한 줄로 자르면 문장이 끊긴다
    wrapBody(`"${pick(content.radio.forkAsk, fork.floor)}"`, inner, 2)
      .forEach((line, i) => this.text(v.x + L.pad, v.y + 80 + i * 36, line, 'bone'));

    // 당신의 서랍 — 플레이어만 보는 진짜 정보
    this.frame(v.x + L.pad, v.y + 156, inner, 116, 'bone');
    this.label(v.x + L.pad + 12, v.y + 164, '진짜 지도', 'dust');
    this.text(v.x + L.pad + 12, v.y + 186, this.clip(`A · ${fork.truth.a.label}`, inner - 24), 'dust');
    this.text(v.x + L.pad + 12, v.y + 226, this.clip(`B · ${fork.truth.b.label}`, inner - 24), 'dust');

    const answers: { label: string; dir: 'A' | 'B' | 'UNKNOWN'; hotkey: string }[] = [
      { label: 'A 로 가', dir: 'A', hotkey: '1' },
      { label: 'B 로 가', dir: 'B', hotkey: '2' },
      { label: '나도 몰라', dir: 'UNKNOWN', hotkey: '3' },
    ];
    const answerGap = 8;
    const answerW = Math.floor((inner - answerGap * 2) / 3);
    answers.forEach((a, i) => {
      new Button(this, {
        x: v.x + L.pad + i * (answerW + answerGap), y: v.y + 292, w: answerW, h: 48,
        label: a.label, hotkey: a.hotkey,
        variant: a.dir === 'UNKNOWN' ? 'ghost' : 'default',
        onClick: () => this.store.dispatch({ type: 'RADIO/ANSWER', dir: a.dir }),
      });
    });
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
      if (!this.spriteFit(e, [enc.enemyKey])) this.enemyShape(e.x - 32, e.y - 20, 320, 300, enc.enemyKey);

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
    const fork = pendingFork(s);
    const spoken = fork !== null
      ? pick(content.radio.forkAsk, fork.floor)
      : (s.today?.encounter?.line ?? '');
    if (spoken === '') return;

    const v = L.live.dialogue;
    if (this.spriteObject(v.x, v.y, 'ui.live.dialogue', v.w, v.h) === null) {
      this.rect(v.x, v.y, v.w, v.h, 'ink');
      this.frame(v.x, v.y, v.w, v.h, 'bone');
    }
    // 배너가 사선으로 잘린 그림이라 글은 가운데 검은 띠 안에만 놓는다.
    // 띠의 중심이 그림 한가운데보다 조금 아래에 있어서 그만큼 내려 앉힌다
    this.text(v.x + 200, v.y + Math.round(v.h / 2) - 4, this.clip(`"${spoken}"`, v.w - 330), 'bone');
  }

  private buildChoices(s: Readonly<GameState>): void {
    const v = L.live.choices;
    this.scrimRow(v.x - 16, v.y - 12, v.w + 32, v.h + 24);
    const ready = s.phase === 'LIVE' && s.today?.encounter != null;
    const choices: { label: string; choice: CombatChoice; hotkey: string }[] = [
      { label: '공격한다', choice: 'ATTACK', hotkey: '1' },
      { label: '방어한다', choice: 'DEFEND', hotkey: '2' },
      { label: '어필한다', choice: 'APPEAL', hotkey: '3' },
    ];
    const gap = 16;
    const pad = 8;
    const buttonW = Math.floor((v.w - pad * 2 - gap * 2) / 3);
    choices.forEach((c, i) => {
      new Button(this, {
        x: v.x + pad + i * (buttonW + gap), y: v.y + pad, w: buttonW, h: v.h - pad * 2,
        label: c.label, hotkey: c.hotkey,
        variant: c.choice === 'APPEAL' ? 'danger' : 'default',
        enabled: ready,
        onClick: () => this.store.dispatch({ type: 'COMBAT/CHOOSE', choice: c.choice }),
      });
    });
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
    const state = appealing ? '카메라를 본다'
      : ratio >= 0.7 ? '평상'
      : ratio >= 0.4 ? '땀. 눈썹이 처졌다'
      : ratio >= 0.15 ? '피. 숨이 가쁘다'
      : '초점이 없다';

    // 어필 중에는 어필 컷으로 갈아낀다 (M06 §7 "이 게임의 썸네일")
    const art = starArt(star.id);
    const before = this.children.list.length;
    this.rect(v.x, v.y, v.w, v.h, 'ink');
    const keys = appealing ? [art.appeal, art.portrait] : [art.portrait];
    if (!this.bust(v, keys)) this.dither(v.x, v.y, v.w, v.h, 'mid', ratio < 0.15 ? 12 : 8);
    this.frame(v.x, v.y, v.w, v.h, appealing ? 'wax' : 'bone');

    // 열화 3+ — 균열 오버레이. 위 모든 상태에 겹친다
    if (star.reviveCount >= 3) {
      for (let i = 0; i < 5; i += 1) {
        const y = v.y + 24 + Math.floor(hash2(star.reviveCount, i) * (v.h - 96));
        this.rect(v.x + 8 + i * 12, y, v.w - 32 - i * 24, L.line, 'dust');
      }
    }

    // HP 15% 이하 — 초상만 미세하게 흔들린다
    if (ratio < 0.15 && !this.reduced) {
      for (const obj of this.children.list.slice(before)) {
        const o = obj as Phaser.GameObjects.GameObject & { x: number; y: number };
        if (typeof o.x === 'number') this.shaken.push({ obj: o, x: o.x, y: o.y });
      }
    }

    // 초상 **바로 아래** — 이름 · 공/방 · 체력. 이 넷이 전투 중에 계속 바뀌는 값이다.
    // 소생·어필 횟수는 뺐다 (사용자 확정) — 소생은 초상의 균열이, 어필은 어필 컷이 말한다.
    // 랜턴 팔이 이 자리 뒤로 지나가 아주 밝다. 솎아 찍는 판(scrim)으로는 글이 안 읽혀서
    // 초상과 같은 폭의 **불투명 판**을 깐다 — 둘이 한 덩어리로 보이는 편이 낫다
    const iw = info.w - L.pad * 2;
    this.rect(info.x, info.y, info.w, info.h, 'ink');
    this.frame(info.x, info.y, info.w, info.h, 'bone');
    // 04-UI-KIT — 글자 크기는 16 / 32 / 48 셋뿐이다 (네오둥근모 16px 의 정수배).
    // 24 같은 값을 지어내면 폰트가 뭉개진다. 그래서 한 단계씩 통째로 내렸다.
    this.text(info.x + L.pad, info.y + 12, this.clip(star.bodyName, iw));
    this.label(info.x + L.pad, info.y + 56, this.clip(state, iw * 2), appealing ? 'wax' : 'dust');
    this.label(info.x + L.pad, info.y + 84, `공 ${run.hero.atk}   방 ${run.hero.def}`, 'dust');
    this.bar(info.x + L.pad, info.y + 112, iw, run.hero.hp, run.hero.maxHp, 'bone');
    this.label(info.x + L.pad, info.y + 140, `${run.hero.hp} / ${run.hero.maxHp}`, 'dust');

    // 이 방송의 누적 슈퍼챗. **시청자 수는 여기 안 쓴다** — 방송바에 이미 있어서
    // 한 화면에 같은 숫자가 둘이 떴다 (사용자 확정)
    this.label(info.x + L.pad, info.y + 168, `+${run.superchat} G`, 'bone');
  }

  /**
   * 초상을 흉상으로 잘라 칸에 넣는다 (사용자 확정 — 씬에서 crop).
   *
   * 원본 384x480 을 **1:1 로** 놓고 세로만 자른다. 줄이면 0.8배 같은 소수배가 되어
   * 도트가 지글거린다. 머리 위 여백 24px 을 버리고 가슴까지 `v.h` 만큼만 보인다.
   * 전투 중 표정이 바뀌어도 같은 crop 이 그대로 적용된다.
   */
  private bust(v: { x: number; y: number; w: number; h: number }, keys: string[]): boolean {
    const img = keys.reduce<Phaser.GameObjects.Image | null>(
      (hit, k) => hit ?? this.spriteObject(v.x, v.y, k), null,
    );
    if (img === null) return false;
    const src = img.texture.getSourceImage() as { width: number; height: number };
    const cw = Math.min(src.width, v.w);
    const ch = Math.min(src.height, v.h);
    const cx = Math.round((src.width - cw) / 2);
    const cy = Math.min(24, Math.max(0, src.height - ch));
    img.setPosition(v.x - cx, v.y - cy).setCrop(cx, cy, cw, ch);
    return true;
  }

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
      const from = { x: L.live.chat.x + L.pad, y: L.live.chat.y + L.live.chat.h - 120 };
      const to = { x: L.live.stats.x + L.pad, y: L.live.stats.y + 216 };
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

/** 04-UI-KIT §3 과 같은 규칙(전각 2 · 반각 1, 본문 32px)으로 줄을 나눈다 */
function wrapBody(s: string, px: number, maxLines: number): string[] {
  const lines: string[] = [];
  let cur = '';
  let used = 0;
  for (const ch of s) {
    const w = (ch.charCodeAt(0) > 0x2000 ? 2 : 1) * 16;
    if (used + w > px) {
      lines.push(cur);
      if (lines.length === maxLines) return lines;
      cur = '';
      used = 0;
    }
    cur += ch;
    used += w;
  }
  if (cur !== '') lines.push(cur);
  return lines;
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
