import { SCENES } from '../../config';
import { content } from '../../core/content';
import { key, MISSING_TEXTURE } from '../../render/assets';
import { L, slotX, actionX, ACTION_W } from '../../ui/layout';
import { Button } from '../../ui/Button';
import { PhaseScene } from './PhaseScene';
import type { Contract, GameState } from '../../core/types';

/**
 * M05 편성실 — **상점 화면** (v3.1 레퍼런스 정본, 04-UI-KIT §1 · 00-OVERVIEW §8-2).
 *
 *   좌(L.guest)    방문자 / 오늘의 출연자 전신
 *   좌하(L.dialogue) 대사 한 줄 + ▼
 *   우(L.bench)    작업대 — 진열 3칸 · 램프 · 장부
 *   우하(L.actions) 蘇生 販売 交渉 出撃 4택
 *
 * 하단 4택이 「방」을 바꾸는 게 아니라 **작업대 위에 무엇을 올릴지**를 바꾼다.
 * 계약서의 honesty 는 절대 그리지 않는다 (02-DATA-SCHEMA §2-b).
 */
type BenchMode = 'CONTRACT' | 'SHELF';

export class OfficePhase extends PhaseScene {
  private mode: BenchMode = 'SHELF';

  constructor() {
    super(SCENES.PHASE_OFFICE);
  }

  protected build(s: Readonly<GameState>): void {
    this.stageBackdrop();
    this.buildGuest(s);
    this.buildBenchBackdrop();
    if (this.mode === 'CONTRACT') this.buildContract(s);
    else this.buildShelf(s);
    this.buildActions(s);
  }

  /* ── 좌 · 방문자 / 출연자 ─────────────────────────────── */

  private buildGuest(s: Readonly<GameState>): void {
    const g = L.guest;
    this.rect(g.x, g.y, g.w, g.h, 'ink');
    // 방 안쪽 벽 — 광원이 위에서 떨어지는 느낌을 디더로만 만든다
    this.dither(g.x, g.y, g.w, Math.round(g.h * 0.45), 'mid', 8);
    this.frame(g.x, g.y, g.w, g.h, 'dust');

    const visitor = s.visitors[0];
    const star = s.stars.find((x) => x.id === s.today?.starId) ?? s.stars.find((x) => x.status === 'ALIVE');
    const name = this.mode === 'CONTRACT' && visitor !== undefined
      ? visitor.displayName
      : s.personas.find((p) => p.id === star?.personaId)?.displayName ?? '무명';

    // 전신 실루엣 384x480 — 진짜 초상은 M03
    const w = 384;
    const h = 480;
    const x = g.x + Math.round((g.w - w) / 2);
    const y = g.y + g.h - h - 24;
    const portraitKey = star === undefined ? MISSING_TEXTURE : key(star.portraitKey);
    const textureKey = portraitKey === MISSING_TEXTURE ? key('star.silhouette') : portraitKey;
    if (textureKey !== MISSING_TEXTURE) {
      this.add.image(x, y, textureKey, 0).setOrigin(0, 0).setDisplaySize(w, h);
    } else {
      this.rect(x, y, w, h, 'mid');
    }

    this.title(g.x + L.pad, g.y + L.pad, this.clip(name, g.w - L.pad * 2, 'title'));

    // 대사 — 좌하단 한 줄 + ▼ (말풍선을 쓰지 않는다)
    const d = L.dialogue;
    this.rect(d.x, d.y, d.w, d.h, 'ink');
    const line = this.mode === 'CONTRACT' ? '...일할 자리 있나요?' : '...강한 무기 있나요?';
    this.title(d.x + L.pad, d.y + 40, this.clip(line, d.w - 96, 'title'), 'bone');
    this.text(d.x + d.w - 48, d.y + 52, '▼', 'dust');
  }

  /* ── 우 · 작업대 배경 ─────────────────────────────────── */

  private buildBenchBackdrop(): void {
    const b = L.bench;
    this.rect(b.x, b.y, b.w, b.h, 'ink');
    // 램프 광원 — 좌상단에서 방사형으로 밝다. 디더 3단으로 감쇠시킨다
    this.dither(b.x + 40, b.y + 40, 420, 360, 'mid', 4);
    this.dither(b.x + 40, b.y + 40, 260, 220, 'dust', 4);
    this.rect(b.x + 120, b.y + 96, 48, 96, 'bone'); // 램프 몸통 자리표시
    this.frame(b.x, b.y, b.w, b.h, 'dust');
  }

  /* ── 작업대 A · 계약서 심사 ───────────────────────────── */

  private buildContract(s: Readonly<GameState>): void {
    const p = L.office.paper;
    const visitor: Contract | undefined = s.visitors[0];

    this.rect(p.x + L.pad * 2, p.y + L.pad * 2, p.w - L.pad * 4, p.h - L.pad * 4, 'mid');
    this.frame(p.x + L.pad * 2, p.y + L.pad * 2, p.w - L.pad * 4, p.h - L.pad * 4, 'bone');
    const ox = p.x + L.pad * 4;
    let oy = p.y + L.pad * 4;

    this.title(ox, oy, '계 약 서');
    if (visitor === undefined) {
      this.text(ox, oy + 96, '오늘은 문 앞이 조용하다.', 'dust');
      this.text(ox, oy + 144, '심사할 계약서가 없다.', 'dust');
      return;
    }

    this.textRight(p.x + p.w - L.pad * 4, oy + 12, `계약금 ${visitor.fee.toLocaleString('en-US')} G`);
    oy += 88;
    this.text(ox, oy, '시체는 반드시 회수한다.', 'dust');
    this.text(ox, oy + 40, '대신 방송 중 갑의 프로듀스를 따른다.', 'dust');

    oy += 120;
    this.label(ox, oy, '자기 신고 공략률', 'dust');
    visitor.claimedTiers.slice(0, 5).forEach((tier, i) => {
      const ty = oy + 32 + i * 44;
      this.text(ox, ty, `${tier.floor}F 까지`);
      this.textRight(p.x + p.w - L.pad * 4, ty, `${Math.round(tier.rate * 100)}%`, 'dust');
    });

    this.text(ox, p.y + p.h - L.pad * 4 - 40, `인지도 ${visitor.recognition} · 팬덤 ${visitor.fandom.toLocaleString('en-US')}`, 'dust');
  }

