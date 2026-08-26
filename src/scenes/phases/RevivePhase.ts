import Phaser from 'phaser';
import { SCENES } from '../../config';
import { content } from '../../core/content';
import { reviveDaysHeld, reviveQuote } from '../../core/systems/economy';
import { pickDialogue, totalRevivals } from '../../core/systems/dialogue';
import { damagedCorpseParts } from '../../core/systems/corpse';
import { key, starArt } from '../../render/assets';
import { FONT } from '../../render/font';
import { css } from '../../render/palette';
import { L, actionX, ACTION_W } from '../../ui/layout';
import { Button } from '../../ui/Button';
import { Dialogue } from '../../ui/Dialogue';
import { reducedMotion } from '../../ui/options';
import { sealStamp } from '../../ui/SealStamp';
import { portrait } from '../../ui/Portrait';
import { createTooltip } from '../../ui/Tooltip';
import { playBgm, playSfx } from '../../audio/Sfx';
import { PhaseScene } from './PhaseScene';
import type { Corpse, CorpsePartId, CorpsePartState, GameState, ItemDef, Persona, Star } from '../../core/types';

/**
 * M04 ① 소생실 — 이 게임의 유일한 지출.
 * v3.1 부터 편성실과 같은 **상점 화면 구성**을 쓴다 (좌 인물 / 우 작업대 / 하단 4택).
 *
 * ★ 비용 산식은 `core/systems/economy.ts` 의 `reviveQuote` 가 전부 계산한다.
 *   이 씬은 숫자를 만들지 않는다. 받아서 그린다.
 * ★ v3(CCR-001) 에는 제한시간이 없다. M04 문서의 10초 타이머 항목은 폐기됐다.
 */
/** 편성실 인벤토리 창과 같은 칸 규격 — 두 화면이 같은 창처럼 보여야 한다 */
const CARRIED_PANEL = { w: 736, h: 420 };
// 진열대가 3칸이라 소지품도 최대 3점이다. 4칸으로 나누면 글자가 옆 칸에 붙는다
const CARRIED_COLUMNS = 3;

/** 사망 기록 서류(`ui.revive.record`) 원본 크기 — at() 좌표계의 기준이다 */
const RECORD_NATIVE = { w: 740, h: 1226 };

/* ── 시체 부위 마크 (`ui.revive.mark`) ─────────────────────────
 *
 * 받은 원본은 「마크 애니메이션.gif」 28프레임이다. 스프라이트시트로 구우면
 * 532×226 × 28 = 14,896px 짜리 텍스처가 되므로 그렇게 하지 않았다.
 * GIF 를 뜯어 보니 **매 프레임이 왼쪽부터 오른쪽으로 단조 증가**하는
 * 순수한 가로 와이프였다 — 그래서 **마지막 프레임 한 장만** 굽고,
 * 아래 표대로 `setCrop` 으로 드러내면 원본과 같은 박자가 나온다.
 * 표의 값은 프레임별로 실제로 그려진 폭을 GIF 에서 그대로 뽑은 것이다.
 */
const MARK_NATIVE = { w: 532, h: 226 };
const MARK_REVEAL = [
  76, 106, 146, 185, 206, 225, 252, 272, 290, 295, 313, 319, 337, 362,
  374, 388, 407, 414, 433, 446, 459, 476, 490, 501, 507, 518, 528, 532,
];
/** 프레임 간격 — 28프레임 × 46ms ≈ 1.3초. 한 번만 재생하고 마지막에 멈춘다 */
const MARK_FRAME_MS = 46;
/** 마크 사각형(=부위를 가리키는 점)의 중심. 이 점이 시체의 부위 위에 온다 */
const MARK_ANCHOR = { x: 38, y: 186 };
/** 라벨 박스 내부 — 부위명은 GIF 에 없다(빈 박스로 끝난다). 여기에 글자를 넣는다 */
const MARK_LABEL_BOX = { x: 295, y: 0, w: 237, h: 80 };

/**
 * 작업대 위에서 부위를 가리키는 자리. `L.bench` 기준 **비율**이다 —
 * 다섯 명의 시체 그림이 저마다 자세가 달라 픽셀로 박으면 한 명에게만 맞는다.
 *
 * 마크는 왼쪽 아래 사각형이 부위를 짚고 오른쪽 위로 선이 뻗어 라벨이 붙는 모양이라,
 * `fx` 가 크면 라벨 박스가 화면 밖으로 나간다. 그래서 자리를 몸의 왼쪽·가운데로 잡았다
 * (그래도 `buildPartMarks` 에서 화면 폭에 맞춰 한 번 더 물린다).
 */
const PART_ANCHOR: Record<CorpsePartId, { fx: number; fy: number }> = {
  HEAD: { fx: 0.17, fy: 0.30 },
  CHEST: { fx: 0.36, fy: 0.52 },
  'LEFT ARM': { fx: 0.28, fy: 0.74 },
  'RIGHT ARM': { fx: 0.50, fy: 0.32 },
  'LEFT LEG': { fx: 0.52, fy: 0.70 },
  'RIGHT LEG': { fx: 0.44, fy: 0.86 },
};
/** 한 번에 가리키는 부위 수. 셋을 넘기면 선과 라벨이 서로를 덮는다 */
const MARK_LIMIT = 2;
/** 라벨 박스가 서로 겹치지 않는 최소 세로 간격 */
const MARK_MIN_GAP = MARK_LABEL_BOX.h + 12;
/** 부위 상태를 라벨 아래줄에 적는 말 — 빨간 상처 아트는 쓰지 않는다 (사용자 확정: 흰색만) */
const PART_STATE_LABEL: Record<CorpsePartState, string> = {
  INTACT: 'INTACT',
  TORN: 'TORN',
  LOST: 'LOST',
};

export class RevivePhase extends PhaseScene {
  private index = 0;
  /** 도장이 찍히는 동안 다시 누르지 못하게 */
  private discarding = false;
  /** 페르소나 승계 화면을 열어 둔 상태 */
  private inheriting = false;
  /** 씌울 대상이 여럿일 때 보고 있는 사람 */
  private heirIndex = 0;
  /** 빈 소생실에서 한 번만 울리는 편성실 쪽 노크 */
  private emptyKnockTimer: Phaser.Time.TimerEvent | null = null;
  private emptyKnockPlayed = false;
  /** 사망 기록 서류를 확대해 읽는 중 (편성실 계약서 리더와 같은 패턴) */
  private recordOpen = false;
  /** 서류 도장이 찍히는 동안 다시 누르지 못하게 */
  private recordStamping = false;
  /** 하단 세 번째 버튼이 여는 공용 창고 */
  private warehouseOpen = false;
  /** 창고에서 회수 대상으로 고른 시체 소지품 */
  private selectedCarriedItemId: string | null = null;
  /** 편성실 인벤토리와 같은 호버 상세 정보 패널 */
  private warehouseItemDetail: Phaser.GameObjects.GameObject[] = [];

