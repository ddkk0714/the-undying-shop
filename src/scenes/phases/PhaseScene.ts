import Phaser from 'phaser';
import { PALETTE, css, type PaletteName } from '../../render/palette';
import { FONT, FONT_LABEL, FONT_TITLE } from '../../render/font';
import { key, firstTexture, hasTexture } from '../../render/assets';
import { scrimTexture, SCRIM_TILE, type ScrimWeight } from '../../render/scrim';
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
 *
 * v3.1 — 기준 1920x1080, 팔레트 5토큰, 폰트 16/32/48 (04-UI-KIT §1·§3).
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

  /**
   * 다시 그려도 **파괴하지 않을** 오브젝트. 풀링한 것을 여기에 등록한다.
   * 채팅 티커처럼 매 프레임 갱신되는 것을 통째로 재생성하면 풀링이 무의미해진다.
   */
  private persistent: Phaser.GameObjects.GameObject[] = [];

  protected keepAlive(...objects: Phaser.GameObjects.GameObject[]): void {
    this.persistent.push(...objects);
  }

  /** 살려 두던 것을 놓아준다 (연출이 끝난 일회성 오브젝트) */
  protected dropAlive(object: Phaser.GameObjects.GameObject): void {
    const at = this.persistent.indexOf(object);
    if (at >= 0) this.persistent.splice(at, 1);
  }

  protected redraw(): void {
    this.input.keyboard?.removeAllListeners(); // Button 이 등록한 핫키까지 함께 정리한다
    // 살려 둘 것은 목록에서 빼놓고, 나머지만 파괴한다
    for (const obj of this.persistent) this.children.remove(obj);
    this.children.removeAll(true);
    this.build(this.store.getState());
    // 다시 맨 위에 얹는다 — 패널 배경 위에 와야 한다
    for (const obj of this.persistent) this.children.add(obj);
  }

  /** 각 단계가 자기 화면을 그린다. */
  protected abstract build(s: Readonly<GameState>): void;

  /* ── 공통 그리기 도구 ─────────────────────────────────── */

  /** 단계 본문 영역(L.stage)을 덮는 배경. HUD 는 DayScene 이 계속 소유한다. */
  protected stageBackdrop(): void {
    this.rect(L.stage.x, L.stage.y, L.stage.w, L.stage.h, 'ink');
  }

  protected rect(x: number, y: number, w: number, h: number, color: PaletteName): void {
    const g = this.add.graphics();
    g.fillStyle(PALETTE[color], 1);
    g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  /** 04-UI-KIT §2-2 — 2px 하드 엣지. 라운딩 0, 그림자 없음 */
  protected frame(x: number, y: number, w: number, h: number, color: PaletteName = 'dust'): void {
    const g = this.add.graphics();
    g.fillStyle(PALETTE[color], 1);
    const X = Math.round(x);
    const Y = Math.round(y);
    const t = L.line;
    g.fillRect(X, Y, w, t);
    g.fillRect(X, Y + h - t, w, t);
    g.fillRect(X, Y, t, h);
    g.fillRect(X + w - t, Y, t, h);
  }

  /** HUD 용 이중선 액자 — 바깥 bone, 안쪽 dust (레퍼런스 상단 박스) */
  protected doubleFrame(x: number, y: number, w: number, h: number): void {
    this.frame(x, y, w, h, 'bone');
    this.frame(x + 6, y + 6, w - 12, h - 12, 'dust');
  }

  /**
   * 00-OVERVIEW §7-1 — 중간 계조는 색이 아니라 디더로 만든다.
   * Bayer 격자를 화면 좌표에 정렬해 찍는다 (에셋마다 위상이 어긋나지 않게).
   */
  protected dither(x: number, y: number, w: number, h: number, color: PaletteName, step = 4): void {
    const g = this.add.graphics();
    g.fillStyle(PALETTE[color], 1);
    const x0 = Math.round(x);
    const y0 = Math.round(y);
    for (let py = y0; py < y0 + h; py += step) {
      for (let px = x0 + ((py / step) % 2 === 0 ? 0 : step / 2); px < x0 + w; px += step) {
        g.fillRect(px, py, step / 2, step / 2);
      }
    }
  }

  /**
   * 그림 위에 글을 얹는 자리에 까는 판 (`render/scrim.ts`).
   * 색은 ink 하나뿐이고 덮는 비율만 바뀐다 — 반투명을 쓰면 중간 계조가 생겨 팔레트가 깨진다.
   * 위상은 화면 좌표에 맞춘다. 그래야 나란히 깐 판의 무늬가 이음매에서 어긋나지 않는다.
   */
  protected scrim(x: number, y: number, w: number, h: number, weight: ScrimWeight = 3): void {
    if (w <= 0 || h <= 0) return;
    const X = Math.round(x);
    const Y = Math.round(y);
    this.add
      .tileSprite(X, Y, Math.round(w), Math.round(h), scrimTexture(this, weight))
      .setOrigin(0, 0)
      .setTilePosition(X % SCRIM_TILE, Y % SCRIM_TILE);
  }

  /**
   * 본문 한 덩어리를 위한 판. 글이 앉는 자리는 ink 로 꽉 채우고,
   * 오른쪽 끝만 75% → 50% → 25% 로 솎아 배경 그림에 이어 붙인다.
   * 하드 엣지 하나로 잘라내면 오려 붙인 티가 난다.
   */
  protected scrimBlock(x: number, y: number, w: number, h: number): void {
    this.fade(x, y, w, h, 'x');
  }

  /** 글줄 하나를 위한 띠. 좌우 폭을 다 쓰므로 위아래로 솎아 나간다 */
  protected scrimRow(x: number, y: number, w: number, h: number): void {
    this.fade(x, y, w, h, 'y');
  }

  /** ink 로 채운 심(心) + 한 축으로 옅어지는 꼬리 */
  private fade(x: number, y: number, w: number, h: number, axis: 'x' | 'y'): void {
    const weights = [3, 2, 1] as const;

    if (axis === 'x') {
      const band = 72;
      const core = Math.max(0, w - band * weights.length);
      this.rect(x, y, core, h, 'ink');
      weights.forEach((weight, i) => {
        const left = x + core + band * i;
        this.scrim(left, y, Math.min(band, Math.max(0, x + w - left)), h, weight);
      });
      return;
    }

    // 세로: 심을 가운데 두고 위아래로 같이 옅어진다
    const band = 16;
    const edge = band * weights.length;
    const core = Math.max(0, h - edge * 2);
    this.rect(x, y + edge, w, core, 'ink');
    weights.forEach((weight, i) => {
      this.scrim(x, y + edge - band * (i + 1), w, band, weight);
      this.scrim(x, y + edge + core + band * i, w, band, weight);
    });
  }

  /**
   * 03-ASSET-MODULES §3 — 에셋은 논리 키로만 참조한다.
   * 키가 없거나 파일이 아직 안 왔으면 조용히 건너뛴다. 아트 하나 빠졌다고 화면이 죽지 않는다.
   */
  protected sprite(x: number, y: number, assetKey: string, w?: number, h?: number, frame = 0): void {
    if (!hasTexture(this, assetKey)) return;
    const img = this.add.image(Math.round(x), Math.round(y), key(assetKey), frame).setOrigin(0, 0);
    if (w !== undefined && h !== undefined) img.setDisplaySize(Math.round(w), Math.round(h));
  }

  /**
   * `sprite` 와 같지만 만들어진 오브젝트를 돌려준다 — 뒤에서 깜빡이거나 흔들어야 할 때.
   * 키가 없으면 null 이다. 호출한 쪽이 절차적 대체물을 그리면 된다.
   */
  protected spriteObject(
    x: number, y: number, assetKey: string, w?: number, h?: number, frame = 0,
  ): Phaser.GameObjects.Image | null {
    if (!hasTexture(this, assetKey)) return null;
    const img = this.add.image(Math.round(x), Math.round(y), key(assetKey), frame).setOrigin(0, 0);
    if (w !== undefined && h !== undefined) img.setDisplaySize(Math.round(w), Math.round(h));
    return img;
  }

  /** 이 키의 그림이 실제로 로드돼 있는가 — 없으면 씬이 절차적으로 대신 그린다 */
  protected hasArt(assetKey: string): boolean {
    return hasTexture(this, assetKey);
  }

  /**
   * 후보를 앞에서부터 훑어 **처음 있는 것**을 상자에 맞춰 그린다.
   * 비율을 지키고 가운데 맞춤이라 규격이 어긋난 그림도 늘어나거나 찌그러지지 않는다.
   * 하나도 없으면 false — 호출한 쪽이 절차적 대체 그림을 그리면 된다.
   */
  protected spriteFit(
    box: { x: number; y: number; w: number; h: number },
    assetKeys: string[],
    frame = 0,
  ): boolean {
    return this.spriteFitObject(box, assetKeys, frame) !== null;
  }

  /** `spriteFit`과 같지만 대사 표정 전환처럼 나중에 조작할 이미지를 돌려준다. */
  protected spriteFitObject(
    box: { x: number; y: number; w: number; h: number },
    assetKeys: string[],
    frame = 0,
  ): Phaser.GameObjects.Image | null {
    const textureKey = firstTexture(this, ...assetKeys);
    if (textureKey === null) return null;
    const src = this.textures.get(textureKey).getSourceImage() as { width: number; height: number };
    const scale = Math.min(box.w / src.width, box.h / src.height);
    const w = Math.round(src.width * scale);
    const h = Math.round(src.height * scale);
    return this.add
      .image(Math.round(box.x + (box.w - w) / 2), Math.round(box.y + (box.h - h) / 2), textureKey, frame)
      .setOrigin(0, 0)
      .setDisplaySize(w, h);
  }

  /** 상자를 꽉 채운다 (배경 전용 — 잘려도 되는 그림). 없으면 false */
  protected spriteCover(box: { x: number; y: number; w: number; h: number }, assetKeys: string[]): boolean {
    const textureKey = firstTexture(this, ...assetKeys);
    if (textureKey === null) return false;
    this.add
      .image(Math.round(box.x), Math.round(box.y), textureKey)
      .setOrigin(0, 0)
      .setDisplaySize(Math.round(box.w), Math.round(box.h));
    return true;
  }

  /** 본문 32px */
  protected text(x: number, y: number, s: string, color: PaletteName = 'bone'): Phaser.GameObjects.Text {
    return this.add.text(Math.round(x), Math.round(y), s, { ...FONT, color: css(color) });
  }

  protected textRight(x: number, y: number, s: string, color: PaletteName = 'bone'): Phaser.GameObjects.Text {
    return this.text(x, y, s, color).setOrigin(1, 0);
  }

  /** 라벨 16px — GOLD / FANS 같은 머리글 전용 */
  protected label(x: number, y: number, s: string, color: PaletteName = 'dust'): Phaser.GameObjects.Text {
    return this.add.text(Math.round(x), Math.round(y), s, { ...FONT_LABEL, color: css(color) });
  }

  /** 제목·대사 48px */
  protected title(x: number, y: number, s: string, color: PaletteName = 'bone'): Phaser.GameObjects.Text {
    return this.add.text(Math.round(x), Math.round(y), s, { ...FONT_TITLE, color: css(color) });
  }

  /**
   * 04-UI-KIT §3 — 본문 32px 기준. 한글 1자 = 32px, 반각 = 16px 로 세어
   * 주어진 폭(px) 안에 들어가도록 자른다. 넘치면 마지막 자리에 · 를 남긴다.
   *
   * Phaser 의 wordWrap 은 공백 기준이라 한글에서 어긋난다. 그래서 글자 수로 센다.
   */
  protected clip(s: string, px: number, size: 'label' | 'body' | 'title' = 'body'): string {
    const unit = size === 'label' ? 8 : size === 'title' ? 24 : 16;
    let used = 0;
    for (let i = 0; i < s.length; i += 1) {
      const w = charWidth(s[i]!) * unit;
      if (used + w > px) return s.slice(0, Math.max(0, i - 1)) + '·';
      used += w;
    }
    return s;
  }

  /** 단계 제목 — 본문 좌상단 고정 위치 */
  protected heading(s: string, color: PaletteName = 'bone'): void {
    this.title(L.pad, L.stage.y + L.pad, s, color);
  }
}

/** 전각(한글·기호) 2단위, 반각 1단위 */
function charWidth(ch: string): number {
  return ch.charCodeAt(0) > 0x2000 ? 2 : 1;
}
