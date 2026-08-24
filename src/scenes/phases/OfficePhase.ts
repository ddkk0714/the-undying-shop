import { SCENES } from '../../config';
import { content } from '../../core/content';
import { isEarlyClosure } from '../../core/systems/narrative';
import { officeHero } from '../../core/systems/office';
import { starArt } from '../../render/assets';
import { L, slotX, actionX, ACTION_W } from '../../ui/layout';
import { Button } from '../../ui/Button';
import { onboard } from '../../ui/Onboarding';
import { playBgm } from '../../audio/Sfx';
import { PhaseScene } from './PhaseScene';
import type { Contract, GameState, Star } from '../../core/types';

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
  /** 계약서가 2장 올 수 있다 (M05). 지금 보고 있는 장 */
  private contractIndex = 0;
  /** 인벤토리에서 지금 보고 있는 물건 (HO-017 · CCR-003) */
  private itemIndex = 0;

  constructor() {
    super(SCENES.PHASE_OFFICE);
  }

  override create(): void {
  /**
   * ★ Phaser 씬 인스턴스는 stop/launch 를 거쳐도 **살아남는다.**
   * 어제 남긴 필드를 지우지 않으면 다음 날 화면이 어제 상태로 시작한다.
   */
    this.contractIndex = 0;
    this.itemIndex = 0;
    this.mode = 'SHELF';
    super.create();
    playBgm(this, 'bgm.shop');
  }

  protected build(s: Readonly<GameState>): void {
    // 심사할 계약서가 없으면 계약 모드에 머무를 이유가 없다.
    // 여기 갇히면 「오늘의 출연자」를 고를 수 없어 하루가 넘어가지 않는다.
    if (this.mode === 'CONTRACT' && s.visitors.length === 0) this.mode = 'SHELF';

    this.stageBackdrop();
    this.buildGuest(s);
    this.buildBenchBackdrop();
    if (this.mode === 'CONTRACT') this.buildContract(s);
    else this.buildShelf(s);
    this.buildActions(s);
    onboard(this, s.day, this.mode === 'CONTRACT' ? 'OFFICE_CONTRACT' : 'OFFICE_SHELF',
      { x: L.pad, y: L.actionsFull.y - 52, w: L.W - L.pad * 2 });
  }

  /* ── 좌 · 방문자 / 출연자 ─────────────────────────────── */

  private buildGuest(s: Readonly<GameState>): void {
    const g = L.guest;
    this.rect(g.x, g.y, g.w, g.h, 'ink');
    this.spriteCover(g, ['bg.shop.room']);
    this.frame(g.x, g.y, g.w, g.h, 'dust');

    // 계약 모드에서 좌측에 서 있는 사람은 **방문자**다. 아직 계약 전이라 recruitPool 에 있다.
    // 이름만 방문자로 바꾸고 그림은 기존 출연자를 쓰면, 이름과 얼굴이 어긋난다
    const visitor = s.visitors[this.contractIndex] ?? s.visitors[0];
    const contracting = this.mode === 'CONTRACT' && visitor !== undefined;
    const guest = contracting ? s.recruitPool.find((x) => x.id === visitor.starId) : undefined;
    const star = guest
      ?? s.stars.find((x) => x.id === s.today?.starId)
      ?? s.stars.find((x) => x.status === 'ALIVE');
    const name = contracting
      ? visitor.displayName
      : s.personas.find((p) => p.id === star?.personaId)?.displayName ?? '무명';

    // 전신 CG 자리 — star.body.* → star.portrait.* → 실루엣 순으로 내려간다
    const art = star === undefined ? null : starArt(star.id);
    const w = 384;
    const h = 480;
    const x = g.x + Math.round((g.w - w) / 2);
    const y = g.y + g.h - h - 24;
    // 전신은 좌측 칸과 1:1 이다 (752x792). 이름 글자는 그 위에 얹는다
    const full = { x: g.x, y: g.y, w: g.w, h: g.h };
    const body = art === null ? false : this.spriteFit(full, [art.body]);
    if (!body && !this.spriteFit({ x, y, w, h }, [...(art === null ? [] : [art.portrait]), 'star.silhouette'])) {
      this.rect(x, y, w, h, 'mid');
    }

    // 배경이 밝은 곳(문·벽)에 이름이 걸리면 안 읽힌다. 이름이 앉는 자리만 덮는다
    this.scrimBlock(g.x + L.line, g.y + L.line, 560, 96);
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
    this.spriteCover(b, ['bg.shop.bench']);
    // 소품 — 작업대를 세 구역으로 나눠 놓는다.
    //   좌: 램프(진열 왼쪽) · 장부(아래)   우: 도장·두루마리(진열 오른쪽 세로 띠)
    //   가운데 아래(local 380~1130 / 400~570)는 출연자 줄이 쓰므로 비워 둔다.
    this.sprite(b.x + 24, b.y + 30, 'prop.lamp');
    this.sprite(b.x + 24, b.y + 470, 'prop.ledger', 336, 264);
    this.sprite(b.x + 980, b.y + 120, 'prop.stamp', 128, 208);
    this.sprite(b.x + 960, b.y + 350, 'prop.scroll', 176, 64);
    this.sprite(b.x + 400, b.y + 640, 'prop.tag', 152, 104);
    this.sprite(b.x + 880, b.y + 660, 'prop.tag', 152, 104);
    this.frame(b.x, b.y, b.w, b.h, 'dust');
  }

  /* ── 작업대 A · 계약서 심사 ───────────────────────────── */

  private buildContract(s: Readonly<GameState>): void {
    const p = L.office.paper;
    if (this.contractIndex >= s.visitors.length) this.contractIndex = 0;
    const visitor: Contract | undefined = s.visitors[this.contractIndex];

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

    // 계약금을 낼 수 없으면 그렇다고 말한다. 눌리는데 아무 일도 안 일어나는 버튼이 제일 나쁘다
    if (s.gold < visitor.fee) {
      this.textRight(p.x + p.w - L.pad * 4, oy - 40, `자금 부족 · 보유 ${s.gold.toLocaleString('en-US')} G`, 'wax');
    }
    if (s.visitors.length > 1) {
      this.label(ox, p.y + L.pad * 4 + 56, `${this.contractIndex + 1} / ${s.visitors.length} 장`, 'dust');
    }
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
      // CCR-003 — 진열은 판매가 아니라 장착이다. 값을 적으면 파는 것처럼 읽힌다
      new Button(this, {
        x: ix, y: y + L.slot3.h - 76, w: inner, h: 56,
        label: '내린다', variant: 'ghost',
        onClick: () => this.store.dispatch({ type: 'OFFICE/PLACE', slot: i, itemId: null }),
      });
    }

    // 오늘의 출연자 — 램프와 장부 사이. 소품 자리를 침범하지 않는다
    const by = L.slot3.y + L.slot3.h + 40;
    const colW = 240;
    // 판은 실제로 쓰는 칸만큼만 깐다. 출연자가 없는 날 빈 검은 상자가 남으면 안 된다
    const cols = Math.min(3, alive.length);
    this.scrimBlock(L.bench.x + 356, by - 20, cols > 0 ? colW * cols + 16 * (cols - 1) + 48 : 700, 216);
    this.label(L.bench.x + 380, by, '오늘의 출연자', 'dust');
    // 빈 칸을 그냥 두면 왜 출격이 잠겼는지 알 길이 없다
    if (cols === 0) {
      this.text(L.bench.x + 380, by + 40, '세울 사람이 없다.', 'wax');
      this.text(L.bench.x + 380, by + 84, '蘇生(1) 되살리기 · 交渉(3) 계약 · 돈이 없으면 賣却(7) 판다.', 'dust');
    }
    alive.slice(0, 3).forEach((star, i) => {
      const picked = s.today?.starId === star.id;
      const x = L.bench.x + 380 + i * (colW + 16);
      const persona = s.personas.find((p) => p.id === star.personaId);
      this.text(x, by + 28, this.clip(persona?.displayName ?? '무명', colW), picked ? 'wax' : 'bone');
      this.text(x, by + 68, this.clip(`${star.bodyName} · ${star.reviveCount}회`, colW), 'dust');
      new Button(this, {
        x, y: by + 112, w: colW, h: 56,
        label: picked ? '출연 확정' : '이 사람으로',
        variant: picked ? 'ghost' : 'default',
        enabled: !picked,
        onClick: () => this.store.dispatch({ type: 'OFFICE/PICK_STAR', starId: star.id }),
      });
    });

    this.buildInventory(s, alive[0]);
  }

  /* ── 작업대 B · 인벤토리 (HO-017 · CCR-003) ───────────── */

  /**
   * 진열은 **판매가 아니라 장착**이다. 올린 물건은 인벤토리에 남고, 내리기 전에는 팔 수 없다.
   * 파는 것은 따로다 — 그리고 진실 유품 2종은 팔면 `leak` 이 오른다 (M05 §5).
   *
   * 물건을 하나씩 넘겨 보고(5) 올리거나 내리고(6) 판다(7). 3칸은 눌러서도 내려진다.
   */
  private buildInventory(s: Readonly<GameState>, star: Star | undefined): void {
    const b = L.bench;
    const iy = b.y + 600;          // 「오늘의 출연자」 줄 아래, Day1 온보딩 띠(884) 위
    const ih = 128;
    const px = b.x + L.pad;
    const pw = b.w - L.pad * 2;
    const ox = b.x + L.pad * 2;

    // 위아래로 옅어지는 판 — 위는 넓게, 아래는 작업대 끝이라 짧게 끊는다
    ([3, 2, 1] as const).forEach((weight, i) => {
      // 위 꼬리는 「이 사람으로」 버튼(720 에서 끝난다)을 덮지 않는 만큼만 쓴다
      this.scrim(px, iy - 8 * (i + 1), pw, 8, weight);
      this.scrim(px, iy + ih + 8 * i, pw, 8, weight);
    });
    this.rect(px, iy, pw, ih, 'ink');

    const stacks = s.inventory.filter((stack) => stack.qty > 0);
    if (this.itemIndex >= stacks.length) this.itemIndex = 0;
    const stack = stacks[this.itemIndex];
    const def = stack === undefined ? undefined : content.items.find((item) => item.id === stack.id);
    const shelved = def !== undefined && s.shelf.includes(def.id);

    const head = stacks.length === 0
      ? '인벤토리'
      : `인벤토리 ${this.itemIndex + 1} / ${stacks.length}${shelved ? '  ·  진열 중' : ''}`;
    this.label(ox, iy + 8, head, shelved ? 'wax' : 'dust');

    // 진열의 결과를 숫자로 보여준다 — 「진열 확정 시 출연자 스탯이 갱신된다」(M05 §8)
    const totals = s.shelf.reduce(
      (sum, id) => {
        const item = id === null ? undefined : content.items.find((candidate) => candidate.id === id);
        return item === undefined ? sum : { hp: sum.hp + item.hp, atk: sum.atk + item.atk, def: sum.def + item.def };
      },
      { hp: 0, atk: 0, def: 0 },
    );
    if (star !== undefined) {
      const hero = officeHero(s, star);
      this.label(ox + 320, iy + 8,
        `장비 HP+${totals.hp} 공+${totals.atk} 방+${totals.def}   →   출연자 ${hero.maxHp} · 공 ${hero.atk} · 방 ${hero.def}`,
        'dust');
    }

    if (def === undefined || stack === undefined) {
      this.text(ox, iy + 36, '팔 것도 올릴 것도 없다.', 'dust');
      this.text(ox, iy + 80, '시체를 훼손하면 유품이 들어온다.', 'dust');
      return;
    }

    const gear = def.kind === 'GEAR';
    const full = s.shelf.every((slot) => slot !== null);
    const spec = gear
      ? `HP+${def.hp} 공+${def.atk} 방+${def.def}`
      : def.kind === 'POTION' ? `방송 중 회복 +${def.healing}` : '전투에는 쓸모가 없다';

    this.text(ox, iy + 36, this.clip(`${def.name}${stack.qty > 1 ? ` x${stack.qty}` : ''}`, 380));
    this.text(ox, iy + 80, this.clip(spec, 300), 'dust');
    this.text(ox + 320, iy + 80, `${def.price.toLocaleString('en-US')} G`, def.isRelic ? 'wax' : 'bone');

    const bw = 200;
    const bx = b.x + b.w - L.pad * 2 - bw;
    const by2 = iy + 32;
    new Button(this, {
      x: bx - (bw + 12) * 2, y: by2, w: bw, h: 64,
      label: '次 다음', hotkey: '5', variant: 'ghost',
      enabled: stacks.length > 1,
      onClick: () => { this.itemIndex = (this.itemIndex + 1) % stacks.length; this.redraw(); },
    });
    new Button(this, {
      x: bx - (bw + 12), y: by2, w: bw, h: 64,
      label: shelved ? '陳列 내린다' : '陳列 진열', hotkey: '6',
      enabled: gear && (shelved || !full),
      onClick: () => {
        const slot = shelved ? s.shelf.indexOf(def.id) : s.shelf.indexOf(null);
        if (slot < 0) return;
        this.store.dispatch({ type: 'OFFICE/PLACE', slot, itemId: shelved ? null : def.id });
      },
    });
    new Button(this, {
      x: bx, y: by2, w: bw, h: 64,
      label: '賣却 판매', hotkey: '7', variant: 'danger',
      enabled: !shelved,
      onClick: () => this.store.dispatch({ type: 'OFFICE/SELL', itemId: def.id }),
    });
  }

  /* ── 하단 4택 ─────────────────────────────────────────── */

  private buildActions(s: Readonly<GameState>): void {
    const a = L.actions;
    this.rect(a.x, a.y, a.w, a.h, 'ink');
    const y = a.y + L.pad;
    const h = a.h - L.pad * 2;

    // 蘇生 — 소생실로 되돌아간다 (CCR-002). 되살릴 시체가 없으면 잠근다.
    const hasCorpse = s.corpses.some((c) =>
      s.stars.some((st) => st.id === c.starId && (st.status === 'DEAD' || st.status === 'HIDDEN')),
    );
    new Button(this, {
      x: actionX(0), y, w: ACTION_W, h,
      label: '蘇生 소생', hotkey: '1', variant: 'danger',
      enabled: hasCorpse,
      onClick: () => this.store.dispatch({ type: 'PHASE/GOTO', phase: 'REVIVE' }),
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
    // 세울 사람이 없으면 core 의 `startLive` 가 state 를 그대로 돌려준다 —
    // 즉 눌러도 아무 일이 안 일어난다. 그건 이 화면에서 제일 나쁜 버튼이므로 잠근다.
    // 단 「더는 세울 수도 되살릴 수도 없는」 날은 이 버튼이 가게를 닫는 유일한 출구다.
    const closing = s.today === null && isEarlyClosure(s);
    new Button(this, {
      x: actionX(3), y, w: ACTION_W, h,
      label: closing ? '閉店 폐업' : '出撃 방송', hotkey: '4', variant: 'danger',
      enabled: s.today !== null || closing,
      onClick: () => this.store.dispatch({ type: 'OFFICE/CONFIRM' }),
    });

    // 계약 모드에서는 「출격」 자리 위에 수락/거절을 겹치지 않고, 작업대 안에서 처리한다.
    // 하단 4택이 1~4 를 쓰므로 여기는 5·6·7 을 쓴다
    if (this.mode === 'CONTRACT') {
      const paper = L.office.paper;
      const sheet = s.visitors[this.contractIndex];
      const by = paper.y + paper.h - L.pad * 4 - 104;
      new Button(this, {
        x: paper.x + L.pad * 4, y: by, w: 300, h: 64,
        label: '계약한다', hotkey: '5',
        enabled: sheet !== undefined && s.gold >= sheet.fee,
        onClick: () => sheet && this.store.dispatch({ type: 'OFFICE/CONTRACT_ACCEPT', starId: sheet.starId }),
      });
      new Button(this, {
        x: paper.x + L.pad * 4 + 324, y: by, w: 300, h: 64,
        label: '돌려보낸다', hotkey: '6', variant: 'danger',
        enabled: sheet !== undefined,
        onClick: () => sheet && this.store.dispatch({ type: 'OFFICE/CONTRACT_REJECT', starId: sheet.starId }),
      });
      if (s.visitors.length > 1) {
        new Button(this, {
          x: paper.x + L.pad * 4 + 648, y: by, w: 220, h: 64,
          label: '次 다음 장', hotkey: '7', variant: 'ghost',
          onClick: () => {
            this.contractIndex = (this.contractIndex + 1) % s.visitors.length;
            this.redraw();
          },
        });
      }
    }
  }

  private switchMode(mode: BenchMode): void {
    this.mode = mode;
    this.redraw();
  }
}
