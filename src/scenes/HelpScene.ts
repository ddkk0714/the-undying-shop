import Phaser from 'phaser';
import { BASE_W, BASE_H, SCENES } from '../config';
import { PALETTE, css } from '../render/palette';
import { FONT, FONT_TITLE } from '../render/font';
import { Button } from '../ui/Button';
import { panel } from '../ui/Panel';
import { L } from '../ui/layout';

/**
 * M01 §6 — 조작 안내.
 * 대회 제출 요건(조작법 안내 필수)을 충족시키는 화면이다. 반드시 있어야 한다.
 */
const LINES: [string, string][] = [
  ['마우스 클릭', '모든 선택지를 고른다'],
  ['숫자키 1~4', '화면의 선택지를 번호로 고른다'],
  ['하강 중 무전', '길을 알려준다. 거짓말도 된다'],
  ['채팅 클릭', '진실을 말하는 채팅을 지운다'],
  ['검시실', '시체를 온전히 둘지 훼손할지 정한다'],
  ['ESC', '이전 화면으로'],
];

/** 패널 안쪽 좌표. 설명 열은 x=152 에서 시작해 패널 우변(456)까지 304px 을 쓴다.
 *  16px 한글 1자 = 16px 이므로 설명은 공백 포함 19자 폭을 넘지 않는다. */
const PANEL = { x: 96, y: 64, w: BASE_W - 192, h: BASE_H - 248 } as const;
const COL_KEY = 160;
const COL_DESC = 608;
const ROW_H = 88;

export class HelpScene extends Phaser.Scene {
  private returnTo: string | null = null;

  constructor() {
    super(SCENES.HELP);
  }

  init(data: { returnTo?: string }): void {
    this.returnTo = data.returnTo ?? null;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PALETTE.ink);
    panel(this, PANEL.x, PANEL.y, PANEL.w, PANEL.h, 'sunken');

    this.add.text(COL_KEY, 104, '조작 안내', { ...FONT_TITLE, color: css('bone') });

    const right = PANEL.x + PANEL.w - L.pad;
    let y = 54;
    for (const [k, desc] of LINES) {
      this.add.text(COL_KEY, y, k, { ...FONT, color: css('bone') });
      const t = this.add.text(COL_DESC, y, desc, { ...FONT, color: css('dust') });
      // 픽셀 폰트라 글자폭이 고정이다. 넘치면 조용히 잘리는 대신 개발 중에 잡는다.
      if (import.meta.env.DEV && Math.ceil(t.x + t.width) > right) {
        console.warn(`[help] 설명이 패널을 넘는다: "${desc}" (${Math.ceil(t.x + t.width)} > ${right})`);
      }
      y += ROW_H;
    }

    this.add.text(COL_KEY, y + 16, 'v3 에는 제한시간이 없다. 얼마든지 생각해도 된다.', { ...FONT, color: css('dust') });

    new Button(this, {
      x: BASE_W / 2 - 264, y: BASE_H - 136, w: 528, h: 96,
      label: '돌아가기', hotkey: '1',
      onClick: () => this.close(),
    });
    this.input.keyboard?.once('keydown-ESC', () => this.close());
  }

  private close(): void {
    if (this.returnTo === null) this.scene.start(SCENES.TITLE);
    else {
      this.scene.stop();
      this.scene.resume(this.returnTo);
    }
  }
}
