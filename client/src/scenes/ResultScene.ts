import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '@/config/game.config';
import { CREDITS_BASE, CREDITS_WIN_BONUS } from '@/config/match.config';
import { MatchState } from '@/types';
import { sfx } from '@/audio/SoundGenerator';

export class ResultScene extends Phaser.Scene {
  private aiMode: boolean = false;

  constructor() {
    super({ key: 'Result' });
  }

  create(data: { matchState: MatchState; aiMode?: boolean }): void {
    const { matchState } = data;
    this.aiMode = data.aiMode ?? false;
    const winner = matchState.winner;

    // Dark overlay
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.85);

    // Winner text
    const winnerColor = winner === 1 ? '#f5c542' : '#ff6644';
    const p2Label = this.aiMode ? 'AI' : 'PLAYER 2';
    const winnerName = winner === 1 ? 'PLAYER 1' : p2Label;

    this.add.text(GAME_WIDTH / 2, 100, `${winnerName} WINS!`, {
      fontSize: '56px',
      fontFamily: 'monospace',
      color: winnerColor,
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5);

    // Winner character (150x150 native, scale 1x = 150px)
    const winnerKey = winner === 1 ? 'p1-idle-1' : 'p2-idle-1';
    const winnerSprite = this.add.image(GAME_WIDTH / 2, 205, winnerKey);
    this.tweens.add({
      targets: winnerSprite,
      y: '+=6',
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Scores
    const scoreY = 300;
    this.add.text(GAME_WIDTH / 2 - 180, scoreY, 'P1', {
      fontSize: '24px', fontFamily: 'monospace', color: '#f5c542', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2 + 180, scoreY, this.aiMode ? 'AI' : 'P2', {
      fontSize: '24px', fontFamily: 'monospace', color: '#ff6644', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, scoreY, 'VS', {
      fontSize: '20px', fontFamily: 'monospace', color: '#666666',
    }).setOrigin(0.5);

    // Score values
    this.add.text(GAME_WIDTH / 2 - 180, scoreY + 40, `${matchState.scores.p1}`, {
      fontSize: '36px', fontFamily: 'monospace', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2 + 180, scoreY + 40, `${matchState.scores.p2}`, {
      fontSize: '36px', fontFamily: 'monospace', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);

    // Kills
    this.add.text(GAME_WIDTH / 2 - 180, scoreY + 80, `${matchState.kills.p1} kill${matchState.kills.p1 !== 1 ? 's' : ''}`, {
      fontSize: '16px', fontFamily: 'monospace', color: '#aaaaaa',
    }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2 + 180, scoreY + 80, `${matchState.kills.p2} kill${matchState.kills.p2 !== 1 ? 's' : ''}`, {
      fontSize: '16px', fontFamily: 'monospace', color: '#aaaaaa',
    }).setOrigin(0.5);

    // Credits earned
    const p1Credits = CREDITS_BASE + (winner === 1 ? CREDITS_WIN_BONUS : 0);
    const p2Credits = CREDITS_BASE + (winner === 2 ? CREDITS_WIN_BONUS : 0);

    this.add.text(GAME_WIDTH / 2, scoreY + 130, 'CREDITS EARNED', {
      fontSize: '14px', fontFamily: 'monospace', color: '#888888',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2 - 180, scoreY + 155, `+${p1Credits}`, {
      fontSize: '20px', fontFamily: 'monospace', color: '#f5c542',
    }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2 + 180, scoreY + 155, `+${p2Credits}`, {
      fontSize: '20px', fontFamily: 'monospace', color: '#f5c542',
    }).setOrigin(0.5);

    // Buttons
    const rematchBtn = this.add.image(GAME_WIDTH / 2 - 100, 585, 'btn-restart')
      .setScale(1.2)
      .setInteractive({ useHandCursor: true });
    this.add.text(GAME_WIDTH / 2 - 100, 650, 'REMATCH', {
      fontSize: '14px', fontFamily: 'monospace', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);

    rematchBtn.on('pointerover', () => rematchBtn.setScale(1.3));
    rematchBtn.on('pointerout', () => rematchBtn.setScale(1.2));
    rematchBtn.on('pointerdown', () => {
      sfx.menuClick();
      this.cameras.main.fadeOut(300);
      this.time.delayedCall(300, () => this.scene.start('Arena', { aiMode: this.aiMode }));
    });

    const menuBtn = this.add.image(GAME_WIDTH / 2 + 100, 585, 'btn-menu')
      .setScale(1.2)
      .setInteractive({ useHandCursor: true });
    this.add.text(GAME_WIDTH / 2 + 100, 650, 'MENU', {
      fontSize: '14px', fontFamily: 'monospace', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);

    menuBtn.on('pointerover', () => menuBtn.setScale(1.3));
    menuBtn.on('pointerout', () => menuBtn.setScale(1.2));
    menuBtn.on('pointerdown', () => {
      sfx.menuClick();
      this.cameras.main.fadeOut(300);
      this.time.delayedCall(300, () => this.scene.start('MainMenu'));
    });

    this.cameras.main.fadeIn(500);
  }
}
