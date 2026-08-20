import Phaser from 'phaser';
import { BASE_W, BASE_H, SCENES } from '../config';
import { PALETTE, css } from '../render/palette';
import { FONT_TITLE } from '../render/font';
import { queuePack, swallowLoadErrors, allKeys } from '../render/assets';

/** content/*.json 을 번들에 포함시킨다. 런타임 fetch 가 아니라 빌드 타임 인라인이라 404 가 없다. */
const CONTENT = import.meta.glob('../../content/*.json', { eager: true, import: 'default' }) as Record<
  string,
  unknown
>;

const MIN_SHOW_MS = 400; // M01 §5 — 너무 빨리 지나가면 로고를 못 본다

/**
 * M01 §5 — 에셋 팩 등록 + 콘텐츠 로드. 로딩바는 봉랍이 차오르는 형태.
 */
export class PreloadScene extends Phaser.Scene {
  private bar!: Phaser.GameObjects.Graphics;
  private startedAt = 0;
  private failed: string[] = [];

  constructor() {
    super(SCENES.PRELOAD);
  }

  preload(): void {
    this.startedAt = this.time.now;
    this.cameras.main.setBackgroundColor(PALETTE.ink);
    this.drawChrome();

    this.failed = swallowLoadErrors(this);
    const queued = queuePack(this.load);

    this.load.on(Phaser.Loader.Events.PROGRESS, (p: number) => this.drawBar(p));
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      this.drawBar(1);
      if (import.meta.env.DEV) {
        console.debug(`[preload] 에셋 ${queued}개 큐, 실패 ${this.failed.length}개`);
      }
    });
  }

  create(): void {
    // content/*.json — 파싱 여부만 확인한다. 스키마 검증은 core/content.ts (Codex) 담당.
    const content: Record<string, unknown> = {};
    let bad = 0;
    for (const [path, mod] of Object.entries(CONTENT)) {
      const name = path.split('/').pop()?.replace('.json', '') ?? path;
      if (mod && typeof mod === 'object') content[name] = mod;
      else bad++;
    }
    this.registry.set('content', content);
    this.registry.set('assetsFailed', this.failed);

    if (import.meta.env.DEV) {
      console.debug(
        `[preload] content ${Object.keys(content).length}개 (${Object.keys(content).join(', ')}), 불량 ${bad}개`,
      );
      console.debug(`[preload] 매니페스트 키 ${allKeys().length}개`);
    }

    // 최소 표시 시간을 채우고 타이틀로
    const elapsed = this.time.now - this.startedAt;
    this.time.delayedCall(Math.max(0, MIN_SHOW_MS - elapsed), () => {
      this.scene.start(SCENES.TITLE);
    });
  }

  private drawChrome(): void {
    this.add
      .text(BASE_W / 2, BASE_H / 2 - 96, '죽지 않는 가게', { ...FONT_TITLE, color: css('bone') })
      .setOrigin(0.5);

    // 봉랍이 차오르는 틀
    const g = this.add.graphics();
    g.fillStyle(PALETTE.dust, 1);
    g.fillRect(BASE_W / 2 - 244, BASE_H / 2 + 28, 488, 40);
    g.fillStyle(PALETTE.ink, 1);
    g.fillRect(BASE_W / 2 - 240, BASE_H / 2 + 32, 480, 32);

    this.bar = this.add.graphics();
  }

  private drawBar(p: number): void {
    this.bar.clear();
    this.bar.fillStyle(PALETTE.wax, 1);
    this.bar.fillRect(BASE_W / 2 - 240, BASE_H / 2 + 32, Math.round(480 * p), 32);
  }
}
