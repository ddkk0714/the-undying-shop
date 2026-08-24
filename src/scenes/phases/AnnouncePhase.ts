import { SCENES } from '../../config';
import { reputationGrade } from '../../core/content';
import { starArt } from '../../render/assets';
import { L } from '../../ui/layout';
import { Button } from '../../ui/Button';
import { onboard } from '../../ui/Onboarding';
import { PhaseScene } from './PhaseScene';
import type { GameState } from '../../core/types';

/**
 * M09 ⑦ 발표 — **마지막 칼.**
 *
 * 검시 결과와 **다르게** 말할 수 있다. 그게 이 화면의 전부다.
 *
 * ★ 결과를 설명하지 않는다. M09 §「이 조합을 발견한 플레이어는 게임을 이해한 것이다.
 *   튜토리얼로 알려주지 마라」 — 검시실은 얻는 것·잃는 것을 다 적었지만 여기는 반대다.
 *   플레이어가 아는 것은 **자기만 아는 진실**과 **두 개의 문장**뿐이다.
 */
export class AnnouncePhase extends PhaseScene {
  constructor() {
    super(SCENES.PHASE_ANNOUNCE);
  }

  protected build(s: Readonly<GameState>): void {
    this.stageBackdrop();
    this.spriteCover(L.stage, ['bg.studio']);
    this.heading('발표');

    // 🔴 ON AIR — 지금 하는 말이 그대로 나간다
    this.rect(L.W - 320, L.stage.y + L.pad + 8, 20, 20, 'wax');
    this.text(L.W - 280, L.stage.y + L.pad, 'ON AIR', 'wax');

    const corpse = s.corpses.find((c) => c.starId === s.today?.starId && c.diedDay === s.day) ?? s.corpses.at(-1);
    const persona = s.personas.find((p) => p.id === s.today?.personaId);
    const star = s.stars.find((x) => x.id === corpse?.starId);

    const ox = L.pad * 4;
    if (corpse === undefined) {
      this.text(ox, L.stage.y + 140, '오늘은 공표할 것이 없다.', 'dust');
      new Button(this, {
        x: L.W / 2 - 264, y: L.actionsFull.y + L.pad, w: 528, h: 96,
        label: '하루를 닫는다', hotkey: '1',
        onClick: () => this.store.dispatch({ type: 'ANNOUNCE/DECLARE', as: 'SUCCESS' }),
      });
      return;
    }

    // 좌 · 무대에 세울 사람
    const slab = { x: ox, y: L.stage.y + 112, w: 320, h: 400 };
    this.rect(slab.x, slab.y, slab.w, slab.h, 'ink');
    this.frame(slab.x, slab.y, slab.w, slab.h, 'dust');
    if (star !== undefined) this.spriteFit(slab, [starArt(star.id).portrait, 'star.silhouette']);
    this.text(ox, slab.y + slab.h + 24, this.clip(persona?.displayName ?? '무명', slab.w));
    this.text(ox, slab.y + slab.h + 68, `${corpse.diedFloor}F · ${star?.bodyName ?? ''}`, 'dust');

    // 중앙 · 당신만 아는 진실
    const tx = 600;
    let ty = L.stage.y + 120;
    this.label(tx, ty, '검시 결과 — 당신만 안다', 'dust');
    this.title(tx, ty + 28, corpse.grade === 'INTACT' ? '온전히 회수됨' : '훼손됨', 'wax');
    ty += 120;
    this.text(tx, ty, '팬들은 아직 아무것도 모른다.', 'dust');
    this.text(tx, ty + 44, `평판 ${reputationGrade(s.reputation)}`, 'dust');

    // 두 문장 — 결과는 적지 않는다
    const cardW = 620;
    const cardH = 260;
    const cardY = L.stage.y + 420;
    const lines: { say: string; as: 'SUCCESS' | 'FAILURE'; hotkey: string }[] = [
      { say: '"회수 성공했습니다"', as: 'SUCCESS', hotkey: '1' },
      { say: '"회수에 실패했습니다"', as: 'FAILURE', hotkey: '2' },
    ];
    lines.forEach((opt, i) => {
      const x = 600 + i * (cardW + 48);
      const lying = (corpse.grade === 'INTACT') !== (opt.as === 'SUCCESS');
      this.rect(x, cardY, cardW, cardH, 'ink');
      this.frame(x, cardY, cardW, cardH, lying ? 'wax' : 'dust');
      this.title(x + L.pad * 2, cardY + L.pad * 2, this.clip(opt.say, cardW - L.pad * 4, 'title'), lying ? 'wax' : 'bone');

      new Button(this, {
        x: x + L.pad * 2, y: cardY + cardH - 104, w: cardW - L.pad * 4, h: 80,
        label: '공표한다', hotkey: opt.hotkey,
        variant: lying ? 'danger' : 'default',
        onClick: () => this.store.dispatch({ type: 'ANNOUNCE/DECLARE', as: opt.as }),
      });
    });

    this.text(ox, L.actionsFull.y + 48, `거짓 공표 ${s.stats.falseAnnouncements}회`, 'dust');
    // 단계 제목과 같은 줄에, 제목 오른쪽으로 비켜 앉는다 (겹치면 둘 다 못 읽는다)
    onboard(this, s.day, 'ANNOUNCE', { x: 320, y: L.stage.y + L.pad, w: 1000 });
  }
}
