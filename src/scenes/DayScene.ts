import Phaser from 'phaser';
import { BASE_W, SCENES } from '../config';
import { content } from '../core/content';
import { PALETTE, css } from '../render/palette';
import { FONT, FONT_LABEL } from '../render/font';
import { L } from '../ui/layout';
import { Button } from '../ui/Button';
import { reducedMotion } from '../ui/options';
import { DEATH_CURTAIN_MS } from './phases/LivePhase';
import { key as assetKey, hasTexture } from '../render/assets';
import type { WipeScene } from './WipeScene';
import { currentRun, listSaveSlots, loadRun, newRun, saveRun, type SaveSlot } from './run';
import type { Store } from '../core/store';
import type { GameState, PhaseId } from '../core/types';

/**
 * M02 §6 의 Claude Code 파트 — 호스트 씬. HUD 를 소유하고 단계 씬을 갈아끼운다.
 *
 * ★ 이 씬은 state 를 직접 수정하지 않는다. dispatch 만 한다.
 * ★ 단계 씬(M04~M09)이 도착하면 PHASE_SCENE 표에 씬 키를 채우면 된다.
 *   그 전까지는 현재 단계를 글자로만 보여주고, 기본 선택으로 진행시킨다.
 */

export const PHASE_LABEL: Record<PhaseId, string> = {
  REVIVE: '소생실',
  OFFICE: '편성실',
  LIVE: '생방송',
  DEATH: '사망',
  AUTOPSY: '검시',
  ANNOUNCE: '발표',
};

/**
 * 단계 → 담당 씬 키 (v3 6단계). 골격은 `scenes/phases/` 에 있다.
 *
 * AUTOPSY·ANNOUNCE 는 없다 — 검시실·발표 창을 뺐다 (사용자 확정, 시체 회수 결정·
 * 발표 결정 제거). 그 단계는 `render()` 가 화면 없이 기본값으로 자동 통과시킨다.
 * `syncPhaseScene` 이 DEATH 다음 자리에 `PHASE_DAYEND` 를 대신 끼워 넣는다.
 */
const PHASE_SCENE: Partial<Record<PhaseId, string>> = {
  REVIVE: SCENES.PHASE_REVIVE,
  OFFICE: SCENES.PHASE_OFFICE,
  LIVE: SCENES.PHASE_LIVE,
  DEATH: SCENES.PHASE_DEATH,
};

/** HUD 자원 칸 — 레퍼런스의 세로 구분선 3분할 */
const HUD_LABEL = { ...FONT_LABEL, fontSize: '24px', padding: { x: 0, y: 1 } } as const;
const HUD_VALUE = { ...FONT, fontSize: '48px', padding: { x: 0, y: 1 } } as const;
const HUD_LIVE = { ...FONT, fontSize: '40px', padding: { x: 0, y: 1 } } as const;

export class DayScene extends Phaser.Scene {
  private readonly hudStatus = { x: 8, y: -4, w: 740, h: 144 };
  private readonly hudTools = { x: 764, y: -4, w: 780, h: 144 };
  private store!: Store;
  private statusFloor!: Phaser.GameObjects.Text;
  private statusViewers!: Phaser.GameObjects.Text;
  private dayValue!: Phaser.GameObjects.Text;
  private depthValue!: Phaser.GameObjects.Text;
  private goldValue!: Phaser.GameObjects.Text;
  private body!: Phaser.GameObjects.Text;
  private fxLine!: Phaser.GameObjects.Text;
  private unsubscribe: (() => void) | null = null;
  private launched: string | null = null;
  private fallback: Button[] = [];
  private savePopup: Phaser.GameObjects.GameObject[] = [];
  /** M06 §8 — 생방송→사망 교체를 지지직이 끝날 때까지 붙잡는다. 0 이면 지연 없음 */
  private swapAt = 0;
  private skipCurtain = false;
  /** HUD 시계는 실제 시간과 무관하다. 출격 순간에만 하루의 시간이 진행된다. */
  private clockMinute: Phaser.GameObjects.Image | null = null;
  private clockHour: Phaser.GameObjects.Image | null = null;
  private clockTween: Phaser.Tweens.Tween | null = null;
  private clockMinutes = 8 * 60;
  private clockDay = 0;
  private lastClockPhase: PhaseId | null = null;
  private clockReady = false;
  /** 엔딩 씬에 한 번만 넘긴다 */
  private handedOver = false;
  /**
   * DEATH 를 떠나 AUTOPSY/ANNOUNCE 를 자동 통과한 뒤 — 실제 state 는 이미
   * 다음 날(REVIVE)이지만, 화면은 `PHASE_DAYEND` 로 붙잡아 둔다.
   * `advanceFromDayEnd()` 가 풀어 줄 때까지 유지한다.
   */
  private dayEndHold = false;
  /** 기록 갱신 연출용 — 정산이 끝나면 이전 최고층은 state 에서 사라진다 (M08) */
  /** 도달 게이지 — 목표까지 차오른다. 신기록이면 눈에 보이게 밀려 올라간다 (M08 §연출) */

