import Phaser from 'phaser';
import { BASE_W, BASE_H } from '../config';
import { PALETTE, css } from '../render/palette';
import { FONT_LABEL } from '../render/font';
import { L } from './layout';

/**
 * 마우스를 따라다니는 한 줄 설명 (사용자 확정).
 *
 * 예전에는 화면 한 구석에 팁을 상시로 띄워 뒀다 (`Onboarding`). 전투 중에는 그게
 * 계속 시야에 남아 거슬려서, **버튼에 올렸을 때만** 뜨는 방식으로 바꿨다.
 *
 * 자리는 **커서의 우측 위**다. 커서 아래에 두면 손이 가는 방향(버튼)을 가린다.
 * 화면 밖으로 나갈 때만 반대쪽으로 접는다.
 */

/** 커서와 패널 사이 간격 */
const GAP = 14;
/** 글자 둘레 여백 */
const PAD = 12;
/**
 * 이보다 길면 줄을 접는다. 넓게 잡았더니(520) 한 줄짜리 팁이 700px 을 넘어서
 * 오른쪽 버튼에서는 커서 우측에 놓을 자리가 안 나왔다 (실측) — 좁고 높은 쪽이 낫다
 */
const MAX_W = 360;

/** 씬마다 하나씩. 버튼이 자기 씬의 것을 찾아 쓴다 */
const byScene = new WeakMap<Phaser.Scene, Tooltip>();

export function tooltipOf(scene: Phaser.Scene): Tooltip | null {
  return byScene.get(scene) ?? null;
}

export class Tooltip {
  private readonly panel: Phaser.GameObjects.Graphics;
  private readonly text: Phaser.GameObjects.Text;
  private shown = false;

  constructor(scene: Phaser.Scene) {
    this.panel = scene.add.graphics().setDepth(1000).setVisible(false);
    this.text = scene.add
      .text(0, 0, '', {
        ...FONT_LABEL,
        color: css('bone'),
        wordWrap: { width: MAX_W, useAdvancedWrap: true },
      })
      .setDepth(1001)
      .setVisible(false);

    // 떠 있는 동안만 따라간다. `PhaseScene.redraw()` 는 키보드 리스너만 지우므로
    // 이 포인터 리스너는 다시 그려도 살아남는다 — 여기서 한 번만 건다
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (this.shown) this.place(p.x, p.y);
    });

    // ★ 매 프레임 히트 테스트. 생방송 화면은 채팅이 들어올 때마다 다시 그려서
    //   버튼이 통째로 새로 만들어진다. 기본 설정(포인터가 움직일 때만 판정)이면
    //   커서를 올려 둔 채 가만히 있을 때 툴팁이 사라진 뒤 다시 안 뜬다.
    scene.input.setPollAlways();
  }

  /** `PhaseScene.keepAlive()` 에 넘길 것들 — 다시 그려도 살아남아야 한다 */
  objects(): Phaser.GameObjects.GameObject[] {
    return [this.panel, this.text];
  }

  show(message: string, x: number, y: number): void {
    if (message === '') return;
    this.text.setText(message);
    this.shown = true;
    this.panel.setVisible(true);
    this.text.setVisible(true);
    this.place(x, y);
  }

  hide(): void {
    this.shown = false;
    this.panel.setVisible(false);
    this.text.setVisible(false);
  }

  private place(px: number, py: number): void {
    const w = Math.ceil(this.text.width) + PAD * 2;
    const h = Math.ceil(this.text.height) + PAD * 2;

    // **항상 커서 우측 위**에서 시작한다 (사용자 확정). 오른쪽 끝에서는 반대편으로
    // 접지 않고 **화면 안으로 밀어 넣기만** 한다 — 접으면 커서 왼쪽으로 튀어 방향이 흔들린다.
    // 위쪽이 막힐 때만 커서 아래로 내린다 (그때는 밀어 넣을 여지가 없다)
    let x = Math.round(px + GAP);
    let y = Math.round(py - GAP - h);
    if (y < 8) y = Math.round(py + GAP);
    x = Math.max(8, Math.min(x, BASE_W - w - 8));
    y = Math.max(8, Math.min(y, BASE_H - h - 8));

    this.panel.clear();
    this.panel.fillStyle(PALETTE.ink, 1);
    this.panel.fillRect(x, y, w, h);
    this.panel.fillStyle(PALETTE.bone, 1);
    this.panel.fillRect(x, y, w, L.line);
    this.panel.fillRect(x, y + h - L.line, w, L.line);
    this.panel.fillRect(x, y, L.line, h);
    this.panel.fillRect(x + w - L.line, y, L.line, h);

    this.text.setPosition(x + PAD, y + PAD);
  }
}

/** 씬이 자기 툴팁을 만들어 등록한다. 버튼은 `tooltipOf(scene)` 로 찾는다 */
export function createTooltip(scene: Phaser.Scene): Tooltip {
  const t = new Tooltip(scene);
  byScene.set(scene, t);
  return t;
}
