import Phaser from 'phaser';
import { BASE_W, SCENES } from '../config';
import { content } from '../core/content';
import { PALETTE, css } from '../render/palette';
import { FONT, FONT_LABEL, FONT_TITLE } from '../render/font';
import { L } from '../ui/layout';
import { Button } from '../ui/Button';
import { reducedMotion } from '../ui/options';
import { currentRun } from './run';
import type { GameState } from '../core/types';

/**
 * M11 §3·§4 — 엔딩과 성적표.
 *
 * 두 장면이다.
 *   1) 엔딩 — `content/narrative.ko.json` 의 문장을 그대로 읽는다. 씬이 글을 짓지 않는다.
 *   2) 성적표 — 「당신이 한 일」. 마지막 줄이 **「그들은 아무도 모른다.」**
 *      M11 이 「이 한 줄이 게임의 마지막 문장이다」라고 못박은 것.
 *
 * 엔딩 A 는 스타 목록이 한 줄씩 지워진다. **아무것도 설명하지 않는다.**
 */

interface EndingText {
  title: string;
  lines: string[];
  choices?: string[];
  starRemovalSeconds?: number;
}

export class EndingScene extends Phaser.Scene {
  private state!: GameState;
  private stage: 'ending' | 'card' = 'ending';
  private erased = 0;

  constructor() {
    super(SCENES.ENDING);
  }

  create(): void {
    const store = currentRun(this.game);
    if (store === null) {
      this.scene.start(SCENES.TITLE);
      return;
    }
    this.state = store.getState();
    this.stage = 'ending';
    this.erased = 0;
    this.cameras.main.setBackgroundColor(PALETTE.ink);
    this.draw();
  }

  private toCard(): void {
    if (this.stage === 'card') return;
    this.stage = 'card';
    this.draw();
  }

  private draw(): void {
    this.input.keyboard?.removeAllListeners();
    this.children.removeAll(true);
    if (this.stage === 'ending') this.drawEnding();
    else this.drawCard();
  }

  /* ── 엔딩 ─────────────────────────────────────────────── */

  private drawEnding(): void {
    const s = this.state;
    const early = s.day < content.balance.start.days;
    const text = early ? null : endingText(s.ending);

    let y = 200;
    if (text === null) {
      // 조기 종료 — 문을 닫는다. narrative 에 없는 상황이라 여기서 말한다 (HO-011)
      this.title(BASE_W / 2, y, '가게를 닫는다', 'wax');
      y += 120;
      for (const line of ['내보낼 사람이 없다.', '되살릴 돈도 없다.', '', '문을 잠그고 장부를 덮는다.']) {
        this.body(BASE_W / 2, y, line);
        y += 56;
      }
    } else {
      this.label(BASE_W / 2, 150, text.title, 'dust');
      for (const line of text.lines) {
        this.body(BASE_W / 2, y, line);
        y += 56;
      }
      // 엔딩 A — 스타 목록이 한 줄씩 지워진다 (M11 §3)
      if (s.ending === 'A_OPEN') this.drawStarRemoval(y + 40, text.starRemovalSeconds ?? 1.2);
      // 엔딩 B — 어느 쪽을 골라도 끊기지 않는다. 버튼이 반응하지 않는다
      if (s.ending === 'B_REVEAL' && text.choices !== undefined) {
        text.choices.forEach((choice, i) => {
          this.add
            .text(BASE_W / 2 + (i === 0 ? -320 : 40), y + 60, `[ ${choice} ]`, { ...FONT, color: css('dust') })
            .setOrigin(0, 0);
        });
      }
    }

    new Button(this, {
      x: BASE_W / 2 - 264, y: L.actionsFull.y + L.pad, w: 528, h: 96,
      label: '당신이 한 일', hotkey: '1',
      onClick: () => this.toCard(),
    });
  }

  /** 스타 목록이 1.2초 간격으로 한 줄씩 덮인다 */
  private drawStarRemoval(top: number, seconds: number): void {
    const names = this.state.stars.map((star) => {
      const persona = this.state.personas.find((p) => p.id === star.personaId);
      return persona?.displayName ?? star.bodyName;
    });
    names.forEach((name, i) => {
      const gone = i < this.erased;
      this.add
        .text(BASE_W / 2 - 200, top + i * 48, `${name}`, { ...FONT, color: css(gone ? 'ink' : 'dust') })
        .setOrigin(0, 0);
      this.add
        .text(BASE_W / 2 + 200, top + i * 48, gone ? '사라짐' : '', { ...FONT, color: css('dust') })
        .setOrigin(1, 0);
    });
    if (this.erased >= names.length || reducedMotion(this.registry)) return;
    this.time.delayedCall(Math.round(seconds * 1000), () => {
      this.erased += 1;
      if (this.stage === 'ending') this.draw();
    });
  }

