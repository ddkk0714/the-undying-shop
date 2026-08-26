import { SCENES } from '../../config';
import { L } from '../../ui/layout';
import { Button } from '../../ui/Button';
import { key, hasTexture } from '../../render/assets';
import { playSfx } from '../../audio/Sfx';
import { PhaseScene } from './PhaseScene';
import type { DayScene } from '../DayScene';
import type { GameState } from '../../core/types';

/** 하루가 끝난 뒤, 다음 날을 시작하기 전에 읽는 신문 화면. */
export class DayEndPhase extends PhaseScene {
  private paperRustle: Phaser.Sound.BaseSound | null = null;

  constructor() {
    super(SCENES.PHASE_DAYEND);
  }

  override create(): void {
    super.create();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.stopPaperRustle());
  }

  protected build(s: Readonly<GameState>): void {
    this.stageBackdrop();
    this.heading('하루 종료');

    const prevDay = Math.max(1, s.day - 1);
    this.text(L.pad, L.stage.y + L.pad + 64, `${prevDay}일차 방송을 정산하고 ${s.day}일차를 시작합니다`, 'dust');
    this.addNewspaper(prevDay);

    const nextDay = new Button(this, {
      x: L.W / 2 - 264, y: L.actionsFull.y + L.pad, w: 528, h: 96,
      label: '다음 날 시작', hotkey: '1',
      onClick: () => (this.scene.get(SCENES.DAY) as DayScene).advanceFromDayEnd(),
    });
    nextDay.setDepth(30);
  }

  private addNewspaper(day: number): void {
    const paperKey = `ui.newspaper.day${Math.min(4, Math.max(1, day))}`;
    const peekY = 900;
    const openY = 160;
    const width = 900;
    const height = 888;
    const x = Math.round((L.W - width) / 2);

    if (!hasTexture(this, paperKey)) {
      this.rect(x, peekY, width, height, 'mid');
      this.frame(x, peekY, width, height, 'bone');
      return;
    }

    const paper = this.add.image(x, peekY, key(paperKey)).setOrigin(0, 0).setDisplaySize(width, height).setDepth(20);
    paper.setInteractive({ cursor: 'grab' });
    this.input.setDraggable(paper);

    let pulledOut = false;
    paper.on('dragstart', () => {
      if (paper.input) paper.input.cursor = 'grabbing';
      this.startPaperRustle();
    });
    paper.on('drag', (_pointer: Phaser.Input.Pointer, _dragX: number, dragY: number) => {
      paper.setPosition(x, Phaser.Math.Clamp(Math.round(dragY), openY, peekY));
      if (paper.y <= openY + 32) pulledOut = true;
    });
    paper.on('dragend', () => {
      if (paper.input) paper.input.cursor = 'grab';
      this.stopPaperRustle();
      if (pulledOut) {
        this.tweens.add({ targets: paper, y: openY, duration: 150, ease: 'Quad.easeOut' });
        this.playPaperTurn();
      } else {
        this.tweens.add({ targets: paper, y: peekY, duration: 180, ease: 'Quad.easeOut' });
      }
    });
  }

  private startPaperRustle(): void {
    if (this.paperRustle?.isPlaying) return;
    const soundKey = key('sfx.newspaper.rustle');
    if (!this.cache.audio.exists(soundKey)) return;
    this.paperRustle?.destroy();
    this.paperRustle = this.sound.add(soundKey, { loop: true, volume: 0.34 });
    this.paperRustle.play();
  }

  private stopPaperRustle(): void {
    this.paperRustle?.stop();
    this.paperRustle?.destroy();
    this.paperRustle = null;
  }

  private playPaperTurn(): void {
    playSfx(this, 'sfx.newspaper.turn', 0.65);
  }
}