  /**
   * 부위 마크 — 지금 보고 있는 시체가 바뀔 때만 처음부터 다시 그려진다.
   * `markKey` 가 그 판별자다 (같은 사람이라도 죽은 날·층이 다르면 다른 시체다).
   */
  private markKey: string | null = null;
  private markAt = 0;
  /** build() 가 매번 다시 채운다. update() 가 프레임을 밀어 준다 */
  private marks: { img: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text; state: Phaser.GameObjects.Text }[] = [];

  constructor() {
    super(SCENES.PHASE_REVIVE);
  }

  override create(): void {
  /**
   * ★ Phaser 씬 인스턴스는 stop/launch 를 거쳐도 **살아남는다.**
   * 어제 남긴 필드를 지우지 않으면 다음 날 화면이 어제 상태로 시작한다.
   */
    this.index = 0;
    this.discarding = false;
    this.inheriting = false;
    this.heirIndex = 0;
    this.emptyKnockTimer = null;
    this.emptyKnockPlayed = false;
    this.recordOpen = false;
    this.recordStamping = false;
    this.warehouseOpen = false;
    this.selectedCarriedItemId = null;
    this.warehouseItemDetail = [];
    this.markKey = null;
    this.markAt = 0;
    this.marks = [];
    super.create();
    // 소생실은 편성실과 다른 곡을 쓴다 (사운드V4 · 소생실메인브금).
    //
    // ★ 이 단계만 볼륨이 1.0 인 데는 이유가 있다. **원본 파일이 유독 작다.**
    //   RMS: revive -21.9 / shop -17.7 / live -18.0 / tension -18.4 dBFS
    //   다른 단계처럼 0.35 로 두면 4.2dB 작게 들려서, 편성실에서 넘어오는 순간
    //   소리가 뚝 떨어진다. 사용자가 두 번 「더 키워 달라」고 한 자리다.
    //
    //   1.0 은 **파일을 다시 인코딩하지 않고 낼 수 있는 최대**다. 원본 피크가
    //   -4.4dBFS(=0.601) 라 1.0 배에서도 출력 피크가 0.601 이고, 클리핑까지
    //   4.4dB 가 남는다 — 효과음이 겹쳐도 깨지지 않는다.
    //   여기서 더 키우려면 볼륨을 1.0 위로 올리는 게 아니라 원본에 게인을 먹여
    //   다시 구워야 한다 (지금 환경에는 인코더가 없다).
    playBgm(this, 'bgm.revive', 1);
    // 상시 팁(`onboard`)을 걷어내고 **버튼에 올렸을 때만** 뜨는 한 줄로 바꿨다.
    // 전투 화면이 먼저 같은 이유로 옮겨 갔다 (`ui/Tooltip.ts`).
    // redraw 로 지워지지 않게 keepAlive 로 붙든다.
    this.keepAlive(...createTooltip(this).objects());
  }

  /**
   * 부위 마크는 상태가 바뀌지 않아도 계속 진행돼야 한다 — `PhaseScene.update()` 는
   * `dirty` 일 때만 다시 그리므로, 프레임 진행은 여기서 직접 민다.
   */
  override update(): void {
    super.update();
    this.stepPartMarks(this.time.now);
  }

  protected build(s: Readonly<GameState>): void {
    this.stageBackdrop();

    // 「한 화면에 끝낸다」 (M03 §승계 UI). 덮기만 하면 아래 버튼이 그대로 눌리므로
    // 아예 다른 것을 그리지 않는다.
    if (this.inheriting) {
      this.buildInherit(s);
      return;
    }

    // 소생 대상 = 아직 살아 있지 않은 몸의 시체. 살릴 수 있는지 판정은 리듀서가 한다.
    const waiting = s.corpses.filter((c) =>
      s.stars.some((st) => st.id === c.starId && (st.status === 'DEAD' || st.status === 'HIDDEN')),
    );
    if (waiting.length === 0) this.scheduleEmptyKnock();
    else this.cancelEmptyKnock();
    if (this.index >= waiting.length) this.index = 0;

    const corpse = waiting[this.index];
    const star = corpse === undefined ? undefined : s.stars.find((st) => st.id === corpse.starId);

    this.buildGuest(s, star, waiting.length);
    if (corpse !== undefined) this.buildDeathRecord();
    this.buildBench(corpse, star);
    this.buildPager(waiting.length);
    this.buildInheritButton(s);
    this.buildActions(s, corpse, star);
    if (this.warehouseOpen && corpse !== undefined) this.buildWarehouse(s, corpse);
    // 확대 리더는 맨 위에 얹는다 — 소지품 창보다도 위여야 도장이 항상 눌린다
    if (this.recordOpen && corpse !== undefined && star !== undefined) this.buildDeathRecordReader(s, corpse, star);
  }

  /** 빈 화면이 유지된 경우에만 2초 뒤 한 번 울린다. 별도 안내 문구는 추가하지 않는다. */
  private scheduleEmptyKnock(): void {
    if (this.emptyKnockPlayed || this.emptyKnockTimer !== null) return;
    this.emptyKnockTimer = this.time.delayedCall(2000, () => {
      this.emptyKnockTimer = null;
      this.emptyKnockPlayed = true;
      playSfx(this, 'sfx.revive.knock', 0.75);
    });
  }

  private cancelEmptyKnock(): void {
    this.emptyKnockTimer?.remove(false);
    this.emptyKnockTimer = null;
  }

  /* ── 좌 · 소생 수조의 몸 ──────────────────────────────── */

  private buildGuest(_s: Readonly<GameState>, star: Star | undefined, count: number): void {
    const g = L.guest;
    this.rect(g.x, g.y, g.w, g.h, 'ink');
    // 소생실 전용 배경이 오면 그걸 쓰고, 없으면 상점 방을 그대로 쓴다
    this.spriteCover(g, ['bg.revive.room', 'bg.shop.room']);
    this.frame(g.x, g.y, g.w, g.h, 'dust');

    if (star === undefined) {
      this.buildRoomLabel(count);
      this.scrimBlock(g.x + L.line, g.y + 184, 560, 56);
      this.text(g.x + L.pad, g.y + 200, '소생 수조가 비어 있다.', 'dust');
      return;
    }

    this.buildRoomLabel(count);
  }

