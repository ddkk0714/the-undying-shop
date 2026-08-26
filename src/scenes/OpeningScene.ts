import Phaser from 'phaser';
import { BASE_W, BASE_H, SCENES } from '../config';
import { PALETTE, css } from '../render/palette';
import { FONT, FONT_TITLE } from '../render/font';
import { key as assetKey, hasTexture } from '../render/assets';
import { reducedMotion } from '../ui/options';
import { playSfx, stopAmbience, stopBgm } from '../audio/Sfx';

/**
 * 오프닝 시퀀스 — 세이브 슬롯에 「새로 시작」할 때마다 본 게임 전에 한 번 튼다.
 * (「이어하기」는 거치지 않는다 — TitleScene 참고.)
 *
 * 톤 원칙(사용자 확정): **감정을 쓰지 않는다.** 서술자는 이 세계에 익숙한 사람이고
 * 끔찍한 것을 끔찍하게 말하지 않는다. 그래서 이 씬도 담담하게 — 음악 없이,
 * 그림 한 장 + 문장 몇 줄 + 클릭 대기 — 만 반복한다.
 */

interface Page {
  /** null 이면 그림 없이 타이틀 카드만 (7장 뒤 암전 후 로고) */
  image: string | null;
  lines: readonly string[];
}

const PAGES: readonly Page[] = [
  {
    image: 'story.ch1',
    lines: [
      '세상은 두 덩어리다.',
      '위에는 아무도 가본 적 없는 곳이 있고, 아래에는 우리가 있다.',
      '그 사이를 잇는 것은 탑 하나뿐이다.',
    ],
  },
  {
    image: 'story.ch2',
    lines: [
      '삼백 년 전, 한 현자가 우리에게 영생을 주었다.',
      '몸만 온전하면 몇 번이든 돌아온다. 좋은 선물이었다.',
      '그를 만난 사람은 아직 못 봤다.',
    ],
  },
  {
    image: 'story.ch3',
    lines: [
      '죽음이 시시해지는 데는 오래 걸리지 않았다.',
      '처음에는 슬퍼했고, 다음에는 익숙해졌고, 결국에는 구경거리가 되었다.',
    ],
  },
  {
    image: 'story.ch4',
    lines: [
      '이제 사람들은 탑에 내려간다.',
      '내려가는 것을 중계하고, 죽는 것을 보러 모인다.',
      '잘 죽을수록 잘 팔린다.',
    ],
  },
  {
    image: 'story.ch5',
    lines: [
      '다만 한 가지.',
      '몸이 온전해야 돌아온다.',
      '탑에서 죽은 자를 끌고 올라가는 일은 누군가 해야 한다.',
    ],
  },
  {
    image: 'story.ch6',
    lines: [
      '탑 위에 가게가 하나 있다.',
      '시체를 회수하고, 되살리고, 그들이 남긴 것을 다음 사람에게 판다.',
      '값은 정직하게 매긴다.',
    ],
  },
  {
    image: 'story.ch7',
    lines: [
      '가게 주인은 탑에 오르지 않는다.',
      '내려가는 일만 한다.',
    ],
  },
  { image: null, lines: [] }, // (암전 후) 《죽지 않는 가게》
];

/** 오른쪽으로 펼치며 미는 전환 (참고: 페이퍼스 플리즈) */
const SLIDE_MS = 480;
const IMAGE_TOP = 56;
const IMAGE_MAX_H = 760;
const IMAGE_MAX_W = BASE_W - 200;
const TEXT_TOP = 856;
const LINE_GAP = 46;

export class OpeningScene extends Phaser.Scene {
  private index = 0;
  private current: Phaser.GameObjects.Container | null = null;
  private busy = false;
  private finishing = false;

  constructor() {
    super(SCENES.OPENING);
  }

