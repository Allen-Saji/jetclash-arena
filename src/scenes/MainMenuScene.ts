import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '@/config/game.config';
import { sfx } from '@/audio/SoundGenerator';

export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MainMenu' });
  }

  create(): void {
    // Init audio on first user interaction
    this.input.once('pointerdown', () => sfx.init());

    // Background
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'bg1-layer1')
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT);

    // Title
    this.add.text(GAME_WIDTH / 2, 130, 'JETCLASH\nARENA', {
      fontSize: '72px',
      fontFamily: 'monospace',
      color: '#f5c542',
      fontStyle: 'bold',
      align: 'center',
      stroke: '#000000',
      strokeThickness: 6,
      shadow: {
        offsetX: 3,
        offsetY: 3,
        color: '#000',
        blur: 8,
        fill: true,
      },
    }).setOrigin(0.5);

    // Subtitle
    this.add.text(GAME_WIDTH / 2, 250, 'JETPACK COMBAT DUEL', {
      fontSize: '18px',
      fontFamily: 'monospace',
      color: '#cccccc',
      letterSpacing: 4,
    }).setOrigin(0.5);

    // --- Mode buttons ---
    this.createModeButton(GAME_WIDTH / 2, 340, 'SINGLEPLAYER', '#ff6644', () => {
      sfx.menuClick();
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.time.delayedCall(300, () => this.scene.start('Arena', { aiMode: true }));
    });

    this.createModeButton(GAME_WIDTH / 2, 410, 'MULTIPLAYER', '#f5c542', () => {
      sfx.menuClick();
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.time.delayedCall(300, () => this.scene.start('Arena', { aiMode: false }));
    });

    // Controls info
    const controlsY = 560;
    this.add.text(GAME_WIDTH / 2 - 280, controlsY, [
      'PLAYER 1',
      'Move: WASD',
      'Shoot: F',
      'Rocket: G',
      'Dash: Q',
    ].join('\n'), {
      fontSize: '14px',
      fontFamily: 'monospace',
      color: '#aaaaaa',
      lineSpacing: 4,
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2 + 280, controlsY, [
      'PLAYER 2',
      'Move: Arrows',
      'Shoot: Num1',
      'Rocket: Num2',
      'Dash: Num0',
    ].join('\n'), {
      fontSize: '14px',
      fontFamily: 'monospace',
      color: '#aaaaaa',
      lineSpacing: 4,
    }).setOrigin(0.5);

    // Version
    this.add.text(GAME_WIDTH - 10, GAME_HEIGHT - 10, 'v0.2.0', {
      fontSize: '12px',
      fontFamily: 'monospace',
      color: '#555555',
    }).setOrigin(1, 1);

    // Sound toggle hint
    this.add.text(10, GAME_HEIGHT - 10, 'M = mute', {
      fontSize: '12px',
      fontFamily: 'monospace',
      color: '#555555',
    }).setOrigin(0, 1);

    // M key to toggle mute
    this.input.keyboard!.on('keydown-M', () => {
      sfx.toggleMute();
    });

    // Floating characters preview
    const p1Preview = this.add.image(GAME_WIDTH / 2 - 280, 380, 'p1-idle-1')
      .setScale(2)
      .setFlipX(false);
    const p2Preview = this.add.image(GAME_WIDTH / 2 + 280, 380, 'p2-idle-1')
      .setScale(2)
      .setFlipX(true);

    this.tweens.add({
      targets: [p1Preview, p2Preview],
      y: '+=10',
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.cameras.main.fadeIn(500, 0, 0, 0);
  }

  private createModeButton(x: number, y: number, label: string, color: string, onClick: () => void): void {
    const btnW = 220;
    const btnH = 48;

    const gfx = this.add.graphics();
    gfx.fillStyle(Phaser.Display.Color.HexStringToColor(color).color, 1);
    gfx.fillRoundedRect(x - btnW / 2, y - btnH / 2, btnW, btnH, 12);
    gfx.lineStyle(3, 0x000000, 0.3);
    gfx.strokeRoundedRect(x - btnW / 2, y - btnH / 2, btnW, btnH, 12);

    const text = this.add.text(x, y, label, {
      fontSize: '24px',
      fontFamily: 'monospace',
      color: '#1a1a1a',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const zone = this.add.zone(x, y, btnW, btnH)
      .setInteractive({ useHandCursor: true });

    zone.on('pointerover', () => text.setScale(1.1));
    zone.on('pointerout', () => text.setScale(1));
    zone.on('pointerdown', onClick);
  }
}
