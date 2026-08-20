import Phaser from 'phaser';
import { BASE_W, SCENES } from '../config';
import { PALETTE, css } from '../render/palette';
import { FONT } from '../render/font';
import { L } from '../ui/layout';
import { Button } from '../ui/Button';
import { fakeStore, type Store } from './__fake/FakeStore';

/**
 * M02 §6 의 Claude Code 파트 — 호스트 씬. HUD 를 소유하고 단계 씬을 갈아끼운다.
 *
 * ★ 지금은 FakeStore 를 본다 (07-PARALLEL-DEV §5-3).
 *   Codex 의 core/store.ts 가 도착하면 아래 import 한 줄만 바꾼다.
 * ★ 이 씬은 state 를 직접 수정하지 않는다. dispatch 만 한다.
 */
export class DayScene extends Phaser.Scene {
  private store: Store = fakeStore;
  private hudText!: Phaser.GameObjects.Text;
  private unsubscribe: (() => void) | null = null;

  constructor() {
    super(SCENES.DAY);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PALETTE.soot);

    // HUD (L.hud) — 상단 26px
    const g = this.add.graphics();
    g.fillStyle(PALETTE.ash, 1);
    g.fillRect(L.hud.x, L.hud.y, L.hud.w, L.hud.h);
    g.fillStyle(PALETTE.line, 1);
    g.fillRect(L.hud.x, L.hud.y + L.hud.h - 1, L.hud.w, 1);

    this.hudText = this.add.text(L.pad, 5, '', { ...FONT, color: css('bone') });

    // 본문 (L.stage)
    this.add
      .text(BASE_W / 2, 110, '하루 사이클 · 단계 씬이 여기 들어온다', { ...FONT, color: css('dust') })
      .setOrigin(0.5);
    this.add
      .text(BASE_W / 2, 132, 'core 미도착 — FakeStore 로 표시 중', { ...FONT, color: css('tallow') })
      .setOrigin(0.5);

    new Button(this, {
      x: BASE_W / 2 - 66, y: L.actions.y + 8, w: 132, h: 24,
      label: '타이틀로', hotkey: '1', variant: 'ghost',
      onClick: () => this.scene.start(SCENES.TITLE),
    });

    this.renderHud();
    this.unsubscribe = this.store.subscribe(() => this.renderHud());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribe?.();
      this.unsubscribe = null;
    });
  }

  private renderHud(): void {
    const s = this.store.getState();
    this.hudText.setText(
      `DAY ${s.day}/8   ${fmtGold(s.gold)}G   팬 ${fmtFans(s.fans)}   최고 ${s.maxFloor}/40F`,
    );
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
