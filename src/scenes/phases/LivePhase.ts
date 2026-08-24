import Phaser from 'phaser';
import { SCENES } from '../../config';
import { content } from '../../core/content';
import { PALETTE } from '../../render/palette';
import { starArt } from '../../render/assets';
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
 * M07 수용 기준 「30초에 40~60개」 → 0.6초에 하나 = 30초에 50개.
 */
const CHAT_SPAWN_MS = 600;

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
  private blinkers: Phaser.GameObjects.Rectangle[] = [];
  private shaken: { obj: Phaser.GameObjects.GameObject & { x: number; y: number }; x: number; y: number }[] = [];
  private noiseLayer: Phaser.GameObjects.Graphics | null = null;

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

    this.chat = new Ticker(this, { x: L.live.chat.x + L.pad, y: L.live.chat.y + 56, w: L.live.chat.w - L.pad * 2, h: L.live.chat.h - 72 },
      (id) => this.store.dispatch({ type: 'CHAT/DELETE', id }));
    this.keepAlive(...this.chat.objects());

    super.create();
    playBgm(this, 'bgm.live');
    const stepMs = Math.round((content.balance.dive.floorSeconds * 1000) / speedMul(this.registry));
    this.ticker = this.time.addEvent({ delay: stepMs, loop: true, callback: () => this.step() });

    // 채팅은 core 에 청하기만 한다. 무슨 말이 나올지는 core 가 정한다 (M07)
    this.chatPump = this.time.addEvent({
      delay: CHAT_SPAWN_MS,
      loop: true,
      callback: () => {
        if (this.store.getState().phase !== 'LIVE') return;
        if (this.time.now < this.chatSilentUntil) return; // 28F 침묵
        this.store.dispatch({ type: 'CHAT/SPAWN' });
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

    if (this.noiseLayer !== null && this.deathAt !== null) this.drawNoise(now - this.deathAt);
  }

  protected build(s: Readonly<GameState>): void {
    this.reduced = reducedMotion(this.registry);
    this.blinkers = [];
    this.shaken = [];
    this.noiseLayer = null;
    this.watch(s);

    const v = L.live;
    this.rect(0, 0, L.W, L.H, 'ink');
    this.spriteCover({ x: 0, y: 0, w: L.W, h: L.H }, ['bg.live']);

    // 「이 순간이 게임 전체에서 가장 중요한 30초다」 (M11 §2).
    // 덮기만 하면 아래 3택이 그대로 눌리므로 다른 것을 아예 그리지 않는다.
    if (this.gatekeeperOpen) {
      this.buildGatekeeper();
      return;
    }

    this.buildBar(s);
    this.buildFloors(s);
    this.buildMap(s);
    this.buildRadio(s);
    this.buildCombat(s);
    this.buildChoices(s);
    this.buildPortrait(s);
    this.buildChat(s);

    // 5분할 경계선 — 2px 하드 엣지만으로 칸을 나눈다
    for (const box of [v.floors, v.map, v.radio, v.combat, v.choices, v.portrait, v.chat]) {
      this.frame(box.x, box.y, box.w, box.h);
    }

    // 5분할이 화면을 꽉 채워 빈 띠가 없다. 온보딩은 방송 정보 바에 태운다 (04-UI-KIT §7)
    if (s.today !== null) {
      const asking = pendingFork(s) !== null;
      if (asking || s.today.encounter !== null) {
        onboard(this, s.day, asking ? 'LIVE_RADIO' : 'LIVE_COMBAT', { x: 700, y: 8, w: 900 });
      }
    }

    if (this.witnessFloor !== null) this.buildWitness(this.witnessFloor);
    if (this.deathAt !== null) this.noiseLayer = this.add.graphics();
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

  /* ── ① 상단 바 ─────────────────────────────────────── */
  private buildBar(s: Readonly<GameState>): void {
    const v = L.live;
    this.rect(v.bar.x, v.bar.y, v.bar.w, v.bar.h, 'ink');
    this.blinkers.push(this.dot(L.pad, 24, 16, 'wax'));
    this.text(L.pad + 32, 12, 'LIVE', 'wax');

    const persona = s.personas.find((p) => p.id === s.today?.personaId);
    const title = `${persona?.displayName ?? '무명 방송'} · ${s.today?.claimedCeiling ?? 0}층 도전`;
    this.text(L.pad + 160, 12, this.clip(title, 900), 'bone');

    this.textRight(L.W - L.pad, 12, `시청자 ${fmtFans(s.fans)}`, 'dust');
    if (this.time.now < this.fanDropUntil) this.textRight(L.W - L.pad - 320, 12, '▼', 'wax');
  }

  /* ── ② 좌측 층수 게이지 — 아래로 깊어진다 (M06 §6) ──── */
  private buildFloors(s: Readonly<GameState>): void {
    const v = L.live.floors;
    this.rect(v.x, v.y, v.w, v.h, 'ink');

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
    this.rect(v.x, v.y, v.w, v.h, 'ink');
    this.label(v.x + L.pad, v.y + L.pad, '단면도', 'dust');

    const floor = s.today?.currentFloor ?? 0;
    const top = windowTop(floor);
    const gridY = v.y + 64;
    const rowH = Math.floor((v.h - 88) / WINDOW_ROWS);
    const innerX = v.x + L.pad;
    const innerW = v.w - L.pad * 2;

    let prevCx = innerX + Math.floor(innerW / 2);
    for (let i = 0; i < WINDOW_ROWS; i += 1) {
      const f = top + i;
      const y = gridY + i * rowH;
      // 층 모양은 시드에 묶는다 — 다시 그려도 통로가 흔들리지 않는다
      const a = hash2(s.seed, f);
      const b = hash2(s.seed ^ 0x5bf03635, f);
      const w = 96 + Math.floor(b * (innerW - 160));
      const x = innerX + Math.floor(a * (innerW - w));
      const cx = x + Math.floor(w / 2);
      const visited = f > 0 && f <= floor;

      this.rect(x, y + rowH - 10, w, L.line, visited ? 'dust' : 'mid');
      if (visited) {
        // 지나온 경로만 선으로 남는다
        this.rect(Math.min(prevCx, cx), y + rowH - 10, Math.abs(cx - prevCx) + L.line, L.line, 'dust');
        this.rect(cx, y, L.line, rowH - 10, 'dust');
        prevCx = cx;
      }
      if (f === floor) this.blinkers.push(this.dot(cx - 6, y + rowH - 20, 12, 'wax'));
    }
  }

  /* ── ④ 무전기 — 진짜 지도는 여기에만 (M06 §5) ────────── */
  private buildRadio(s: Readonly<GameState>): void {
    const v = L.live.radio;
    this.rect(v.x, v.y, v.w, v.h, 'ink');
    this.label(v.x + L.pad, v.y + L.pad, '무전', 'dust');

    const inner = v.w - L.pad * 2;
    const fork = pendingFork(s);
    if (fork === null) {
      this.text(v.x + L.pad, v.y + 120, '· · · 잡음뿐', 'dust');
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
    answers.forEach((a, i) => {
      new Button(this, {
        x: v.x + L.pad, y: v.y + 284 + i * 66, w: inner, h: 58,
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
    this.spriteCover(v, ['bg.tower']);
    // 탑 배경이 들어오면 그 위의 층수·대사·HP 가 묻힌다. 글이 놓이는 두 띠만 덮는다.
    // 가운데(적이 서는 자리)는 건드리지 않는다 — 거기가 이 칸의 그림이다
    this.scrimBlock(v.x, v.y, 480, 104);
    // 아래 띠는 3택 패널까지 48px 넘겨 깐다 — 거기는 곧 3택이 덮으므로 이음매가 보이지 않는다
    this.scrimRow(v.x, v.y + 424, v.w, v.h - 424 + 48);
    const run = s.today ?? null;
    if (run === null) {
      this.text(v.x + L.pad, v.y + L.pad, '방송 준비 중', 'dust');
      return;
    }
    const inner = v.w - L.pad * 2;
    const enc = run.encounter;

    if (enc === null) {
      this.label(v.x + L.pad, v.y + 16, `${run.currentFloor}F`, 'dust');
      this.title(v.x + L.pad, v.y + 48, '하강 중', 'dust');
      this.dither(v.x + 212, v.y + 160, 320, 260, 'mid', 12);
    } else {
      this.label(v.x + L.pad, v.y + 16, `${enc.floor}F · ${enc.turn}턴`, 'dust');
      this.title(v.x + L.pad, v.y + 48, this.clip(enemyName(enc.enemyKey), inner, 'title'), 'bone');
      // 적 CG 가 오면 그걸 쓰고, 없으면 키 해시로 만든 실루엣을 그린다
      // 512x512 원본을 정확히 1/2 로 줄여 놓는다. 소수배로 줄이면 디더가 깨진다
      if (!this.spriteFit({ x: v.x + 244, y: v.y + 152, w: 256, h: 256 }, [enc.enemyKey])) {
        this.enemyShape(v.x + 212, v.y + 130, 320, 300, enc.enemyKey);
      }
      this.bar(v.x + L.pad, v.y + 452, inner, enc.enemy.hp, enc.enemy.maxHp, 'wax');
      this.label(v.x + L.pad, v.y + 486, `적 ${enc.enemy.hp} / ${enc.enemy.maxHp}`, 'dust');
      // 용사 대사는 core 가 `Encounter.line` 에 넣는다. 비어 있으면 지어내지 않는다 (HO-005)
      if (enc.line !== '') this.text(v.x + L.pad, v.y + 512, this.clip(`"${enc.line}"`, inner), 'bone');
      if (enc.guarding) this.textRight(v.x + v.w - L.pad, v.y + 480, '방어 자세', 'wax');
    }

    this.rect(v.x + L.pad, v.y + 576, inner, L.line, 'mid');
    this.label(v.x + L.pad, v.y + 600, '용사', 'dust');
    this.textRight(v.x + v.w - L.pad, v.y + 592, `공 ${run.hero.atk}  방 ${run.hero.def}`, 'dust');
    this.bar(v.x + L.pad, v.y + 636, inner, run.hero.hp, run.hero.maxHp, 'bone');
    this.label(v.x + L.pad, v.y + 670, `${run.hero.hp} / ${run.hero.maxHp}`, 'dust');
  }

  /* ── ⑥ 공격 / 방어 / 어필 ──────────────────────────── */
  private buildChoices(s: Readonly<GameState>): void {
    const v = L.live.choices;
    this.rect(v.x, v.y, v.w, v.h, 'ink');
    const ready = s.phase === 'LIVE' && s.today?.encounter != null;
    const choices: { label: string; choice: CombatChoice; hotkey: string }[] = [
      { label: '공격한다', choice: 'ATTACK', hotkey: '1' },
      { label: '방어한다', choice: 'DEFEND', hotkey: '2' },
      { label: '어필한다', choice: 'APPEAL', hotkey: '3' },
    ];
    choices.forEach((c, i) => {
      new Button(this, {
        x: v.x + L.pad, y: v.y + L.pad + i * 88, w: v.w - L.pad * 2, h: 72,
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
    this.rect(v.x, v.y, v.w, v.h, 'ink');
    const run = s.today ?? null;
    const star = s.stars.find((x) => x.id === run?.starId);
    if (run === null || star === undefined) {
      this.text(v.x + L.pad, v.y + L.pad, '출연자 없음', 'dust');
      return;
    }
    const ratio = run.hero.maxHp <= 0 ? 0 : run.hero.hp / run.hero.maxHp;
    const appealing = run.encounter?.log.at(-1) === 'APPEAL';
    const state = appealing ? '카메라를 본다'
      : ratio >= 0.7 ? '평상'
      : ratio >= 0.4 ? '땀. 눈썹이 처졌다'
      : ratio >= 0.15 ? '피. 숨이 가쁘다'
      : '초점이 없다';

    // 초상 자리 — 어필 중에는 어필 컷으로 갈아낀다 (M06 §7 "이 게임의 썸네일")
    const art = starArt(star.id);
    const px = v.x + v.w - 248;
    const py = v.y + 16;
    // 384x480 원본을 정확히 1/2 로 (192x240). 상점 화면에서는 1:1 로 쓰인다
    const box = { x: v.x + v.w - 216, y: v.y + 80, w: 192, h: 240 };
    const before = this.children.list.length;
    const keys = appealing ? [art.appeal, art.portrait] : [art.portrait];
    if (!this.spriteFit(box, keys)) this.dither(px, py, 232, v.h - 32, 'mid', ratio < 0.15 ? 12 : 8);
    if (appealing) this.frame(px, py, 232, v.h - 32, 'wax');

    // 열화 3+ — 균열 오버레이. 위 모든 상태에 겹친다
    if (star.reviveCount >= 3) {
      for (let i = 0; i < 5; i += 1) {
        const y = py + 24 + Math.floor(hash2(star.reviveCount, i) * (v.h - 96));
        this.rect(px + 8 + i * 12, y, 216 - i * 24, L.line, 'dust');
      }
    }

    // HP 15% 이하 — 초상만 미세하게 흔들린다
    if (ratio < 0.15 && !this.reduced) {
      for (const obj of this.children.list.slice(before)) {
        const o = obj as Phaser.GameObjects.GameObject & { x: number; y: number };
        if (typeof o.x === 'number') this.shaken.push({ obj: o, x: o.x, y: o.y });
      }
    }

    this.title(v.x + L.pad, v.y + 20, this.clip(star.bodyName, v.w - 280, 'title'));
    this.text(v.x + L.pad, v.y + 96, this.clip(state, v.w - 280), appealing ? 'wax' : 'dust');
    this.text(v.x + L.pad, v.y + 148, `소생 ${star.reviveCount}회`, star.reviveCount >= 3 ? 'wax' : 'dust');
    this.text(v.x + L.pad, v.y + 200, `어필 ${run.appealCount}회`, 'dust');
    this.text(v.x + L.pad, v.y + 252, `+${run.superchat} G`, 'bone');
  }

  /* ── ⑧ 채팅 ────────────────────────────────────────── */
  private buildChat(s: Readonly<GameState>): void {
    const v = L.live.chat;
    this.rect(v.x, v.y, v.w, v.h, 'ink');
    this.label(v.x + L.pad, v.y + 16, '채팅', 'dust');

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
      const to = { x: L.live.portrait.x + L.pad, y: L.live.portrait.y + 252 };
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

/** 'enemy.gatekeeper' → 'GATEKEEPER'. 한글 이름은 content 몫이다 (HO-005) */
function enemyName(assetKey: string): string {
  return (assetKey.split('.').at(-1) ?? assetKey).toUpperCase();
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
