import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '@/config/game.config';

export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MainMenu' });
  }

  create(): void {
    // Background
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'bg1-layer1')
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT);

    // Title
    const title = this.add.text(GAME_WIDTH / 2, 160, 'JETCLASH\nARENA', {
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
    this.add.text(GAME_WIDTH / 2, 280, 'JETPACK COMBAT DUEL', {
      fontSize: '18px',
      fontFamily: 'monospace',
      color: '#cccccc',
      letterSpacing: 4,
    }).setOrigin(0.5);

    // Play button - custom drawn
    const btnW = 200;
    const btnH = 50;
    const btnY = 380;
    const btnGraphics = this.add.graphics();
    btnGraphics.fillStyle(0xf5c542, 1);
    btnGraphics.fillRoundedRect(GAME_WIDTH / 2 - btnW / 2, btnY - btnH / 2, btnW, btnH, 12);
    btnGraphics.lineStyle(3, 0x000000, 0.3);
    btnGraphics.strokeRoundedRect(GAME_WIDTH / 2 - btnW / 2, btnY - btnH / 2, btnW, btnH, 12);

    const playLabel = this.add.text(GAME_WIDTH / 2, btnY, 'PLAY', {
      fontSize: '28px',
      fontFamily: 'monospace',
      color: '#1a1a1a',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const playZone = this.add.zone(GAME_WIDTH / 2, btnY, btnW, btnH)
      .setInteractive({ useHandCursor: true });

    playZone.on('pointerover', () => { playLabel.setScale(1.1); });
    playZone.on('pointerout', () => { playLabel.setScale(1); });
    playZone.on('pointerdown', () => {
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.time.delayedCall(300, () => this.scene.start('Arena'));
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
    this.add.text(GAME_WIDTH - 10, GAME_HEIGHT - 10, 'v0.1.0 MVP', {
      fontSize: '12px',
      fontFamily: 'monospace',
      color: '#555555',
    }).setOrigin(1, 1);

    // Floating characters preview - spaced out from button
    const p1Preview = this.add.image(GAME_WIDTH / 2 - 280, 400, 'p1-idle-1')
      .setScale(2.5)
      .setFlipX(false);
    const p2Preview = this.add.image(GAME_WIDTH / 2 + 280, 400, 'p2-idle-1')
      .setScale(2.5)
      .setFlipX(true);

    // Bobbing animation
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
}
