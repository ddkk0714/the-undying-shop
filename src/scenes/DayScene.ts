import Phaser from 'phaser';
import { BASE_W, SCENES } from '../config';
import { PALETTE, css } from '../render/palette';
import { FONT } from '../render/font';
import { L } from '../ui/layout';
import { Button } from '../ui/Button';
import { content } from '../core/content';
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

export class DayScene extends Phaser.Scene {
  private store!: Store;
  private hudLeft!: Phaser.GameObjects.Text;
  private hudRight!: Phaser.GameObjects.Text;
  private body!: Phaser.GameObjects.Text;
  private fxLine!: Phaser.GameObjects.Text;
  private unsubscribe: (() => void) | null = null;
  private launched: string | null = null;
  private fallback: Button[] = [];

  constructor() {
    super(SCENES.DAY);
  }

  create(): void {
    // TitleScene 의 '새로 시작' 이 이미 만들어 뒀다. 씬을 직접 열었으면 여기서 만든다.
    this.store = currentRun(this.game) ?? newRun(this.game);

    this.cameras.main.setBackgroundColor(PALETTE.soot);

    // HUD (L.hud) — 상단 26px
    const g = this.add.graphics();
    g.fillStyle(PALETTE.ash, 1);
    g.fillRect(L.hud.x, L.hud.y, L.hud.w, L.hud.h);
    g.fillStyle(PALETTE.line, 1);
    g.fillRect(L.hud.x, L.hud.y + L.hud.h - 1, L.hud.w, 1);

    this.hudLeft = this.add.text(L.pad, 5, '', { ...FONT, color: css('bone') });
    this.hudRight = this.add
      .text(L.hud.w - L.pad, 5, '', { ...FONT, color: css('tallow') })
      .setOrigin(1, 0);

    // 본문 (L.stage) — 단계 씬이 들어올 자리
    this.body = this.add
      .text(BASE_W / 2, 96, '', { ...FONT, color: css('dust'), align: 'center' })
      .setOrigin(0.5, 0);

    this.fxLine = this.add
      .text(BASE_W / 2, 196, '', { ...FONT, color: css('dust') })
      .setOrigin(0.5, 0);

    // 폴백 조작 — 단계 씬이 붙어 있는 동안에는 숨긴다.
    // 숨기기만 하면 핫키가 남아 단계 씬의 1/2 와 겹치므로 setActive(false) 까지 한다.
    this.fallback = [
      new Button(this, {
        x: 84, y: L.actions.y + 8, w: 132, h: 24,
        label: '다음 단계', hotkey: '1',
        onClick: () => this.advancePhase(),
      }),
      new Button(this, {
        x: 264, y: L.actions.y + 8, w: 132, h: 24,
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
    const fx = this.store.getState().pendingFx;
    if (fx.length === 0) return;
    // 연출 모듈이 아직 없다. 지금은 무엇이 큐에 쌓였는지 화면에 남기고 비운다.
    this.fxLine.setText(fx.map((e) => e.kind).join('  '));
    this.store.dispatch({ type: 'FX/CONSUME' });
  }

  private render(s: Readonly<GameState>): void {
    this.hudLeft.setText(
      `DAY ${s.day}/${content.balance.start.days}   ${fmtGold(s.gold)}G   팬 ${fmtFans(s.fans)}   최고 ${s.maxFloor}/${content.balance.start.targetFloor}F`,
    );
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
