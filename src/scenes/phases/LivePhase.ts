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
 * 이 화면만 HUD 를 덮는다. 26+124+186+144 = 480, 16+254 = 270 로 화면 전체를 채운다.
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
    this.rect(0, 0, L.W, L.H, 'soot');
    this.buildBar(s);
    this.buildFloors(s);
    this.buildMap(s);
    this.buildRadio(s);
    this.buildCombat(s);
    this.buildChoices(s);
    this.buildPortrait(s);
    this.buildChat(s);

    // 5분할 경계선 — 1px 하드 엣지만으로 칸을 나눈다
    for (const box of [v.floors, v.map, v.radio, v.combat, v.choices, v.portrait, v.chat]) {
      this.frame(box.x, box.y, box.w, box.h);
    }
  }

  /* ── ① 상단 바 ─────────────────────────────────────── */
  private buildBar(s: Readonly<GameState>): void {
    const v = L.live;
    this.rect(v.bar.x, v.bar.y, v.bar.w, v.bar.h, 'ash');
    this.rect(L.pad, 6, 4, 4, 'wax');
    this.text(L.pad + 8, -1, 'LIVE', 'wax');
    const persona = s.personas.find((p) => p.id === s.today?.personaId);
    this.text(L.pad + 48, -1, persona?.displayName ?? '무명 방송', 'bone');
    this.textRight(L.W - L.pad, -1, `시청자 ${fmtFans(s.fans)}`, 'dust');
  }

  /* ── ② 좌측 층수 게이지 ────────────────────────────── */
  private buildFloors(s: Readonly<GameState>): void {
    const v = L.live.floors;
    this.rect(v.x, v.y, v.w, v.h, 'ash');
    const target = content.balance.start.targetFloor;
    const railY = (floor: number): number => v.y + 8 + Math.round((Math.min(floor, target) / target) * (v.h - 20));

    // 최고기록 눈금
    this.rect(v.x + 2, railY(s.maxFloor), v.w - 4, 1, 'tallow');
    const floor = s.today?.currentFloor ?? 0;
    this.rect(v.x + 2, railY(floor), v.w - 4, 3, 'wax');
    this.text(v.x + 4, v.y + 2, String(floor).padStart(2, '0'), 'bone');
    this.text(v.x + 4, v.y + v.h - 18, String(target), 'dust');
  }

  /* ── ③ 던전 지도 (연출용) ──────────────────────────── */
  private buildMap(s: Readonly<GameState>): void {
    const v = L.live.map;
    this.rect(v.x, v.y, v.w, v.h, 'ash');
    this.text(v.x + 6, v.y + 4, '지도', 'dust');
    // 프로시저럴 단면도는 M06 본구현에서. 지금은 경로 자리만 잡는다.
    const step = 12;
    const rows = Math.floor((v.h - 28) / step);
    const floor = s.today?.currentFloor ?? 0;
    for (let i = 0; i < rows; i += 1) {
      const y = v.y + 22 + i * step;
      const cx = v.x + 20 + ((i * 17) % (v.w - 44));
      this.rect(cx, y, 10, 2, i === Math.min(rows - 1, floor % rows) ? 'wax' : 'line');
    }
  }

  /* ── ④ 무전기 — 진짜 지도는 여기에만 ───────────────── */
  private buildRadio(s: Readonly<GameState>): void {
    const v = L.live.radio;
    this.rect(v.x, v.y, v.w, v.h, 'clay');
    this.text(v.x + 6, v.y + 4, '무전', 'dust');

    const inner = v.w - 12;
    const fork = s.today?.forks.at(-1) ?? null;
    if (fork === null) {
      this.text(v.x + 6, v.y + 22, '갈림길 없음', 'dust');
      this.text(v.x + 6, v.y + 40, '· · · 잡음뿐', 'dust');
      return;
    }
    // 층수는 층 게이지와 전투 칸에 이미 있다. 여기서는 두 갈래만 보여준다.
    this.text(v.x + 6, v.y + 20, this.clip(`A ${fork.truth.a.label}`, inner), 'dust');
    this.text(v.x + 6, v.y + 36, this.clip(`B ${fork.truth.b.label}`, inner), 'dust');

    const answers: { label: string; dir: 'A' | 'B' | 'UNKNOWN' }[] = [
      { label: 'A 로 가', dir: 'A' },
      { label: 'B 로 가', dir: 'B' },
      { label: '나도 몰라', dir: 'UNKNOWN' },
    ];
    answers.forEach((a, i) => {
      new Button(this, {
        x: v.x + 6, y: v.y + 56 + i * 20, w: inner, h: 20,
        label: a.label,
        onClick: () => this.store.dispatch({ type: 'RADIO/ANSWER', dir: a.dir }),
      });
    });
  }

  /* ── ⑤ 1인칭 전투 ──────────────────────────────────── */
  private buildCombat(s: Readonly<GameState>): void {
    const v = L.live.combat;
    this.rect(v.x, v.y, v.w, v.h, 'ash');
    const run = s.today;
    const enc = run?.encounter ?? null;

    if (run === null || run === undefined) {
      this.text(v.x + 8, v.y + 8, '방송 준비 중', 'dust');
      return;
    }
    const inner = v.w - 16;
    if (enc === null) {
      this.text(v.x + 8, v.y + 8, `${run.currentFloor}F 하강 중`, 'dust');
      this.text(v.x + 8, v.y + 28, '아직 조용하다', 'dust');
    } else {
      this.text(v.x + 8, v.y + 8, `${enc.floor}F · ${enc.turn}턴`, 'dust');
      this.text(v.x + 8, v.y + 28, this.clip(enc.enemyKey, inner), 'bone');
      this.bar(v.x + 8, v.y + 48, inner, enc.enemy.hp, enc.enemy.maxHp, 'wax');
      if (enc.line !== '') this.text(v.x + 8, v.y + 62, this.clip(enc.line, inner), 'bone');
      if (enc.guarding) this.text(v.x + 8, v.y + 80, '방어 자세', 'dust');
    }

    this.text(v.x + 8, v.y + v.h - 42, `${run.hero.hp} / ${run.hero.maxHp}`, 'bone');
    this.bar(v.x + 8, v.y + v.h - 22, v.w - 16, run.hero.hp, run.hero.maxHp, 'bone');
    this.textRight(v.x + v.w - 8, v.y + v.h - 42, `공 ${run.hero.atk} 방 ${run.hero.def}`, 'dust');
  }

  /* ── ⑥ 공격 / 방어 / 어필 ──────────────────────────── */
  private buildChoices(s: Readonly<GameState>): void {
    const v = L.live.choices;
    this.rect(v.x, v.y, v.w, v.h, 'soot');
    const ready = s.today?.encounter != null;
    const choices: { label: string; choice: CombatChoice; hotkey: string }[] = [
      { label: '공격한다', choice: 'ATTACK', hotkey: '1' },
      { label: '방어한다', choice: 'DEFEND', hotkey: '2' },
      { label: '어필한다', choice: 'APPEAL', hotkey: '3' },
    ];
    choices.forEach((c, i) => {
      new Button(this, {
        x: v.x + 6, y: v.y + 2 + i * 24, w: v.w - 12, h: 22,
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
    this.rect(v.x, v.y, v.w, v.h, 'clay');
    const star = s.stars.find((x) => x.id === s.today?.starId);
    if (star === undefined) {
      this.text(v.x + 8, v.y + 8, '출연자 없음', 'dust');
      return;
    }
    this.text(v.x + 8, v.y + 8, star.bodyName);
    this.text(v.x + 8, v.y + 28, `소생 ${star.reviveCount}회`, star.reviveCount > 2 ? 'wax' : 'dust');
    this.text(v.x + 8, v.y + 48, `어필 ${s.today?.appealCount ?? 0}회`, 'dust');
    this.textRight(v.x + v.w - 8, v.y + 8, `+${s.today?.superchat ?? 0}G`, 'tallow');
  }

  /* ── ⑧ 채팅 ────────────────────────────────────────── */
  private buildChat(s: Readonly<GameState>): void {
    const v = L.live.chat;
    this.rect(v.x, v.y, v.w, v.h, 'ash');
    const queue = s.today?.chatQueue.filter((m) => !m.removed) ?? [];
    if (queue.length === 0) {
      this.text(v.x + 6, v.y + 6, '채팅이 조용하다', 'dust');
      return;
    }
    queue.slice(-8).forEach((msg, i) => {
      this.text(v.x + 6, v.y + 6 + i * 18, this.clip(`${msg.nick}: ${msg.text}`, v.w - 12), msg.tone === 'TRUTH' ? 'wax' : 'dust');
    });
  }

  /** 값 게이지 — 1px 테두리 안을 채운다 */
  private bar(x: number, y: number, w: number, value: number, max: number, color: 'wax' | 'bone'): void {
    this.rect(x, y, w, 6, 'soot');
    this.frame(x, y, w, 6);
    const ratio = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max));
    this.rect(x + 1, y + 1, Math.round((w - 2) * ratio), 4, color);
  }
}

/** 표시는 84.2K 형태 (02-DATA-SCHEMA §1) */
function fmtFans(n: number): string {
  return n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n);
}
