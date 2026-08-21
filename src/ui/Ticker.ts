import Phaser from 'phaser';
import { PALETTE, css } from '../render/palette';
import { FONT_LABEL } from '../render/font';
import { L } from './layout';
import type { ChatMessage } from '../core/types';

/**
 * 04-UI-KIT §컴포넌트 표 — 「아래→위 스크롤 텍스트 풀 (채팅). **최대 12개 풀링**」
 *
 * 채팅은 초당 한두 개씩 들어오고 씬은 state 가 바뀔 때마다 통째로 다시 그린다.
 * 메시지마다 Text 를 새로 만들면 30초에 수십 개가 생성·파괴된다. 그래서 **줄을 미리 12개 만들어
 * 두고 내용만 갈아끼운다.** 이 파일이 만드는 Text 는 평생 12개다.
 *
 * 각 줄에는 삭제 버튼이 붙는다 (M07). 클릭 영역은 32x32 — 수용 기준의 16x16 이상이다.
 * ✕ 표시는 Graphics 로 그린다. Text 개수를 늘리지 않기 위해서다.
 */

export const TICKER_ROWS = 12;

const ROW_H = 44;

interface Row {
  text: Phaser.GameObjects.Text;
  hit: Phaser.GameObjects.Rectangle;
  mark: Phaser.GameObjects.Graphics;
  id: string | null;
}

export class Ticker {
  private rows: Row[] = [];
  private box: { x: number; y: number; w: number; h: number };

  constructor(
    scene: Phaser.Scene,
    box: { x: number; y: number; w: number; h: number },
    private readonly onDelete: (id: string) => void,
  ) {
    this.box = box;
    for (let i = 0; i < TICKER_ROWS; i += 1) {
      const y = box.y + i * ROW_H;
      const text = scene.add
        .text(box.x, y, '', { ...FONT_LABEL, fontSize: '32px', color: css('dust') })
        .setVisible(false);

      // 삭제 버튼 — 줄 오른쪽 끝. 32x32 라 손가락으로도 눌린다
      const hit = scene.add
        .rectangle(box.x + box.w - 40, y, 32, 32, PALETTE.ink, 0.01)
        .setOrigin(0, 0)
        .setVisible(false)
        .setInteractive({ useHandCursor: true });
      const mark = scene.add.graphics().setVisible(false);

      hit.on('pointerover', () => this.paintMark(mark, box.x + box.w - 40, y, true));
      hit.on('pointerout', () => this.paintMark(mark, box.x + box.w - 40, y, false));
      hit.on('pointerup', () => {
        const id = this.rows[i]?.id;
        if (id !== null && id !== undefined) this.onDelete(id);
      });

      this.rows.push({ text, hit, mark, id: null });
    }
  }

  /** 씬이 다시 그려도 파괴되지 않게 등록할 목록 */
  objects(): Phaser.GameObjects.GameObject[] {
    return this.rows.flatMap((r) => [r.text, r.hit, r.mark]);
  }

  /** 28F 침묵처럼 통째로 숨겨야 할 때 */
  hideAll(): void {
    for (const row of this.rows) {
      row.id = null;
      row.text.setVisible(false);
      row.hit.setVisible(false);
      row.mark.setVisible(false).clear();
    }
  }

  /**
   * 큐를 줄에 얹는다. **아래가 최신이다** — 새 메시지가 아래에서 올라온다.
   * 오브젝트를 만들지 않는다. 내용과 보임 여부만 바꾼다.
   */
  render(queue: readonly ChatMessage[]): void {
    const live = queue.filter((m) => !m.removed).slice(-TICKER_ROWS);
    const offset = TICKER_ROWS - live.length; // 아래쪽부터 채운다

    this.rows.forEach((row, i) => {
      const msg = i >= offset ? live[i - offset] : undefined;
      if (msg === undefined) {
        row.id = null;
        row.text.setVisible(false);
        row.hit.setVisible(false);
        row.mark.setVisible(false).clear();
        return;
      }
      // 지울 수 있는 줄에만 ✕ 를 붙인다. 눌리는데 아무 일도 안 일어나는 버튼이 제일 나쁘다.
      // core 의 moderateChat 은 진실·의심 톤만 받는다 — 그 줄만 leakPower 가 0 보다 크다 (HO-015)
      const deletable = msg.leakPower > 0;
      row.id = deletable ? msg.id : null;
      const money = msg.amount === undefined ? '' : ` +${msg.amount}G`;
      row.text
        .setText(clip(`${msg.nick}: ${msg.text}${money}`, this.box.w - 56))
        // TRUTH 는 진실이 새어나가는 줄이다. 즉시 눈에 띄어야 한다 (M07)
        .setColor(css(msg.tone === 'TRUTH' || msg.tone === 'SUPERCHAT' ? 'wax' : 'dust'))
        .setVisible(true);
      row.hit.setVisible(deletable);
      if (deletable) this.paintMark(row.mark, this.box.x + this.box.w - 40, this.box.y + i * ROW_H, false);
      else row.mark.setVisible(false).clear();
    });
  }

  /** ✕ — Text 를 쓰지 않는다. 풀 개수를 12개로 묶어 두기 위해서다 */
  private paintMark(g: Phaser.GameObjects.Graphics, x: number, y: number, hot: boolean): void {
    g.clear();
    g.setVisible(true);
    g.fillStyle(hot ? PALETTE.wax : PALETTE.mid, 1);
    for (let i = 0; i < 14; i += 1) {
      g.fillRect(x + 9 + i, y + 9 + i, L.line, L.line);
      g.fillRect(x + 22 - i, y + 9 + i, L.line, L.line);
    }
  }
}

/** 04-UI-KIT §3 과 같은 규칙 — 전각 2 · 반각 1, 본문 32px */
function clip(s: string, px: number): string {
  let used = 0;
  for (let i = 0; i < s.length; i += 1) {
    const w = (s.charCodeAt(i) > 0x2000 ? 2 : 1) * 16;
    if (used + w > px) return s.slice(0, Math.max(0, i - 1)) + '·';
    used += w;
  }
  return s;
}
