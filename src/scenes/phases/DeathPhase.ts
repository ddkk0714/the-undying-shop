import Phaser from 'phaser';
import { SCENES } from '../../config';
import { content } from '../../core/content';
import { pickDialogue, totalRevivals } from '../../core/systems/dialogue';
import { key } from '../../render/assets';
import { PALETTE } from '../../render/palette';
import { L } from '../../ui/layout';
import { Button } from '../../ui/Button';
import { reducedMotion } from '../../ui/options';
import { playBgm, playSfx } from '../../audio/Sfx';
import { PhaseScene } from './PhaseScene';
import type { GameState } from '../../core/types';

/**
 * M08 ④ 사망 & 기록 갱신.
 *
 * 지지직(t=0~1.2)은 앞 단계에서 끝났다 — `LivePhase` 가 그리고 `DayScene` 이 단계 교체를
 * 1.8초 늦춰 준다. 이 씬은 그 다음을 받는다 (M08 §흐름의 t=1.80 지점).
 *
 *   0.0s  이름 · 층 · 사인
 *   1.2s  ★ 기록 갱신이면 NEW RECORD (M08 「아끼지 마라」)
 *   3.7s  일일 정산 — 숫자를 하나씩 세어 올린다
 *
 * **사망은 실패가 아니라 하이라이트다.** 그래서 시간을 쓴다. 아무 키·클릭으로 건너뛴다.
 */

const STAGE_RECORD_MS = 1200;
const STAGE_TALLY_MS = 3700;
/** 숫자 하나가 다 세어 올라가는 데 걸리는 시간. 한 번에 뜨면 감흥이 없다 (M08) */
const COUNT_MS = 300;

interface Row {
  label: string;
  value: number;
  suffix: string;
  color: 'bone' | 'wax' | 'dust';
  text?: Phaser.GameObjects.Text;
}

export class DeathPhase extends PhaseScene {
  private stage = 0;
  private reduced = false;
  private isRecord = false;
  private prevRecord: number | null = null;
  private rows: Row[] = [];
  private flashes = 0;

  constructor() {
    super(SCENES.PHASE_DEATH);
  }

  override create(): void {
  /**
   * ★ Phaser 씬 인스턴스는 stop/launch 를 거쳐도 **살아남는다.**
   * 어제 남긴 필드를 지우지 않으면 다음 날 화면이 어제 상태로 시작한다.
   */
    this.stage = 0;
    this.flashes = 0;
    this.isRecord = false;
    this.rows = [];

    this.reduced = reducedMotion(this.registry);
    this.prevRecord = (this.registry.get('record.prev') as number | undefined) ?? null;
    super.create();
    // 사망부터 발표까지는 한 덩어리다 — 세 화면이 같은 곡을 이어 받는다 (사운드V4)
    playBgm(this, 'bgm.tension');

    if (this.reduced) {
      this.stage = 2;
      this.redraw();
    } else {
      this.time.delayedCall(STAGE_RECORD_MS, () => this.toStage(1));
      this.time.delayedCall(STAGE_TALLY_MS, () => this.toStage(2));
    }

    // 스킵 — 심사자가 기다릴 이유가 없다
    this.input.keyboard?.on('keydown', () => this.toStage(2));
    this.input.on('pointerdown', () => this.toStage(2));
  }

  private toStage(next: number): void {
    if (next <= this.stage) return;
    this.stage = next;
    this.redraw();
  }

  override update(): void {
    super.update();
    if (this.stage < 2) return;
    const elapsed = this.time.now - this.tallyStartedAt;
    this.rows.forEach((row, i) => {
      if (row.text === undefined) return;
      const t = Math.max(0, Math.min(1, (elapsed - i * COUNT_MS) / COUNT_MS));
      const shown = Math.round(row.value * t);
      row.text.setText(fmt(shown) + row.suffix);
    });
  }

  private tallyStartedAt = 0;

