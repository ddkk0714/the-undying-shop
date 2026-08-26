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

/** 한 줄이 최소로 차지하는 높이. 두 줄로 접히면 그만큼 늘어난다 */
const ROW_MIN_H = 26;
/** 줄 사이 간격 */
const ROW_GAP = 6;

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
    // 줄은 12개를 미리 만들어 두고 **아래에서 위로** 쌓는다. 상자를 넘치는 줄은
    // 그리지 않는다 — 예전에는 상자 높이로 줄 수를 세었는데, 그러면 접힌 줄(2줄짜리)을
    // 세지 못해 개수가 어긋난다.
    for (let i = 0; i < TICKER_ROWS; i += 1) {
      const y = box.y + i * ROW_MIN_H;
      // 16px 본문. 32px 로 키워 뒀더니 긴 말이 잘려 나가고 창의 절반만 찼다 (실측)
      const text = scene.add
        .text(box.x, y, '', {
          ...FONT_LABEL,
          color: css('dust'),
          // 접힌 줄은 그냥 두면 행간이 0 이라 한글 글자상자가 서로 맞닿아 뭉개진다.
          // 줄 높이는 `render` 가 `text.height` 로 다시 재므로 벌려도 자리는 안 어긋난다
          lineSpacing: 6,
          wordWrap: { width: box.w - 56, useAdvancedWrap: true },
        })
        .setVisible(false);

      // 삭제 버튼 — 줄 오른쪽 끝. 32x32 라 손가락으로도 눌린다
      const hit = scene.add
        .rectangle(box.x + box.w - 40, y, 32, 32, PALETTE.ink, 0.01)
        .setOrigin(0, 0)
        .setVisible(false)
        .setInteractive({ useHandCursor: true });
      const mark = scene.add.graphics().setVisible(false);

      hit.on('pointerover', () => this.paintMark(mark, hit.x, hit.y, true));
      hit.on('pointerout', () => this.paintMark(mark, hit.x, hit.y, false));
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
   * 오브젝트를 만들지 않는다. 내용과 자리만 바꾼다.
   *
   * ★ 예전에는 `offset = TICKER_ROWS - live.length` 로 자리를 잡았다.
   *   그런데 실제 줄 수는 상자 높이에 따라 12보다 적을 수 있어서, 줄이 9개인데
   *   상수 12로 빼면 앞쪽 3개가 음수 인덱스로 떨어져 **그냥 사라졌다.**
   *   메시지 7개 중 4개만 뜨던 「채팅창의 절반만 찬다」가 이것이다.
   *   이제 자리는 아래에서 위로 쌓으면서 정한다 — 상수를 안 쓴다.
   */
  render(queue: readonly ChatMessage[]): void {
    const live = queue.filter((m) => !m.removed).slice(-this.rows.length);
    const shown = live.length;

    // 먼저 내용을 넣어 높이를 재고(접히면 두 줄이 된다), 그 다음 아래부터 쌓는다
    let y = this.box.y + this.box.h;
    for (let j = shown - 1; j >= 0; j -= 1) {
      const msg = live[j]!;
      const row = this.rows[shown - 1 - j]!;
      const deletable = msg.leakPower > 0;
      const money = msg.amount === undefined ? '' : ` +${msg.amount}G`;
      row.text
        .setText(`${msg.nick}: ${msg.text}${money}`)
        // TRUTH 는 진실이 새어나가는 줄이다. 즉시 눈에 띄어야 한다 (M07)
        .setColor(css(msg.tone === 'TRUTH' || msg.tone === 'SUPERCHAT' ? 'wax' : 'dust'));

      const h = Math.max(ROW_MIN_H, Math.ceil(row.text.height));
      y -= h + ROW_GAP;
      if (y < this.box.y) {
        // 상자를 넘겼다 — 이 줄부터는 안 보인다
        row.id = null;
        row.text.setVisible(false);
        row.hit.setVisible(false);
        row.mark.setVisible(false).clear();
        y += h + ROW_GAP;
        continue;
      }

      row.id = deletable ? msg.id : null;
      row.text.setPosition(this.box.x, y).setVisible(true);
      // 지울 수 있는 줄에만 ✕ 를 붙인다. 눌리는데 아무 일도 안 일어나는 버튼이 제일 나쁘다.
      // core 의 moderateChat 은 진실·의심 톤만 받는다 — 그 줄만 leakPower 가 0 보다 크다 (HO-015)
      row.hit.setPosition(this.box.x + this.box.w - 40, y).setVisible(deletable);
      if (deletable) this.paintMark(row.mark, this.box.x + this.box.w - 40, y, false);
      else row.mark.setVisible(false).clear();
    }

    for (let i = shown; i < this.rows.length; i += 1) {
      const row = this.rows[i]!;
      row.id = null;
      row.text.setVisible(false);
      row.hit.setVisible(false);
      row.mark.setVisible(false).clear();
    }
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

