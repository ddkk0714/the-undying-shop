import { SCENES } from '../../config';
import Phaser from 'phaser';
import { content, type DialogueSituation } from '../../core/content';
import { pickDialogue, totalRevivals } from '../../core/systems/dialogue';
import { descentForecast, equippedItemIds } from '../../core/systems/forecast';
import { saleHaggleCount, saleOfferTried, salePriceMultiplier, salePurchaseChance, saleSlotSold } from '../../core/systems/office';
import { key, starArt, starExpression } from '../../render/assets';
import { PALETTE } from '../../render/palette';
// 입 움직임 연출은 폐지했다 (사용자 확정 — 입 그림 크기가 얼굴에 안 맞았다).
// 표(`render/mouth.ts`)와 에셋은 남겨 두고 부르는 자리만 주석 처리한다
// import { mouthKey, mouthSpot } from '../../render/mouth';
import { starVoice } from '../../audio/Voice';
import { L, actionX, ACTION_W } from '../../ui/layout';
import { Button } from '../../ui/Button';
import { Dialogue } from '../../ui/Dialogue';
import { createTooltip } from '../../ui/Tooltip';
import { reducedMotion } from '../../ui/options';
import { playBgm, playSfx } from '../../audio/Sfx';
import { PhaseScene } from './PhaseScene';
import type { GameState, ItemDef, Persona } from '../../core/types';

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
const SLOT_NAMES = ['무기', '방어구', '기타'] as const;
const INVENTORY_COLUMNS = 5;
const INVENTORY_VISIBLE_ROWS = 2;
// 원화의 아래만 잘라 작업대 비율로 맞춘 뒤, 세 사각 홈을 옮긴 값.
const SHELF_SLOTS = [
  { x: 1016, y: 249, w: 223, h: 266 },
  { x: 1248, y: 249, w: 214, h: 266 },
  { x: 1488, y: 249, w: 214, h: 266 },
] as const;

/**
 * 배경 원화(`bg.shop.room`, 650×792)의 오른쪽 문간에 세우는 문짝 자리 — `L.guest` 상대 좌표다.
 *
 * 원화에는 문이 **열린 검은 구멍**으로만 그려져 있다. 그 구멍의 안쪽 경계를 실측해서
 * (x 527..636 · y 225..438) 그 안에 문짝을 끼운다. 세로는 구멍에 꽉 맞추고 가로는
 * 원본 비율(170:356)을 지켜 가운데에 놓았다 — 그래서 좌우로 4px 씩 그늘이 남는다.
 * 문짝 아랫변이 구멍의 바닥선(=방바닥)에 닿아야 떠 보이지 않는다.
 */
const OFFICE_DOOR = { x: 531, y: 225, w: 102, h: 214 } as const;

/**
 * 원래 장비는 캐릭터 스탯 원장에서 이름으로만 관리한다. 서류에서는 슬롯 성격을
 * 바로 읽을 수 있도록 인벤토리의 공용 장비 도트를 사용하고, 실제 진열 장비가
 * 들어오면 그 아이템 도트로 교체한다.
 */
const BASE_EQUIPMENT_ICON_IDS = ['blade_tallow', 'cloak_ash', 'charm_seal'] as const;

/** 한글은 공백 없이 길어질 수 있어, 편성실 대사창 폭에 맞춰 명시적으로 줄을 나눈다. */
function wrapOfficeDialogue(line: string, maxUnits = 64): string {
  let units = 0;
  let wrapped = '';
  for (const ch of line) {
    if (ch === '\n') {
      wrapped += ch;
      units = 0;
      continue;
    }
    const width = ch.charCodeAt(0) > 0x2000 ? 2 : 1;
    if (units > 0 && units + width > maxUnits) {
      wrapped += '\n';
      units = 0;
    }
    wrapped += ch;
    units += width;
  }
  return wrapped;
}

export class OfficePhase extends PhaseScene {
  /** 계약서가 2장 올 수 있다 (M05). 지금 보고 있는 장 */
  private contractIndex = 0;
  /** 하단 「진열」을 눌렀을 때만 여는 장비 서랍 */
  private inventoryOpen = false;
  /** 서랍에서 클릭해 집은 장비. 맞는 진열대를 누르면 놓인다. */
  private selectedItemId: string | null = null;
  /** 4칸 한 줄 인벤토리의 현재 첫 번째 행. */
  private inventoryScrollRow = 0;
  /** 아이콘 hover 중에만 살아 있는 장비 상세 정보창 오브젝트. */
  private itemDetail: Phaser.GameObjects.GameObject[] = [];
  /** 드래그 중에는 hover 상세창을 다시 열지 않는다. */
  private draggingInventoryItem = false;
  /** 작업대에 놓인 계약서 축소본을 왼쪽 클릭하면, 같은 종이를 읽기 크기로 펼친다. */
  private contractReaderOpen = false;
  /** 용사가 함께 제출한 하강 예상·스탯 서류의 확대 상태. */
  private statsReaderOpen = false;
  /** 접힌 계약서와 펼친 계약서가 공유하는 작업대 위 이동량. */
  private contractSheetOffset = { x: 0, y: 0 };
  /** 접힌 스탯 서류와 펼친 스탯 서류가 공유하는 작업대 위 이동량. */
  private statsSheetOffset = { x: 0, y: 0 };
  /** 하단 계약 버튼의 첫 클릭은 서류 확인만 열고, 두 번째 클릭에서만 수락한다. */
  private contractConfirmationOpen = false;
  /** 계약서에 도장을 내리치는 중에는 중복 입력을 막는다. */
  private contractStamping = false;
  /** 계약 완료 대사와 작별 대사가 끝나면 자동으로 퇴장한 상태. */
  private contractedGuestDeparted = false;
  /** 첫날에는 배경의 문을 직접 열기 전까지 손님을 맞지 않는다. */
  private shopOpened = false;
  /** 돌려보낸 뒤에는 다음 지원자를 다시 문으로 맞이한다. */
  private waitingForNextVisitorDoor = false;
  /** 첫 영업의 빈 편성실에서 문을 열 때까지 반복되는 노크 */
  private officeKnockTimer: Phaser.Time.TimerEvent | null = null;
  /** 전신을 누를 때 SHOP_TOUCH 대사를 순서대로 넘긴다. */
  private guestTouchCount = 0;
  /** 우측 UI를 다시 그려도 같은 대사를 처음부터 재생하지 않도록 유지하는 대사 오브젝트. */
  private guestDialogue: Dialogue | null = null;
  private guestDialogueKey: string | null = null;
  /**
   * 현재 화면의 대사 진행 전용 용사 클릭 판정 대상.
   * 사각 상자(Zone)가 아니라 **용사 본인 스프라이트**를 픽셀 단위(alpha)로 판정한다 —
   * 원화 캔버스에 여백이 크고 인물 실루엣이 오목한 모양(머리카락 사이로 문·TV가 비치는 등)이라,
   * 사각 상자로는 아무리 좁혀도 배경까지 함께 잡힌다 (사용자 리포트 재현 — 문틀·TV를 눌러도
   * 대사가 넘어갔다). `body.setInteractive({ pixelPerfect: true })` 로 만든 진짜 스프라이트를 쓴다.
   */
  private guestDialogueTarget: Phaser.GameObjects.Image | null = null;
  /** 현재 편성실에 보이는 용사 전신. 숨쉬기·입퇴장 연출은 이 이미지에만 적용한다. */
  private guestSprite: Phaser.GameObjects.Image | null = null;
  /** 문을 연 직후 한 번만 우하단에서 등장시킨다. */
  private guestEntryPending = false;
  /** 손님 입장 직후, 제출 서류 두 장을 순서대로 꺼내 보일지 여부. */
  private submittedPaperEntryPending = false;
  /** 퇴장 트윈이 끝나기 전 중복 클릭을 막는다. */
  private guestExitInProgress = false;
  /** 진열 상품의 가격을 정하는 흥정 팝업. */
  private saleDialogOpen = false;
  private saleMultiplier = 1;
  private saleReaction: string | null = null;
  /** 버튼 조작 직후 기본 인사 대신 한 번 재생할 대사집 상황. */
  private officeDialogueSituation: DialogueSituation | null = null;
  /** SHOP_ITEM 치환/조건에 쓸, 방금 진열한 장비. */
  private officeDialogueItemId: string | null = null;
  /** 계약 확정 뒤에는 계약 대사와 작별 대사를 순서대로 끝낸 뒤 자동 퇴장한다. */
  private contractDepartureStep: 'CONTRACT' | 'LEAVE' | null = null;
  private broadcastTransitioning = false;

  constructor() {
    super(SCENES.PHASE_OFFICE);
  }

  /**
   * 계약서·인벤토리 아이콘처럼 pointer 이벤트 안에서 redraw()를 부르는 UI는 파괴 직후에도
   * Phaser InputPlugin의 제거 대기 목록에 한 프레임 남을 수 있다. 그 유령 입력 판이 다음
   * 클릭을 받지 않도록, 화면을 비우기 전에 모든 기존 입력을 즉시 비활성화한다.
   */
  protected override redraw(): void {
    for (const child of this.children.list) {
      if (child.input !== null) this.input.clear(child);
    }
    super.redraw();
  }

