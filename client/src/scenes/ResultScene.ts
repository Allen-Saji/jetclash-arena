import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '@/config/game.config';
import { CREDITS_BASE, CREDITS_WIN_BONUS } from '@/config/match.config';
import { MatchState } from '@/types';
import { sfx } from '@/audio/SoundGenerator';

const PLAYER_COLOR_HEX = ['#f5c542', '#ff6644', '#44cc66', '#4488ff'];
const PLAYER_LABELS = ['P1', 'P2', 'P3', 'P4'];

export class ResultScene extends Phaser.Scene {
  private aiMode: boolean = false;
  private fromOnline: boolean = false;

  constructor() {
    super({ key: 'Result' });
  }

  create(data: { matchState: MatchState; aiMode?: boolean; fromOnline?: boolean; characterIds?: number[] }): void {
    const { matchState } = data;
    this.aiMode = data.aiMode ?? false;
    this.fromOnline = data.fromOnline ?? false;
    const winner = matchState.winner;
    const playerCount = matchState.playerCount ?? 2;

    // Dark overlay
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.85);

    // Winner text
    const winnerIdx = winner ? winner - 1 : 0;
    const winnerColor = PLAYER_COLOR_HEX[winnerIdx] ?? '#f5c542';
    let winnerName: string;
    if (winner === null || winner === 0) {
      winnerName = 'DRAW';
    } else if (winner === 2 && this.aiMode) {
      winnerName = 'AI WINS!';
    } else {
      winnerName = `${PLAYER_LABELS[winnerIdx]} WINS!`;
    }

    this.add.text(GAME_WIDTH / 2, 100, winnerName, {
      fontSize: '56px',
      fontFamily: 'monospace',
      color: winnerColor,
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5);

    // Winner character sprite
    const charId = data.characterIds?.[winnerIdx] ?? (winnerIdx + 1);
    const charStr = String(charId).padStart(2, '0');
    const winnerKey = `p${winnerIdx + 1}-idle-1`;
    const winnerSprite = this.add.image(GAME_WIDTH / 2, 205, winnerKey);
    this.tweens.add({
      targets: winnerSprite,
      y: '+=6',
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Score table
    const scoreY = 300;
    const spacing = 360 / playerCount;
    const startX = GAME_WIDTH / 2 - (spacing * (playerCount - 1)) / 2;

    for (let i = 0; i < playerCount; i++) {
      const x = startX + i * spacing;
      const label = (i === 1 && this.aiMode) ? 'AI' : PLAYER_LABELS[i];
      this.add.text(x, scoreY, label, {
        fontSize: '24px', fontFamily: 'monospace', color: PLAYER_COLOR_HEX[i], fontStyle: 'bold',
      }).setOrigin(0.5);

      this.add.text(x, scoreY + 40, `${matchState.scores[i] ?? 0}`, {
        fontSize: '36px', fontFamily: 'monospace', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5);

      const kills = matchState.kills[i] ?? 0;
      this.add.text(x, scoreY + 80, `${kills} kill${kills !== 1 ? 's' : ''}`, {
        fontSize: '16px', fontFamily: 'monospace', color: '#aaaaaa',
      }).setOrigin(0.5);
    }

    // Credits earned
    this.add.text(GAME_WIDTH / 2, scoreY + 130, 'CREDITS EARNED', {
      fontSize: '14px', fontFamily: 'monospace', color: '#888888',
    }).setOrigin(0.5);

    for (let i = 0; i < playerCount; i++) {
      const x = startX + i * spacing;
      const credits = CREDITS_BASE + (winner === i + 1 ? CREDITS_WIN_BONUS : 0);
      this.add.text(x, scoreY + 155, `+${credits}`, {
        fontSize: '20px', fontFamily: 'monospace', color: '#f5c542',
      }).setOrigin(0.5);
    }

    // Buttons
    if (!this.fromOnline) {
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
    }

    const menuBtn = this.add.image(
      this.fromOnline ? GAME_WIDTH / 2 : GAME_WIDTH / 2 + 100,
      585,
      'btn-menu',
    )
      .setScale(1.2)
      .setInteractive({ useHandCursor: true });
    this.add.text(
      this.fromOnline ? GAME_WIDTH / 2 : GAME_WIDTH / 2 + 100,
      650,
      'MENU',
      { fontSize: '14px', fontFamily: 'monospace', color: '#ffffff', fontStyle: 'bold' },
    ).setOrigin(0.5);

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
