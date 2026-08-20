import Phaser from 'phaser';
import { BASE_W, SCENES } from '../config';
import { PALETTE, css } from '../render/palette';
import { FONT } from '../render/font';
import { L } from '../ui/layout';
import { Button } from '../ui/Button';
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
  CASTING: '캐스팅',
  SHOP: '진열',
  DIVE: '하강',
  DEATH: '사망',
  AUTOPSY: '검시',
  ANNOUNCE: '발표',
};

/** 단계 → 담당 씬 키. M04~M09 가 도착하면 여기만 채운다. */
const PHASE_SCENE: Partial<Record<PhaseId, string>> = {};

export class DayScene extends Phaser.Scene {
  private store!: Store;
  private hudLeft!: Phaser.GameObjects.Text;
  private hudRight!: Phaser.GameObjects.Text;
  private body!: Phaser.GameObjects.Text;
  private fxLine!: Phaser.GameObjects.Text;
  private unsubscribe: (() => void) | null = null;
  private launched: string | null = null;

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

    new Button(this, {
      x: 84, y: L.actions.y + 8, w: 132, h: 24,
      label: '다음 단계', hotkey: '1',
      onClick: () => this.store.dispatch({ type: 'PHASE/TIMEOUT' }),
    });
    new Button(this, {
      x: 264, y: L.actions.y + 8, w: 132, h: 24,
      label: '타이틀로', hotkey: '2', variant: 'ghost',
      onClick: () => this.scene.start(SCENES.TITLE),
    });

    this.render(this.store.getState());
    this.unsubscribe = this.store.subscribe((s) => this.render(s));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribe?.();
      this.unsubscribe = null;
    });
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
      `DAY ${s.day}/8   ${fmtGold(s.gold)}G   팬 ${fmtFans(s.fans)}   최고 ${s.maxFloor}/40F`,
    );
    this.hudRight.setText(s.isOver ? '종료' : PHASE_LABEL[s.phase]);

    this.syncPhaseScene(s);

    if (s.isOver) {
      this.body.setText(`8일이 끝났다\n엔딩 ${s.ending ?? '-'}\n최고 ${s.stats.deepestFloor}F`);
      return;
    }

    const star = s.today === null ? null : s.stars.find((x) => x.id === s.today?.starId) ?? null;
    this.body.setText(
      [
        `${PHASE_LABEL[s.phase]} 단계`,
        star === null ? '오늘의 스타 미정' : `오늘의 스타 · ${star.bodyName}`,
        PHASE_SCENE[s.phase] === undefined ? '단계 씬 미구현 — 기본 선택으로 진행한다' : '',
      ]
        .filter((line) => line !== '')
        .join('\n'),
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
