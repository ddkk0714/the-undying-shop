import Phaser from 'phaser';
import { BASE_W, SCENES } from '../config';
import { PALETTE, css } from '../render/palette';
import { FONT } from '../render/font';
import { L } from '../ui/layout';
import { Button } from '../ui/Button';
import { label } from '../ui/Label';
import { reducedMotion } from '../ui/options';
import { DEATH_CURTAIN_MS } from './phases/LivePhase';
import { content, reputationGrade } from '../core/content';
import { currentRun, newRun } from './run';
import type { Store } from '../core/store';
import type { GameState, PhaseId } from '../core/types';

/**
 * M02 §6 의 Claude Code 파트 — 호스트 씬. HUD 를 소유하고 단계 씬을 갈아끼운다.
 *
 * ★ 이 씬은 state 를 직접 수정하지 않는다. dispatch 만 한다.
 * ★ 단계 씬(M04~M09)이 도착하면 PHASE_SCENE 표에 씬 키를 채우면 된다.
 *   그 전까지는 현재 단계를 글자로만 보여주고, 기본 선택으로 진행시킨다.
 */

const PHASE_LABEL: Record<PhaseId, string> = {
  REVIVE: '소생실',
  OFFICE: '편성실',
  LIVE: '생방송',
  DEATH: '사망',
  AUTOPSY: '검시',
  ANNOUNCE: '발표',
};

/** 단계 → 담당 씬 키 (v3 6단계). 골격은 `scenes/phases/` 에 있다. */
const PHASE_SCENE: Partial<Record<PhaseId, string>> = {
  REVIVE: SCENES.PHASE_REVIVE,
  OFFICE: SCENES.PHASE_OFFICE,
  LIVE: SCENES.PHASE_LIVE,
  DEATH: SCENES.PHASE_DEATH,
  AUTOPSY: SCENES.PHASE_AUTOPSY,
  ANNOUNCE: SCENES.PHASE_ANNOUNCE,
};

/** HUD 자원 칸 — 레퍼런스의 세로 구분선 3분할 */
const COLS = [
  { label: 'GOLD', x: 232 },
  { label: 'FANS', x: 456 },
  { label: 'REPUTATION', x: 616 },
] as const;

export class DayScene extends Phaser.Scene {
  private store!: Store;
  private hudLeft!: Phaser.GameObjects.Text;
  private hudRight!: Phaser.GameObjects.Text;
  private hudFloor!: Phaser.GameObjects.Text;
  private hudValues: Phaser.GameObjects.Text[] = [];
  private body!: Phaser.GameObjects.Text;
  private fxLine!: Phaser.GameObjects.Text;
  private unsubscribe: (() => void) | null = null;
  private launched: string | null = null;
  private fallback: Button[] = [];
  /** M06 §8 — 생방송→사망 교체를 지지직이 끝날 때까지 붙잡는다. 0 이면 지연 없음 */
  private swapAt = 0;
  private skipCurtain = false;
  /** 기록 갱신 연출용 — 정산이 끝나면 이전 최고층은 state 에서 사라진다 (M08) */
  private lastMaxFloor = -1;
  /** 도달 게이지 — 목표까지 차오른다. 신기록이면 눈에 보이게 밀려 올라간다 (M08 §연출) */
  private gauge!: Phaser.GameObjects.Graphics;
  private gaugeShown = 0;
  private gaugeTarget = 0;
  private gaugeFlashUntil = 0;

  constructor() {
    super(SCENES.DAY);
  }

