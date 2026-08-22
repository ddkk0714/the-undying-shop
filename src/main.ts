import Phaser from 'phaser';
import { BASE_W, BASE_H } from './config';
import { PALETTE } from './render/palette';
import { applyIntegerScale } from './render/scaler';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { TitleScene } from './scenes/TitleScene';
import { HelpScene } from './scenes/HelpScene';
import { OptionsScene } from './scenes/OptionsScene';
import { DayScene } from './scenes/DayScene';
import { EndingScene } from './scenes/EndingScene';
import { RevivePhase } from './scenes/phases/RevivePhase';
import { OfficePhase } from './scenes/phases/OfficePhase';
import { LivePhase } from './scenes/phases/LivePhase';
import { DeathPhase } from './scenes/phases/DeathPhase';
import { AutopsyPhase } from './scenes/phases/AutopsyPhase';
import { AnnouncePhase } from './scenes/phases/AnnouncePhase';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: BASE_W,
  height: BASE_H,
  parent: 'game',
  backgroundColor: PALETTE.ink,
  pixelArt: true, // antialias off + roundPixels 유도
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.NONE, // ★ FIT 금지. 정수배만 — 01-ARCHITECTURE §4
    // CSS grid(#game{place-items:center})가 중앙 정렬을 담당한다.
    // Phaser 의 autoCenter 까지 켜면 canvas 에 marginLeft 가 더해져 둘이 겹치고,
    // 캔버스가 좌우 3:1 로 밀린다. (상수 이름은 NO_CENTER — CENTER_OFF 는 없다)
    autoCenter: Phaser.Scale.NO_CENTER,
    zoom: 1, // scaler.ts 가 런타임에 정수로 재설정
  },
  // 첫 씬만 자동 시작한다. 단계 씬은 DayScene 이 launch 할 때까지 잠들어 있다.
  scene: [
    BootScene, PreloadScene, TitleScene, DayScene, EndingScene, HelpScene, OptionsScene,
    RevivePhase, OfficePhase, LivePhase, DeathPhase, AutopsyPhase, AnnouncePhase,
  ],
});

applyIntegerScale(game);

// ?seed=12345 — 버그 재현 및 심사 시연용 결정적 플레이 (01-ARCHITECTURE §6)
const seed = Number(new URLSearchParams(location.search).get('seed'));
if (Number.isFinite(seed) && seed > 0) game.registry.set('seed', seed);