  /* ── 작업대 B · 진열 3칸 ──────────────────────────────── */

  private buildShelf(s: Readonly<GameState>): void {
    const alive = s.stars.filter((star) => star.status === 'ALIVE');

    for (let i = 0; i < 3; i += 1) {
      const x = slotX(i);
      const y = L.slot3.y;
      const itemId = s.shelf[i] ?? null;
      const def = itemId === null ? undefined : content.items.find((item) => item.id === itemId);
      this.rect(x, y, L.slot3.w, L.slot3.h, 'ink');
      this.frame(x, y, L.slot3.w, L.slot3.h, 'bone');

      const ix = x + L.pad;
      const inner = L.slot3.w - L.pad * 2;
      if (def === undefined) {
        this.label(ix, y + L.pad, `진열 ${i + 1}`, 'dust');
        this.text(ix, y + 72, '비어 있음', 'dust');
        continue;
      }
      this.label(ix, y + L.pad, `진열 ${i + 1}`, 'dust');
      this.text(ix, y + 56, this.clip(def.name, inner));
      this.text(ix, y + 104, `HP+${def.hp}`, 'dust');
      this.text(ix, y + 144, `공+${def.atk} 방+${def.def}`, 'dust');
      this.text(ix, y + 200, `${def.price.toLocaleString('en-US')} G`);
    }

    // 오늘의 출연자 — 작업대 아래쪽 장부 자리
    const by = L.slot3.y + L.slot3.h + 48;
    this.label(L.bench.x + L.pad * 2, by, '오늘의 출연자', 'dust');
    alive.slice(0, 3).forEach((star, i) => {
      const picked = s.today?.starId === star.id;
      const x = L.bench.x + L.pad * 2 + i * 368;
      const persona = s.personas.find((p) => p.id === star.personaId);
      this.text(x, by + 32, this.clip(persona?.displayName ?? '무명', 340), picked ? 'wax' : 'bone');
      this.text(x, by + 72, this.clip(`${star.bodyName} · ${star.reviveCount}회`, 340), 'dust');
      new Button(this, {
        x, y: by + 116, w: 340, h: 56,
        label: picked ? '출연 확정' : '이 사람으로',
        variant: picked ? 'ghost' : 'default',
        enabled: !picked,
        onClick: () => this.store.dispatch({ type: 'OFFICE/PICK_STAR', starId: star.id }),
      });
    });
  }

  /* ── 하단 4택 ─────────────────────────────────────────── */

  private buildActions(s: Readonly<GameState>): void {
    const a = L.actions;
    this.rect(a.x, a.y, a.w, a.h, 'ink');
    const y = a.y + L.pad;
    const h = a.h - L.pad * 2;
    const visitor = s.visitors[0];

    new Button(this, {
      x: actionX(0), y, w: ACTION_W, h,
      label: '蘇生 소생', hotkey: '1', variant: 'danger',
      onClick: () => this.store.dispatch({ type: 'PHASE/ADVANCE' }), // 소생은 ① 단계에서
      enabled: false,
    });
    new Button(this, {
      x: actionX(1), y, w: ACTION_W, h,
      label: '販売 진열', hotkey: '2',
      variant: this.mode === 'SHELF' ? 'default' : 'ghost',
      onClick: () => this.switchMode('SHELF'),
    });
    new Button(this, {
      x: actionX(2), y, w: ACTION_W, h,
      label: '交渉 계약', hotkey: '3',
      variant: this.mode === 'CONTRACT' ? 'default' : 'ghost',
      onClick: () => this.switchMode('CONTRACT'),
    });
    new Button(this, {
      x: actionX(3), y, w: ACTION_W, h,
      label: '出撃 방송', hotkey: '4', variant: 'danger',
      onClick: () => this.store.dispatch({ type: 'OFFICE/CONFIRM' }),
    });

    // 계약 모드에서는 「출격」 자리 위에 수락/거절을 겹치지 않고, 작업대 안에서 처리한다
    if (this.mode === 'CONTRACT' && visitor !== undefined) {
      const p = L.office.paper;
      new Button(this, {
        x: p.x + L.pad * 4, y: p.y + p.h - L.pad * 4 - 104, w: 300, h: 64,
        label: '계약한다',
        onClick: () => this.store.dispatch({ type: 'OFFICE/CONTRACT_ACCEPT', starId: visitor.starId }),
      });
      new Button(this, {
        x: p.x + L.pad * 4 + 324, y: p.y + p.h - L.pad * 4 - 104, w: 300, h: 64,
        label: '돌려보낸다', variant: 'danger',
        onClick: () => this.store.dispatch({ type: 'OFFICE/CONTRACT_REJECT', starId: visitor.starId }),
      });
    }
  }

  private switchMode(mode: BenchMode): void {
    this.mode = mode;
    this.redraw();
  }
}