  create(): void {
    // TitleScene 의 '새로 시작' 이 이미 만들어 뒀다. 씬을 직접 열었으면 여기서 만든다.
    this.store = currentRun(this.game) ?? newRun(this.game);

    this.cameras.main.setBackgroundColor(PALETTE.ink);

    // HUD (L.hud) — 상단 144px. 액자 박스 2개 (00-OVERVIEW §8-1)
    const g = this.add.graphics();
    g.fillStyle(PALETTE.ink, 1);
    g.fillRect(L.hud.x, L.hud.y, L.hud.w, L.hud.h);
    this.drawFrame(g, L.hudStatus.x, L.hudStatus.y, L.hudStatus.w, L.hudStatus.h);
    this.drawFrame(g, L.hudTools.x, L.hudTools.y, L.hudTools.w, L.hudTools.h);

    // 자원 라벨 3종 — 값은 render() 가 같은 x 에 채운다 (레퍼런스 배치)
    COLS.forEach((col, i) => {
      label(this, L.hudStatus.x + col.x, L.hudStatus.y + 18, col.label);
      this.hudValues[i] = this.add.text(L.hudStatus.x + col.x, L.hudStatus.y + 52, '', {
        ...FONT, color: css(col.label === 'REPUTATION' ? 'wax' : 'bone'),
      });
      if (i > 0) {
        g.fillStyle(PALETTE.dust, 1);
        g.fillRect(L.hudStatus.x + col.x - 24, L.hudStatus.y + 16, L.line, L.hudStatus.h - 32);
      }
    });

    this.hudLeft = this.add.text(L.hudStatus.x + 24, L.hudStatus.y + 30, '', { ...FONT, color: css('bone') });
    this.hudRight = this.add
      .text(L.hudTools.x + L.hudTools.w - 24, L.hudTools.y + 52, '', { ...FONT, color: css('bone') })
      .setOrigin(1, 0);
    this.hudFloor = this.add.text(L.hudTools.x + 24, L.hudTools.y + 52, '', { ...FONT, color: css('bone') });
    // 도달 게이지 — 글자 오른쪽 빈자리. 차오르는 게 보여야 기록이 기록으로 느껴진다
    this.gauge = this.add.graphics();

    // 본문 (L.stage) — 단계 씬이 들어올 자리
    this.body = this.add
      .text(BASE_W / 2, L.stage.y + 200, '', { ...FONT, color: css('dust'), align: 'center' })
      .setOrigin(0.5, 0);

    this.fxLine = this.add
      .text(BASE_W / 2, L.stage.y + 600, '', { ...FONT, color: css('dust') })
      .setOrigin(0.5, 0);

    // 폴백 조작 — 단계 씬이 붙어 있는 동안에는 숨긴다.
    // 숨기기만 하면 핫키가 남아 단계 씬의 1/2 와 겹치므로 setActive(false) 까지 한다.
    this.fallback = [
      new Button(this, {
        x: 336, y: L.actionsFull.y + L.pad, w: 528, h: 96,
        label: '다음 단계', hotkey: '1',
        onClick: () => this.advancePhase(),
      }),
      new Button(this, {
        x: 1056, y: L.actionsFull.y + L.pad, w: 528, h: 96,
        label: '타이틀로', hotkey: '2', variant: 'ghost',
        onClick: () => this.scene.start(SCENES.TITLE),
      }),
    ];

    this.render(this.store.getState());
    this.unsubscribe = this.store.subscribe((s) => this.render(s));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribe?.();
      this.unsubscribe = null;
    });
  }

  /**
   * v3 에는 PHASE/TIMEOUT 이 없다 (CCR-001). 단계 씬이 아직 없으므로,
   * 편성실에서 출연자가 안 정해졌으면 첫 생존자로 자리만 채우고 다음 단계로 보낸다.
   * 규칙이 아니라 셸의 기본 선택이다 — 단계 씬이 오면 이 분기는 사라진다.
   */
  private advancePhase(): void {
    const s = this.store.getState();
    if (s.phase === 'OFFICE' && s.today === null) {
      const star = s.stars.find((x) => x.status === 'ALIVE');
      if (star !== undefined) this.store.dispatch({ type: 'OFFICE/PICK_STAR', starId: star.id });
    }
    this.store.dispatch({ type: 'PHASE/ADVANCE' });
  }

  /** M02 §6 — pendingFx 를 매 프레임 확인하고 소비한다. */
  override update(): void {
    if (this.swapAt > 0 && (this.skipCurtain || this.time.now >= this.swapAt)) {
      const s = this.store.getState();
      this.swap(s.isOver ? undefined : PHASE_SCENE[s.phase]);
    }
    this.drawGauge();

    const fx = this.store.getState().pendingFx;
    if (fx.length === 0) return;
    // 단계 씬이 소비할 수 있게 남겨 둔다 — 여기서 비우면 그쪽은 볼 기회가 없다 (M02 §6)
    this.registry.set('fx.recent', { kinds: fx.map((e) => e.kind), at: this.time.now });
    this.fxLine.setText(fx.map((e) => e.kind).join('  '));
    this.store.dispatch({ type: 'FX/CONSUME' });
  }

  /**
   * 도달 게이지 n/40. 값이 오르면 **차오르는 게 보이도록** 프레임마다 조금씩 따라간다.
   * 신기록 직후 1.4초 동안은 wax 로 칠한다 (M08 §RECORD_BREAK 「HUD 게이지가 차오름」).
   */
  private drawGauge(): void {
    const target = content.balance.start.targetFloor;
    if (Math.abs(this.gaugeShown - this.gaugeTarget) > 0.05) {
      this.gaugeShown += (this.gaugeTarget - this.gaugeShown) * 0.08;
    } else {
      this.gaugeShown = this.gaugeTarget;
    }

    const x = L.hudTools.x + 240;
    const y = L.hudTools.y + 58;
    const w = 520;
    const h = 16;
    const ratio = target <= 0 ? 0 : Math.max(0, Math.min(1, this.gaugeShown / target));
    const hot = this.time.now < this.gaugeFlashUntil;

    const g = this.gauge;
    g.clear();
    g.fillStyle(PALETTE.ink, 1);
    g.fillRect(x, y, w, h);
    g.fillStyle(hot ? PALETTE.wax : PALETTE.bone, 1);
    g.fillRect(x, y, Math.round(w * ratio), h);
    g.fillStyle(PALETTE.dust, 1);
    g.fillRect(x, y, w, L.line);
    g.fillRect(x, y + h - L.line, w, L.line);
    g.fillRect(x, y, L.line, h);
    g.fillRect(x + w - L.line, y, L.line, h);
  }

  /** 04-UI-KIT §2-2 — HUD 이중선 액자 (바깥 bone 2px + 안쪽 dust 2px) */
  private drawFrame(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
    const t = L.line;
    for (const [color, ox] of [[PALETTE.bone, 0], [PALETTE.dust, 6]] as const) {
      g.fillStyle(color, 1);
      g.fillRect(x + ox, y + ox, w - ox * 2, t);
      g.fillRect(x + ox, y + h - ox - t, w - ox * 2, t);
      g.fillRect(x + ox, y + ox, t, h - ox * 2);
      g.fillRect(x + w - ox - t, y + ox, t, h - ox * 2);
    }
  }

  private render(s: Readonly<GameState>): void {
    // 최고층이 갱신되는 순간 직전 값을 넘겨 준다. DeathPhase 의 「이전 기록」 표시용
    if (this.lastMaxFloor >= 0 && s.maxFloor !== this.lastMaxFloor) {
      this.registry.set('record.prev', this.lastMaxFloor);
      this.gaugeFlashUntil = this.time.now + 1400;
    }
    if (this.lastMaxFloor < 0) this.gaugeShown = s.maxFloor; // 첫 그림은 차오르지 않는다
    this.lastMaxFloor = s.maxFloor;
    this.gaugeTarget = s.maxFloor;

    this.hudLeft.setText(`DAY ${s.day}\n/${content.balance.start.days}`);
    this.hudValues[0]?.setText(`${fmtGold(s.gold)} G`);
    this.hudValues[1]?.setText(fmtFans(s.fans));
    this.hudValues[2]?.setText(reputationGrade(s.reputation));
    this.hudFloor.setText(`${s.maxFloor} / ${content.balance.start.targetFloor} F`);
    this.hudRight.setText(s.isOver ? '종료' : PHASE_LABEL[s.phase]);

    this.syncPhaseScene(s);

    // 단계 씬이 화면을 맡으면 셸의 폴백 UI 는 물러난다.
    const hosted = !s.isOver && PHASE_SCENE[s.phase] !== undefined;
    this.body.setVisible(!hosted);
    for (const button of this.fallback) button.setVisible(!hosted).setActive(!hosted);

    if (s.isOver) {
      this.body.setText(`8일이 끝났다\n엔딩 ${s.ending ?? '-'}\n최고 ${s.stats.deepestFloor}F`);
      return;
    }
    if (hosted) return;

    const star = s.today === null ? null : s.stars.find((x) => x.id === s.today?.starId) ?? null;
    this.body.setText(
      [
        `${PHASE_LABEL[s.phase]} 단계`,
        star === null ? '오늘의 스타 미정' : `오늘의 스타 · ${star.bodyName}`,
        '단계 씬 미구현 — 기본 선택으로 진행한다',
      ].join('\n'),
    );
  }

  /** 단계 씬이 등록돼 있으면 갈아끼운다. 없으면 아무것도 하지 않는다. */
  private syncPhaseScene(s: Readonly<GameState>): void {
    const want = s.isOver ? undefined : PHASE_SCENE[s.phase];
    if (want === this.launched) return;

    // M06 §8 — 용사가 죽어도 생방송 화면을 1.8초 더 붙잡는다. 그 위에서 LivePhase 가
    // 지지직을 그린다. 셸이 단계를 바로 갈아끼우면 그 연출이 통째로 사라진다.
    if (this.launched === SCENES.PHASE_LIVE && want === SCENES.PHASE_DEATH && !reducedMotion(this.registry)) {
      if (this.swapAt === 0) this.armCurtain();
      return;
    }
    this.swap(want);
  }

  private armCurtain(): void {
    this.swapAt = this.time.now + DEATH_CURTAIN_MS;
    this.skipCurtain = false;
    // 스킵 — 심사자가 기다릴 이유가 없다 (M06 §11)
    this.input.keyboard?.once('keydown', () => { this.skipCurtain = true; });
    this.input.once('pointerdown', () => { this.skipCurtain = true; });
  }

  private swap(want: string | undefined): void {
    if (this.swapAt > 0) {
      this.input.keyboard?.off('keydown');
      this.swapAt = 0;
      this.skipCurtain = false;
    }
    if (want === this.launched) return;
    if (this.launched !== null) this.scene.stop(this.launched);
    if (want !== undefined) this.scene.launch(want);
    this.launched = want ?? null;
  }
}

/** 표시는 84.2K 형태 (02-DATA-SCHEMA §1) */
function fmtFans(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function fmtGold(n: number): string {
  return n.toLocaleString('en-US');
}


