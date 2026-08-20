import { SCENES } from '../../config';
import { content } from '../../core/content';
import { L, slotX } from '../../ui/layout';
import { Button } from '../../ui/Button';
import { PhaseScene } from './PhaseScene';
import type { Contract, GameState } from '../../core/types';

/**
 * M05 편성실 — 화면 골격. v3 에서 캐스팅 + 진열이 한 단계로 합쳐졌다 (CCR-001).
 *
 * 모드A 「계약 심사」 — 방문자의 계약서를 읽고 수락/거절 (L.office.guest / paper)
 * 모드B 「편성」     — 출연자 3칸 + 진열대 3칸 (L.office.roster / shelf)
 *
 * 계약서의 honesty 는 절대 그리지 않는다 (02-DATA-SCHEMA §2-b).
 */
export class OfficePhase extends PhaseScene {
  private mode: 'CONTRACT' | 'ROSTER' = 'ROSTER';

  constructor() {
    super(SCENES.PHASE_OFFICE);
  }

  protected build(s: Readonly<GameState>): void {
    this.stageBackdrop();
    this.heading('편성실');

    if (this.mode === 'CONTRACT') this.buildContract(s);
    else this.buildRoster(s);

    // 모드 전환은 액션 바에 둔다 — 계약서 모드는 본문(L.office.guest/paper)이 화면을 다 덮는다
    new Button(this, {
      x: L.pad, y: L.actions.y + 10, w: 108, h: 24,
      label: this.mode === 'CONTRACT' ? '편성 보기' : '계약서 보기', variant: 'ghost',
      onClick: () => this.switchMode(this.mode === 'CONTRACT' ? 'ROSTER' : 'CONTRACT'),
    });
  }

  private switchMode(mode: 'CONTRACT' | 'ROSTER'): void {
    this.mode = mode;
    this.redraw();
  }

  /* ── 모드A · 계약 심사 ────────────────────────────────── */

  private buildContract(s: Readonly<GameState>): void {
    const o = L.office;
    this.rect(o.guest.x, o.guest.y, o.guest.w, o.guest.h, 'ash');
    this.frame(o.guest.x, o.guest.y, o.guest.w, o.guest.h);
    this.rect(o.paper.x, o.paper.y, o.paper.w, o.paper.h, 'clay');
    this.frame(o.paper.x, o.paper.y, o.paper.w, o.paper.h);

    const visitor: Contract | undefined = s.visitors[0];
    if (visitor === undefined) {
      this.text(o.guest.x + 8, o.guest.y + 12, '문 앞이 조용하다.', 'dust');
      this.text(o.paper.x + 10, o.paper.y + 12, '심사할 계약서가 없다.', 'dust');
      this.text(o.paper.x + 10, o.paper.y + 30, '방문자 생성은 M05 · Codex 가 채운다.', 'dust');
      this.confirmButton();
      return;
    }

    this.text(o.guest.x + 8, o.guest.y + 12, visitor.displayName);
    this.text(o.guest.x + 8, o.guest.y + 30, `인지도 ${visitor.recognition}`, 'dust');
    this.text(o.guest.x + 8, o.guest.y + 48, `팬덤 ${visitor.fandom}`, 'dust');

    this.text(o.paper.x + 10, o.paper.y + 10, '계 약 서');
    this.text(o.paper.x + 10, o.paper.y + 32, '시체는 반드시 회수한다.', 'dust');
    this.text(o.paper.x + 10, o.paper.y + 48, '대신 방송 중', 'dust');
    this.text(o.paper.x + 10, o.paper.y + 64, '갑의 프로듀스를 따른다.', 'dust');
    visitor.claimedTiers.slice(0, 4).forEach((tier, i) => {
      this.text(o.paper.x + 10, o.paper.y + 92 + i * 18, `${tier.floor}F 까지`, 'bone');
      this.textRight(o.paper.x + o.paper.w - 10, o.paper.y + 92 + i * 18, `${Math.round(tier.rate * 100)}%`, 'dust');
    });
    this.textRight(o.paper.x + o.paper.w - 10, o.paper.y + 10, `계약금 ${visitor.fee}G`, 'tallow');

    new Button(this, {
      x: o.paper.x + 10, y: L.actions.y + 10, w: 130, h: 24,
      label: '계약한다', hotkey: '1',
      onClick: () => this.store.dispatch({ type: 'OFFICE/CONTRACT_ACCEPT', starId: visitor.starId }),
    });
    new Button(this, {
      x: o.paper.x + 148, y: L.actions.y + 10, w: 122, h: 24,
      label: '돌려보낸다', hotkey: '2', variant: 'danger',
      onClick: () => this.store.dispatch({ type: 'OFFICE/CONTRACT_REJECT', starId: visitor.starId }),
    });
  }