  protected build(s: Readonly<GameState>): void {
    this.rows = [];
    this.stageBackdrop();
    this.staticNoise();
    this.scrimBlock(L.pad, L.stage.y + L.pad - 8, 480, 80);
    this.heading('신호 두절', 'wax');

    const run = s.today;
    const star = s.stars.find((x) => x.id === run?.starId);
    const persona = s.personas.find((p) => p.id === run?.personaId);
    const floor = run?.diedFloor ?? run?.currentFloor ?? 0;
    this.isRecord = recordBroken(this, floor, s.maxFloor);

    // 끊긴 화면의 잔상 — 가로줄이 위에서 아래로 옅어진다
    for (let i = 0; i < 10; i += 1) {
      this.rect(L.pad, L.stage.y + 96 + i * 26, L.W - L.pad * 2, L.line, i % 3 === 0 ? 'dust' : 'mid');
    }

    const ox = L.pad * 4;
    let oy = L.stage.y + 380;
    // 잡음 위에 그대로 얹으면 글자가 먹힌다 (본 아트가 오기 전에는 배경이 비어 있어서 몰랐다)
    this.scrimBlock(ox - 32, oy - 28, 1080, 380);
    this.title(ox, oy, `${persona?.displayName ?? '무명'} · ${star?.bodyName ?? '-'}`);
    oy += 88;
    this.title(ox, oy, `${floor}F 에서 끊겼다`, 'wax');
    oy += 80;
    this.text(ox, oy, run?.deathCause ?? '원인 불명', 'dust');
    oy += 64;
    this.text(ox, oy, `최고 기록 ${s.maxFloor} / ${content.balance.start.targetFloor}F`, 'dust');
    if (star !== undefined) {
      const lastWords = pickDialogue(star.id, 'DEATH', {
        floor,
        revives: totalRevivals(star.id, star.reviveCount),
        deaths: s.stats.totalDiscarded,
      }, (floor % 10) / 10);
      if (lastWords !== null) this.text(ox, oy + 48, this.clip(`“${lastWords.text}”`, 1000), 'bone').setScale(0.72);
    }

    if (this.stage >= 1 && this.isRecord) this.buildRecord(floor);
    if (this.stage >= 2) this.buildTally(s, floor);

    new Button(this, {
      x: L.W / 2 - 264, y: L.actionsFull.y + L.pad, w: 528, h: 96,
      // 검시실·발표 창은 뺐다 (사용자 확정) — 이 버튼 하나로 다음 날로 넘어간다
      label: '다음으로', hotkey: '1',
      onClick: () => this.store.dispatch({ type: 'PHASE/ADVANCE' }),
    // 노이즈보다 프레임과 글자까지 모두 앞에 와야 끝까지 읽고 누를 수 있다.
    }).setDepth(6000);
  }

  /**
   * 「신호 두절」 — 방송이 끊긴 화면.
   *
   * 잡음 한 장을 매 프레임 뒤집어 가며 쓴다. 프레임을 여러 장 두면 1920x936 텍스처가
   * 장수만큼 메모리에 남는데, 잡음은 **뒤집어도 여전히 잡음**이라 한 장이면 충분하다.
   * 가로줄이 흐르는 그림이라 상하 반전이 특히 다르게 보인다.
   */
  private staticNoise(): void {
    if (!this.hasArt('bg.death')) return;
    const img = this.add
      .image(L.stage.x, L.stage.y, key('bg.death'))
      .setOrigin(0, 0)
      .setDisplaySize(L.stage.w, L.stage.h);
    if (this.reduced) return;

    let step = 0;
    this.time.addEvent({
      delay: 110,
      loop: true,
      callback: () => {
        step += 1;
        img.setFlipX((step & 1) === 1).setFlipY((step & 2) === 2);
      },
    });
  }