  /* ── 성적표 ───────────────────────────────────────────── */

  private drawCard(): void {
    const s = this.state;
    const w = 900;
    const h = 800;
    const x = Math.round((BASE_W - w) / 2);
    const y = 130;

    this.rect(x, y, w, h, 'ink');
    this.frame(x, y, w, h, 'bone');
    this.label(x + 48, y + 32, '당신이 한 일', 'dust');

    // 전부 core 가 세어 둔 값이다. 화면은 읽기만 한다
    const rows: [string, string][] = [
      ['방송한 날', `${s.day} 일`],
      ['도달한 깊이', `${s.stats.deepestFloor} F  /  ${content.balance.start.targetFloor}`],
      ['', ''],
      ['되살린 횟수', `${s.stats.totalRevived} 회`],
      ['폐기한 몸', `${s.stats.totalDiscarded} 구`],
      ['씌운 이름', `${inheritCount(s)} 번`],
      ['', ''],
      ['거짓말', `${s.stats.liesTold} 회`],
      ['지운 말', `${s.stats.chatsDeleted} 개`],
      ['거짓 공표', `${s.stats.falseAnnouncements} 회`],
      ['', ''],
      ['소생에 쓴 돈', `${s.stats.goldSpentOnRevive.toLocaleString('en-US')} G`],
    ];
    rows.forEach(([label, value], i) => {
      if (label === '') return;
      const ry = y + 88 + i * 44;
      this.add.text(x + 72, ry, label, { ...FONT, color: css('dust') });
      this.add.text(x + w - 72, ry, value, { ...FONT, color: css('bone') }).setOrigin(1, 0);
    });

    // 게임의 마지막 문장 (M11 §4)
    this.title(BASE_W / 2, y + h - 150, '그들은 아무도 모른다.', 'bone');

    new Button(this, {
      x: BASE_W / 2 - 264, y: L.actionsFull.y + L.pad, w: 528, h: 96,
      label: '다시 시작', hotkey: '1',
      onClick: () => this.scene.start(SCENES.TITLE),
    });
  }

  /* ── 그리기 도구 ──────────────────────────────────────── */

  private title(cx: number, y: number, s: string, color: 'bone' | 'wax' = 'bone'): void {
    this.add.text(Math.round(cx), Math.round(y), s, { ...FONT_TITLE, color: css(color) }).setOrigin(0.5, 0);
  }

  private body(cx: number, y: number, s: string): void {
    this.add.text(Math.round(cx), Math.round(y), s, { ...FONT, color: css('dust') }).setOrigin(0.5, 0);
  }

  private label(cx: number, y: number, s: string, color: 'dust' = 'dust'): void {
    this.add.text(Math.round(cx), Math.round(y), s, { ...FONT_LABEL, color: css(color) }).setOrigin(0.5, 0);
  }

  private rect(x: number, y: number, w: number, h: number, color: 'ink'): void {
    const g = this.add.graphics();
    g.fillStyle(PALETTE[color], 1);
    g.fillRect(x, y, w, h);
  }

  private frame(x: number, y: number, w: number, h: number, color: 'bone'): void {
    const g = this.add.graphics();
    g.fillStyle(PALETTE[color], 1);
    const t = L.line;
    g.fillRect(x, y, w, t);
    g.fillRect(x, y + h - t, w, t);
    g.fillRect(x, y, t, h);
    g.fillRect(x + w - t, y, t, h);
  }
}

/** narrative.ko.json 의 엔딩 문장. 씬이 글을 짓지 않는다 */
function endingText(ending: GameState['ending']): EndingText | null {
  if (ending === null) return null;
  const endings = (content.narrative as { endings?: Record<string, unknown> }).endings;
  const entry = endings?.[ending];
  if (entry === undefined || entry === null || typeof entry !== 'object') return null;
  const e = entry as Partial<EndingText>;
  return {
    title: e.title ?? '',
    lines: Array.isArray(e.lines) ? e.lines : [],
    ...(Array.isArray(e.choices) ? { choices: e.choices } : {}),
    ...(typeof e.starRemovalSeconds === 'number' ? { starRemovalSeconds: e.starRemovalSeconds } : {}),
  };
}

/**
 * 「씌운 이름」 횟수. `RunStats` 에 승계 카운터가 없어서 계보가 자란 만큼으로 센다.
 * 정본 카운터가 생기면 그걸 쓴다 (HO-016).
 */
function inheritCount(s: GameState): number {
  return s.personas.reduce((total, persona) => {
    const initial = content.personas.find((p) => p.id === persona.id);
    return total + Math.max(0, persona.lineage.length - (initial?.lineage.length ?? 0));
  }, 0);
}