  /* ── 모드B · 편성 + 진열 ──────────────────────────────── */

  private buildRoster(s: Readonly<GameState>): void {
    const o = L.office;
    const alive = s.stars.filter((star) => star.status === 'ALIVE');
    for (let i = 0; i < 3; i += 1) {
      const x = slotX(i);
      const y = o.roster.y + 18; // 제목줄(L.stage.y+L.pad) 아래로 내린다
      const h = o.roster.h - 22;
      const star = alive[i];
      const picked = star !== undefined && s.today?.starId === star.id;
      this.rect(x, y, L.slot3.w, h, picked ? 'clay' : 'ash');
      this.frame(x, y, L.slot3.w, h, picked ? 'tallow' : 'line');

      if (star === undefined) {
        this.text(x + 8, y + 10, '자리 비어 있음', 'dust');
        continue;
      }
      const inner = L.slot3.w - 16;
      const persona = s.personas.find((p) => p.id === star.personaId);
      this.text(x + 8, y + 4, this.clip(persona?.displayName ?? '무명', inner), picked ? 'tallow' : 'bone');
      this.text(x + 8, y + 20, this.clip(`${star.bodyName} · ${star.reviveCount}회`, inner), 'dust');
      this.text(x + 8, y + 36, `근 ${star.stats.grit} 매 ${star.stats.charisma} 운 ${star.stats.luck}`, 'dust');

      new Button(this, {
        x: x + 8, y: y + h - 24, w: inner, h: 20,
        label: picked ? '오늘의 출연자' : '내보낸다',
        variant: picked ? 'ghost' : 'default',
        enabled: !picked,
        onClick: () => this.store.dispatch({ type: 'OFFICE/PICK_STAR', starId: star.id }),
      });
    }

    // 진열대 3칸 — 시체에서 나온 재고를 판다 (매입비 0). 판매 처리는 리듀서 몫이다.
    this.text(L.pad + 2, o.roster.y + o.roster.h, '진열대', 'dust');
    for (let i = 0; i < 3; i += 1) {
      const x = slotX(i);
      const y = o.shelf.y + 16;
      const h = o.shelf.h - 20;
      const itemId = s.shelf[i] ?? null;
      const def = itemId === null ? undefined : content.items.find((item) => item.id === itemId);
      this.rect(x, y, L.slot3.w, h, 'ash');
      this.frame(x, y, L.slot3.w, h);
      if (def === undefined) {
        this.text(x + 8, y + 6, '비어 있음', 'dust');
        this.text(x + 8, y + 24, `재고 ${s.inventory.length}종`, 'dust');
        continue;
      }
      this.text(x + 8, y + 6, this.clip(def.name, L.slot3.w - 16));
      this.text(x + 8, y + 24, `HP+${def.hp} 공+${def.atk} 방+${def.def}`, 'dust');
      this.textRight(x + L.slot3.w - 8, y + 42, `${def.price}G`, 'tallow');
    }

    this.confirmButton();
  }

  private confirmButton(): void {
    new Button(this, {
      x: L.W / 2 - 66, y: L.actions.y + 10, w: 132, h: 24,
      label: '생방송 시작', hotkey: '3', variant: 'danger',
      onClick: () => this.store.dispatch({ type: 'OFFICE/CONFIRM' }),
    });
  }
}
