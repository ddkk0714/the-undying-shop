import Phaser from 'phaser';
import './style.css';

class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create() {
    this.cameras.main.setBackgroundColor('#12100E');

    this.add
      .text(240, 135, 'THE UNDYING SHOP', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#E6DCC8',
      })
      .setOrigin(0.5);
  }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,

  width: 480,
  height: 270,

  pixelArt: true,
  roundPixels: true,

  backgroundColor: '#12100E',

  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },

  scene: [BootScene],
};

new Phaser.Game(config);