  /** 좌측 칸 좌상단의 방 이름 — 배경이 밝은 곳에 걸려도 읽히게 판을 깐다 */
  private buildRoomLabel(count: number): void {
    const g = L.guest;
    this.scrimBlock(g.x + L.line, g.y + L.line, 460, 136);
    this.title(g.x + L.pad, g.y + L.pad, '소생실');
    this.text(g.x + L.pad, g.y + 96, `대기 ${count}구`, 'dust');
  }

  /* ── 우 · 작업대에 올린 시체 기록 ─────────────────────── */

  private buildBench(corpse: Corpse | undefined, star: Star | undefined): void {
    const b = L.bench;
    this.rect(b.x, b.y, b.w, b.h, 'ink');
    /**
     * 한 사이클을 돌고 **시체가 생기면** 작업대에 그 사람의 시체 연출이 깔린다.
     * 다섯 명이 저마다 다른 그림을 쓴다 (`star.corpse.*` — 검사·궁수·도적·마법사·힐러).
     *
     * 그림이 아직 없는 몸이면 조용히 예전 배경으로 내려간다. 순서가 곧 우선순위다:
     *   그 사람의 시체 -> 소생실 작업대 -> 편성실 작업대
     */
    const corpseArt = star === undefined || corpse === undefined ? null : starArt(star.id).corpse;
    this.spriteCover(b, [...(corpseArt === null ? [] : [corpseArt]), 'bg.revive.bench', 'bg.shop.bench']);
    // 소생실에서는 작업대에 장부와 도장만 올려 둔다 (진열은 편성실 몫)
    this.frame(b.x, b.y, b.w, b.h, 'dust');
    this.buildPartMarks(corpse);
    // 사망 위치·시체 상태·부활 횟수·소생 비용은 전부 좌측의 사망 기록 서류로 옮겼다
    // (사용자 확정) — 작업대는 몸 그림만 남기고 글자를 지운다.
  }

  /**
   * 시체 위에 부위 마크를 얹는다 — 마크가 찍히고 선이 뻗어 라벨 박스가 그려진 뒤,
   * **마지막에** 부위명이 들어온다. 한 번만 재생하고 그 상태로 멈춘다 (반복 없음).
   *
   * 오브젝트는 `keepAlive` 하지 않는다. 창고를 여닫을 때마다 redraw 가 도는데
   * 살려 두면 그 위에 겹쳐 쌓인다. 대신 **시작 시각(`markAt`)만** 들고 있어서,
   * 다시 그려져도 애니메이션이 처음으로 되감기지 않는다.
   */
  private buildPartMarks(corpse: Corpse | undefined): void {
    this.marks = [];
    if (corpse === undefined || !this.hasArt('ui.revive.mark')) return;

    // 같은 사람이라도 죽은 날·층이 다르면 다른 시체다 — 그때는 처음부터 다시 그린다
    const nextKey = `${corpse.starId}:${corpse.diedDay}:${corpse.diedFloor}`;
    if (this.markKey !== nextKey) {
      this.markKey = nextKey;
      this.markAt = this.time.now;
    }

    const b = L.bench;
    /**
     * 어느 부위가 상했는지는 `core/systems/corpse.ts` 가 정한다 (HO-029).
     * 이 씬은 판정하지 않는다 — 험한 순서로 받아서 앞에서 몇 개만 짚는다.
     * 몸이 통째로 멀쩡하면 그것도 정보다 — 가슴 한 곳에 `INTACT` 를 세워 둔다.
     */
    const damaged = damagedCorpseParts(this.store.getState().seed, corpse);
    const shown: { part: CorpsePartId; state: CorpsePartState }[] = damaged.length === 0
      ? [{ part: 'CHEST', state: 'INTACT' }]
      : damaged.slice(0, MARK_LIMIT);

    // 작업대 오른쪽 위는 `buildPager` 의 「다음 n/m」 자리다 — 라벨 박스가 그 위에 얹히면
    // 둘 다 못 읽는다. 겹치는 마크는 버튼 아래로 내려 보낸다
    const pagerBottom = b.y + L.pad * 3 + 28 + 56 + 10;
    const pagerLeft = b.x + b.w - 320;

    // 라벨이 서로를 덮지 않도록 위에서 아래로 세우고, 붙으면 아래쪽을 조금 밀어 내린다
    const placed = shown
      .map((entry) => {
        const ox = Math.round(b.x + b.w * PART_ANCHOR[entry.part].fx - MARK_ANCHOR.x);
        const oy = Math.round(b.y + b.h * PART_ANCHOR[entry.part].fy - MARK_ANCHOR.y);
        const hitsPager = ox + MARK_LABEL_BOX.x + MARK_LABEL_BOX.w > pagerLeft;
        return { entry, ox, oy: hitsPager ? Math.max(oy, pagerBottom) : oy };
      })
      .sort((a, c) => a.oy - c.oy);
    for (let index = 1; index < placed.length; index += 1) {
      const gap = placed[index].oy - placed[index - 1].oy;
      if (gap < MARK_MIN_GAP) placed[index].oy += MARK_MIN_GAP - gap;
    }

    for (const spot of placed) {
      // 마크 사각형의 중심이 부위 위에 오도록 이미지를 끌어다 놓는다
      // 라벨 박스는 마크의 오른쪽 끝이라, 화면 밖으로 나가지 않게 여기서 한 번 물린다
      const ox = Math.min(spot.ox, this.scale.width - MARK_NATIVE.w - 8);
      const oy = spot.oy;

      const img = this.add.image(ox, oy, key('ui.revive.mark')).setOrigin(0, 0);
      const cx = ox + MARK_LABEL_BOX.x + Math.round(MARK_LABEL_BOX.w / 2);
      const cy = oy + MARK_LABEL_BOX.y + Math.round(MARK_LABEL_BOX.h / 2);
      // 부위명 위 · 상태 아래. 색은 bone 하나뿐이다 (사용자 확정: 흰색만, 빨간 마크 폐지)
      const label = this.add
        .text(cx, cy - 15, spot.entry.part, { ...FONT, color: css('bone'), fontSize: '26px' })
        .setOrigin(0.5);
      const state = this.add
        .text(cx, cy + 15, PART_STATE_LABEL[spot.entry.state], { ...FONT, color: css('bone'), fontSize: '22px' })
        .setOrigin(0.5);

      this.marks.push({ img, label, state });
    }
    this.stepPartMarks(this.time.now);
  }

