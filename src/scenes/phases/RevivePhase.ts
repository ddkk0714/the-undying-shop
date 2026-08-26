import Phaser from 'phaser';
import { SCENES } from '../../config';
import { content } from '../../core/content';
import { pickDialogue, totalRevivals } from '../../core/systems/dialogue';
import { reviveDaysHeld, reviveQuote } from '../../core/systems/economy';
import { starVoice } from '../../audio/Voice';
import { key, starArt } from '../../render/assets';
import { L, actionX, ACTION_W } from '../../ui/layout';
import { Button } from '../../ui/Button';
import { Dialogue } from '../../ui/Dialogue';
import { reducedMotion } from '../../ui/options';
import { sealStamp } from '../../ui/SealStamp';
import { portrait } from '../../ui/Portrait';
import { createTooltip } from '../../ui/Tooltip';
import { playBgm, playSfx } from '../../audio/Sfx';
import { PhaseScene } from './PhaseScene';
import type { Corpse, GameState, ItemDef, Persona, Star } from '../../core/types';

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

export class RevivePhase extends PhaseScene {
  private index = 0;
  /** 도장이 찍히는 동안 다시 누르지 못하게 */
  private discarding = false;
  /** 페르소나 승계 화면을 열어 둔 상태 */
  private inheriting = false;
  /** 씌울 대상이 여럿일 때 보고 있는 사람 */
  private heirIndex = 0;
  /** 시체가 지니고 있던 장비를 펼쳐 놓은 상태 (CCR-006) */
  private carriedOpen = false;
  /** 빈 소생실에서 한 번만 울리는 편성실 쪽 노크 */
  private emptyKnockTimer: Phaser.Time.TimerEvent | null = null;
  private emptyKnockPlayed = false;
  /** 사망 기록 서류를 확대해 읽는 중 (편성실 계약서 리더와 같은 패턴) */
  private recordOpen = false;
  /** 서류 도장이 찍히는 동안 다시 누르지 못하게 */
  private recordStamping = false;

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
    this.carriedOpen = false;
    this.emptyKnockTimer = null;
    this.emptyKnockPlayed = false;
    this.recordOpen = false;
    this.recordStamping = false;
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
    this.buildCarriedButton(corpse);
    this.buildInheritButton(s);
    this.buildActions(s, corpse, star);
    if (this.carriedOpen && corpse !== undefined) this.buildCarried(corpse);
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