  /** M08 「이 연출이 데모 영상의 클라이맥스다. 아끼지 마라」 */
  private buildRecord(floor: number): void {
    const w = 880;
    const h = 300;
    const x = L.W - w - L.pad * 4;
    const y = L.stage.y + 80;

    this.rect(x, y, w, h, 'ink');
    this.frame(x, y, w, h, 'bone');
    this.frame(x + 8, y + 8, w - 16, h - 16, 'wax');

    // 자간을 벌린다 — 간판처럼 읽혀야 한다
    this.title(x + 64, y + 36, 'N E W   R E C O R D', 'bone');
    this.add
      .text(x + w / 2, y + 106, `${floor} F`, {
        fontFamily: 'NeoDunggeunmo, monospace',
        fontSize: '144px',
        resolution: 1,
        color: '#' + PALETTE.wax.toString(16).padStart(6, '0'),
      })
      .setOrigin(0.5, 0);
    if (this.prevRecord !== null) this.text(x + 64, y + h - 52, `이전 기록 · ${this.prevRecord}F`, 'dust');

    if (this.reduced || this.flashes > 0) return;
    // 화면 전체 wax 플래시 3회 + 카메라 흔들림
    this.flashes = 3;
    playSfx(this, 'sfx.record', 0.9);
    const cam = this.cameras.main;
    for (let i = 0; i < 3; i += 1) {
      this.time.delayedCall(i * 220, () => cam.flash(140, 192, 57, 47, false));
    }
    cam.shake(400, 0.004);
  }

  /** 일일 정산 — 숫자는 하나씩 세어 올라간다 (M08) */
  private buildTally(s: Readonly<GameState>, floor: number): void {
    // 하단 액션 바(L.actionsFull.y = 936)를 넘지 않는다
    const w = 880;
    const h = 388;
    const x = L.W - w - L.pad * 4;
    const y = this.isRecord ? L.stage.y + 404 : L.stage.y + 96;

    this.rect(x, y, w, h, 'ink');
    this.frame(x, y, w, h, 'dust');
    this.label(x + 48, y + 28, `DAY ${s.day} 종료`, 'dust');

    // 화면은 계산하지 않는다 — core 가 today.income 에 적어 둔 원장을 읽기만 한다 (HO-012)
    const ledger = s.today?.income ?? { superchat: 0, shelf: 0, goods: 0 };
    const total = ledger.superchat + ledger.shelf + ledger.goods;
    const fansDelta = s.today?.fansDelta ?? 0;
    this.rows = [
      { label: '도달', value: floor, suffix: 'F', color: this.isRecord ? 'wax' : 'bone' },
      { label: '슈퍼챗', value: ledger.superchat, suffix: ' G', color: 'dust' },
      { label: '장비 판매', value: ledger.shelf, suffix: ' G', color: 'dust' },
      { label: '굿즈', value: ledger.goods, suffix: ' G', color: 'dust' },
      { label: '오늘 수입', value: total, suffix: ' G', color: 'bone' },
      { label: '팬', value: fansDelta, suffix: '', color: fansDelta < 0 ? 'wax' : 'bone' },
    ];
    this.rows.forEach((row, i) => {
      // 「오늘 수입」 위에 가로줄 — 합계라는 걸 선 하나로 말한다
      if (row.label === '오늘 수입') this.rect(x + 48, y + 62 + i * 48, w - 96, L.line, 'mid');
      const ry = y + 72 + i * 48;
      this.text(x + 48, ry, row.label, 'dust');
      row.text = this.textRight(x + w - 48, ry, '0' + row.suffix, row.color);
    });
    // 팬은 몇에서 몇이 됐는지가 더 중요하다
    this.label(x + 48, y + h - 34, `팬 ${fmtK(s.fans - fansDelta)} → ${fmtK(s.fans)}`, 'dust');
    this.tallyStartedAt = this.time.now;
  }
}

/**
 * 기록 갱신 판정. 정산이 끝나면 이전 최고층이 state 에 남지 않으므로,
 * `DayScene` 이 registry 에 넘겨 준 값과 FX 큐를 함께 본다.
 */
function recordBroken(scene: Phaser.Scene, floor: number, maxFloor: number): boolean {
  const fx = scene.registry.get('fx.recent') as { kinds: string[]; at: number } | undefined;
  if (fx !== undefined && scene.time.now - fx.at < 8000 && fx.kinds.includes('RECORD_BREAK')) return true;
  const prev = scene.registry.get('record.prev') as number | undefined;
  return prev !== undefined && floor >= maxFloor && maxFloor > prev;
}

/** 표시는 84.2K 형태 (02-DATA-SCHEMA §1) */
function fmtK(n: number): string {
  return n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n);
}

function fmt(n: number): string {
  return n >= 1000 || n <= -1000 ? n.toLocaleString('en-US') : String(n);
}
