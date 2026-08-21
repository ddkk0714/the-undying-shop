import { SCENES } from '../../config';
import { content } from '../../core/content';
import { starArt } from '../../render/assets';
import { L } from '../../ui/layout';
import { Button } from '../../ui/Button';
import { reducedMotion } from '../../ui/options';
import { sealStamp } from '../../ui/SealStamp';
import { PhaseScene } from './PhaseScene';
import type { CorpseGrade, GameState } from '../../core/types';

/**
 * M09 ⑥ 검시실 — **이 게임의 핵심 딜레마.**
 *
 * > 깊이 갈수록 돈이 되지만, 깊이 간 자는 입을 막아야 한다.
 *
 * 화면은 판정을 숨기지 않는다. 무엇을 얻고 무엇을 잃는지 둘 다 적어 놓고,
 * **목격 기록을 붉게 보여준 뒤** 고르게 한다. 되살리면 그가 방송에서 말한다.
 *
 * 봉랍은 `ui/SealStamp.ts` — 판정을 누르면 도장이 먼저 찍히고 그 다음 단계가 넘어간다.
 */
export class AutopsyPhase extends PhaseScene {
  /** 도장이 찍히는 동안 다시 누르지 못하게 */
  private sealing = false;

  constructor() {
    super(SCENES.PHASE_AUTOPSY);
  }

  override create(): void {
  /**
   * ★ Phaser 씬 인스턴스는 stop/launch 를 거쳐도 **살아남는다.**
   * 어제 남긴 필드를 지우지 않으면 다음 날 화면이 어제 상태로 시작한다.
   */
    this.sealing = false;
    super.create();
  }

  protected build(s: Readonly<GameState>): void {
    this.stageBackdrop();
    this.spriteCover(L.stage, ['bg.autopsy']);
    this.heading('검시실');
    this.textRight(L.W - L.pad, L.stage.y + L.pad + 16, '비공개', 'dust');

    const corpse = s.corpses.find((c) => c.starId === s.today?.starId && c.diedDay === s.day) ?? s.corpses.at(-1);
    const star = s.stars.find((x) => x.id === corpse?.starId);

    const ox = L.pad * 4;
    if (corpse === undefined) {
      this.text(ox, L.stage.y + 120, '검시할 시체가 없다.', 'dust');
      new Button(this, {
        x: L.W / 2 - 264, y: L.actionsFull.y + L.pad, w: 528, h: 96,
        label: '발표로', hotkey: '3',
        onClick: () => this.store.dispatch({ type: 'PHASE/ADVANCE' }),
      });
      return;
    }

    // 좌 · 회수된 몸
    const slab = { x: ox, y: L.stage.y + 108, w: 384, h: 480 };
    this.rect(slab.x, slab.y, slab.w, slab.h, 'ink');
    this.frame(slab.x, slab.y, slab.w, slab.h, 'dust');
    if (star !== undefined) this.spriteFit(slab, [starArt(star.id).portrait, 'star.silhouette']);
    this.text(ox, slab.y + slab.h + 24, `${star?.bodyName ?? corpse.starId} · ${corpse.diedFloor}F 회수`);
    this.text(ox, slab.y + slab.h + 72, `${corpse.diedDay}일차 · 판정은 공개되지 않는다`, 'dust');

    // 목격 기록 — 이게 딜레마의 전부다
    this.buildWitnessLog(star?.witnessed ?? []);

    // 2택 카드
    const cardW = 560;
    const cardH = 460;
    const cardY = L.stage.y + 400;
    const options: {
      title: string; grade: CorpseGrade; hotkey: string;
      gain: string[]; lose: string[];
    }[] = [
      {
        title: '온 전', grade: 'INTACT', hotkey: '1',
        gain: ['부활 가능', '팬덤 유지', '페르소나 유지'],
        lose: ['진실을 그대로 가진다', '소생비가 든다'],
      },
      {
        title: '훼 손', grade: 'DAMAGED', hotkey: '2',
        gain: ['유품 확보', '페르소나 승계 가능', '진실 완전 삭제'],
        lose: ['이 몸을 잃는다', '팬덤이 깎인다'],
      },
    ];

    options.forEach((opt, i) => {
      const danger = opt.grade === 'DAMAGED';
      const x = 700 + i * (cardW + 64);
      this.rect(x, cardY, cardW, cardH, 'ink');
      this.frame(x, cardY, cardW, cardH, danger ? 'wax' : 'bone');
      this.title(x + L.pad * 2, cardY + L.pad, opt.title, danger ? 'wax' : 'bone');

      let ly = cardY + 100;
      opt.gain.forEach((line) => {
        this.text(x + L.pad * 2, ly, `+ ${line}`, 'bone');
        ly += 40;
      });
      ly += 8;
      opt.lose.forEach((line) => {
        this.text(x + L.pad * 2, ly, `− ${line}`, 'dust');
        ly += 40;
      });

      new Button(this, {
        x: x + L.pad * 2, y: cardY + cardH - 96, w: cardW - L.pad * 4, h: 80,
        label: '봉인한다', hotkey: opt.hotkey,
        variant: danger ? 'danger' : 'default',
        enabled: !this.sealing,
        onClick: () => this.seal(opt.grade),
      });
    });
  }

  /** 18F 아래에서 본 것. 되살리면 방송에서 말한다 (M09) */
  private buildWitnessLog(witnessed: readonly number[]): void {
    const x = 700;
    const y = L.stage.y + 108;
    this.label(x, y, '목격 기록', 'dust');
    if (witnessed.length === 0) {
      this.text(x, y + 32, '아무것도 보지 못했다.', 'dust');
      return;
    }
    const floors = Object.keys(content.balance.opinion.leakPerWitnessRevive).map(Number).sort((a, b) => a - b);
    witnessed.slice(0, 3).forEach((floor, i) => {
      const line = content.radio.witness?.[floors.indexOf(floor)] ?? '';
      this.text(x, y + 40 + i * 48, this.clip(`· ${floor}F  "${line}"`, L.W - x - L.pad * 4), 'wax');
    });
  }

  /** 봉랍이 먼저 찍히고, 그 다음 판정이 넘어간다 */
  private seal(grade: CorpseGrade): void {
    if (this.sealing) return;
    this.sealing = true;
    this.redraw(); // 버튼을 잠근다
    sealStamp(this, {
      x: L.W / 2,
      y: L.stage.y + 420,
      reduced: reducedMotion(this.registry),
      onDone: () => this.store.dispatch({ type: 'AUTOPSY/DECIDE', grade }),
    });
  }
}
