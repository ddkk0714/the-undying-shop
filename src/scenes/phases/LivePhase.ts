import Phaser from 'phaser';
import { SCENES } from '../../config';
import { content } from '../../core/content';
import { L } from '../../ui/layout';
import { Button } from '../../ui/Button';
import { PhaseScene } from './PhaseScene';
import type { CombatChoice, GameState } from '../../core/types';

/**
 * M06 생방송 — 5분할 화면 골격 (04-UI-KIT §1 의 L.live).
 *
 * 이 화면만 HUD 를 덮는다. 104+496+744+576 = 1920, 64+1016 = 1080 로 화면 전체를 채운다.
 * 하강 틱은 프레임마다가 아니라 `balance.dive.floorSeconds` 고정 간격으로 보낸다 (HO-001).
 */
export class LivePhase extends PhaseScene {
  private ticker: Phaser.Time.TimerEvent | null = null;

  constructor() {
    super(SCENES.PHASE_LIVE);
  }

  override create(): void {
    super.create();
    const stepMs = Math.round(content.balance.dive.floorSeconds * 1000);
    this.ticker = this.time.addEvent({
      delay: stepMs,
      loop: true,
      callback: () => {
        const s = this.store.getState();
        // 전투 중이면 멈춘다 — 제한시간이 없으므로 선택을 기다린다 (CCR-001 §2)
        if (s.phase !== 'LIVE' || s.today?.encounter != null) return;
        this.store.dispatch({ type: 'LIVE/TICK', dt: content.balance.dive.floorSeconds });
      },
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.ticker?.remove();
      this.ticker = null;
    });
  }

  protected build(s: Readonly<GameState>): void {
    const v = L.live;
    this.rect(0, 0, L.W, L.H, 'ink');
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
  }

  /* ── ① 상단 바 ─────────────────────────────────────── */
  private buildBar(s: Readonly<GameState>): void {
    const v = L.live;
    this.rect(v.bar.x, v.bar.y, v.bar.w, v.bar.h, 'ink');
    this.rect(L.pad, 24, 16, 16, 'wax');
    this.text(L.pad + 32, 12, 'LIVE', 'wax');
    const persona = s.personas.find((p) => p.id === s.today?.personaId);
    this.text(L.pad + 160, 12, this.clip(persona?.displayName ?? '무명 방송', 700), 'bone');
    this.textRight(L.W - L.pad, 12, `시청자 ${fmtFans(s.fans)}`, 'dust');
  }

  /* ── ② 좌측 층수 게이지 ────────────────────────────── */
  private buildFloors(s: Readonly<GameState>): void {
    const v = L.live.floors;
    this.rect(v.x, v.y, v.w, v.h, 'ink');
    const target = content.balance.start.targetFloor;
    const railY = (floor: number): number => v.y + 64 + Math.round((Math.min(floor, target) / target) * (v.h - 160));

    this.rect(v.x + 8, railY(s.maxFloor), v.w - 16, L.line, 'dust'); // 최고기록 눈금
    const floor = s.today?.currentFloor ?? 0;
    this.rect(v.x + 8, railY(floor), v.w - 16, 12, 'wax');
    this.text(v.x + 12, v.y + 8, String(floor).padStart(2, '0'), 'bone');
    this.text(v.x + 12, v.y + v.h - 56, String(target), 'dust');
  }

  /* ── ③ 던전 지도 (연출용) ──────────────────────────── */
  private buildMap(s: Readonly<GameState>): void {
    const v = L.live.map;
    this.rect(v.x, v.y, v.w, v.h, 'ink');
    this.dither(v.x + 8, v.y + 8, v.w - 16, v.h - 16, 'mid', 8);
    this.label(v.x + L.pad, v.y + L.pad, '지도', 'dust');
    // 프로시저럴 단면도는 M06 본구현에서. 지금은 경로 자리만 잡는다.
    const step = 48;
    const rows = Math.floor((v.h - 112) / step);
    const floor = s.today?.currentFloor ?? 0;
    for (let i = 0; i < rows; i += 1) {
      const y = v.y + 88 + i * step;
      const cx = v.x + 80 + ((i * 68) % (v.w - 176));
      this.rect(cx, y, 40, 8, i === Math.min(rows - 1, floor % rows) ? 'wax' : 'dust');
    }
  }

  /* ── ④ 무전기 — 진짜 지도는 여기에만 ───────────────── */
  private buildRadio(s: Readonly<GameState>): void {
    const v = L.live.radio;
    this.rect(v.x, v.y, v.w, v.h, 'ink');
    this.label(v.x + L.pad, v.y + L.pad, '무전', 'dust');

    const inner = v.w - L.pad * 2;
    const fork = s.today?.forks.at(-1) ?? null;
    if (fork === null) {
      this.text(v.x + L.pad, v.y + 88, '갈림길 없음', 'dust');
      this.text(v.x + L.pad, v.y + 144, '· · · 잡음뿐', 'dust');
      return;
    }
    // 층수는 층 게이지와 전투 칸에 이미 있다. 여기서는 두 갈래만 보여준다.
    this.text(v.x + L.pad, v.y + 80, this.clip(`A ${fork.truth.a.label}`, inner), 'dust');
    this.text(v.x + L.pad, v.y + 144, this.clip(`B ${fork.truth.b.label}`, inner), 'dust');

    const answers: { label: string; dir: 'A' | 'B' | 'UNKNOWN' }[] = [
      { label: 'A 로 가', dir: 'A' },
      { label: 'B 로 가', dir: 'B' },
      { label: '나도 몰라', dir: 'UNKNOWN' },
    ];
    answers.forEach((a, i) => {
      new Button(this, {
        x: v.x + L.pad, y: v.y + 224 + i * 80, w: inner, h: 72,
        label: a.label,
        onClick: () => this.store.dispatch({ type: 'RADIO/ANSWER', dir: a.dir }),
      });
    });
  }