  override create(): void {
  /**
   * ★ Phaser 씬 인스턴스는 stop/launch 를 거쳐도 **살아남는다.**
   * 어제 남긴 필드를 지우지 않으면 다음 날 화면이 어제 상태로 시작한다.
   */
    // 겹치는 클릭 영역은 가장 앞의 조작 대상만 받는다. 진열대 클릭이 뒤의 용사 스프라이트로
    // 전파되어 SHOP_TOUCH 대사가 넘어가는 것을 막는다.
    this.input.setTopOnly(true);
    this.contractIndex = 0;
    this.inventoryOpen = false;
    this.selectedItemId = null;
    this.inventoryScrollRow = 0;
    this.itemDetail = [];
    this.draggingInventoryItem = false;
    // 클릭과 드래그를 분리한다. Phaser 기본 0px 임계값에서는 단순 클릭도 dragstart가 된다.
    this.input.dragDistanceThreshold = 12;
    this.contractReaderOpen = false;
    this.statsReaderOpen = false;
    this.contractSheetOffset = { x: 0, y: 0 };
    this.statsSheetOffset = { x: 0, y: 0 };
    this.contractConfirmationOpen = false;
    this.contractStamping = false;
    this.contractedGuestDeparted = false;
    this.shopOpened = false;
    this.waitingForNextVisitorDoor = false;
    this.officeKnockTimer = null;
    this.guestTouchCount = 0;
    this.guestDialogue = null;
    this.guestDialogueKey = null;
    this.guestDialogueTarget = null;
    this.guestSprite = null;
    this.guestEntryPending = false;
    this.submittedPaperEntryPending = false;
    this.guestExitInProgress = false;
    this.saleDialogOpen = false;
    this.saleMultiplier = 1;
    this.saleReaction = null;
    this.officeDialogueSituation = null;
    this.officeDialogueItemId = null;
    this.contractDepartureStep = null;
    this.broadcastTransitioning = false;
    // 방송 화면과 같은 버튼 툴팁. redraw 때 버튼만 다시 만들어져도 툴팁 판은 유지한다.
    this.keepAlive(...createTooltip(this).objects());
    super.create();
    // 대사 진행은 개별 이미지/버튼의 pointerup 이벤트를 전혀 사용하지 않는다.
    // 우측 UI가 화면을 다시 그리는 중에도, 이 단일 좌표 게이트만 용사 대사를 바꿀 수 있다.
    this.input.on('pointerdown', this.handleGuestDialoguePointer, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off('pointerdown', this.handleGuestDialoguePointer, this);
    });
    playBgm(this, 'bgm.shop');
  }

  protected build(s: Readonly<GameState>): void {
    // 모달을 열고 닫으며 다시 그린 뒤에도 겹친 입력이 뒤 오브젝트로 전달되지 않게 한다.
    this.input.setTopOnly(true);
    // redraw()가 이전 동적 오브젝트를 정리한 뒤 새 화면을 만든다.
    this.itemDetail = [];
    this.draggingInventoryItem = false;
    this.guestDialogueTarget = null;
    this.guestSprite = null;
    this.stageBackdrop();
    // Entering OFFICE always starts with the visitor behind the door.
    // The scene instance is reused across days, and create() resets shopOpened.
    if (!this.shopOpened) {
      this.scheduleOfficeKnock();
      this.buildShopStart();
      return;
    }
    this.cancelOfficeKnock();
    this.buildGuest(s);
    this.buildBenchBackdrop();
    this.buildShelf(s);
    // 펼친 서류 자신의 축소본만 숨기고, 다른 한 장은 계속 작업대에 남긴다.
    if (s.today === null) this.buildSubmittedContracts(s);
    // 확대는 별도 장면이 아니라, 이미 그린 작업대 위에 원본 종이를 얹는다.
    if (this.contractReaderOpen) this.buildContract(s);
    if (this.statsReaderOpen) this.buildStatsSheet(s);
    if (this.inventoryOpen) {
      // 인벤토리는 어떤 서류를 열었을 때도 최상단 모달이다. buildInventory()가 만든
      // 모든 입력 영역까지 함께 올려서, 서류가 인벤토리의 클릭을 가로채지 않게 한다.
      const firstInventoryChild = this.children.list.length;
      this.buildInventory(s);
      this.children.list.slice(firstInventoryChild).forEach((child) => {
        // 모달 전체는 서류보다 위에 두되, 장비 칸 내부에서 지정한 순서는 보존한다.
        // (기본 칸 10 → 선택 프레임 20 → 도트 30)
        const depthable = child as Phaser.GameObjects.GameObject & { depth: number; setDepth: (depth: number) => unknown };
        depthable.setDepth(1200 + depthable.depth);
      });
    }
    this.buildActions(s);
    if (this.saleDialogOpen) this.buildSaleDialog(s);
  }

  /* ── 좌 · 방문자 / 출연자 ─────────────────────────────── */

  /** 첫 영업은 버튼이 아니라, shop_room 원화의 오른쪽 문을 눌러 시작한다. */
  private buildShopStart(): void {
    const g = L.guest;
    this.rect(g.x, g.y, g.w, g.h, 'ink');
    this.spriteCover(g, ['bg.shop.room']);
    // 배경 원화(1086×1324)의 왼쪽 상자 위 좌표를 좌측 용사 칸(752×792)으로 옮겼다.
    // 용사 전신보다 먼저 그려, 참고 이미지처럼 방 안 소품으로 남긴다.
    this.sprite(g.x + 27, g.y + 275, 'prop.tv', 140, 112);
    this.frame(g.x, g.y, g.w, g.h, 'dust');
    this.buildBenchBackdrop();

    // 문짝 그림 자체가 클릭 대상이다. 그림이 없을 때만 예전처럼 투명 zone 으로 내려간다.
    // (예전 zone 은 원화의 문간과 어긋나 있었다 — 아래쪽 절반이 방바닥을 덮고 있었다.)
    const doorImage = this.buildOfficeDoor(g);
    const handle: Phaser.GameObjects.GameObject = doorImage
      ?? this.add.zone(g.x + OFFICE_DOOR.x, g.y + OFFICE_DOOR.y, OFFICE_DOOR.w, OFFICE_DOOR.h).setOrigin(0, 0);
    handle.setInteractive({ cursor: 'pointer' });
    handle.on('pointerup', () => {
      this.shopOpened = true;
      this.guestEntryPending = true;
      this.submittedPaperEntryPending = true;
      this.waitingForNextVisitorDoor = false;
      this.cancelOfficeKnock();
      playSfx(this, 'sfx.title.door', 0.28);
      playSfx(this, 'sfx.office.walk', 0.22);
      this.redraw();
    });
    // 빈 편성실도 손님이 있을 때와 같은 상단 이름판·하단 가리개 크기를 사용한다.
    // 문을 열어 손님이 나타나는 순간 UI가 흔들리거나 크기가 바뀌어 보이지 않는다.
    const prompt = { x: g.x + L.line, y: g.y + L.line, w: 460, h: 76 };
    this.scrimBlock(prompt.x, prompt.y, prompt.w, prompt.h);
    this.title(g.x + L.pad, g.y + 18, this.waitingForNextVisitorDoor ? '손님 대기' : '첫 영업', 'bone').setScale(0.55);
    this.text(prompt.x + 28, prompt.y + 46, '문을 눌러 장사를 시작하세요.', 'bone').setScale(0.55);
    const coverW = g.w;
    const coverH = Math.round(258 * (coverW / 1087));
    const coverY = g.y + g.h - coverH;
    this.sprite(g.x, coverY, 'ui.guest.cover', coverW, coverH);
    this.rect(L.dialogue.x, L.dialogue.y, L.dialogue.w, L.dialogue.h, 'ink');
  }

  /**
   * 문짝을 방 안 소품으로 세운다. **TV 와 같은 층**이다 — 방 배경 다음, 용사 전신 앞.
   * 용사가 문 앞을 지나 서면 용사가 앞에 와야 하므로 이 순서를 지켜야 한다.
   *
   * 그림이 아직 없으면 `null` 이다. 그때는 부르는 쪽이 예전처럼 투명 zone 을 놓는다 —
   * 문은 첫 영업을 시작하는 **유일한 입구**라, 아트 하나 빠졌다고 막히면 안 된다.
   */
  private buildOfficeDoor(g: { x: number; y: number }): Phaser.GameObjects.Image | null {
    const door = this.spriteObject(
      g.x + OFFICE_DOOR.x, g.y + OFFICE_DOOR.y, 'prop.office.door', OFFICE_DOOR.w, OFFICE_DOOR.h,
    );
    door?.setDepth(0);
    return door;
  }

  /** 진입 2초 뒤 한 번, 이후 문을 열 때까지 3초마다 노크한다. */
  private scheduleOfficeKnock(): void {
    if (this.officeKnockTimer !== null) return;
    this.officeKnockTimer = this.time.delayedCall(2000, () => {
      if (this.shopOpened) return;
      playSfx(this, 'sfx.revive.knock', 0.75);
      this.officeKnockTimer = this.time.addEvent({
        delay: 3000,
        loop: true,
        callback: () => {
          if (this.shopOpened) {
            this.cancelOfficeKnock();
            return;
          }
          playSfx(this, 'sfx.revive.knock', 0.75);
        },
      });
    });
  }

  private cancelOfficeKnock(): void {
    this.officeKnockTimer?.remove(false);
    this.officeKnockTimer = null;
  }

  private buildGuest(s: Readonly<GameState>): void {
    const g = L.guest;
    const broadcastReady = s.today !== null && this.contractedGuestDeparted;
    this.rect(g.x, g.y, g.w, g.h, 'ink');
    this.spriteCover(g, ['bg.shop.room']);
    // TV는 방 배경 다음, 용사 전신 전 단계에서 만들어져 항상 방 안 소품으로 남는다.
    // 계약이 끝나면 재생 화면으로 바뀌며, 이 TV만 방송 시작 입력을 받는다.
    const tv = this.spriteObject(g.x + 27, g.y + 275, broadcastReady ? 'prop.tv.live' : 'prop.tv', 140, 112);
    if (tv !== null && broadcastReady) {
      const showLiveTv = (hovered: boolean): void => {
        tv.setTexture(key(hovered && this.hasArt('prop.tv.live.hover') ? 'prop.tv.live.hover' : 'prop.tv.live'))
          .setDisplaySize(140, 112);
      };
      // TV는 배경 위, 뒤이어 생성되는 용사 전신 뒤에 있어야 한다.
      tv.setInteractive({ cursor: 'pointer' }).setDepth(0);
      tv.on('pointerover', () => showLiveTv(true));
      tv.on('pointerout', () => showLiveTv(false));
      tv.on('pointerup', () => this.startBroadcastTransition());
    } else if (tv !== null) {
      // 아직 아무 기능이 없어도 이 자리는 눌러 잡아 둔다. 안 그러면 뒤에 깔리는
      // 용사 클릭 판정 상자(guestDialogueTarget)로 클릭이 새어 들어가, TV를 눌렀는데
      // 대사가 넘어가 버린다 (사용자 리포트 — characterHitbox 로 상자를 좁혀도
      // TV는 그 상자 '안'에 그려지는 소품이라 겹침 자체는 남는다).
      tv.setInteractive({ cursor: 'default' }).setDepth(0);
    }
    // 손님이 와 있는 동안에도 문은 방에 그대로 있다. 이때는 여는 기능이 없지만
    // TV 와 같은 이유로 클릭은 삼킨다 — 안 그러면 문을 눌렀는데 용사 대사가 넘어간다.
    this.buildOfficeDoor(g)?.setInteractive({ cursor: 'default' });
    this.frame(g.x, g.y, g.w, g.h, 'dust');

    // 계약 모드에서 좌측에 서 있는 사람은 **방문자**다. 아직 계약 전이라 recruitPool 에 있다.
    // 이름만 방문자로 바꾸고 그림은 기존 출연자를 쓰면, 이름과 얼굴이 어긋난다
    // 계약이 완료된 뒤에는 남은 지원자가 아니라, 방금 계약한 오늘의 용사를 보여 준다.
    const visitor = s.today === null ? s.visitors[this.contractIndex] ?? s.visitors[0] : undefined;
    const contracting = visitor !== undefined;
    const guest = contracting ? s.recruitPool.find((x) => x.id === visitor.starId) : undefined;
    const star = guest
      ?? s.stars.find((x) => x.id === s.today?.starId)
      ?? s.stars.find((x) => x.status === 'ALIVE');
    const name = broadcastReady
      ? 'TV를 눌러 방송 시작'
      : contracting
        ? visitor.displayName
        // 페르소나(예: 불꽃의 리온)가 아니라 지금 서 있는 용사의 실제 이름을 쓴다.
        // 노일 세이로(검사)와 펜로 루엔(궁수)의 이름이 계약 전후로 바뀌지 않는다.
        : star?.bodyName ?? '무명';

    // 전신 CG 자리 — star.body.* → star.portrait.* → 실루엣 순으로 내려간다
    const art = star === undefined ? null : starArt(star.id);
    const w = 384;
    const h = 480;
    const x = g.x + Math.round((g.w - w) / 2);
    const y = g.y + g.h - h - 24;
    // 전신은 좌측 칸과 1:1 이다 (752x792). 이름 글자는 그 위에 얹는다
    const full = { x: g.x, y: g.y, w: g.w, h: g.h };
    // 계약 대사와 작별 대사가 끝날 때까지는 방금 계약한 용사를 그대로 보여 준다.
    const body = broadcastReady || art === null ? null : this.spriteFitObject(full, [art.body]);
    if (!broadcastReady && body === null && !this.spriteFit({ x, y, w, h }, [...(art === null ? [] : [art.portrait]), 'star.silhouette'])) {
      this.rect(x, y, w, h, 'mid');
    }

    // 배경이 밝은 곳(문·벽)에 이름이 걸리면 안 읽힌다. 이름이 앉는 자리만 덮는다
    this.scrimBlock(g.x + L.line, g.y + L.line, 460, 76);
    this.title(g.x + L.pad, g.y + 18, this.clip(name, g.w - L.pad * 2, 'title')).setScale(0.8);

    // 캐릭터보다 앞에 가리개를 얹고 그 안에 대사를 둔다.
    const coverW = g.w;
    const coverH = Math.round(258 * (coverW / 1087));
    const coverX = g.x;
    const coverY = g.y + g.h - coverH;
    this.sprite(coverX, coverY, 'ui.guest.cover', coverW, coverH);
    const d = L.dialogue;
    this.rect(d.x, d.y, d.w, d.h, 'ink');
    const profile = star === undefined ? undefined : content.starProfiles[star.id];
    const defaultSituation = this.guestTouchCount > 0
      ? 'SHOP_TOUCH'
      : contracting ? 'SHOP_FIRST' : 'SHOP_GREET';
    const situation = this.officeDialogueSituation ?? defaultSituation;
    const contractedGuestWaiting = s.today !== null && !this.contractedGuestDeparted;
    const dialogueItem = this.officeDialogueItemId === null
      ? undefined
      : content.items.find((item) => item.id === this.officeDialogueItemId);
    const speechLine = broadcastReady || star === undefined ? null : pickDialogue(star.id, situation, {
      floor: profile?.targetFloor,
      revives: totalRevivals(star.id, star.reviveCount),
      viewers: profile?.fans,
      deaths: s.stats.totalDiscarded,
      generation: s.personas.find((persona) => persona.id === star.personaId)?.generation,
      item: dialogueItem?.name,
      itemUsed: dialogueItem?.isRelic === true,
      hasWeapon: s.shelf[0] !== null,
    }, ((s.day * 17 + this.contractIndex * 7 + this.guestTouchCount) % 100) / 100);
    const speech: { line: string; expressionAsset?: string; effects?: readonly string[] } = {
      line: contractedGuestWaiting
        ? (speechLine?.text ?? '계약해 주셔서 감사합니다. 방송에서 뵐게요.')
        : this.saleReaction ?? speechLine?.text ?? (contracting ? '...일할 자리 있나요?' : '...강한 무기 있나요?'),
      expressionAsset: star === undefined || speechLine === null ? undefined : starExpression(star.id, speechLine.expression),
      effects: speechLine?.effects,
    };
    const bodyGeometry = body === null ? null : {
      x: body.x,
      y: body.y,
      w: body.displayWidth,
      h: body.displayHeight,
    };
    const setCharacterFrame = (asset: string | undefined): void => {
      if (body === null || bodyGeometry === null || art === null || asset === undefined || !this.hasArt(asset)) return;
      body
        .setTexture(key(asset))
        // setTexture가 프레임의 내부 크기를 다시 읽어도 화면 기하가 바뀌지 않게 고정한다.
        .setPosition(bodyGeometry.x, bodyGeometry.y)
        .setDisplaySize(bodyGeometry.w, bodyGeometry.h);
    };
    if (art !== null) setCharacterFrame(speech.expressionAsset ?? art.dialogue);
    if (body !== null && star !== undefined) {
      // 대사를 넘기는 유일한 입력 대상 — 사각 상자(Zone)가 아니라 **스프라이트 자신**을
      // 픽셀 단위(alpha)로 판정한다. 원화 인물 실루엣이 오목해서(머리카락 사이로 문·TV가
      // 비치는 등) 사각 상자로는 아무리 좁혀도 배경까지 함께 잡혔다 — 이전 시도(characterHitbox,
      // 알파 bounding box)가 이 실패를 반복했다. 개별 pointer 이벤트는 달지 않고, 씬 전역
      // 이벤트가 제공하는 currentlyOver 의 최상단 대상과만 비교한다 (handleGuestDialoguePointer).
      body.setInteractive({ cursor: 'pointer', pixelPerfect: true, alphaTolerance: 8 });
      this.guestDialogueTarget = body;
      this.guestSprite = body;
      this.animateGuestArrivalAndBreathing(body, bodyGeometry?.x ?? body.x, bodyGeometry?.y ?? body.y);
    }
    // 입 연출 — 폐지. 말하는 동안 입을 얹던 자리
    // const mouth = this.buildGuestMouth(bodyGeometry, star?.id, speech.expressionAsset);
    if (!broadcastReady) {
      // 퇴장 대사는 같은 문장이 우연히 이미 떠 있어도 반드시 새 Dialogue로 만든다.
      // 기존 키에는 퇴장 대기 상태가 없어서, 이미 완료된 대사 객체가 재사용되면
      // onComplete가 없는 이전 객체를 그대로 쓰게 되어 departGuest()가 호출되지 않았다.
      const dialogueKey = [
        star?.id ?? '',
        speech.line,
        speech.expressionAsset ?? '',
        ...(speech.effects ?? []),
        this.contractDepartureStep ?? '',
      ].join('\u0001');
      if (this.guestDialogueKey !== dialogueKey || this.guestDialogue === null || !this.guestDialogue.active) {
        if (this.guestDialogue !== null) {
          this.dropAlive(this.guestDialogue);
          this.guestDialogue.destroy();
        }
        this.guestDialogue = new Dialogue(this, {
        x: coverX + L.pad,
        y: coverY + 52,
        w: coverW - L.pad,
        // 대사를 생략하지 않고, 작은 본문 글씨로 여러 줄에 모두 표시한다.
        line: wrapOfficeDialogue(speech.line),
        size: 'body',
        scale: 0.90,
          effects: speech.effects,
          voice: starVoice(star?.id),
          onComplete: this.contractDepartureStep !== null
            ? () => this.advanceContractDeparture()
            : undefined,
        // 입 연출 — 폐지
        // onComplete: () => mouth?.setVisible(false),
        });
        this.guestDialogueKey = dialogueKey;
        this.keepAlive(this.guestDialogue);
      }
    } else if (this.guestDialogue !== null) {
      this.dropAlive(this.guestDialogue);
      this.guestDialogue.destroy();
      this.guestDialogue = null;
      this.guestDialogueKey = null;
    }
  }

  /** Phaser가 판정한 최상단 클릭 대상이 용사 전신일 때만 다음 대사로 인정한다. */
  private handleGuestDialoguePointer(
    _pointer: Phaser.Input.Pointer,
    currentlyOver: Phaser.GameObjects.GameObject[],
  ): void {
    const target = this.guestDialogueTarget;
    if (target === null || currentlyOver[0] !== target) return;
    // 계약 확정 뒤 대사가 재생되는 동안에는 클릭으로 순서를 건너뛸 수 없다.
    if (this.contractDepartureStep !== null) return;
    if (this.officeDialogueSituation !== null) {
      // 장비/계약 반응을 먼저 끝까지 보여 준 뒤, 다음 클릭부터 평소 대사 순서로 돌아간다.
      this.officeDialogueSituation = null;
      this.officeDialogueItemId = null;
    } else this.guestTouchCount += 1;
    this.redraw();
  }

  /** 대사집에만 있던 편성실 상황을 현재 방문자에게 한 번 연결한다. */
  private showOfficeDialogue(situation: DialogueSituation, itemId: string | null = null): void {
    this.officeDialogueSituation = situation;
    this.officeDialogueItemId = itemId;
  }

  /** 계약 → 작별 → 퇴장을 대사 UI 재생 순서와 분리해 한 번만 진행한다. */
  private advanceContractDeparture(): void {
    if (this.contractDepartureStep === 'CONTRACT') {
      this.contractDepartureStep = 'LEAVE';
      // 계약 대사를 다 읽은 뒤 1초를 쉬고 작별 대사를 시작한다. redraw는 대사 객체의
      // finish 호출 스택 밖에서 실행해야 현재 대사가 다시 persistent 목록에 남지 않는다.
      this.time.delayedCall(1000, () => {
        if (this.contractDepartureStep !== 'LEAVE') return;
        this.showOfficeDialogue('SHOP_LEAVE');
        this.redraw();
      });
      return;
    }
    if (this.contractDepartureStep !== 'LEAVE') return;
    // Dialogue.finish()의 호출 스택 안에서 해당 객체를 바로 destroy하면, 브라우저에
    // 따라 후속 트윈이 취소될 수 있다. 작별 대사가 끝난 뒤 1초를 둔 다음 별도 틱에서
    // 퇴장 트윈을 시작한다. 이 대기 중에도 step을 유지해 용사 클릭으로 넘기지 못한다.
    this.time.delayedCall(1000, () => {
      if (this.contractDepartureStep !== 'LEAVE' || this.guestExitInProgress) return;
      this.contractDepartureStep = null;
      this.officeDialogueSituation = null;
      this.officeDialogueItemId = null;
      this.departGuest(() => {
        this.contractedGuestDeparted = true;
        this.redraw();
      });
    });
  }

  /** 용사 스프라이트만 아주 작게 상하로 흔들어 정지 화면에서도 숨 쉬는 느낌을 준다. */
  private startGuestBreathing(body: Phaser.GameObjects.Image, baseY: number): void {
    if (reducedMotion(this.registry)) return;
    this.tweens.add({
      targets: body,
      y: baseY - 2,
      duration: 1450,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
  }

  /** 검은 실루엣을 원래 밝기로 부드럽게 되돌린다. */
  private brightenGuest(body: Phaser.GameObjects.Image, from: number, to: number, duration: number, onComplete: () => void): void {
    this.tweens.addCounter({
      from,
      to,
      duration,
      ease: 'Sine.easeInOut',
      onUpdate: (tween) => {
        const tone = Math.round(tween.getValue() ?? from);
        body.setTint((tone << 16) | (tone << 8) | tone);
      },
      onComplete: () => {
        if (to === 255) body.clearTint();
        onComplete();
      },
    });
  }

  /** 문을 연 때만 우측 중하단의 검은 실루엣이 들어와 원래 밝기로 드러난다. */
  private animateGuestArrivalAndBreathing(body: Phaser.GameObjects.Image, baseX: number, baseY: number): void {
    if (!this.guestEntryPending) {
      this.startGuestBreathing(body, baseY);
      return;
    }
    this.guestEntryPending = false;
    if (reducedMotion(this.registry)) {
      this.startGuestBreathing(body, baseY);
      return;
    }
    body.setPosition(baseX + Math.round(body.displayWidth * 0.62), baseY + 8).setTint(0x000000);
    this.tweens.add({
      targets: body,
      x: baseX,
      duration: 340,
      ease: 'Quad.easeOut',
      onComplete: () => {
        body.setPosition(baseX, baseY);
        this.brightenGuest(body, 0, 255, 210, () => this.startGuestBreathing(body, baseY));
      },
    });
    this.tweens.add({
      targets: body,
      y: baseY - 2,
      duration: 80,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: 1,
    });
  }

  /** 용사를 먼저 검은 실루엣으로 만든 뒤 좌측 중단으로 빠져나가게 한다. */
  private departGuest(afterDeparture: () => void): void {
    if (this.guestExitInProgress) return;
    this.guestExitInProgress = true;
    const body = this.guestSprite;
    this.guestDialogueTarget = null;
    // 퇴장 중에는 이전 대사가 남지 않게 대사창을 비운다.
    if (this.guestDialogue !== null) {
      this.dropAlive(this.guestDialogue);
      this.guestDialogue.destroy();
      this.guestDialogue = null;
      this.guestDialogueKey = null;
    }
    playSfx(this, 'sfx.office.walk', 0.22);
    if (body === null || !body.active || reducedMotion(this.registry)) {
      this.guestExitInProgress = false;
      afterDeparture();
      return;
    }
    this.input.clear(body);
    this.tweens.killTweensOf(body);
    this.brightenGuest(body, 255, 0, 170, () => {
      const exitY = body.y - 12;
      this.tweens.add({
        targets: body,
        x: body.x - Math.round(body.displayWidth * 0.62),
        duration: 340,
        ease: 'Quad.easeIn',
        onComplete: () => {
          body.setY(exitY);
          this.guestExitInProgress = false;
          this.guestSprite = null;
          afterDeparture();
        },
      });
      this.tweens.add({
        targets: body,
        y: body.y - 10,
        duration: 80,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: 1,
      });
    });
  }

  /**
   * 손님 전신 위에 얹는 **말하는 입**.
   *
   * 몸은 `star.body.*` 를 칸에 맞춰 늘려 놓고 표정이 오면 텍스처만 갈아 끼운다.
   * 그래서 화면 기하는 `bodyGeometry` 하나로 고정돼 있고, 입도 그 배율로 옮기면 맞는다.
   * **표정 스프라이트를 쓰고 있을 때만** 얹는다 — 기본 전신 그림은 좌표계가 다르다.
   */
  /* ── 입 연출 (폐지) — 되살리려면 아래를 통째로 푼다 ──────── */
  // /** 이 에셋 키의 텍스처 원본 크기 — 없으면 null */
  // private textureSize(assetKey: string): { width: number; height: number } | null {
  // if (!this.hasArt(assetKey)) return null;
  // const src = this.textures.get(key(assetKey)).getSourceImage() as { width: number; height: number };
  // return { width: src.width, height: src.height };
  // }
  //
  // private buildGuestMouth(
  // geometry: { x: number; y: number; w: number; h: number } | null,
  // starId: string | undefined,
  // expressionAsset: string | undefined,
  // ): Phaser.GameObjects.Image | null {
  // const spot = mouthSpot(starId);
  // if (geometry === null || spot === null || starId === undefined || expressionAsset === undefined) return null;
  // const src = this.textureSize(expressionAsset);
  // if (src === null) return null;
  // const sx = geometry.w / src.width;
  // const sy = geometry.h / src.height;
  // const img = this.spriteObject(
  // geometry.x + spot.x * sx,
  // geometry.y + spot.y * sy,
  // mouthKey(starId),
  // Math.round(spot.w * sx),
  // Math.round(spot.h * sy),
  // );
  // return img;
  // }
  //

  /* ── 우 · 작업대 배경 ─────────────────────────────────── */

  /** TV를 누른 뒤 짧은 수신 잡음 화면을 보이고 방송으로 넘긴다. */
  private startBroadcastTransition(): void {
    if (this.broadcastTransitioning) return;
    this.broadcastTransitioning = true;

    const enterBroadcast = (): void => {
      this.store.dispatch({ type: 'OFFICE/CONFIRM' });
    };
    if (reducedMotion(this.registry)) {
      enterBroadcast();
      return;
    }

    const noise = this.spriteObject(0, 0, 'ui.live.noise', L.W, L.H);
    const overlay = noise ?? this.add.rectangle(0, 0, L.W, L.H, PALETTE.ink, 0.92).setOrigin(0, 0);
    overlay.setDepth(5000).setAlpha(0);
    this.tweens.add({
      targets: overlay,
      alpha: 0.94,
      duration: 90,
      ease: 'Steps(3)',
      onComplete: () => {
        this.time.delayedCall(210, () => {
          overlay.destroy();
          enterBroadcast();
        });
      },
    });
  }

  private buildBenchBackdrop(): void {
    const b = L.bench;
    this.rect(b.x, b.y, b.w, b.h, 'ink');
    this.spriteCover(b, ['bg.shop.bench']);
    // 소품 — 작업대를 세 구역으로 나눠 놓는다.
    //   좌: 램프(진열 왼쪽) · 장부(아래)   우: 도장·두루마리(진열 오른쪽 세로 띠)
    //   가운데 아래(local 380~1130 / 400~570)는 출연자 줄이 쓰므로 비워 둔다.
    this.frame(b.x, b.y, b.w, b.h, 'dust');
  }

  /* ── 작업대 A · 계약서 심사 ───────────────────────────── */

  /** 축소 계약서에서 열리는 유일한 확대 상태. 다른 팝업/계약서 경로는 만들지 않는다. */
  private buildContract(s: Readonly<GameState>): void {
    const visitor = s.visitors[this.contractIndex];
    if (visitor === undefined) {
      this.contractReaderOpen = false;
      return;
    }
    const body = s.recruitPool.find((candidate) => candidate.id === visitor.starId);
    const profile = content.starProfiles[visitor.starId];
    // 원본 비율(700×914)을 유지한 채 기존 펼침의 1/1.3 크기로 줄였다.
    // 본문 좌표·폰트는 아래 scale/textScale을 함께 써서 종이 안의 상대 위치를 보존한다.
    // 펼친 종이의 중심은 접힌 계약서가 놓인 현재 위치와 같다.
    // 그래서 펼침·접기·드래그 뒤에도 종이가 한 곳에서만 열리고 닫힌다.
    const foldedCenter = {
      x: L.bench.x + 168 + this.contractSheetOffset.x,
      y: L.bench.y + L.bench.h - 138 + this.contractSheetOffset.y,
    };
    const paper = { x: foldedCenter.x - 308, y: foldedCenter.y - 402, w: 616, h: 804 };
    const documentStart = this.children.list.length;
    const asset = this.contractSheetAsset();
    if (asset === null) return;
    const paperDepth = 800;
    const scale = paper.w / 700;
    const textScale = paper.w / 560;
    const at = (x: number, y: number, value: string, textScale = 0.72) =>
      this.text(paper.x + x * scale, paper.y + y * scale, value, 'ink').setScale(textScale * (paper.w / 560)).setDepth(paperDepth + 2);

    // 종이를 별도 팝업처럼 검게 가리지 않는다. 원래 진열대 위에서 집어 든 서류처럼
    // 작업대 배경을 그대로 남긴다. 입력은 build()의 모달 분기로 이미 차단되어 있다.
    this.add.image(paper.x, paper.y, key(asset)).setOrigin(0, 0).setDisplaySize(paper.w, paper.h).setDepth(paperDepth);

    // 계약서 좌측 하단의 빈 원형 도장란(원본 x≈50, y≈745)에 맞춘다.
    const stampBox = { x: paper.x + 44, y: paper.y + 645, w: 122, h: 122 };
    const stamp = this.spriteObject(stampBox.x, stampBox.y, 'prop.contract.stamp', stampBox.w, stampBox.h);
    stamp?.setDepth(paperDepth + 4).setAlpha(0);

    // 계약서를 여는 클릭은 이 redraw 이전의 축소본에 전달됐으므로, 여기서는 바로 입력을 등록해도
    // 충돌하지 않는다. delayedCall로 늦게 등록하면 닫은 뒤의 폐기된 page가 InputPlugin에 남을 수 있다.
    const page = this.add.zone(paper.x, paper.y, paper.w, paper.h)
      .setOrigin(0, 0)
      .setDepth(paperDepth + 1)
      .setInteractive({ cursor: 'pointer' });
    let draggedPaper = false;
    page.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (draggedPaper) return;
      if (pointer.button !== 0) return;
      if (this.contractConfirmationOpen
        && pointer.x >= stampBox.x && pointer.x <= stampBox.x + stampBox.w
        && pointer.y >= stampBox.y && pointer.y <= stampBox.y + stampBox.h) return;
      page.disableInteractive();
      this.contractSheetOffset = {
        x: Math.round(paper.x + paper.w / 2 - (L.bench.x + 168)),
        y: Math.round(paper.y + paper.h / 2 - (L.bench.y + L.bench.h - 138)),
      };
      this.contractReaderOpen = false;
      this.contractConfirmationOpen = false;
      this.redraw();
    });

    if (this.contractConfirmationOpen) {
      const stampZone = this.add.zone(stampBox.x, stampBox.y, stampBox.w, stampBox.h)
        .setOrigin(0, 0)
        .setDepth(paperDepth + 5)
        .setInteractive({ cursor: 'pointer' });
      stampZone.on('pointerover', () => stamp?.setAlpha(0.38));
      stampZone.on('pointerout', () => {
        if (!this.contractStamping) stamp?.setAlpha(0);
      });
      stampZone.on('pointerup', () => {
        if (this.contractStamping || stamp === null) return;
        this.contractStamping = true;
        stamp.setAlpha(1).setY(stampBox.y - 44);
        this.tweens.add({
          targets: stamp,
          y: stampBox.y,
          duration: 120,
          ease: 'Quad.easeIn',
          onComplete: () => {
            playSfx(this, 'sfx.contract.stamp', 0.2);
            this.time.delayedCall(180, () => {
              this.contractStamping = false;
              this.contractReaderOpen = false;
              this.contractConfirmationOpen = false;
              this.contractedGuestDeparted = false;
              // 계약 대사 뒤 작별 대사를 보여 준 뒤 자동으로 퇴장한다.
              this.showOfficeDialogue('SHOP_CONTRACT');
              this.contractDepartureStep = 'CONTRACT';
              this.store.dispatch({ type: 'OFFICE/CONTRACT_ACCEPT', starId: visitor.starId });
            });
          },
        });
      });
    }

    // 상단 개인정보 칸
    // 초상칸 오른쪽의 기입선에 맞춘 개인정보 블록.
    const identityX = 325;
    at(identityX, 130, '예명', 0.50);
    at(identityX, 150, this.clip(profile?.stageName ?? visitor.displayName, 240, 'title'), 0.82);
    at(identityX, 190, '본명', 0.50);
    at(identityX, 210, body?.bodyName ?? '미상', 0.82);
    at(identityX, 250, '출신', 0.50);
    at(identityX, 270, profile?.origin ?? '미등록 구역', 0.64);
    at(identityX, 300, '직종', 0.50);
    at(identityX, 320, profile?.role ?? '하강 용병', 0.64);
    at(326, 350, visitor.recognition, 0.88);
    at(525, 350, visitor.fandom.toLocaleString('en-US'), 0.82);

    // 하단 계약 조건 칸. honesty는 의도적으로 어느 곳에도 적지 않는다.
    const target = visitor.claimedTiers.at(-1)?.floor ?? 0;
    at(90, 526, '계약금', 0.46);
    at(300, 552, `${visitor.fee.toLocaleString('en-US')} G`, 0.82);
    at(90, 582, '목표층', 0.46);
    at(300, 607, `${target} F`, 0.92);
    if (profile !== undefined) {
      at(90, 650, `HP ${profile.hp} · ATK ${profile.atk} · DEF ${profile.def} · WILL ${profile.will}`, 0.46);
    }
    const rates = visitor.claimedTiers.map((tier) => `${tier.floor}F ${Math.round(tier.rate * 100)}%`).join(' · ');
    at(90, 694, this.clip(rates, 500, 'body'), 0.46);
    const documentObjects = this.children.list.slice(documentStart);
    this.wirePaperDrag(page, documentObjects, this.contractSheetOffset, () => {
      draggedPaper = true;
      this.raiseDocumentAboveActions(documentObjects);
    });
    this.label(paper.x + 72, paper.y + paper.h - 62, this.contractConfirmationOpen ? '좌측 하단 도장을 눌러 계약 확정' : '종이를 누르면 접기', 'ink').setScale(0.62 * textScale).setDepth(paperDepth + 2);
  }

  /* ── 작업대 B · 장비 진열 ─────────────────────────────── */

  /** 용사가 낸 하강 예상서. 계약서와 달리 읽기 전용이며 실제 프로필 수치로 채운다. */
  private buildStatsSheet(s: Readonly<GameState>): void {
    const visitor = s.visitors[this.contractIndex];
    const asset = this.statsSheetAsset();
    if (visitor === undefined || asset === null) {
      this.statsReaderOpen = false;
      return;
    }
    const profile = content.starProfiles[visitor.starId];
    // 하강 예상서도 접힌 서류의 현재 중심에서 그대로 펼친다.
    const foldedCenter = {
      x: L.bench.x + 412 + this.statsSheetOffset.x,
      y: L.bench.y + L.bench.h - 130 + this.statsSheetOffset.y,
    };
    const paper = { x: foldedCenter.x - 308, y: foldedCenter.y - 390, w: 616, h: 779 };
    const documentStart = this.children.list.length;
    // 두 장이 겹치면 개인정보가 적힌 계약서보다 스탯 검수표를 항상 위에 둔다.
    const depth = this.contractReaderOpen ? 950 : 800;
    const scale = paper.w / 705;
    const at = (x: number, y: number, value: string, textScale = 0.64) =>
      this.text(paper.x + x * scale, paper.y + y * scale, value, 'ink')
        .setScale(textScale * scale)
        .setDepth(depth + 2);
    this.add.image(paper.x, paper.y, key(asset)).setOrigin(0, 0).setDisplaySize(paper.w, paper.h).setDepth(depth);

    // 캐릭터스탯.xlsm의 개인 시트에 적힌 원래 착용 장비와 기본 스탯.
    const originalEquipment = profile?.equipment ?? [];
    const hp = profile?.hp ?? 0;
    const atk = profile?.atk ?? 0;
    const def = profile?.def ?? 0;
    // 판매 뒤 진열대가 비어도, 이번 방송에 착용한 장비는 runEquipment 플래그로 이어진다.
    const activeEquipment = equippedItemIds(s, visitor.starId);
    const displayedEquipment = activeEquipment.map((itemId, slot) => {
      const item = itemId === null ? undefined : content.items.find((candidate) => candidate.id === itemId);
      const baseIcon = content.items.find((candidate) => candidate.id === BASE_EQUIPMENT_ICON_IDS[slot]);
      return {
        item,
        icon: item ?? baseIcon,
        label: item === undefined ? (originalEquipment[slot] ?? '기본 장비 없음') : item.name,
        isShelfItem: item !== undefined,
      };
    });
    const bonus = displayedEquipment.reduce(
      (total, entry) => entry.item === undefined
        ? total
        : { hp: total.hp + entry.item.hp, atk: total.atk + entry.item.atk, def: total.def + entry.item.def },
      { hp: 0, atk: 0, def: 0 },
    );
    const effective = { hp: hp + bonus.hp, atk: atk + bonus.atk, def: def + bonus.def };

    // 서류 안의 글씨는 예시보다 한 단계 크게 잡아 확대 없이도 읽힌다.
    at(98, 70, '하강 예상서', 1.28);
    at(96, 134, '캐릭터 스탯', 0.88);
    at(112, 178, `체력 ${effective.hp}     공격 ${effective.atk}     방어 ${effective.def}`, 0.76);
    at(112, 216, `진열 보정  HP ${bonus.hp >= 0 ? '+' : ''}${bonus.hp}  ATK ${bonus.atk >= 0 ? '+' : ''}${bonus.atk}  DEF ${bonus.def >= 0 ? '+' : ''}${bonus.def}`, 0.54);
    at(112, 246, `특이사항  ${profile?.nature ?? '기록 없음'}${profile?.refuses ? ` · ${profile.refuses}` : ''}`, 0.54);

    at(96, 286, '장비 현황', 0.88);
    displayedEquipment.forEach((entry, index) => {
      const rowY = 348 + index * 56;
      at(112, rowY, SLOT_NAMES[index] ?? '기타', 0.56);
      if (entry.icon !== undefined) {
        const icon = this.itemArt(entry.icon, {
          x: paper.x + 188 * scale,
          y: paper.y + (rowY - 20) * scale,
          w: Math.round(42 * scale),
          h: Math.round(42 * scale),
        });
        if (icon !== null) {
          icon.setDepth(depth + 4);
          if (entry.item !== undefined) {
            icon.setInteractive({ cursor: 'help' });
            icon.on('pointerover', (pointer: Phaser.Input.Pointer) => this.showItemDetail(entry.item!, pointer, this.featuredPersona(s)));
            icon.on('pointerout', () => this.hideItemDetail());
          }
        }
      }
      at(242, rowY, this.clip(entry.label, 250, 'body'), entry.isShelfItem ? 0.62 : 0.54);
      at(532, rowY, entry.isShelfItem ? '진열' : '기본', entry.isShelfItem ? 0.48 : 0.42);
    });

    at(96, 516, '구간별 하강 확률', 0.88);
    // 방송 시작 시 자동 통과 여부에도 쓰는 공용 예측식으로 표시한다.
    descentForecast(s, visitor.starId).forEach((band, row) => {
      const chance = band.chance;
      const filled = Math.max(1, Math.round(chance / 20));
      const rowY = 566 + row * 45;
      at(112, rowY, `${band.from}-${band.to}F`, 0.62);
      for (let column = 0; column < 5; column += 1) {
        const cellX = paper.x + (294 + column * 48) * scale;
        const cellY = paper.y + (rowY - 2) * scale;
        this.add.rectangle(cellX, cellY, Math.round(42 * scale), Math.round(30 * scale))
          .setOrigin(0, 0)
          .setStrokeStyle(2, PALETTE.ink)
          .setDepth(depth + 2);
        if (column < filled) {
          this.add.rectangle(cellX + 4, cellY + 4, Math.round(34 * scale), Math.round(22 * scale), PALETTE.ink)
            .setOrigin(0, 0)
          .setDepth(depth + 1);
        }
      }
      at(552, rowY, `${chance}%`, 0.62);
    });

    const page = this.add.zone(paper.x, paper.y, paper.w, paper.h)
      .setOrigin(0, 0)
      .setDepth(depth + 3)
      .setInteractive({ cursor: 'pointer' });
    let draggedPaper = false;
    page.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (draggedPaper) return;
      if (pointer.button !== 0) return;
      page.disableInteractive();
      this.statsSheetOffset = {
        x: Math.round(paper.x + paper.w / 2 - (L.bench.x + 412)),
        y: Math.round(paper.y + paper.h / 2 - (L.bench.y + L.bench.h - 130)),
      };
      this.statsReaderOpen = false;
      this.redraw();
    });
    this.label(paper.x + 70, paper.y + paper.h - 54, '종이를 누르면 접기', 'ink').setScale(0.56).setDepth(depth + 2);
    const statsDocumentObjects = this.children.list.slice(documentStart);
    this.wirePaperDrag(page, statsDocumentObjects, this.statsSheetOffset, () => {
      draggedPaper = true;
      this.raiseDocumentAboveActions(statsDocumentObjects);
    });
  }

  private buildShelf(s: Readonly<GameState>): void {
    // 장비를 고른 순간부터는 이 줄 대신 **화살표**가 어느 칸인지 말한다.
    // 둘을 같이 두면 화살표 자리(진열대 위 여백)와 글자가 겹친다.
    if (this.selectedItemId === null) {
      this.label(
        SHELF_SLOTS[0].x,
        SHELF_SLOTS[0].y - 28,
        this.inventoryOpen ? '장비를 끌거나 선택한 뒤, 맞는 진열대를 누르세요.' : '하단 진열을 눌러 인벤토리를 여세요.',
        'dust',
      );
    }
    for (let i = 0; i < 3; i += 1) {
      const slot = SHELF_SLOTS[i]!;
      const { x, y, w, h } = slot;
      const itemId = s.shelf[i] ?? null;
      const def = itemId === null ? undefined : content.items.find((item) => item.id === itemId);
      const soldOut = saleSlotSold(s, i);

      // 원화에 그려진 사각 홈이 곧 놓는 자리다. 별도의 카드·배경은 덮지 않는다.
      const selected = this.selectedItemId === null ? undefined : content.items.find((item) => item.id === this.selectedItemId);
      const acceptsSelected = !soldOut && selected !== undefined && content.balance.equipment.slotByItem[selected.id] === i;
      const dropZone = this.add.zone(x, y, w, h).setOrigin(0, 0);
      dropZone.setInteractive({ cursor: acceptsSelected ? 'pointer' : 'default' });
      dropZone.on('pointerup', (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        // 진열대 클릭은 이 영역에서 끝난다. 뒤쪽 용사 전신으로 전달되면 안 된다.
        event.stopPropagation();
        this.placeSelected(i);
      });
      if (acceptsSelected) this.shelfArrow(slot);
      this.text(x + 12, y + 10, SLOT_NAMES[i]!, 'bone').setScale(0.75);
      if (soldOut) {
        this.label(x + Math.round(w / 2) - 92, y + Math.round(h / 2) - 18, '오늘 판매 완료', 'wax').setScale(1.18).setDepth(41);
        continue;
      }
      if (def === undefined) {
        this.text(x + 12, y + 72, '여기로 끌기', 'bone').setScale(0.75);
        this.text(x + 12, y + 98, i === 0 ? '무기' : i === 1 ? '방어구' : '물약·유물', 'bone').setScale(0.75);
        continue;
      }

      const art = this.itemArt(def, { x: x + 14, y: y + 34, w: w - 28, h: 100 });
      if (art !== null) this.wireShelfDrag(art, i, { x: art.x, y: art.y });
      this.text(x + 12, y + 142, this.clip(def.name, Math.floor((w - 24) / 0.75), 'body'), 'bone').setScale(0.75);
      this.text(x + 12, y + 168, this.clip(this.itemStats(def), Math.floor((w - 24) / 0.75), 'body'), 'bone').setScale(0.75);
      const salePrice = Math.round(def.price * salePriceMultiplier(s));
      this.text(x + 12, y + 202, `판매가 ${salePrice.toLocaleString('en-US')} G`, 'wax').setScale(0.72);
    }

  }

  /**
   * 고른 장비가 들어갈 칸을 진열대 **위**에서 가리키는 화살표.
   * 원화 154x161 을 정확히 1/2 로 놓는다 (소수배는 도트가 지글거린다).
   */
  private shelfArrow(slot: { x: number; y: number; w: number; h: number }): Phaser.GameObjects.Image | null {
    const w = 77;
    const h = 80;
    const x = slot.x + Math.round((slot.w - w) / 2);
    const y = slot.y - h - 12;
    const arrow = this.spriteObject(x, y, 'ui.shelf.arrow', w, h);
    if (arrow === null) return null;
    arrow.setDepth(60);
    if (reducedMotion(this.registry)) return arrow;
    // 위아래로 얕게 까딱인다 — 「여기」를 글자 없이 말하는 유일한 수단이다
    this.tweens.add({ targets: arrow, y: y + 10, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    return arrow;
  }

  /* ── 작업대 B · 인벤토리 ───────────────────────────────── */

  /** 방문자는 계약서를 버튼으로 건네지 않는다. 책상 하단에 놓고, 플레이어가 직접 집어 든다. */
  private buildSubmittedContracts(s: Readonly<GameState>): void {
    const asset = this.contractSheetAsset();
    if (asset === null) return;
    const b = L.bench;
    const paper = { w: 180, h: 235 };
    const visitor = s.visitors[0];
    if (visitor === undefined) return;
    // 서류는 손님 쪽 작업대의 좌측 하단부터 중간까지 놓인다. 우측의 진열대·버튼을 가리지 않는다.
    const home = { x: b.x + 168 + this.contractSheetOffset.x, y: b.y + b.h - 138 + this.contractSheetOffset.y };
    const index = 0;
    const sheet = this.add.image(home.x, home.y, key(asset))
      .setOrigin(0.5, 0.5)
      .setDisplaySize(paper.w, paper.h)
      // 한 장을 읽는 중에도 남은 축소본을 눌러 두 장을 함께 펼칠 수 있다.
      .setDepth(this.contractReaderOpen || this.statsReaderOpen ? 900 : 20)
      .setInteractive({ cursor: 'pointer' });
    if (this.contractReaderOpen) sheet.setVisible(false).disableInteractive();
    // 접힌 상태는 글자 없이 계약서 원화만 남긴다. 세부 내용은 펼친 상태에서만 읽는다.
    // 축소본은 이동할 수 없다. 좌클릭 한 번만 확대라는 유일한 입력으로 쓴다.
    if (!this.contractReaderOpen) {
      this.wireFoldedPaperDrag(sheet, home, this.contractSheetOffset, () => {
        this.contractIndex = index;
        this.contractReaderOpen = true;
        // 하단 계약서로 펼쳐도 계약 버튼으로 연 것과 같은 도장 확정 모드가 된다.
        // 단, 계약금이 부족하면 열람만 가능하고 도장으로 우회 확정할 수는 없다.
        this.contractConfirmationOpen = s.gold >= visitor.fee;
        this.contractStamping = false;
        this.redraw();
      });
    }

    const statsAsset = this.statsSheetAsset();
    if (statsAsset === null) return;
    const statsHome = { x: b.x + 412 + this.statsSheetOffset.x, y: b.y + b.h - 130 + this.statsSheetOffset.y };
    const statsSheet = this.add.image(statsHome.x, statsHome.y, key(statsAsset))
      .setOrigin(0.5, 0.5)
      .setDisplaySize(154, 190)
      .setDepth(this.contractReaderOpen || this.statsReaderOpen ? 900 : 20)
      .setInteractive({ cursor: 'pointer' });
    if (this.statsReaderOpen) statsSheet.setVisible(false).disableInteractive();
    if (!this.statsReaderOpen) {
      this.wireFoldedPaperDrag(statsSheet, statsHome, this.statsSheetOffset, () => {
        this.contractIndex = index;
        this.contractConfirmationOpen = false;
        this.statsReaderOpen = true;
        this.redraw();
      });
    }

    // 문을 열어 처음 손님을 맞이한 때만, 두 장을 약간의 시간차로 제출한다.
    // 이후 redraw(서류 열기/닫기, 드래그 등)에서는 이미 놓인 위치를 즉시 다시 그린다.
    if (!this.submittedPaperEntryPending) return;
    this.submittedPaperEntryPending = false;
    if (reducedMotion(this.registry)) return;

    const reveal = (paperImage: Phaser.GameObjects.Image, target: { x: number; y: number }, delay: number) => {
      paperImage
        .setPosition(target.x - 18, target.y + 12)
        .setAlpha(0)
        .disableInteractive();
      this.tweens.add({
        targets: paperImage,
        x: target.x,
        y: target.y,
        alpha: 1,
        delay,
        duration: 240,
        ease: 'Sine.Out',
        onComplete: () => {
          paperImage.setInteractive({ cursor: 'pointer' });
          // disableInteractive()가 입력 컴포넌트를 제거하므로, 페이드 후 드래그도 다시 등록한다.
          this.input.setDraggable(paperImage);
        },
      });
    };
    reveal(sheet, home, 140);
    reveal(statsSheet, statsHome, 470);
  }

  /** 새 계약서 텍스처는 HMR 중 아직 프리로드되지 않을 수 있다. 그때도 기존 장부로 종이를 유지한다. */
  private wireFoldedPaperDrag(
    image: Phaser.GameObjects.Image,
    home: { x: number; y: number },
    offset: { x: number; y: number },
    onClick: () => void,
  ): void {
    let dragged = false;
    this.input.setDraggable(image);
    image.on('dragstart', () => {
      dragged = true;
      image.setDepth(1000);
    });
    image.on('drag', (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
      image.setPosition(Math.round(dragX), Math.round(dragY));
    });
    image.on('dragend', () => {
      offset.x += Math.round(image.x - home.x);
      offset.y += Math.round(image.y - home.y);
      this.redraw();
    });
    image.on('pointerup', (
      pointer: Phaser.Input.Pointer,
      _localX: number,
      _localY: number,
      event: Phaser.Types.Input.EventData,
    ) => {
      event.stopPropagation();
      if (dragged || pointer.button !== 0) return;
      onClick();
    });
  }

  private wirePaperDrag(
    page: Phaser.GameObjects.Zone,
    objects: Phaser.GameObjects.GameObject[],
    offset: { x: number; y: number },
    onDragStart: () => void,
  ): void {
    let startX = page.x;
    let startY = page.y;
    this.input.setDraggable(page);
    page.on('dragstart', () => {
      startX = page.x;
      startY = page.y;
      onDragStart();
    });
    page.on('drag', (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
      const dx = Math.round(dragX - page.x);
      const dy = Math.round(dragY - page.y);
      for (const object of objects) {
        const movable = object as Phaser.GameObjects.GameObject & {
          x?: number;
          y?: number;
          setPosition?: (x: number, y: number) => Phaser.GameObjects.GameObject;
        };
        if (movable.x === undefined || movable.y === undefined || movable.setPosition === undefined) continue;
        movable.setPosition(movable.x + dx, movable.y + dy);
      }
    });
    page.on('dragend', () => {
      offset.x += Math.round(page.x - startX);
      offset.y += Math.round(page.y - startY);
      this.redraw();
    });
  }

  /** 드래그 중인 서류는 하단 행동 버튼의 판·글자보다 앞에 놓인다. */
  private raiseDocumentAboveActions(objects: Phaser.GameObjects.GameObject[]): void {
    for (const object of objects) {
      const depthable = object as Phaser.GameObjects.GameObject & {
        depth?: number;
        setDepth?: (depth: number) => Phaser.GameObjects.GameObject;
      };
      if (depthable.depth === undefined || depthable.setDepth === undefined) continue;
      depthable.setDepth(1500 + depthable.depth);
    }
  }

  private contractSheetAsset(): string | null {
    if (this.hasArt('ui.contract.sheet')) return 'ui.contract.sheet';
    if (this.hasArt('prop.ledger')) return 'prop.ledger';
    return null;
  }

  private statsSheetAsset(): string | null {
    return this.hasArt('ui.stats.sheet') ? 'ui.stats.sheet' : null;
  }

  private buildInventory(s: Readonly<GameState>): void {
    const panel = this.inventoryRect();
    const ix = panel.x + 28;
    // 받은 장비창 원본(1452×831)의 비율을 보존한다. 진열대 바로 아래에서만
    // 열리므로 실제 장비를 놓는 상단 작업대는 가리지 않는다.
    if (!this.spriteFit(panel, ['ui.inventory.window'])) {
      this.rect(panel.x, panel.y, panel.w, panel.h, 'ink');
      this.frame(panel.x, panel.y, panel.w, panel.h, 'bone');
    }

    const stacks = s.inventory.filter((stack) => stack.qty > 0);
    this.text(ix, panel.y + 16, `인벤토리  ${stacks.length}종`, 'ink');
    const hint = this.label(ix, panel.y + 70, '장비를 끌거나 클릭해 고른 뒤, 맞는 진열대를 누르세요.', 'dust').setScale(1.3);
    new Button(this, {
      x: panel.x + panel.w + 12, y: panel.y + 8, w: 128, h: 52,
      label: '닫기',
      onClick: () => {
        this.inventoryOpen = false;
        this.selectedItemId = null;
        this.redraw();
      },
    });
    const cellW = Math.floor((panel.w - 56) / INVENTORY_COLUMNS);
    const totalRows = Math.ceil(stacks.length / INVENTORY_COLUMNS);
    const maxScrollRow = Math.max(0, totalRows - INVENTORY_VISIBLE_ROWS);
    this.inventoryScrollRow = Math.min(this.inventoryScrollRow, maxScrollRow);
    const cellTop = panel.y + 120;
    const cellHeight = 128;
    const scrollZone = this.add.zone(panel.x, cellTop, panel.w, panel.h - (cellTop - panel.y)).setOrigin(0, 0).setInteractive();
    scrollZone.on('wheel', (_pointer: Phaser.Input.Pointer, _dx: number, dy: number) => this.scrollInventory(Math.sign(dy), maxScrollRow));

    if (maxScrollRow > 0) {
      this.label(panel.x + panel.w - 126, panel.y + 112, `${this.inventoryScrollRow + 1}–${Math.min(totalRows, this.inventoryScrollRow + INVENTORY_VISIBLE_ROWS)} / ${totalRows}`, 'dust');
      new Button(this, {
        x: panel.x + panel.w - 128, y: panel.y + 138, w: 52, h: 40,
        label: '▲', enabled: this.inventoryScrollRow > 0,
        onClick: () => this.scrollInventory(-1, maxScrollRow),
      });
      new Button(this, {
        x: panel.x + panel.w - 68, y: panel.y + 138, w: 52, h: 40,
        label: '▼', enabled: this.inventoryScrollRow < maxScrollRow,
        onClick: () => this.scrollInventory(1, maxScrollRow),
      });
    }

    // 예시처럼 5×2 그리드를 항상 유지한다. 빈 칸도 기본 프레임을 보여 주므로,
    // 다음에 들어올 장비의 자리와 현재 소지량을 한눈에 알 수 있다.
    for (let index = 0; index < INVENTORY_COLUMNS * INVENTORY_VISIBLE_ROWS; index += 1) {
      const col = index % INVENTORY_COLUMNS;
      const row = Math.floor(index / INVENTORY_COLUMNS);
      const cellX = ix + col * cellW;
      const cellY = cellTop + row * cellHeight;
      const stack = stacks[this.inventoryScrollRow * INVENTORY_COLUMNS + index];
      const selected = stack !== undefined && stack.id === this.selectedItemId;
      // 선택 프레임은 기본 카드 위의 불투명 오버레이가 아니라 카드 자체를 교체한다.
      // 따라서 선택된 도트가 검은 프레임 중심에 가려지지 않는다.
      const frameBox = selected
        ? { x: cellX - 12, y: cellY - 14, w: cellW + 24, h: 134 }
        : { x: cellX - 2, y: cellY - 5, w: cellW + 4, h: 116 };
      this.spriteFitObject(frameBox, [selected ? 'ui.inventory.selected' : 'ui.inventory.slot'])?.setDepth(10);
    }

    if (stacks.length === 0) {
      this.text(ix, panel.y + 166, '팔 것도 올릴 것도 없다.', 'dust');
      this.text(ix, panel.y + 208, '시체를 훼손하면 유품이 들어온다.', 'dust');
    }

    stacks.forEach((stack, index) => {
      const def = content.items.find((item) => item.id === stack.id);
      if (def === undefined) return;
      const col = index % INVENTORY_COLUMNS;
      const absoluteRow = Math.floor(index / INVENTORY_COLUMNS);
      if (absoluteRow < this.inventoryScrollRow || absoluteRow >= this.inventoryScrollRow + INVENTORY_VISIBLE_ROWS) return;
      const row = absoluteRow - this.inventoryScrollRow;
      const cellX = ix + col * cellW;
      const cellY = cellTop + row * cellHeight;
      const equipped = s.shelf.includes(def.id);
      // 도트 원본에는 투명 여백이 있어 이미지 픽셀만으로 선택을 받으면 클릭 지점이
      // 어긋난다. 카드 전체를 별도 선택 영역으로 두되, 위의 도트 드래그보다 낮게 둔다.
      const selectZone = this.add.zone(cellX + 5, cellY + 2, cellW - 10, 102)
        .setOrigin(0, 0)
        .setDepth(25)
        .setInteractive({ cursor: 'pointer' });
      selectZone.on('pointerup', (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        this.selectedItemId = def.id;
        event.stopPropagation();
        this.redraw();
      });
      const art = this.itemArt(def, { x: cellX + 13, y: cellY + 10, w: cellW - 26, h: 74 });
      if (art !== null) {
        // 카드와 함께 위로 옮긴 뒤, 도트만 시각적으로 14px 오른쪽에 둔다.
        art.setX(Math.round(cellX + cellW / 2));
        art.setDepth(90);
        if (equipped) art.setAlpha(0.38);
        else {
          this.wireInventoryDrag(art, def, { x: art.x, y: art.y });
          // 아이콘 위에서도 휠이 작업대가 아니라 인벤토리 행을 넘긴다.
          art.on('wheel', (_pointer: Phaser.Input.Pointer, _dx: number, dy: number) => this.scrollInventory(Math.sign(dy), maxScrollRow));
        }
        this.wireItemHint(art, def, hint, s);
      }
      if (stack.qty > 1) this.text(cellX + cellW - 31, cellY + 78, `×${stack.qty}`, 'bone').setScale(0.62).setDepth(91);
    });
  }

  /** 장비 원본 비율을 유지한다. 크기가 제각각인 도트도 찌그러지지 않는다. */
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

  private wireItemHint(image: Phaser.GameObjects.Image, item: ItemDef, hint: Phaser.GameObjects.Text, state: Readonly<GameState>): void {
    image.on('pointerover', (pointer: Phaser.Input.Pointer) => {
      hint.setText(`${item.name} · ${this.itemStats(item)} · ${item.price.toLocaleString('en-US')} G`);
      if (!this.draggingInventoryItem) this.showItemDetail(item, pointer, this.featuredPersona(state));
    });
    image.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.draggingInventoryItem) this.showItemDetail(item, pointer, this.featuredPersona(state));
    });
    image.on('pointerout', () => {
      hint.setText('장비 도트를 끌어 맞는 진열대에 놓으세요.');
      this.hideItemDetail();
    });
  }

  /** 현재 출연 중인 페르소나의 실제 계승 기록을 장비 카드에 함께 보여 준다. */
  private featuredPersona(state: Readonly<GameState>): Persona | undefined {
    return state.personas.find((persona) => state.stars.some((star) => star.personaId === persona.id && star.status === 'ALIVE'))
      ?? state.personas.find((persona) => persona.lineage.length > 0);
  }

  /** 마우스 오른쪽 위에 원본 정보창 비율을 유지한 상세 카드를 연다. */
  private showItemDetail(item: ItemDef, pointer: Phaser.Input.Pointer, persona: Persona | undefined): void {
    this.hideItemDetail();
    const w = 450;
    const h = 948;
    const x = Math.max(8, Math.min(L.W - w - 8, pointer.x + 24 <= L.W - w - 8 ? pointer.x + 24 : pointer.x - w - 24));
    const y = Math.max(72, Math.min(L.H - h - 8, pointer.y - h - 56));
    const depth = 5000;

    if (this.hasArt('ui.inventory.info')) {
      this.itemDetail.push(this.add.image(x, y, key('ui.inventory.info')).setOrigin(0, 0).setDisplaySize(w, h).setDepth(depth));
    } else {
      this.itemDetail.push(this.add.rectangle(x, y, w, h, 0x07110b, 0.96).setOrigin(0, 0).setDepth(depth));
    }

    const addBody = (dx: number, dy: number, text: string, color: 'bone' | 'dust' | 'wax' = 'bone', scale = 0.85): void => {
      const label = this.text(x + dx, y + dy, text, color).setScale(scale).setDepth(depth + 1);
      this.itemDetail.push(label);
    };
    const addLabel = (dx: number, dy: number, text: string, color: 'bone' | 'dust' | 'wax' = 'dust', scale = 1.3): void => {
      const label = this.label(x + dx, y + dy, text, color).setScale(scale).setDepth(depth + 1);
      this.itemDetail.push(label);
    };
    const slot = content.balance.equipment.slotByItem[item.id];
    const slotName = slot === undefined ? '기타' : SLOT_NAMES[slot];
    const itemType = item.kind === 'POTION' ? 'POTION' : item.isRelic ? 'RELIC' : slot === 0 ? 'WEAPON' : slot === 1 ? 'ARMOR' : 'UTILITY';
    const signed = (value: number): string => `${value >= 0 ? '+' : ''}${value}`;
    const statRows = item.kind === 'POTION'
      ? `HEAL  +${item.healing}`
      : `HP    ${signed(item.hp)}\nATK   ${signed(item.atk)}\nDEF   ${signed(item.def)}`;
    const marks = item.kind === 'POTION'
      ? `<HEAL>\nHP +${item.healing}`
      : `<${slotName}>\n${this.itemStats(item)}`;

    // 장비정보창_예상.png의 다섯 구획: 제목 → 아이콘/가격 → 스탯 → 특성 → 계승 정보.
    addBody(29, 28, this.clip(item.name, 286, 'body'), item.isRelic ? 'wax' : 'bone', 1.1);
    addBody(344, 31, item.tier, item.isRelic ? 'wax' : 'bone', 1.1);
    const icon = this.itemArt(item, { x: x + 50, y: y + 130, w: 112, h: 112 });
    if (icon !== null) {
      icon.setDepth(depth + 2);
      this.itemDetail.push(icon);
    }
    addBody(205, 138, itemType, 'bone', 1.0);
    addBody(205, 185, `${item.price.toLocaleString('en-US')} G`, 'bone', 1.25);
    addBody(38, 286, statRows, 'bone', 0.95);
    addLabel(38, 445, '특성', 'dust', 1.45);
    addBody(38, 485, marks, item.isRelic ? 'wax' : 'bone', 1.0);
    addLabel(38, 644, '계승 정보', 'dust', 1.45);
    addBody(38, 684, this.personaLineage(persona), 'dust', 0.9);
    addBody(95, 878, '“EQUIP TO LIVE”', 'bone', 0.78);
  }

  /** 현재 몸은 빼고, 페르소나가 거쳐 간 이전 사용자의 이름과 사망 층만 남긴다. */
  private personaLineage(persona: Persona | undefined): string {
    if (persona === undefined) return '페르소나 미배정\n이전 사용자 기록 없음';
    const currentCarrier = this.store.getState().stars.find((star) => star.personaId === persona.id)?.id;
    const previous = persona.lineage
      .filter((entry) => entry.starId !== currentCarrier)
      .slice(-2)
      .map((entry, index) => {
        const name = content.stars.find((star) => star.id === entry.starId)?.bodyName ?? entry.starId;
        const floor = entry.diedFloor > 0 ? `${entry.diedFloor}F` : '기록 없음';
        return `${index + 1}대  ${name}  ${floor}`;
      });
    return previous.length > 0
      ? `${persona.displayName} · ${persona.generation}세대\n이전 사용자\n${previous.join('\n')}`
      : `${persona.displayName} · ${persona.generation}세대\n이전 사용자 기록 없음`;
  }

  private hideItemDetail(): void {
    this.itemDetail.forEach((object) => object.destroy());
    this.itemDetail = [];
  }

  private wireInventoryDrag(image: Phaser.GameObjects.Image, item: ItemDef, home: { x: number; y: number }): void {
    image.setInteractive({ cursor: 'grab' });
    this.input.setDraggable(image);
    let dragged = false;
    let dragArrow: Phaser.GameObjects.Image | null = null;
    image.on('pointerup', () => {
      if (dragged) return;
      this.selectedItemId = item.id;
      this.redraw();
    });
    image.on('dragstart', () => {
      dragged = true;
      this.draggingInventoryItem = true;
      this.hideItemDetail();
      playSfx(this, 'sfx.item.pick', 0.5);
      image.setDepth(1000).setScale(1.15);
      const slot = content.balance.equipment.slotByItem[item.id];
      if (slot !== undefined) dragArrow = this.shelfArrow(SHELF_SLOTS[slot]!);
    });
    image.on('drag', (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => image.setPosition(Math.round(dragX), Math.round(dragY)));
    image.on('dragend', () => {
      this.draggingInventoryItem = false;
      dragArrow?.destroy();
      dragArrow = null;
      const slot = this.shelfSlotAt(image.x, image.y);
      if (slot === content.balance.equipment.slotByItem[item.id]) {
        this.selectedItemId = null;
        this.playShelfDrop(item);
        this.showOfficeDialogue('SHOP_ITEM', item.id);
        this.store.dispatch({ type: 'OFFICE/PLACE', slot, itemId: item.id });
        return;
      }
      dragged = false;
      image.setPosition(home.x, home.y).setScale(1).setDepth(0);
    });
  }

  private wireShelfDrag(image: Phaser.GameObjects.Image, slot: number, home: { x: number; y: number }): void {
    image.setInteractive({ cursor: 'grab' });
    this.input.setDraggable(image);
    image.on('pointerup', (
      _pointer: Phaser.Input.Pointer,
      _localX: number,
      _localY: number,
      event: Phaser.Types.Input.EventData,
    ) => {
      // 진열된 장비를 눌렀을 때도 입력을 소비한다. 이 뒤에 있는 용사 클릭과는 별개다.
      event.stopPropagation();
    });
    image.on('dragstart', () => {
      playSfx(this, 'sfx.item.pick', 0.5);
      image.setDepth(1000).setScale(1.15);
    });
    image.on('drag', (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => image.setPosition(Math.round(dragX), Math.round(dragY)));
    image.on('dragend', () => {
      if (this.inInventory(image.x, image.y)) {
        this.selectedItemId = null;
        this.store.dispatch({ type: 'OFFICE/PLACE', slot, itemId: null });
        return;
      }
      image.setPosition(home.x, home.y).setScale(1).setDepth(0);
    });
  }

  private shelfSlotAt(x: number, y: number): number | null {
    for (let i = 0; i < 3; i += 1) {
      const slot = SHELF_SLOTS[i]!;
      if (x >= slot.x && x <= slot.x + slot.w && y >= slot.y && y <= slot.y + slot.h) return i;
    }
    return null;
  }

  private placeSelected(slot: number): void {
    if (this.selectedItemId === null) return;
    if (content.balance.equipment.slotByItem[this.selectedItemId] !== slot) return;
    const item = content.items.find((candidate) => candidate.id === this.selectedItemId);
    if (item !== undefined) this.playShelfDrop(item);
    if (item !== undefined) this.showOfficeDialogue('SHOP_ITEM', item.id);
    this.store.dispatch({ type: 'OFFICE/PLACE', slot, itemId: this.selectedItemId });
    this.selectedItemId = null;
  }

  /** 장비는 무거운 철, 물약·유물은 가벼운 철을 매우 낮은 볼륨으로 낸다. */
  private playShelfDrop(item: ItemDef): void {
    playSfx(this, item.kind === 'GEAR' ? 'sfx.item.drop.heavy' : 'sfx.item.drop.light', 0.12);
  }

  private inInventory(x: number, y: number): boolean {
    const panel = this.inventoryRect();
    return x >= panel.x && x <= panel.x + panel.w && y >= panel.y && y <= panel.y + panel.h;
  }

  private inventoryRect(): { x: number; y: number; w: number; h: number } {
    const b = L.bench;
    const w = 736;
    const h = 420;
    return { x: b.x + Math.round((b.w - w) / 2), y: b.y + b.h - h, w, h };
  }

  private scrollInventory(delta: number, maxScrollRow: number): void {
    const next = Math.max(0, Math.min(maxScrollRow, this.inventoryScrollRow + delta));
    if (next === this.inventoryScrollRow) return;
    this.inventoryScrollRow = next;
    this.redraw();
  }

  /* ── 하단 4택 ─────────────────────────────────────────── */

  private buildActions(s: Readonly<GameState>): void {
    const a = L.actions;
    this.rect(a.x, a.y, a.w, a.h, 'ink');
    const y = a.y + L.pad;
    const h = a.h - L.pad * 2;

    const actionButton = (index: number, opts: Omit<ConstructorParameters<typeof Button>[1], 'x' | 'y' | 'w' | 'h'>): Button => {
      const button = new Button(this, { x: actionX(index), y, w: ACTION_W, h, ...opts });
      // 펼친 계약서는 작업대와 함께 행동 바 일부까지 덮는다. 행동 버튼은 항상 그 위에 둔다.
      return button.setDepth(900);
    };

    // ① 소생실 — 두 버튼 구성 모두 같은 자리를 쓴다.
    const hasCorpse = s.corpses.some((c) =>
      s.stars.some((st) => st.id === c.starId && (st.status === 'DEAD' || st.status === 'HIDDEN')),
    );
    actionButton(0, {
      label: '소생실', hotkey: '1', variant: 'danger',
      enabled: hasCorpse,
      tip: hasCorpse ? '사망한 출연자를 되살리거나 소지품을 회수하러 갑니다.' : '되살릴 출연자가 없습니다.',
      onClick: () => this.store.dispatch({ type: 'PHASE/GOTO', phase: 'REVIVE' }),
    });

    const waiting = s.visitors[this.contractIndex] ?? s.visitors[0];
    if (!this.inventoryOpen) {
      // 방문 중: ①소생실 ②인벤토리 ③계약. 거절/돌려보내기 경로는 없다.
      actionButton(1, {
        label: '인벤토리', hotkey: '2',
        tip: '장비를 진열하거나 판매할 수 있는 인벤토리 창을 엽니다.',
        onClick: () => this.openInventory(),
      });
      if (s.today !== null) {
        // 계약 뒤에는 용사가 대사를 마치고 자동으로 돌아간다. 방송은 좌측 TV만으로 시작한다.
        return;
      }
      const canAccept = waiting !== undefined && s.gold >= waiting.fee;
      actionButton(2, {
        label: '계약', hotkey: '3',
        enabled: canAccept && !this.contractConfirmationOpen,
        tip: waiting === undefined
          ? '계약할 지원자가 없습니다.'
          : canAccept
            ? this.contractConfirmationOpen
              ? '계약서 우측 하단의 도장을 눌러 계약을 확정하세요.'
              : '계약서를 펼쳐 최종 계약 여부를 확인합니다.'
            : `계약금 ${waiting.fee.toLocaleString('en-US')} G가 필요합니다.`,
        onClick: () => {
          if (waiting === undefined) return;
          if (!this.contractConfirmationOpen) {
            this.contractReaderOpen = true;
            this.contractConfirmationOpen = true;
            this.contractStamping = false;
            this.redraw();
            return;
          }
        },
      });
      return;
    }

    // 인벤토리: ①소생실 ②진열 ③판매 ④흥정
    const selected = this.selectedItemId === null
      ? undefined
      : content.items.find((item) => item.id === this.selectedItemId);
    const selectedSlot = selected === undefined ? undefined : content.balance.equipment.slotByItem[selected.id];
    const selectedSlotClosed = selectedSlot !== undefined && saleSlotSold(s, selectedSlot);
    actionButton(1, {
      label: '진열', hotkey: '2',
      enabled: selected !== undefined && selectedSlot !== undefined && !selectedSlotClosed && !s.shelf.includes(selected.id),
      tip: selected === undefined
        ? '인벤토리에서 장비를 먼저 선택하세요.'
        : selectedSlotClosed
          ? `${SLOT_NAMES[selectedSlot!]} 진열대는 오늘 판매를 마쳐 비활성화됐습니다.`
          : s.shelf.includes(selected.id)
          ? '이미 진열된 장비입니다.'
          : `${selected.name}을(를) 알맞은 진열대에 놓습니다.`,
      onClick: () => {
        if (selected === undefined || selectedSlot === undefined || selectedSlotClosed || s.shelf.includes(selected.id)) return;
        playSfx(this, 'sfx.item.drop', 0.6);
        this.showOfficeDialogue('SHOP_ITEM', selected.id);
        this.store.dispatch({ type: 'OFFICE/PLACE', slot: selectedSlot, itemId: selected.id });
        this.selectedItemId = null;
      },
    });
    const saleItems = this.saleCandidates(s);
    const canSell = saleItems.length > 0 && !saleOfferTried(s);
    const haggles = saleHaggleCount(s);
    const canHaggle = saleItems.length > 0 && haggles < content.balance.shopSale.maxHaggles;
    const displayedCount = s.shelf.filter((itemId, slot) => itemId !== null && !saleSlotSold(s, slot)).length;
    actionButton(2, {
      label: '판매', hotkey: '3', variant: 'danger',
      enabled: canSell,
      tip: canSell
        ? `현재 진열 가격으로 상품 ${saleItems.length}개를 한 번에 판매합니다. 결과는 전부 성공 또는 전부 실패입니다.`
        : saleItems.length > 0 && saleOfferTried(s)
          ? '이 가격으로는 이미 판매를 시도했습니다. 흥정에서 새 가격을 제안하세요.'
        : displayedCount > 0
          ? '오늘 판매할 수 있는 진열 상품이 없습니다.'
          : '판매할 장비를 진열대에 먼저 배치하세요.',
      onClick: () => {
        if (!canSell) return;
        this.attemptBatchSale();
      },
    });
    actionButton(3, {
      label: '흥정', hotkey: '4',
      enabled: canHaggle,
      tip: canHaggle
        ? `진열대의 상품 ${saleItems.length}개에 적용할 가격을 제안합니다. 용사의 반응 뒤 진열 가격이 바뀝니다. (${haggles}/${content.balance.shopSale.maxHaggles})`
        : displayedCount > 0
          ? `오늘 가능한 가격 제안 ${content.balance.shopSale.maxHaggles}회를 모두 사용했습니다.`
          : '흥정할 장비를 진열대에 먼저 배치하세요.',
      onClick: () => {
        if (!canHaggle) return;
        this.saleMultiplier = salePriceMultiplier(s);
        this.saleDialogOpen = true;
        this.redraw();
      },
    });

  }

  private saleCandidates(state: Readonly<GameState>): { item: ItemDef; slot: number }[] {
    return state.shelf.flatMap((itemId, slot) => {
      if (itemId === null || saleSlotSold(state, slot)) return [];
      const item = content.items.find((candidate) => candidate.id === itemId);
      return item === undefined ? [] : [{ item, slot }];
    });
  }

  private attemptBatchSale(): void {
    const before = this.store.getState();
    const candidates = this.saleCandidates(before);
    if (candidates.length === 0 || saleOfferTried(before)) return;
    const beforeGold = before.gold;
    this.store.dispatch({ type: 'OFFICE/SELL_BATCH' });
    const after = this.store.getState();
    const soldCount = candidates.filter(({ slot }) => !saleSlotSold(before, slot) && saleSlotSold(after, slot)).length;
    const income = after.gold - beforeGold;
    this.saleReaction = soldCount === candidates.length
      ? `좋아요. 진열된 물건 전부 살게요. ${income.toLocaleString('en-US')} G 맞죠?`
      : '그 가격에는 못 사겠어요. 가격을 다시 생각해 주세요.';
    this.selectedItemId = null;
    this.saleDialogOpen = false;
    this.redraw();
  }

  private buildSaleDialog(s: Readonly<GameState>): void {
    const candidates = this.saleCandidates(s);
    if (candidates.length === 0) {
      this.saleDialogOpen = false;
      return;
    }
    const rules = content.balance.shopSale;
    const baseTotal = candidates.reduce((sum, { item }) => sum + item.price, 0);
    const haggles = saleHaggleCount(s);
    const box = { x: 610, y: 282, w: 700, h: 500 };
    // 인벤토리 모달(1200)보다도 앞에서 가격을 확정해야 한다.
    const depth = 2000;

    this.add.rectangle(L.W / 2, L.H / 2, L.W, L.H, PALETTE.ink, 0.68).setDepth(depth);
    this.add.rectangle(box.x, box.y, box.w, box.h, PALETTE.ink, 1).setOrigin(0, 0).setDepth(depth + 1);
    const border = this.add.graphics().setDepth(depth + 2);
    border.fillStyle(PALETTE.bone, 1);
    border.fillRect(box.x, box.y, box.w, L.line);
    border.fillRect(box.x, box.y + box.h - L.line, box.w, L.line);
    border.fillRect(box.x, box.y, L.line, box.h);
    border.fillRect(box.x + box.w - L.line, box.y, L.line, box.h);

    this.title(box.x + 42, box.y + 30, '가격을 어떻게 할까?').setScale(0.92).setDepth(depth + 3);
    this.text(box.x + 44, box.y + 104, `진열 상품 ${candidates.length}개 일괄 · 기준가 ${baseTotal.toLocaleString('en-US')} G`, 'dust').setScale(1.02).setDepth(depth + 3);
    const priceText = this.label(box.x + 44, box.y + 164, '', 'bone').setScale(1.62).setDepth(depth + 3);
    const chanceText = this.label(box.x + 44, box.y + 220, '', 'wax').setScale(1.36).setDepth(depth + 3);
    this.text(box.x + 44, box.y + 256, `가격 제안 ${haggles} / ${rules.maxHaggles}`, 'dust').setScale(0.86).setDepth(depth + 3);

    const trackX = box.x + 54;
    const trackY = box.y + 306;
    const trackW = box.w - 108;
    const track = this.add.graphics().setDepth(depth + 3);
    track.fillStyle(PALETTE.dust, 1);
    track.fillRect(trackX, trackY - 3, trackW, 6);
    const thumb = this.add.rectangle(trackX, trackY, 18, 42, PALETTE.wax, 1).setDepth(depth + 4);

    const renderValue = (): void => {
      const ratio = (this.saleMultiplier - rules.minMultiplier) / (rules.maxMultiplier - rules.minMultiplier);
      thumb.setX(Math.round(trackX + trackW * ratio));
      priceText.setText(`×${this.saleMultiplier.toFixed(1)}  ·  총 ${Math.round(baseTotal * this.saleMultiplier).toLocaleString('en-US')} G`);
      chanceText.setText(`상품별 구매 확률 ${Math.round(salePurchaseChance(this.saleMultiplier) * 100)}%`);
    };
    const setFromPointer = (pointer: Phaser.Input.Pointer): void => {
      const raw = rules.minMultiplier + Math.max(0, Math.min(1, (pointer.x - trackX) / trackW)) * (rules.maxMultiplier - rules.minMultiplier);
      this.saleMultiplier = Math.max(rules.minMultiplier, Math.min(rules.maxMultiplier, Math.round(raw / rules.step) * rules.step));
      renderValue();
    };
    const slider = this.add.zone(trackX, trackY - 32, trackW, 64).setOrigin(0, 0).setDepth(depth + 5).setInteractive({ cursor: 'pointer' });
    slider.on('pointerdown', (pointer: Phaser.Input.Pointer) => setFromPointer(pointer));
    slider.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown) setFromPointer(pointer);
    });
    this.text(trackX, trackY + 32, `×${rules.minMultiplier.toFixed(1)}`, 'dust').setScale(1.08).setDepth(depth + 3);
    this.text(trackX + trackW - 60, trackY + 32, `×${rules.maxMultiplier.toFixed(1)}`, 'dust').setScale(1.08).setDepth(depth + 3);
    renderValue();

    new Button(this, {
      x: box.x + 44, y: box.y + box.h - 78, w: 270, h: 52,
      label: '취소', variant: 'ghost', hover: false,
      tip: '가격 흥정을 닫고 편성실로 돌아갑니다.',
      onClick: () => {
        this.saleDialogOpen = false;
        this.redraw();
      },
    }).setDepth(depth + 10);
    new Button(this, {
      x: box.x + box.w - 314, y: box.y + box.h - 78, w: 270, h: 52,
      label: '가격 제안', hover: false,
      enabled: candidates.length > 0 && haggles < rules.maxHaggles,
      tip: `진열 상품 ${candidates.length}개에 같은 가격 배율을 제안합니다. 용사의 반응 후 진열 가격이 갱신됩니다.`,
      onClick: () => {
        const before = this.store.getState();
        this.store.dispatch({ type: 'OFFICE/SALE_PRICE_SET', multiplier: this.saleMultiplier });
        const after = this.store.getState();
        if (saleHaggleCount(after) === saleHaggleCount(before)) return;
        this.saleReaction = this.saleMultiplier <= 0.8
          ? '이 정도 가격이면 괜찮네요. 진열 가격을 그렇게 바꿔 주세요.'
          : this.saleMultiplier <= 1.1
            ? '그 가격이라면 한번 생각해 볼게요.'
            : this.saleMultiplier <= 1.5
              ? '조금 비싼데요... 그래도 가격표는 확인해 볼게요.'
              : '너무 비싸요. 정말 그 가격으로 파실 건가요?';
        this.saleDialogOpen = false;
        this.redraw();
      },
    }).setDepth(depth + 10);
  }

  private openInventory(): void {
    this.inventoryOpen = true;
    this.selectedItemId = null;
    this.inventoryScrollRow = 0;
    this.contractReaderOpen = false;
    this.contractConfirmationOpen = false;
    this.redraw();
  }
}
