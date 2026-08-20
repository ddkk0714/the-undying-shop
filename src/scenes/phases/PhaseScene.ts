import Phaser from 'phaser';
import { PALETTE, css, type PaletteName } from '../../render/palette';
import { FONT } from '../../render/font';
import { L } from '../../ui/layout';
import { currentRun, newRun } from '../run';
import type { Store } from '../../core/store';
import type { GameState } from '../../core/types';

/**
 * 단계 씬 공통 골격 (M02 §6).
 *
 * ★ 규칙·수식은 여기 없다. state 를 읽고 dispatch 만 한다.
 * ★ DayScene 이 phase 에 맞춰 launch/stop 한다. 씬은 자기 영역만 그린다.
 *
 * state 가 바뀌면 통째로 다시 그린다. 오브젝트가 수십 개 수준이라 부분 갱신보다 안전하다.
 * 다시 그리는 시점은 dispatch 직후가 아니라 다음 프레임이다 — 버튼이 자기 콜백 안에서
 * 파괴되면 Phaser 의 입력 디스패치 중간에 죽는다.
 */
export abstract class PhaseScene extends Phaser.Scene {
  protected store!: Store;
  private unsubscribe: (() => void) | null = null;
  private dirty = false;

  create(): void {
    this.store = currentRun(this.game) ?? newRun(this.game);
    this.redraw();
    this.unsubscribe = this.store.subscribe(() => {
      this.dirty = true;
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribe?.();
      this.unsubscribe = null;
    });
  }

  override update(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.redraw();
  }

  protected redraw(): void {
    this.input.keyboard?.removeAllListeners(); // Button 이 등록한 핫키까지 함께 정리한다
    this.children.removeAll(true);
    this.build(this.store.getState());
  }

  /** 각 단계가 자기 화면을 그린다. */
  protected abstract build(s: Readonly<GameState>): void;

  /* ── 공통 그리기 도구 ─────────────────────────────────── */

  /** 단계 본문 영역(L.stage)을 덮는 배경. HUD 는 DayScene 이 계속 소유한다. */
  protected stageBackdrop(): void {
    this.rect(L.stage.x, L.stage.y, L.stage.w, L.stage.h, 'soot');
  }

  protected rect(x: number, y: number, w: number, h: number, color: PaletteName): void {
    const g = this.add.graphics();
    g.fillStyle(PALETTE[color], 1);
    g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  /** 04-UI-KIT §2-2 — 1px 하드 엣지. panel() 과 같은 규칙, 씬 안에서 쓰기 편한 형태 */
  protected frame(x: number, y: number, w: number, h: number, color: PaletteName = 'line'): void {
    const g = this.add.graphics();
    g.fillStyle(PALETTE[color], 1);
    const X = Math.round(x);
    const Y = Math.round(y);
    g.fillRect(X, Y, w, 1);
    g.fillRect(X, Y + h - 1, w, 1);
    g.fillRect(X, Y, 1, h);
    g.fillRect(X + w - 1, Y, 1, h);
  }

  protected text(x: number, y: number, s: string, color: PaletteName = 'bone'): Phaser.GameObjects.Text {
    return this.add.text(Math.round(x), Math.round(y), s, { ...FONT, color: css(color) });
  }

  protected textRight(x: number, y: number, s: string, color: PaletteName = 'bone'): Phaser.GameObjects.Text {
    return this.text(x, y, s, color).setOrigin(1, 0);
  }

  /**
   * 04-UI-KIT §3 — 16px 단일 폰트. 한글 1자 = 16px, 그 외 = 8px 로 세어
   * 주어진 폭(px) 안에 들어가도록 자른다. 넘치면 마지막 자리에 · 를 남긴다.
   *
   * Phaser 의 wordWrap 은 공백 기준이라 한글에서 어긋난다. 그래서 글자 수로 센다.
   */
  protected clip(s: string, px: number): string {
    let used = 0;
    for (let i = 0; i < s.length; i += 1) {
      const w = charWidth(s[i]!);
      if (used + w > px) return s.slice(0, Math.max(0, i - 1)) + '·';
      used += w;
    }
    return s;
  }

  /** 단계 제목 — 본문 좌상단 고정 위치 */
  protected heading(s: string, color: PaletteName = 'bone'): void {
    this.text(L.pad + 2, L.stage.y + L.pad, s, color);
  }
}

/** 전각(한글·기호) 16px, 반각 8px */
function charWidth(ch: string): number {
  return ch.charCodeAt(0) > 0x2000 ? 16 : 8;
}