  /**
   * 마크 한 프레임을 밀어 준다. `MARK_REVEAL` 표의 폭까지만 잘라 보여 주는 것이
   * 곧 원본 GIF 의 한 프레임이다. 표 끝에 닿으면 거기서 멈춘다 — 되감지 않는다.
   */
  private stepPartMarks(now: number): void {
    if (this.marks.length === 0) return;
    const last = MARK_REVEAL.length - 1;
    // 연출 감소면 완성형으로 바로 보여 준다 (04-UI-KIT — 움직임만 걷어내고 정보는 남긴다)
    const frame = reducedMotion(this.registry)
      ? last
      : Math.min(last, Math.floor((now - this.markAt) / MARK_FRAME_MS));
    const shown = MARK_REVEAL[frame] ?? MARK_NATIVE.w;
    const done = frame >= last;

    for (const m of this.marks) {
      m.img.setCrop(0, 0, shown, MARK_NATIVE.h);
      // 부위명과 상처는 **다 그려진 뒤에** 들어온다 (사용자 확정)
      m.label.setVisible(done);
      m.state.setVisible(done);
    }
  }

  /* ── 좌 · 사망 기록 서류 ──────────────────────────────── */

  /**
   * 책상 위에 놓인 사망 기록 축소본 — 누르면 확대해서 읽는다.
   * 시체 상태·부활 횟수·사망 위치·소생 비용은 전부 이 서류(확대판)에만 적는다.
   */
  private buildDeathRecord(): void {
    if (this.recordOpen || !this.hasArt('ui.revive.record')) return; // 확대 리더가 같은 그림을 그대로 보여준다
    const g = L.guest;
    const w = 300;
    const h = Math.round((w * RECORD_NATIVE.h) / RECORD_NATIVE.w);
    const x = g.x + Math.round((g.w - w) / 2);
    // 방 이름판 아래 ~ 대사창 위, 빈 칸 한가운데
    const top = g.y + 160;
    const bottom = L.dialogue.y;
    const y = top + Math.round((bottom - top - h) / 2);
    const sheet = this.add.image(x, y, key('ui.revive.record'))
      .setOrigin(0, 0)
      .setDisplaySize(w, h)
      .setInteractive({ cursor: 'pointer' });
    sheet.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.leftButtonDown()) return;
      this.recordOpen = true;
      this.redraw();
    });
    this.scrimBlock(x - 12, y + h + 4, w + 24, 44);
    this.text(x, y + h + 10, '눌러서 사망 기록을 확인합니다.', 'dust').setScale(0.6);
  }

  /**
   * 확대한 사망 기록 — 편성실 계약서 리더와 같은 패턴이다.
   * 서류 자체를 누르면 접히고, 도장란(원화에 인쇄된 원형 자리)을 누르면
   * 도장이 찍히며 그 자리에서 바로 소생(`REVIVE/PAY`)이 확정된다.
   */
  private buildDeathRecordReader(s: Readonly<GameState>, corpse: Corpse, star: Star): void {
    if (!this.hasArt('ui.revive.record')) {
      this.recordOpen = false;
      return;
    }
    const paperH = 800;
    const paperW = Math.round((paperH * RECORD_NATIVE.w) / RECORD_NATIVE.h);
    const paper = { x: L.guest.x + Math.round((L.guest.w - paperW) / 2), y: 100, w: paperW, h: paperH };
    const scale = paper.w / RECORD_NATIVE.w;
    const depth = 800;
    const at = (nx: number, ny: number, value: string, ts = 0.62, color: 'ink' | 'wax' = 'ink') =>
      this.text(paper.x + nx * scale, paper.y + ny * scale, value, color).setScale(ts * scale).setDepth(depth + 2);

    // 종이를 별도 팝업처럼 검게 가리지 않는다 — 책상 위 축소본이 그대로 커진 것처럼 보인다
    this.add.image(paper.x, paper.y, key('ui.revive.record')).setOrigin(0, 0).setDisplaySize(paper.w, paper.h).setDepth(depth);

    const persona = s.personas.find((p) => p.id === star.personaId);
    const quote = reviveQuote(s, corpse, star);
    const daysHeld = reviveDaysHeld(s, corpse);

    // 좌상단은 종이 자체에 그려진 클립 그림과 겹친다 — 제목은 클립을 피해 오른쪽에서 시작한다
    at(170, 66, '사망 기록', 1.05);
    at(605, 78, `#${star.reviveCount + 1}`, 0.6, 'ink');
    at(60, 172, `이름 : ${this.clip(persona?.displayName ?? star.bodyName, 520, 'body')}`, 0.85);
    at(60, 234, `사망 층 : ${corpse.diedFloor}F`, 0.85);
    at(60, 296, `경과 : ${daysHeld}일`, 0.85);
    at(60, 408, `상태 : ${corpse.grade === 'INTACT' ? '온전' : '훼손'}`, 0.85);

    // 도장이 앉는 원형 워터마크 자리(약 400~840)를 비워 두고, 그 아래 좁은 띠에 나머지를 몰아 적는다.
    // 목격·경고·비용을 한 줄씩으로 압축한다 — 최대 3줄이 895~1080 구간(185px)에 다 들어가야 한다.
    let by = 900;
    if (star.witnessed.length > 0) {
      at(60, by, `목격 : ${star.witnessed.map((f) => `${f}F`).join(' · ')}`, 0.66);
      by += 48;
    }
    if (quote.witnessWarning) {
      at(60, by, '아래를 본 사람이다 — 되살리면 방송에서 말한다.', 0.58, 'wax');
      by += 48;
    }
    at(60, by, `소생 비용 : ${fmtGold(quote.cost)} G   ·   보유 : ${fmtGold(s.gold)} G`, 0.7, quote.affordable ? 'ink' : 'wax');
    by += 48;
    // 도장은 소생을 확정하지 않는다 — 상태 판정만 확인한다. 실제 소생 여부는
    // 하단 「소생」 버튼에서 결정한다 (사용자 확정)
    at(60, by, '도장 = 상태 판정 확인. 소생은 하단 버튼으로 결정합니다.', 0.5);

    // 도장 — 서류에 인쇄된 원형 자리에 앉힌다. 등급은 시체 상태 그대로다 (온전=S · 훼손=F)
    const stampKey = corpse.grade === 'INTACT' ? 'prop.revive.stamp.s' : 'prop.revive.stamp.f';
    const stampW = Math.round(340 * scale);
    const stampH = Math.round(354 * scale);
    const stampCenter = { x: paper.x + 370 * scale, y: paper.y + 620 * scale };
    const stampBox = {
      x: Math.round(stampCenter.x - stampW / 2), y: Math.round(stampCenter.y - stampH / 2), w: stampW, h: stampH,
    };
    const stamp = this.spriteObject(stampBox.x, stampBox.y, stampKey, stampBox.w, stampBox.h);
    stamp?.setDepth(depth + 4).setAlpha(0);

    // 펼침을 만든 첫 클릭과 충돌하지 않도록, 다음 프레임부터만 접기 입력을 받는다 (편성실과 동일)
    const page = this.add.zone(paper.x, paper.y, paper.w, paper.h).setOrigin(0, 0).setDepth(depth + 1);
    this.time.delayedCall(0, () => {
      if (!page.active) return;
      page.setInteractive({ cursor: 'pointer' });
      page.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (!pointer.leftButtonDown()) return;
        if (pointer.x >= stampBox.x && pointer.x <= stampBox.x + stampBox.w
          && pointer.y >= stampBox.y && pointer.y <= stampBox.y + stampBox.h) return;
        this.recordOpen = false;
        this.redraw();
      });
    });

    // 도장은 「소생 확정」이 아니라 「상태 판정 확인」이다 (사용자 확정) — 찍어도
    // REVIVE/PAY 를 부르지 않는다. 실제 소생은 하단 액션 바의 「소생」 버튼이 그대로 맡는다.
    // 한 번 찍히면 그 자리에 그대로 남는다 — 마우스가 벗어나도 다시 흐려지지 않는다.
    const recordKey = `reviveRecordStamped:${corpse.starId}:${corpse.diedDay}:${corpse.diedFloor}`;
    let stamped = s.flags[recordKey] === true;
    if (stamped) stamp?.setAlpha(1);
    const stampZone = this.add.zone(stampBox.x, stampBox.y, stampBox.w, stampBox.h)
      .setOrigin(0, 0)
      .setDepth(depth + 5)
      .setInteractive({ cursor: 'pointer' });
    stampZone.on('pointerover', () => { if (!stamped) stamp?.setAlpha(0.38); });
    stampZone.on('pointerout', () => { if (!stamped && !this.recordStamping) stamp?.setAlpha(0); });
    stampZone.on('pointerup', () => {
      if (this.recordStamping || stamped || stamp === null) return;
      this.recordStamping = true;
      stamp.setAlpha(1).setY(stampBox.y - 44);
      this.tweens.add({
        targets: stamp,
        y: stampBox.y,
        duration: 120,
        ease: 'Quad.easeIn',
        onComplete: () => {
          playSfx(this, 'sfx.contract.stamp', 0.2);
          this.recordStamping = false;
          stamped = true;
          this.store.dispatch({ type: 'REVIVE/RECORD_STAMP', starId: corpse.starId, diedDay: corpse.diedDay, diedFloor: corpse.diedFloor });
        },
      });
    });
  }

  /** 편성실 인벤토리와 같은 칸으로, 시체 소지품을 고른 뒤 하단 「회수」로 옮긴다. */
  private buildWarehouse(s: Readonly<GameState>, corpse: Corpse): void {
    const panel = {
      x: L.bench.x + Math.round((L.bench.w - CARRIED_PANEL.w) / 2),
      y: L.bench.y + L.bench.h - CARRIED_PANEL.h,
      w: CARRIED_PANEL.w,
      h: CARRIED_PANEL.h,
    };
    const ix = panel.x + 28;
    if (!this.spriteFit(panel, ['ui.inventory.window'])) {
      this.rect(panel.x, panel.y, panel.w, panel.h, 'ink');
      this.frame(panel.x, panel.y, panel.w, panel.h, 'bone');
    }
    const carried = corpse.carried ?? [];
    if (this.selectedCarriedItemId !== null && !carried.includes(this.selectedCarriedItemId)) this.selectedCarriedItemId = null;
    const storedKinds = s.inventory.filter((stack) => stack.qty > 0).length;
    this.text(ix, panel.y + 16, `창고  ${storedKinds}종 · 소지품 ${carried.length}점`, 'ink');
    this.label(ix, panel.y + 70, '시체 소지품을 고른 뒤, 하단의 「회수」를 누르면 창고에 들어옵니다.', 'dust').setScale(1.3);
    new Button(this, {
      x: panel.x + panel.w + 12, y: panel.y + 8, w: 128, h: 52,
      label: '닫기',
      onClick: () => {
        this.warehouseOpen = false;
        this.selectedCarriedItemId = null;
        this.hideWarehouseItemDetail();
        this.redraw();
      },
    });
    if (carried.length === 0) {
      this.text(ix, panel.y + 166, '회수할 소지품이 없습니다.', 'dust');
      return;
    }
    const cellW = Math.floor((panel.w - 56) / CARRIED_COLUMNS);
    carried.forEach((itemId, index) => {
      const def = content.items.find((item) => item.id === itemId);
      if (def === undefined) return;
      const cellX = ix + (index % CARRIED_COLUMNS) * cellW;
      const cellY = panel.y + 144 + Math.floor(index / CARRIED_COLUMNS) * 128;
      const selected = itemId === this.selectedCarriedItemId;
      this.spriteFitObject(
        { x: cellX - 2, y: cellY - 5, w: cellW + 4, h: 116 },
        [selected ? 'ui.inventory.selected' : 'ui.inventory.slot'],
      )?.setDepth(10);
      const zone = this.add.zone(cellX + 4, cellY, cellW - 8, 108).setOrigin(0, 0).setDepth(25).setInteractive({ cursor: 'pointer' });
      zone.on('pointerup', () => {
        this.selectedCarriedItemId = itemId;
        this.hideWarehouseItemDetail();
        this.redraw();
      });
      zone.on('pointerover', (pointer: Phaser.Input.Pointer) => this.showWarehouseItemDetail(def, pointer));
      zone.on('pointerout', () => this.hideWarehouseItemDetail());
      this.itemArt(def, { x: cellX + 3, y: cellY + 5, w: cellW - 6, h: 84 })?.setX(Math.round(cellX + cellW / 2 - 14)).setDepth(20);
    });
  }

  /** 편성실 인벤토리와 같은 위치·원본 정보창으로 장비 정보를 보인다. */
  private showWarehouseItemDetail(item: ItemDef, pointer: Phaser.Input.Pointer): void {
    this.hideWarehouseItemDetail();
    const w = 450;
    const h = 948;
    const x = Math.max(8, Math.min(L.W - w - 8, pointer.x + 24 <= L.W - w - 8 ? pointer.x + 24 : pointer.x - w - 24));
    const y = Math.max(72, Math.min(L.H - h - 8, pointer.y - h - 56));
    const depth = 5000;
    const add = <T extends Phaser.GameObjects.GameObject>(object: T): T => {
      this.warehouseItemDetail.push(object);
      return object;
    };
    if (this.hasArt('ui.inventory.info')) add(this.add.image(x, y, key('ui.inventory.info')).setOrigin(0, 0).setDisplaySize(w, h).setDepth(depth));
    else add(this.add.rectangle(x, y, w, h, 0x07110b, 0.96).setOrigin(0, 0).setDepth(depth));
    const body = (dx: number, dy: number, text: string, color: 'bone' | 'dust' | 'wax' = 'bone', scale = 0.9) =>
      add(this.text(x + dx, y + dy, text, color).setScale(scale).setDepth(depth + 1));
    const label = (dx: number, dy: number, text: string) => add(this.label(x + dx, y + dy, text, 'dust').setScale(1.3).setDepth(depth + 1));
    const slot = content.balance.equipment.slotByItem[item.id];
    const slotName = slot === 0 ? 'WEAPON' : slot === 1 ? 'ARMOR' : 'UTILITY';
    const signed = (value: number) => `${value >= 0 ? '+' : ''}${value}`;
    body(29, 28, this.clip(item.name, 286, 'body'), item.isRelic ? 'wax' : 'bone', 1.1);
    body(344, 31, item.tier, item.isRelic ? 'wax' : 'bone', 1.1);
    const icon = this.itemArt(item, { x: x + 50, y: y + 130, w: 112, h: 112 });
    if (icon !== null) add(icon.setDepth(depth + 2));
    body(205, 138, item.kind === 'POTION' ? 'POTION' : item.isRelic ? 'RELIC' : slotName, 'bone', 1.0);
    body(205, 185, `${item.price.toLocaleString('en-US')} G`, 'bone', 1.25);
    body(38, 286, item.kind === 'POTION' ? `HEAL  +${item.healing}` : `HP    ${signed(item.hp)}\nATK   ${signed(item.atk)}\nDEF   ${signed(item.def)}`, 'bone', 0.95);
    label(38, 445, '특성');
    body(38, 485, item.kind === 'POTION' ? '<HEAL>' : `<${slotName}>`, item.isRelic ? 'wax' : 'bone', 1.0);
    label(38, 644, '회수');
    body(38, 684, '선택한 뒤 하단 「회수」를 누르면\n공용 인벤토리에 들어갑니다.', 'dust', 0.9);
  }

  private hideWarehouseItemDetail(): void {
    this.warehouseItemDetail.forEach((object) => object.destroy());
    this.warehouseItemDetail = [];
  }

  private itemArt(item: ItemDef, box: { x: number; y: number; w: number; h: number }): Phaser.GameObjects.Image | null {
    if (!this.hasArt(item.iconKey)) return null;
    const texture = key(item.iconKey);
    const source = this.textures.get(texture).getSourceImage() as { width: number; height: number };
    const scale = Math.min(box.w / source.width, box.h / source.height);
    return this.add.image(Math.round(box.x + box.w / 2), Math.round(box.y + box.h / 2), texture)
      .setDisplaySize(Math.max(1, Math.round(source.width * scale)), Math.max(1, Math.round(source.height * scale)));
  }

  /* ── 페르소나 승계 (M03) ─────────────────────────────── */

  /**
   * 씌울 수 있는 조합. core 의 `inherit()` 가드를 그대로 읽는다 —
   * 이름이 붙어 있던 몸이 더는 살아 있지 않고 시체가 남아 있을 때,
   * 이름 없는 산 몸에 옮겨 씌울 수 있다.
   */
  /**
   * 의심도 — 눈이 떠지는 5단.
   *
   * 「팬들은 대부분 모른다」 옆에 두는 그림이다. 대부분은 모르지만 **눈 하나는 떠 있고,**
   * 이름을 갈아 끼울 때마다 조금 더 떠진다. 승계가 공짜가 아니라는 걸 숫자 말고 그림으로 말한다.
   *
   * 아트 5장이 다 있을 때만 그린다 — 한 칸이라도 비면 게이지가 거짓말을 한다.
   * 증가량은 `balance.roster.inheritSuspicion` 을 읽는다 (씬에 숫자를 두지 않는다).
   */
  private suspicionRow(x: number, y: number, persona: Persona): void {
    const before = persona.suspicion;
    const after = Math.min(100, before + content.balance.roster.inheritSuspicion);
    if (!this.suspicionEye(x, y, before)) return;
    this.title(x + 108, y + 6, '→', 'wax');
    this.suspicionEye(x + 160, y, after);
    this.label(x, y + 76, `의심  ${before} → ${after}`, 'dust');
  }

  /** 0..100 을 눈 5칸으로 본다. 표시 단계일 뿐 규칙이 아니다 — 규칙은 core 가 가진다 */
  private suspicionEye(x: number, y: number, value: number): boolean {
    const step = Math.max(1, Math.min(5, 1 + Math.floor(value / 25)));
    const artKey = `ui.suspicion${step}`;
    if (!this.hasArt('ui.suspicion1') || !this.hasArt('ui.suspicion5') || !this.hasArt(artKey)) return false;
    this.sprite(x, y, artKey, 96, 64);   // 192x128 의 정확히 1/2
    return true;
  }

  private inheritable(s: Readonly<GameState>): { persona: Persona; from: Star; heirs: Star[] } | null {
    for (const persona of s.personas) {
      const from = s.stars.find((x) => x.personaId === persona.id && x.status !== 'ALIVE');
      if (from === undefined) continue;
      if (!s.corpses.some((c) => c.starId === from.id)) continue;
      const heirs = s.stars.filter((x) => x.status === 'ALIVE' && x.personaId === null);
      if (heirs.length === 0) continue;
      return { persona, from, heirs };
    }
    return null;
  }

  private buildInheritButton(s: Readonly<GameState>): void {
    const ready = this.inheritable(s);
    if (ready === null || this.inheriting) return;
    const b = L.bench;
    new Button(this, {
      x: b.x + b.w - 300, y: b.y + b.h - 96, w: 260, h: 64,
      label: '승계', hotkey: '6', variant: 'danger',
      tip: `죽은 자의 이름을 살아 있는 다른 몸에 옮겨 씌웁니다. 팬덤이 ${Math.round(content.balance.roster.inheritFandomLoss * 100)}% 떨어지고 의심이 ${content.balance.roster.inheritSuspicion} 오릅니다.`,
      onClick: () => {
        this.inheriting = true;
        this.heirIndex = 0;
        this.redraw();
      },
    });
  }

  /**
   * M03 §승계 UI — 「한 화면에 끝낸다」.
   * 마지막 줄 **「팬들은 대부분 모른다.」** 이 한 문장이 이 화면의 전부다.
   */
  private buildInherit(s: Readonly<GameState>): void {
    const ready = this.inheritable(s);
    if (ready === null) {
      this.inheriting = false;
      return;
    }
    const { persona, from, heirs } = ready;
    if (this.heirIndex >= heirs.length) this.heirIndex = 0;
    const heir = heirs[this.heirIndex]!;

    const w = 1280;
    const h = 700;
    const x = Math.round((L.W - w) / 2);
    const y = L.stage.y + 56;
    this.rect(x, y, w, h, 'ink');
    this.frame(x, y, w, h, 'bone');

    this.label(x + L.pad * 2, y + L.pad, '페르소나 승계', 'dust');
    this.title(x + L.pad * 2, y + 44, `「${persona.displayName}」  ${persona.generation}대 → ${persona.generation + 1}대`);

    // 왼쪽 · 이름을 잃는 몸  →  오른쪽 · 이름을 받는 몸
    // 세로 예산: 초상 310..650 · 이름 666 · 계보 706 · 문장 740 · 버튼 812..884 (카드 900 끝)
    const slot = { w: 300, h: 340 };
    const ly = y + 110;
    const lx = x + 96;
    const rx = x + w - 96 - slot.w;
    const reduced = reducedMotion(this.registry);
    portrait(this, { x: lx, y: ly, w: slot.w, h: slot.h }, from, { reduced });
    this.frame(lx, ly, slot.w, slot.h, 'dust');
    portrait(this, { x: rx, y: ly, w: slot.w, h: slot.h }, heir, { reduced });
    this.frame(rx, ly, slot.w, slot.h, 'bone');

    this.text(lx, ly + slot.h + 16, this.clip(from.bodyName, slot.w), 'dust');
    // 아직 죽지 않은 대는 0F 로 들어 있다. 계보에 0F 를 적지 않는다
    const line = persona.lineage.filter((entry) => entry.diedFloor > 0).map((entry) => `${entry.diedFloor}F`).join(' · ');
    this.label(lx, ly + slot.h + 56, line === '' ? '계보 없음' : line, 'dust');

    this.text(rx, ly + slot.h + 16, this.clip(heir.bodyName, slot.w));
    const heirProfile = content.starProfiles[heir.id];
    this.label(
      rx,
      ly + slot.h + 56,
      heirProfile === undefined
        ? `grit ${heir.stats.grit}  cha ${heir.stats.charisma}  luck ${heir.stats.luck}`
        : `HP ${heirProfile.hp}  ATK ${heirProfile.atk}  DEF ${heirProfile.def}  WILL ${heirProfile.will}`,
      'dust',
    );

    // 가운데 — 이름이 건너가는 자리. 팬덤이 얼마나 떨어져 나가는지 여기서 말한다
    const mx = lx + slot.w + 24;
    const mw = rx - mx - 24;
    this.title(mx + Math.round(mw / 2) - 24, ly + 130, '→', 'wax');

    const loss = content.balance.roster.inheritFandomLoss;
    const after = Math.floor(persona.fandom * (1 - loss));
    this.text(mx, ly + 210, `팬덤 ${fmtGold(persona.fandom)}`, 'dust');
    this.text(mx, ly + 250, `  → ${fmtGold(after)}  (-${Math.round(loss * 100)}%)`, 'wax');

    // 팬덤 바로 아래 — 이름을 갈아 끼우면 의심이 올라간다. 같은 문법으로 이어 붙인다
    this.suspicionRow(mx, ly + 300, persona);

    // 이 한 문장이 이 화면의 전부다 (M03). 이름·계보 아래, 버튼 위에 혼자 놓는다
    this.title(x + L.pad * 2, ly + slot.h + 100, '팬들은 대부분 모른다.', 'bone');

    const by = y + h - 88;
    new Button(this, {
      x: x + L.pad * 2, y: by, w: 320, h: 72,
      label: '씌운다', hotkey: '1', variant: 'danger',
      tip: `「${persona.displayName}」 을 이 몸에 넘깁니다. 되돌릴 수 없습니다. 팬덤 -${Math.round(content.balance.roster.inheritFandomLoss * 100)}% · 의심 +${content.balance.roster.inheritSuspicion}.`,
      onClick: () => {
        this.inheriting = false;
        this.store.dispatch({ type: 'REVIVE/INHERIT', personaId: persona.id, toStarId: heir.id });
      },
    });
    new Button(this, {
      x: x + L.pad * 2 + 344, y: by, w: 320, h: 72,
      label: '그만둔다', hotkey: '2', variant: 'ghost',
      tip: '승계하지 않고 소생실로 돌아갑니다.',
      onClick: () => {
        this.inheriting = false;
        this.redraw();
      },
    });
    if (heirs.length > 1) {
      new Button(this, {
        x: x + w - L.pad * 2 - 260, y: by, w: 260, h: 72,
        label: `다음 ${this.heirIndex + 1}/${heirs.length}`, hotkey: '3', variant: 'ghost',
        tip: '이름을 받을 다른 몸을 봅니다. 능력치가 저마다 다릅니다.',
        onClick: () => {
          this.heirIndex = (this.heirIndex + 1) % heirs.length;
          this.redraw();
        },
      });
    }
  }

  /** 대기 중인 시체가 여럿이면 작업대 위에서 넘긴다. 하단 네 자리는 3택 + 편성실이 쓴다 */
  private buildPager(count: number): void {
    if (count <= 1) return;
    const b = L.bench;
    this.label(b.x + b.w - 300, b.y + L.pad * 3, `대기 ${count}구`, 'dust');
    new Button(this, {
      x: b.x + b.w - 300, y: b.y + L.pad * 3 + 28, w: 220, h: 56,
      label: `다음 ${this.index + 1}/${count}`, hotkey: '5', variant: 'ghost',
      tip: '대기 중인 다음 시체를 봅니다.',
      onClick: () => {
        this.index = (this.index + 1) % Math.max(1, count);
        this.redraw();
      },
    });
  }

  /* ── 하단 4택 — 蘇生 / 保管 / 廢棄 (M04 §화면의 3택) + 編成 ── */

  /**
   * M04 §81 — 폐기 확정 시 봉랍 도장이 먼저 찍힌다.
   * 누르는 즉시 dispatch 하면 시체가 목록에서 사라져 도장이 보일 새가 없다.
   */
  private discard(starId: string): void {
    if (this.discarding) return;
    this.discarding = true;
    this.redraw();
    sealStamp(this, {
      x: L.guest.x + L.guest.w / 2,
      y: L.guest.y + L.guest.h / 2,
      reduced: reducedMotion(this.registry),
      onDone: () => {
        this.discarding = false;
        this.index = 0;
        this.store.dispatch({ type: 'REVIVE/DISCARD', starId });
      },
    });
  }

  private buildActions(s: Readonly<GameState>, corpse: Corpse | undefined, star: Star | undefined): void {
    const a = L.actions;
    this.rect(a.x, a.y, a.w, a.h, 'ink');
    const y = a.y + L.pad;
    const h = a.h - L.pad * 2;
    const quote = corpse !== undefined && star !== undefined ? reviveQuote(s, corpse, star) : null;

    new Button(this, {
      x: actionX(0), y, w: ACTION_W, h,
      label: quote === null ? '소생' : `소생 ${fmtGold(quote.cost)}G`,
      hotkey: '1', variant: 'danger',
      enabled: quote?.affordable === true,
      tip: quote === null
        ? '되살릴 시체가 없습니다.'
        : quote.affordable
          ? `${fmtGold(quote.cost)}G 를 내고 되살립니다. 부활 횟수가 1 오르고, 몸이 그만큼 열화해 다음 소생은 ${Math.round((content.balance.revive.degradeExp - 1) * 100)}% 비싸집니다.`
          : `자금이 ${fmtGold(quote.cost - s.gold)}G 모자랍니다. 장비를 팔거나 시체를 폐기해 마련하세요.`,
      onClick: () => {
        if (corpse === undefined) return;
        const revivedStar = star;
        playSfx(this, 'sfx.revive', 0.8);
        this.store.dispatch({ type: 'REVIVE/PAY', starId: corpse.starId });
        // reducer가 화면을 새 상태로 다시 그린 뒤, 소생 완료 대사를 한 번 얹는다.
        // REVIVE 조건은 이번 소생까지 포함해야 하므로 직전 횟수에 1을 더한다.
        if (revivedStar !== undefined) {
          const profile = content.starProfiles[revivedStar.id];
          const line = pickDialogue(revivedStar.id, 'REVIVE', {
            floor: profile?.targetFloor,
            revives: totalRevivals(revivedStar.id, revivedStar.reviveCount + 1),
            viewers: profile?.fans,
            deaths: this.store.getState().stats.totalDiscarded,
            generation: this.store.getState().personas.find((persona) => persona.id === revivedStar.personaId)?.generation,
          }, (this.store.getState().day % 10) / 10);
          if (line !== null) this.time.delayedCall(0, () => this.showReviveDialogue(line.text, line.effects));
        }
      },
    });
    const selectedCarried = corpse?.carried?.includes(this.selectedCarriedItemId ?? '') === true
      ? this.selectedCarriedItemId
      : null;
    new Button(this, {
      x: actionX(1), y, w: ACTION_W, h,
      label: this.warehouseOpen ? '회수' : '폐기', hotkey: '2', variant: this.warehouseOpen ? 'ghost' : 'danger',
      enabled: this.warehouseOpen ? selectedCarried !== null : corpse !== undefined && !this.discarding,
      tip: this.warehouseOpen
        ? selectedCarried === null
          ? '창고의 소지품에서 회수할 장비를 먼저 고르세요.'
          : '선택한 장비를 시체에서 꺼내 공용 창고로 옮깁니다.'
        : corpse === undefined
          ? '폐기할 시체가 없습니다.'
          : `몸이 사라집니다. 되돌릴 수 없습니다. 대신 유품 ${content.balance.revive.discardLoot}점과 회수하지 않은 소지품은 창고로 들어옵니다.`,
      onClick: () => {
        if (this.warehouseOpen) {
          if (corpse === undefined || selectedCarried === null) return;
          this.selectedCarriedItemId = null;
          this.store.dispatch({ type: 'REVIVE/LOOT', starId: corpse.starId, itemId: selectedCarried });
          return;
        }
        if (corpse !== undefined) this.discard(corpse.starId);
      },
    });
    new Button(this, {
      x: actionX(2), y, w: ACTION_W, h,
      label: this.warehouseOpen ? '창고 닫기' : '창고', hotkey: '3',
      tip: this.warehouseOpen
        ? '창고를 닫고 폐기 동작으로 돌아갑니다.'
        : '편성실 인벤토리와 같은 칸에서 시체 소지품을 고르고 회수합니다.',
      onClick: () => {
        this.warehouseOpen = !this.warehouseOpen;
        this.selectedCarriedItemId = null;
        this.hideWarehouseItemDetail();
        this.redraw();
      },
    });
    new Button(this, {
      x: actionX(3), y, w: ACTION_W, h,
      label: '편성실', hotkey: '4',
      tip: '오늘 방송할 출연자를 고르러 갑니다. 편성실 하단의 「소생」으로 언제든 돌아올 수 있습니다.',
      onClick: () => this.store.dispatch({ type: 'PHASE/ADVANCE' }),
    });
  }

  /** 소생 직후에만 쓰는 짧은 대사창. 다음 조작/화면 갱신에서 자연스럽게 사라진다. */
  private showReviveDialogue(line: string, effects: readonly string[]): void {
    const d = L.dialogue;
    this.rect(d.x, d.y, d.w, d.h, 'ink');
    this.frame(d.x, d.y, d.w, d.h, 'bone');
    new Dialogue(this, {
      x: d.x + L.pad,
      y: d.y + 28,
      w: d.w - L.pad * 2,
      line,
      size: 'body',
      effects,
      voice: undefined,
    });
  }
}

function fmtGold(n: number): string {
  return n.toLocaleString('en-US');
}