  constructor() {
    super(SCENES.DAY);
  }

  create(): void {
    /**
     * ★ Phaser 씬 인스턴스는 재시작해도 살아남는다. 판을 새로 시작하면
     * 어제 판의 상태가 그대로 남아 두 번째 판이 어긋난다 (엔딩으로 안 넘어가는 등).
     */
    this.handedOver = false;
    this.dayEndHold = false;
    this.launched = null;
    this.swapAt = 0;
    this.skipCurtain = false;
    this.fallback = [];
    this.clockMinute = null;
    this.clockHour = null;
    this.clockTween?.stop();
    this.clockTween = null;
    this.clockMinutes = 8 * 60;
    this.clockDay = 0;
    this.lastClockPhase = null;
    this.clockReady = false;

    // 와이프는 항상 맨 위에 떠 있어야 한다. Phaser 는 목록의 첫 씬만 자동 시작한다
    if (!this.scene.isActive(SCENES.WIPE)) this.scene.launch(SCENES.WIPE);

    // TitleScene 의 '새로 시작' 이 이미 만들어 뒀다. 씬을 직접 열었으면 여기서 만든다.
    this.store = currentRun(this.game) ?? newRun(this.game);

    this.cameras.main.setBackgroundColor(PALETTE.ink);

    // HUD (L.hud) — 상단 144px. 액자 박스 2개 (00-OVERVIEW §8-1)
    const g = this.add.graphics();
    g.fillStyle(PALETTE.ink, 1);
    g.fillRect(L.hud.x, L.hud.y, L.hud.w, L.hud.h);
    if (hasTexture(this, 'ui.hud.status')) this.add.image(this.hudStatus.x, this.hudStatus.y, assetKey('ui.hud.status')).setOrigin(0).setDisplaySize(this.hudStatus.w, this.hudStatus.h);
    else this.drawFrame(g, this.hudStatus.x, this.hudStatus.y, this.hudStatus.w, this.hudStatus.h);
    if (hasTexture(this, 'ui.hud.tools')) this.add.image(this.hudTools.x, this.hudTools.y, assetKey('ui.hud.tools')).setOrigin(0).setDisplaySize(this.hudTools.w, this.hudTools.h);
    else this.drawFrame(g, this.hudTools.x, this.hudTools.y, this.hudTools.w, this.hudTools.h);
    this.createGameClock();

    // 자원 라벨 3종 — 값은 render() 가 같은 x 에 채운다 (레퍼런스 배치)
    this.add.text(this.hudStatus.x + 28, this.hudStatus.y + 55, '● LIVE', { ...HUD_LIVE, color: css('bone') });
    this.addHudField(this.hudStatus.x + 212, 'FLOOR', () => this.statusFloor = this.add.text(this.hudStatus.x + 212, this.hudStatus.y + 62, '', { ...HUD_VALUE, color: css('bone') }));
    this.addHudField(this.hudStatus.x + 358, 'VIEWERS', () => this.statusViewers = this.add.text(this.hudStatus.x + 358, this.hudStatus.y + 62, '', { ...HUD_VALUE, color: css('bone') }));
    this.addWatchEye(this.hudStatus.x + 656, this.hudStatus.y + 76);

    this.addHudField(this.hudTools.x + 190, 'DAY', () => this.dayValue = this.add.text(this.hudTools.x + 190, this.hudTools.y + 62, '', { ...HUD_VALUE, color: css('bone') }));
    this.addHudField(this.hudTools.x + 336, 'DEPTH', () => this.depthValue = this.add.text(this.hudTools.x + 336, this.hudTools.y + 62, '', { ...HUD_VALUE, color: css('bone') }));
    this.addHudField(this.hudTools.x + 468, 'GOLD', () => this.goldValue = this.add.text(this.hudTools.x + 468, this.hudTools.y + 62, '', { ...HUD_VALUE, color: css('bone') }));
    this.addWatchEye(this.hudTools.x + 684, this.hudTools.y + 76);
    this.addHudIcon('ui.icon.help', 'ui.icon.help.hover', BASE_W - 365, () => this.openOverlay(SCENES.HELP));
    this.addHudIcon('ui.icon.options', 'ui.icon.options.hover', BASE_W - 240, () => this.openOverlay(SCENES.OPTIONS));
    this.addHudIcon('ui.icon.save', 'ui.icon.save.hover', BASE_W - 119, () => this.openSavePopup());
    // 도달 게이지 — 글자 오른쪽 빈자리. 차오르는 게 보여야 기록이 기록으로 느껴진다

    // 본문 (L.stage) — 단계 씬이 들어올 자리
    this.body = this.add
      .text(BASE_W / 2, L.stage.y + 200, '', { ...FONT, color: css('dust'), align: 'center' })
      .setOrigin(0.5, 0);

    this.fxLine = this.add
      .text(BASE_W / 2, L.stage.y + 600, '', { ...FONT, color: css('dust') })
      .setOrigin(0.5, 0);

    // 폴백 조작 — 단계 씬이 붙어 있는 동안에는 숨긴다.
    // 숨기기만 하면 핫키가 남아 단계 씬의 1/2 와 겹치므로 setActive(false) 까지 한다.
    this.fallback = [
      new Button(this, {
        x: 336, y: L.actionsFull.y + L.pad, w: 528, h: 96,
        label: '다음 단계', hotkey: '1',
        onClick: () => this.advancePhase(),
      }),
      new Button(this, {
        x: 1056, y: L.actionsFull.y + L.pad, w: 528, h: 96,
        label: '타이틀로', hotkey: '2', variant: 'ghost',
        onClick: () => this.scene.start(SCENES.TITLE),
      }),
    ];

    this.render(this.store.getState());
    this.unsubscribe = this.store.subscribe((s) => this.render(s));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribe?.();
      this.unsubscribe = null;
    });
  }

  /**
   * v3 에는 PHASE/TIMEOUT 이 없다 (CCR-001). 단계 씬이 아직 없으므로,
   * 편성실에서 출연자가 안 정해졌으면 첫 생존자로 자리만 채우고 다음 단계로 보낸다.
   * 규칙이 아니라 셸의 기본 선택이다 — 단계 씬이 오면 이 분기는 사라진다.
   */
  private advancePhase(): void {
    const s = this.store.getState();
    if (s.phase === 'OFFICE' && s.today === null) {
      const star = s.stars.find((x) => x.status === 'ALIVE');
      if (star !== undefined) this.store.dispatch({ type: 'OFFICE/PICK_STAR', starId: star.id });
    }
    this.store.dispatch({ type: 'PHASE/ADVANCE' });
  }

  /** M02 §6 — pendingFx 를 매 프레임 확인하고 소비한다. */
  override update(): void {
    if (this.swapAt > 0 && (this.skipCurtain || this.time.now >= this.swapAt)) {
      const s = this.store.getState();
      this.swap(s.isOver ? undefined : PHASE_SCENE[s.phase]);
    }

    const fx = this.store.getState().pendingFx;
    if (fx.length === 0) return;
    // 단계 씬이 소비할 수 있게 남겨 둔다 — 여기서 비우면 그쪽은 볼 기회가 없다 (M02 §6)
    this.registry.set('fx.recent', { kinds: fx.map((e) => e.kind), at: this.time.now });
    // FX 이름은 개발 중에만 보인다. 심사자 화면에 SEAL_STAMP 같은 글자가 뜨면 안 된다
    if (import.meta.env.DEV) this.fxLine.setText(fx.map((e) => e.kind).join('  '));
    this.store.dispatch({ type: 'FX/CONSUME' });
  }

  /**
   * 도달 게이지 n/40. 값이 오르면 **차오르는 게 보이도록** 프레임마다 조금씩 따라간다.
   * 신기록 직후 1.4초 동안은 wax 로 칠한다 (M08 §RECORD_BREAK 「HUD 게이지가 차오름」).
   */
  /** 04-UI-KIT §2-2 — HUD 이중선 액자 (바깥 bone 2px + 안쪽 dust 2px) */
  private drawFrame(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
    const t = L.line;
    for (const [color, ox] of [[PALETTE.bone, 0], [PALETTE.dust, 6]] as const) {
      g.fillStyle(color, 1);
      g.fillRect(x + ox, y + ox, w - ox * 2, t);
      g.fillRect(x + ox, y + h - ox - t, w - ox * 2, t);
      g.fillRect(x + ox, y + ox, t, h - ox * 2);
      g.fillRect(x + w - ox - t, y + ox, t, h - ox * 2);
    }
  }

  private addHudIcon(idle: string, hover: string, x: number, onClick: () => void): void {
    if (!hasTexture(this, idle)) return;
    const icon = this.add.image(x, 12, assetKey(idle)).setOrigin(0).setInteractive({ useHandCursor: true });
    icon.on('pointerover', () => hasTexture(this, hover) && icon.setTexture(assetKey(hover)));
    icon.on('pointerout', () => icon.setTexture(assetKey(idle)));
    icon.on('pointerup', onClick);
  }

  /** HUD 저장 아이콘 — 저장과 불러오기를 한 곳에서 고르는 3슬롯 팝업. */
  private openSavePopup(): void {
    this.closeSavePopup();
    const depth = 10_000;
    const objects = this.savePopup;
    const add = <T extends Phaser.GameObjects.GameObject & { setDepth(depth: number): T }>(object: T): T => {
      object.setDepth(depth + objects.length);
      objects.push(object);
      return object;
    };
    const box = { x: 560, y: 190, w: 800, h: 700 };
    const close = () => this.closeSavePopup();
    const panel = add(this.add.rectangle(L.W / 2, L.H / 2, L.W, L.H, PALETTE.ink, 0.72).setInteractive());
    panel.on('pointerup', close);
    add(this.add.rectangle(box.x, box.y, box.w, box.h, PALETTE.ink, 1).setOrigin(0));
    const frame = add(this.add.graphics());
    frame.lineStyle(4, PALETTE.bone, 1).strokeRect(box.x, box.y, box.w, box.h);
    add(this.add.text(box.x + 42, box.y + 34, '저장 / 불러오기', { ...FONT, color: css('bone'), fontSize: '48px' }));
    add(this.add.text(box.x + 42, box.y + 98, '현재 진행을 저장하거나, 저장된 슬롯을 불러옵니다.', { ...FONT, color: css('dust'), fontSize: '24px' }));

    const addSlot = (slot: SaveSlot, y: number): void => {
      const info = listSaveSlots().find((entry) => entry.slot === slot)!;
      const label = info.state === null
        ? `슬롯 ${slot}  ·  비어 있음`
        : `슬롯 ${slot}  ·  DAY ${info.state.day} · ${PHASE_LABEL[info.state.phase]}`;
      const detail = info.savedAt === null ? '저장할 수 있습니다.' : new Date(info.savedAt).toLocaleString('ko-KR');
      add(this.add.rectangle(box.x + 42, y, box.w - 84, 128, PALETTE.mid, 0.45).setOrigin(0));
      add(this.add.text(box.x + 66, y + 22, label, { ...FONT, color: css('bone'), fontSize: '32px' }));
      add(this.add.text(box.x + 66, y + 74, detail, { ...FONT, color: css('dust'), fontSize: '21px' }));
      const save = new Button(this, { x: box.x + box.w - 280, y: y + 22, w: 104, h: 76, label: '저장', onClick: () => {
        saveRun(this.store, slot);
        this.closeSavePopup();
      } });
      add(save);
      const load = new Button(this, { x: box.x + box.w - 160, y: y + 22, w: 104, h: 76, label: '불러오기', enabled: info.state !== null, onClick: () => {
        if (loadRun(this.game, slot) === null) return;
        this.closeSavePopup();
        this.scene.restart();
      } });
      add(load);
    };
    addSlot(1, box.y + 158);
    addSlot(2, box.y + 314);
    addSlot(3, box.y + 470);
    add(new Button(this, { x: box.x + box.w - 172, y: box.y + box.h - 86, w: 128, h: 54, label: '닫기', variant: 'ghost', onClick: close }));
  }

  private closeSavePopup(): void {
    this.savePopup.forEach((object) => object.destroy());
    this.savePopup = [];
  }

  /** 출격 전 08:00, 출격 뒤 20:00. 실제 경과 시간으로는 절대 움직이지 않는다. */
  private createGameClock(): void {
    if (!hasTexture(this, 'ui.clock.minute') || !hasTexture(this, 'ui.clock.hour')) return;
    // hud_tools 원화의 시계 중심(원화 83, 72)을 현재 표시 폭에 맞춰 환산한다.
    const centerX = this.hudTools.x + 83 * (this.hudTools.w / 740);
    const centerY = this.hudTools.y + 72;
    // 시침 원화는 좌하단의 둥근 축에서 우상단 끝으로 뻗는다.
    this.clockHour = this.add.image(centerX, centerY, assetKey('ui.clock.hour')).setOrigin(0.16, 0.86);
    this.clockMinute = this.add.image(centerX, centerY, assetKey('ui.clock.minute')).setOrigin(0.5, 0.98);
    this.setGameClock(this.clockMinutes);
  }

  private setGameClock(minutes: number): void {
    this.clockMinutes = Math.max(0, Math.min(24 * 60, minutes));
    // 절대 각도를 유지해야 12시를 넘길 때 침이 0도로 튀지 않고 연속 회전한다.
    this.clockMinute?.setAngle(this.clockMinutes * 6);
    // 전달받은 시침 원화의 기본 방향은 약 2시이므로, 실제 시각에 맞춰 34도를 뺀다.
    this.clockHour?.setAngle((this.clockMinutes / 60) * 30 - 34);
  }

  private advanceGameClock(toMinutes: number): void {
    this.clockTween?.stop();
    if (reducedMotion(this.registry) || this.clockMinute === null || this.clockHour === null) {
      this.setGameClock(toMinutes);
      return;
    }
    const progress = { minutes: this.clockMinutes };
    this.clockTween = this.tweens.add({
      targets: progress,
      minutes: toMinutes,
      duration: 1350,
      ease: 'Cubic.Out',
      onUpdate: () => this.setGameClock(progress.minutes),
      onComplete: () => {
        this.setGameClock(toMinutes);
        this.clockTween = null;
      },
    });
  }

  private syncGameClock(state: Readonly<GameState>): void {
    const afterDeparture = state.phase === 'LIVE' || state.phase === 'DEATH' || state.phase === 'AUTOPSY' || state.phase === 'ANNOUNCE';
    if (!this.clockReady) {
      this.clockReady = true;
      this.clockDay = state.day;
      this.setGameClock(afterDeparture ? 20 * 60 : 8 * 60);
    } else {
      if (state.day !== this.clockDay) {
        this.clockDay = state.day;
        this.clockTween?.stop();
        this.clockTween = null;
        this.setGameClock(8 * 60);
      }
      if (state.phase === 'LIVE' && this.lastClockPhase !== 'LIVE') this.advanceGameClock(20 * 60);
    }
    this.lastClockPhase = state.phase;
  }

  private addHudField(x: number, labelText: string, createValue: () => void): void {
    this.add.text(x, this.hudStatus.y + 22, labelText, { ...HUD_LABEL, color: css('dust') });
    createValue();
  }

  private addWatchEye(x: number, y: number): void {
    if (!hasTexture(this, 'ui.suspicion1')) return;
    this.add.image(x, y, assetKey('ui.suspicion1')).setDisplaySize(96, 64);
  }

  private openOverlay(scene: string): void {
    this.scene.pause(SCENES.DAY);
    this.scene.launch(scene, { returnTo: SCENES.DAY });
    // PhaseScene/WipeScene 는 Day 위에서 따로 동작한다. overlay 를 Day만
    // pause한 뒤 launch하면 이 씬들 뒤에 숨어 보일 수 있으므로 마지막에 올린다.
    this.scene.bringToTop(scene);
  }

  private render(s: Readonly<GameState>): void {
    /**
     * 검시실·발표 창은 뺐다 (사용자 확정) — 시체 회수 결정·발표 결정 없이
     * 화면 한 번 없이 기본값으로 통과시킨다. 화면이 없으니 값도 가장 무난한
     * 쪽으로 고정한다: 시체는 훼손하지 않고(`INTACT`), 있는 그대로 공표한다
     * (`SUCCESS` — 거짓 공표로 인한 평판/유출 페널티가 붙지 않는 쪽).
     *
     * `dispatch` 는 동기라 아래 두 줄이 끝나면 `state.phase` 는 이미 다음 날
     * (REVIVE)이거나 8일째면 엔딩이다. 그 값을 이 함수가 다시 부르며 이어받는다.
     */
    if (s.phase === 'AUTOPSY') {
      this.store.dispatch({ type: 'AUTOPSY/DECIDE', grade: 'INTACT' });
      return;
    }
    if (s.phase === 'ANNOUNCE') {
      this.store.dispatch({ type: 'ANNOUNCE/DECLARE', as: 'SUCCESS' });
      return;
    }

    // 최고층이 갱신되는 순간 직전 값을 넘겨 준다. DeathPhase 의 「이전 기록」 표시용
    // 좌측 상태칸은 회사 전체 기록이 아니라, 지금 방문했거나 출연 중인 용사의 정보다.
    // 손님도 오늘의 용사도 없으면 숫자를 지어내지 않고 '-'로 비운다.
    const visitor = s.today === null ? s.visitors[0] : undefined;
    const persona = s.today === null ? undefined : s.personas.find((candidate) => candidate.id === s.today?.personaId);
    const floor = s.today !== null
      ? `${s.today.currentFloor}F`
      : visitor === undefined
        ? '-'
        : `${Math.max(...visitor.claimedTiers.map((tier) => tier.floor))}F`;
    const viewers = s.today !== null
      ? (persona?.fandom ?? '-')
      : (visitor?.fandom ?? '-');
    this.statusFloor.setText(floor);
    this.statusViewers.setText(typeof viewers === 'number' ? viewers.toLocaleString('en-US') : viewers);
    this.dayValue.setText(String(s.day));
    // 기록값은 26F에서 시작하지만, 첫 방송 전 HUD는 아직 도전하지 않은 1F로 표기한다.
    // 실제 최고 기록과 하강/엔딩 계산은 core의 maxFloor를 그대로 사용한다.
    const untouchedRun = s.day === 1 && s.today === null && s.maxFloor === content.balance.start.maxFloor;
    this.depthValue.setText(untouchedRun ? '1F' : `${s.maxFloor}F`);
    this.goldValue.setText(fmtHudGold(s.gold));
    this.syncGameClock(s);

    this.syncPhaseScene(s);

    // 단계 씬이 화면을 맡으면 셸의 폴백 UI 는 물러난다.
    const hosted = !s.isOver && PHASE_SCENE[s.phase] !== undefined;
    this.body.setVisible(!hosted);
    for (const button of this.fallback) button.setVisible(!hosted).setActive(!hosted);

    if (s.isOver) {
      // 엔딩과 성적표는 전용 씬이 맡는다 (M11 §3·§4)
      if (!this.handedOver) {
        this.handedOver = true;
        this.time.delayedCall(0, () => this.scene.start(SCENES.ENDING));
      }
      // 넘어가기 전 한 프레임 — 눌리는 버튼을 남겨 두지 않는다
      this.fallback[0]?.setVisible(false).setActive(false);
      this.body.setText(
        [
          '8일이 끝났다',
          `엔딩 ${s.ending ?? '-'}`,
          '',
          `최고 도달 ${s.stats.deepestFloor}F · 소생 ${s.stats.totalRevived}회 · 폐기 ${s.stats.totalDiscarded}회`,
          `어필 ${s.stats.appeals}회 · 거짓 공표 ${s.stats.falseAnnouncements}회`,
        ].join('\n'),
      );
      return;
    }
    if (hosted) return;

    const star = s.today === null ? null : s.stars.find((x) => x.id === s.today?.starId) ?? null;
    this.body.setText(
      [
        `${PHASE_LABEL[s.phase]} 단계`,
        star === null ? '오늘의 스타 미정' : `오늘의 스타 · ${star.bodyName}`,
        '단계 씬 미구현 — 기본 선택으로 진행한다',
      ].join('\n'),
    );
  }

  /** 단계 씬이 등록돼 있으면 갈아끼운다. 없으면 아무것도 하지 않는다. */
  private syncPhaseScene(s: Readonly<GameState>): void {
    let want = s.isOver ? undefined : PHASE_SCENE[s.phase];

    /**
     * DEATH 다음(검시·발표) 자리가 비었다 — `render()` 가 이미 화면 없이 지나쳤으므로
     * 여기 도착했을 때 state 는 이미 다음 날(REVIVE)이거나, 8일째면 게임 오버다.
     * 전자만 하루 종료 화면으로 붙잡는다 — 후자는 그냥 엔딩으로 보낸다.
     */
    if (this.launched === SCENES.PHASE_DEATH && want !== SCENES.PHASE_DEATH) {
      this.dayEndHold = want === SCENES.PHASE_REVIVE;
    }
    if (this.dayEndHold) want = SCENES.PHASE_DAYEND;

    if (want === this.launched) return;

    // M06 §8 — 용사가 죽어도 생방송 화면을 1.8초 더 붙잡는다. 그 위에서 LivePhase 가
    // 지지직을 그린다. 셸이 단계를 바로 갈아끼우면 그 연출이 통째로 사라진다.
    if (this.launched === SCENES.PHASE_LIVE && want === SCENES.PHASE_DEATH && !reducedMotion(this.registry)) {
      if (this.swapAt === 0) this.armCurtain();
      return;
    }
    this.swap(want);
  }

  /** `DayEndPhase` 의 「다음 날 시작」이 부른다. state 는 이미 다음 날이다 — 화면만 넘긴다 */
  advanceFromDayEnd(): void {
    this.dayEndHold = false;
    this.render(this.store.getState());
  }

  private armCurtain(): void {
    this.swapAt = this.time.now + DEATH_CURTAIN_MS;
    this.skipCurtain = false;
    // 스킵 — 심사자가 기다릴 이유가 없다 (M06 §11)
    this.input.keyboard?.once('keydown', () => { this.skipCurtain = true; });
    this.input.once('pointerdown', () => { this.skipCurtain = true; });
  }

  private swap(want: string | undefined): void {
    if (this.swapAt > 0) {
      this.input.keyboard?.off('keydown');
      this.swapAt = 0;
      this.skipCurtain = false;
    }
    if (want === this.launched) return;

    // 디더 와이프로 덮은 뒤에 갈아끼운다 (04-UI-KIT). 첫 진입은 덮을 것이 없으니 그냥 연다
    const wipe = this.scene.get(SCENES.WIPE) as WipeScene | null;
    if (this.launched === null || wipe === null) {
      this.doSwap(want);
      return;
    }
    wipe.run(() => this.doSwap(want));
  }

  private doSwap(want: string | undefined): void {
    if (want === this.launched) return;
    if (this.launched !== null) this.scene.stop(this.launched);
    if (want !== undefined) this.scene.launch(want);
    this.launched = want ?? null;
  }
}

/** 표시는 84.2K 형태 (02-DATA-SCHEMA §1) */
function fmtGold(n: number): string {
  return n.toLocaleString('en-US');
}

/** HUD fields are intentionally narrow: preserve legibility instead of clipping large gold totals. */
function fmtHudGold(n: number): string {
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}K`;
  return fmtGold(n);
}