  create(): void {
    this.index = 0;
    this.current = null;
    this.busy = false;
    this.finishing = false;
    this.cameras.main.setBackgroundColor(PALETTE.ink);
    // 서술자의 무심함이 톤이다 — 음악을 얹지 않는다. 방송 브금은 다음 단계(소생실)에서 시작된다.
    stopBgm(this);
    stopAmbience(this);

    this.input.on('pointerup', () => this.advance());
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (e.code === 'Escape') this.finish();
      else this.advance();
    });

    this.buildSkipHint();
    this.showPage(0, false);
  }

  private buildSkipHint(): void {
    const hint = this.add
      .text(BASE_W - 32, 28, '건너뛰기 (ESC)', { ...FONT, color: css('dust'), fontSize: '21px' })
      .setOrigin(1, 0)
      .setDepth(500)
      .setInteractive({ useHandCursor: true });
    hint.on('pointerup', () => this.finish());
  }

  private advance(): void {
    if (this.finishing || this.busy) return;
    if (this.index >= PAGES.length - 1) {
      this.finish();
      return;
    }
    playSfx(this, 'sfx.click', 0.25);
    this.index += 1;
    this.showPage(this.index, true);
  }

  private finish(): void {
    if (this.finishing) return;
    this.finishing = true;
    this.input.removeAllListeners();
    this.input.keyboard?.removeAllListeners();
    this.scene.start(SCENES.DAY);
  }

  private buildPage(page: Page): Phaser.GameObjects.Container {
    const container = this.add.container(0, 0);

    if (page.image === null) {
      // (암전 후) — 타이틀 카드. 배경은 이미 ink 다, 그림 없이 제호만 남긴다.
      // 타이틀 화면과 같은 로고를 쓴다 — 여기서만 글자로 쓰면 다른 게임처럼 보인다.
      if (hasTexture(this, 'ui.logo')) {
        container.add(
          this.add.image(BASE_W / 2, BASE_H / 2, assetKey('ui.logo')).setOrigin(0.5).setDisplaySize(560, 475),
        );
      } else {
        container.add([
          this.add.text(BASE_W / 2, BASE_H / 2 - 40, '죽 지  않 는  가 게', { ...FONT_TITLE, color: css('bone') }).setOrigin(0.5),
          this.add.text(BASE_W / 2, BASE_H / 2 + 40, 'THE UNDYING SHOP', { ...FONT, color: css('dust') }).setOrigin(0.5),
        ]);
      }
      return container;
    }

    if (hasTexture(this, page.image)) {
      const img = this.add.image(BASE_W / 2, IMAGE_TOP, assetKey(page.image)).setOrigin(0.5, 0);
      const scale = Math.min(1, IMAGE_MAX_H / img.height, IMAGE_MAX_W / img.width);
      img.setScale(scale);
      container.add(img);
    }

    let y = TEXT_TOP;
    for (const line of page.lines) {
      container.add(this.add.text(BASE_W / 2, y, line, { ...FONT, color: css('bone') }).setOrigin(0.5, 0));
      y += LINE_GAP;
    }

    const arrow = this.add.text(BASE_W / 2, y + 4, '▼', { ...FONT, color: css('dust') }).setOrigin(0.5, 0);
    container.add(arrow);
    if (!reducedMotion(this.registry)) {
      this.tweens.add({ targets: arrow, y: arrow.y - 8, duration: 320, ease: 'Quad.Out', yoyo: true, repeat: -1 });
    }

    return container;
  }

  /** 오른쪽으로 펼치며 밀기 — 다음 장이 왼쪽에서 들어오며 이전 장을 오른쪽으로 밀어낸다 */
  private showPage(index: number, animate: boolean): void {
    const page = PAGES[index];
    if (page === undefined) return;
    const prev = this.current;
    const next = this.buildPage(page);
    this.current = next;

    if (!animate || reducedMotion(this.registry)) {
      prev?.destroy();
      next.setX(0);
      return;
    }

    this.busy = true;
    next.setX(-BASE_W);
    this.tweens.add({
      targets: next,
      x: 0,
      duration: SLIDE_MS,
      ease: 'Cubic.Out',
      onComplete: () => { this.busy = false; },
    });
    if (prev !== null) {
      this.tweens.add({
        targets: prev,
        x: BASE_W,
        duration: SLIDE_MS,
        ease: 'Cubic.Out',
        onComplete: () => prev.destroy(),
      });
    }
  }
}