  /* ── ⑤ 1인칭 전투 ──────────────────────────────────── */
  private buildCombat(s: Readonly<GameState>): void {
    const v = L.live.combat;
    this.rect(v.x, v.y, v.w, v.h, 'ink');
    const run = s.today;
    const enc = run?.encounter ?? null;

    if (run === null || run === undefined) {
      this.text(v.x + L.pad, v.y + L.pad, '방송 준비 중', 'dust');
      return;
    }
    const inner = v.w - L.pad * 2;
    if (enc === null) {
      this.text(v.x + L.pad, v.y + L.pad, `${run.currentFloor}F 하강 중`, 'dust');
      this.text(v.x + L.pad, v.y + 96, '아직 조용하다', 'dust');
    } else {
      this.label(v.x + L.pad, v.y + L.pad, `${enc.floor}F · ${enc.turn}턴`, 'dust');
      this.title(v.x + L.pad, v.y + 72, this.clip(enc.enemyKey, inner, 'title'), 'bone');
      this.bar(v.x + L.pad, v.y + 160, inner, enc.enemy.hp, enc.enemy.maxHp, 'wax');
      if (enc.line !== '') this.text(v.x + L.pad, v.y + 220, this.clip(enc.line, inner), 'bone');
      if (enc.guarding) this.text(v.x + L.pad, v.y + 280, '방어 자세', 'dust');
    }

    this.text(v.x + L.pad, v.y + v.h - 140, `${run.hero.hp} / ${run.hero.maxHp}`, 'bone');
    this.bar(v.x + L.pad, v.y + v.h - 72, inner, run.hero.hp, run.hero.maxHp, 'bone');
    this.textRight(v.x + v.w - L.pad, v.y + v.h - 140, `공 ${run.hero.atk} 방 ${run.hero.def}`, 'dust');
  }

  /* ── ⑥ 공격 / 방어 / 어필 ──────────────────────────── */
  private buildChoices(s: Readonly<GameState>): void {
    const v = L.live.choices;
    this.rect(v.x, v.y, v.w, v.h, 'ink');
    const ready = s.today?.encounter != null;
    const choices: { label: string; choice: CombatChoice; hotkey: string }[] = [
      { label: '공격한다', choice: 'ATTACK', hotkey: '1' },
      { label: '방어한다', choice: 'DEFEND', hotkey: '2' },
      { label: '어필한다', choice: 'APPEAL', hotkey: '3' },
    ];
    choices.forEach((c, i) => {
      new Button(this, {
        x: v.x + L.pad, y: v.y + 16 + i * 92, w: v.w - L.pad * 2, h: 80,
        label: c.label, hotkey: c.hotkey,
        variant: c.choice === 'APPEAL' ? 'danger' : 'default',
        enabled: ready,
        onClick: () => this.store.dispatch({ type: 'COMBAT/CHOOSE', choice: c.choice }),
      });
    });
  }

  /* ── ⑦ 용사 초상 ───────────────────────────────────── */
  private buildPortrait(s: Readonly<GameState>): void {
    const v = L.live.portrait;
    this.rect(v.x, v.y, v.w, v.h, 'ink');
    // 초상 이미지가 들어올 자리에만 디더를 깐다. 글자 뒤에는 깔지 않는다
    this.dither(v.x + v.w - 232, v.y + 8, 224, v.h - 16, 'mid', 8);
    const star = s.stars.find((x) => x.id === s.today?.starId);
    if (star === undefined) {
      this.text(v.x + L.pad, v.y + L.pad, '출연자 없음', 'dust');
      return;
    }
    this.title(v.x + L.pad, v.y + L.pad, this.clip(star.bodyName, v.w - 260, 'title'));
    this.text(v.x + L.pad, v.y + 112, `소생 ${star.reviveCount}회`, star.reviveCount > 2 ? 'wax' : 'dust');
    this.text(v.x + L.pad, v.y + 176, `어필 ${s.today?.appealCount ?? 0}회`, 'dust');
    this.text(v.x + L.pad, v.y + 296, `+${s.today?.superchat ?? 0} G`, 'bone');
  }

  /* ── ⑧ 채팅 ────────────────────────────────────────── */
  private buildChat(s: Readonly<GameState>): void {
    const v = L.live.chat;
    this.rect(v.x, v.y, v.w, v.h, 'ink');
    const queue = s.today?.chatQueue.filter((m) => !m.removed) ?? [];
    if (queue.length === 0) {
      this.text(v.x + L.pad, v.y + L.pad, '채팅이 조용하다', 'dust');
      return;
    }
    queue.slice(-12).forEach((msg, i) => {
      this.text(
        v.x + L.pad, v.y + L.pad + i * 48,
        this.clip(`${msg.nick}: ${msg.text}`, v.w - L.pad * 2),
        msg.tone === 'TRUTH' ? 'wax' : 'dust',
      );
    });
  }

  /** 값 게이지 — 2px 테두리 안을 채운다 */
  private bar(x: number, y: number, w: number, value: number, max: number, color: 'wax' | 'bone'): void {
    this.rect(x, y, w, 24, 'ink');
    this.frame(x, y, w, 24);
    const ratio = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max));
    this.rect(x + L.line, y + L.line, Math.round((w - L.line * 2) * ratio), 24 - L.line * 2, color);
  }
}

/** 표시는 84.2K 형태 (02-DATA-SCHEMA §1) */
function fmtFans(n: number): string {
  return n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n);
}