  private buildGuest(s: Readonly<GameState>, star: Star | undefined, count: number): void {
    const g = L.guest;
    this.rect(g.x, g.y, g.w, g.h, 'ink');
    // 소생실 전용 배경이 오면 그걸 쓰고, 없으면 상점 방을 그대로 쓴다
    this.spriteCover(g, ['bg.revive.room', 'bg.shop.room']);
    this.frame(g.x, g.y, g.w, g.h, 'dust');

    const d = L.dialogue;
    this.rect(d.x, d.y, d.w, d.h, 'ink');

    if (star === undefined) {
      this.buildRoomLabel(count);
      this.scrimBlock(g.x + L.line, g.y + 184, 560, 56);
      this.text(g.x + L.pad, g.y + 200, '소생 수조가 비어 있다.', 'dust');
      this.title(d.x + L.pad, d.y + 40, '...오늘은 아무도 없다', 'dust');
      return;
    }

    // 용사 전신 스프라이트는 소생실 좌측 화면에서 지웠다 (사용자 확정) — 배경 + 방 이름 + 대사만 남는다
    const reviveLine = pickDialogue(star.id, 'REVIVE', {
      revives: totalRevivals(star.id, star.reviveCount),
      deaths: s.stats.totalDiscarded,
    }, (s.day % 10) / 10);

    this.buildRoomLabel(count);

    const persona = s.personas.find((p) => p.id === star.personaId);
    this.title(d.x + L.pad, d.y + 12, this.clip(persona?.displayName ?? '무명', d.w - 96, 'title')).setScale(0.65);
    if (reviveLine !== null) {
      new Dialogue(this, {
        x: d.x + L.pad,
        y: d.y + 58,
        w: d.w - 96,
        line: this.clip(reviveLine.text, d.w - 96, 'title'),
        scale: 0.68,
        effects: reviveLine.effects,
        voice: starVoice(star?.id),
      });
    }
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
    // 사망 위치·시체 상태·부활 횟수·소생 비용은 전부 좌측의 사망 기록 서류로 옮겼다
    // (사용자 확정) — 작업대는 몸 그림만 남기고 글자를 지운다.
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
    let stamped = false;
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
        },
      });
    });
  }

  /* ── 우 · 시체가 지니고 있던 것 (CCR-006) ─────────────── */

  /**
   * 방송이 끝나도 장비는 저절로 돌아오지 않는다. **몸에 남는다.**
   * 소생실에서 그 몸을 살피고 한 점씩 회수하는 것이 이 버튼이 여는 화면이다.
   */
  private buildCarriedButton(corpse: Corpse | undefined): void {
    if (corpse === undefined || this.carriedOpen) return;
    const carried = corpse.carried ?? [];
    if (carried.length === 0) return;
    const b = L.bench;
    // 시체 기록(최대 y 631)과 소생 비용 띠(723 부터) 사이의 빈 칸.
    // 비용 위에 겹치면 금액을 가린다 — 실제로 가렸었다
    const x = b.x + L.pad * 3;
    const y = b.y + 500;
    // 작업대 배경이 고주파 디더라 투명한 버튼 위의 글자가 뭉개진다. 깔고 그린다
    this.scrimBlock(x - 16, y - 12, 332, 88);
    new Button(this, {
      x, y, w: 300, h: 64,
      label: `소지품 ${carried.length}점`, hotkey: '5',
      tip: '죽을 때 지니고 내려간 장비입니다. 눌러서 꺼내 보고, 한 점씩 회수할 수 있습니다.',
      onClick: () => {
        this.carriedOpen = true;
        this.redraw();
      },
    });
  }

  /** 편성실 인벤토리 창과 같은 그림·같은 칸 규격을 쓴다 — 플레이어가 두 번 배우지 않게. */
  private buildCarried(corpse: Corpse): void {
    const b = L.bench;
    const panel = {
      x: b.x + Math.round((b.w - CARRIED_PANEL.w) / 2),
      y: b.y + b.h - CARRIED_PANEL.h,
      w: CARRIED_PANEL.w,
      h: CARRIED_PANEL.h,
    };
    const ix = panel.x + 28;
    if (!this.spriteFit(panel, ['ui.inventory.window'])) {
      this.rect(panel.x, panel.y, panel.w, panel.h, 'ink');
      this.frame(panel.x, panel.y, panel.w, panel.h, 'bone');
    }

    const carried = corpse.carried ?? [];
    this.text(ix, panel.y + 16, `소지품  ${carried.length}점`, 'ink');
    this.label(ix, panel.y + 70, '장비를 눌러 회수합니다. 두고 가도 몸과 함께 돌아옵니다.', 'dust').setScale(1.3);
    new Button(this, {
      x: panel.x + panel.w + 12, y: panel.y + 8, w: 128, h: 52,
      label: '닫기',
      tip: '소지품 창을 닫습니다. 회수하지 않은 장비는 몸에 그대로 남습니다.',
      onClick: () => {
        this.carriedOpen = false;
        this.redraw();
      },
    });

    if (carried.length === 0) {
      this.text(ix, panel.y + 150, '맨몸으로 내려갔다.', 'dust');
      return;
    }

    const cellW = Math.floor((panel.w - 56) / CARRIED_COLUMNS);
    const cellTop = panel.y + 144;
    carried.forEach((itemId, index) => {
      const def = content.items.find((item) => item.id === itemId);
      if (def === undefined) return;
      const cellX = ix + (index % CARRIED_COLUMNS) * cellW;
      const cellY = cellTop + Math.floor(index / CARRIED_COLUMNS) * 128;
      const art = this.itemArt(def, { x: cellX + 3, y: cellY + 5, w: cellW - 6, h: 84 });
      if (art !== null) {
        // 원화의 도트 무게 보정 — 편성실 인벤토리와 같은 값이라야 두 창이 같아 보인다
        art.setX(Math.round(cellX + cellW / 2 - 14));
        art.setInteractive({ cursor: 'pointer' });
        art.on('pointerup', () => this.store.dispatch({ type: 'REVIVE/LOOT', starId: corpse.starId, itemId }));
      }
      const textPx = Math.floor((cellW - 20) / 0.75);
      this.text(cellX, cellY + 86, this.clip(def.name, textPx, 'body'), 'bone').setScale(0.75);
      this.text(cellX, cellY + 112, this.clip(this.itemStats(def), textPx, 'body'), 'dust').setScale(0.75);
    });
  }

  /** 편성실과 같은 규칙 — 원본 비율을 지켜 칸 안에 넣는다. */
  private itemArt(item: ItemDef, box: { x: number; y: number; w: number; h: number }): Phaser.GameObjects.Image | null {
    if (!this.hasArt(item.iconKey)) return null;
    const texture = key(item.iconKey);
    const source = this.textures.get(texture).getSourceImage() as { width: number; height: number };
    const scale = Math.min(box.w / source.width, box.h / source.height);
    return this.add.image(Math.round(box.x + box.w / 2), Math.round(box.y + box.h / 2), texture)
      .setDisplaySize(Math.max(1, Math.round(source.width * scale)), Math.max(1, Math.round(source.height * scale)));
  }

  private itemStats(item: ItemDef): string {
    return item.kind === 'POTION' ? `회복 +${item.healing}` : `HP+${item.hp} 공+${item.atk} 방+${item.def}`;
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
        playSfx(this, 'sfx.revive', 0.8);
        this.store.dispatch({ type: 'REVIVE/PAY', starId: corpse.starId });
      },
    });
    new Button(this, {
      x: actionX(1), y, w: ACTION_W, h,
      label: '그대로', hotkey: '2',
      enabled: corpse !== undefined,
      tip: corpse === undefined
        ? '보관할 시체가 없습니다.'
        : `오늘은 두고 넘어갑니다. 시체는 남지만, 하루 미룰 때마다 소생 비용이 ${Math.round((content.balance.revive.decayPerDay - 1) * 100)}% 씩 오릅니다.`,
      onClick: () => {
        if (corpse === undefined) return;
        this.store.dispatch({ type: 'REVIVE/SKIP', starId: corpse.starId });
        this.index += 1; // 보관하고 다음 시체를 본다. 미루면 내일 비용이 오른다.
        this.redraw();
      },
    });
    // 廢棄 — 몸이 사라지고 유품이 남는다. 되돌릴 수 없다 (M04 §결과표)
    new Button(this, {
      x: actionX(2), y, w: ACTION_W, h,
      label: '폐기', hotkey: '3', variant: 'danger',
      enabled: corpse !== undefined && !this.discarding,
      tip: corpse === undefined
        ? '폐기할 시체가 없습니다.'
        : `몸이 사라집니다. 되돌릴 수 없습니다. 대신 유품 ${content.balance.revive.discardLoot}점과 회수하지 않은 소지품이 인벤토리로 들어옵니다.`,
      onClick: () => corpse && this.discard(corpse.starId),
    });
    new Button(this, {
      x: actionX(3), y, w: ACTION_W, h,
      label: '편성실', hotkey: '4',
      tip: '오늘 방송할 출연자를 고르러 갑니다. 편성실 하단의 「소생」으로 언제든 돌아올 수 있습니다.',
      onClick: () => this.store.dispatch({ type: 'PHASE/ADVANCE' }),
    });
  }
}

function fmtGold(n: number): string {
  return n.toLocaleString('en-US');
}
