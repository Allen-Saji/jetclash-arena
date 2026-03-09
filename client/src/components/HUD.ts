import Phaser from 'phaser';
import { PLAYER_PHYSICS } from '@/config/player.config';
import { KILL_CAP } from '@/config/match.config';
import { GAME_WIDTH, GAME_HEIGHT } from '@/config/game.config';
import { MatchState } from '@/types';

/** Minimal interface for player data the HUD needs */
export interface HUDPlayerInfo {
  hp: number;
  fuel: number;
}

const PLAYER_COLORS = [0xf5c542, 0xff6644, 0x44cc66, 0x4488ff];
const PLAYER_COLOR_HEX = ['#f5c542', '#ff6644', '#44cc66', '#4488ff'];
const PLAYER_LABELS = ['P1', 'P2', 'P3', 'P4'];

export class HUD {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;

  private hpBars: Phaser.GameObjects.Rectangle[] = [];
  private hpBgs: Phaser.GameObjects.Rectangle[] = [];
  private fuelBars: Phaser.GameObjects.Rectangle[] = [];
  private fuelBgs: Phaser.GameObjects.Rectangle[] = [];
  private scoreTexts: Phaser.GameObjects.Text[] = [];
  private nameTexts: Phaser.GameObjects.Text[] = [];
  private timerText!: Phaser.GameObjects.Text;
  private killsText!: Phaser.GameObjects.Text;

  private readonly BAR_W = 200;
  private readonly BAR_H = 16;
  private readonly FUEL_H = 8;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0);
    this.container.setScrollFactor(0);
    this.container.setDepth(100);

    this.createPlayerHUD(0, 20, 15, false);
    this.createPlayerHUD(1, 1280 - 20 - this.BAR_W, 15, true);
    this.createCenterHUD();
  }

  private createPlayerHUD(idx: number, x: number, y: number, rightAligned: boolean): void {
    const nameText = this.scene.add.text(
      rightAligned ? x + this.BAR_W : x,
      y,
      PLAYER_LABELS[idx],
      { fontSize: '16px', fontFamily: 'monospace', color: PLAYER_COLOR_HEX[idx], fontStyle: 'bold' },
    );
    if (rightAligned) nameText.setOrigin(1, 0);
    this.nameTexts[idx] = nameText;
    this.container.add(nameText);

    const hpBg = this.scene.add.rectangle(x, y + 24, this.BAR_W, this.BAR_H, 0x333333).setOrigin(0, 0);
    const hpBar = this.scene.add.rectangle(
      rightAligned ? x + this.BAR_W : x,
      y + 24,
      this.BAR_W,
      this.BAR_H,
      0x44cc44,
    ).setOrigin(rightAligned ? 1 : 0, 0);
    this.hpBgs[idx] = hpBg;
    this.hpBars[idx] = hpBar;
    this.container.add([hpBg, hpBar]);

    const fuelBg = this.scene.add.rectangle(x, y + 44, this.BAR_W, this.FUEL_H, 0x222244).setOrigin(0, 0);
    const fuelBar = this.scene.add.rectangle(
      rightAligned ? x + this.BAR_W : x,
      y + 44,
      this.BAR_W,
      this.FUEL_H,
      0x4488ff,
    ).setOrigin(rightAligned ? 1 : 0, 0);
    this.fuelBgs[idx] = fuelBg;
    this.fuelBars[idx] = fuelBar;
    this.container.add([fuelBg, fuelBar]);

    const scoreText = this.scene.add.text(
      rightAligned ? x + this.BAR_W : x,
      y + 58,
      '0',
      { fontSize: '24px', fontFamily: 'monospace', color: '#ffffff', fontStyle: 'bold' },
    );
    if (rightAligned) scoreText.setOrigin(1, 0);
    this.scoreTexts[idx] = scoreText;
    this.container.add(scoreText);
  }

  private createCenterHUD(): void {
    const cx = 640;
    this.timerText = this.scene.add.text(cx, 20, '2:00', {
      fontSize: '32px', fontFamily: 'monospace', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5, 0);
    this.container.add(this.timerText);

    this.killsText = this.scene.add.text(cx, 58, `First to ${KILL_CAP} kills`, {
      fontSize: '12px', fontFamily: 'monospace', color: '#888888',
    }).setOrigin(0.5, 0);
    this.container.add(this.killsText);
  }

  update(players: HUDPlayerInfo[], matchState: MatchState): void {
    for (let i = 0; i < 2 && i < players.length; i++) {
      const p = players[i];
      const hpRatio = p.hp / PLAYER_PHYSICS.maxHP;
      this.hpBars[i].width = this.BAR_W * hpRatio;
      this.hpBars[i].setFillStyle(hpRatio > 0.5 ? 0x44cc44 : hpRatio > 0.25 ? 0xcccc44 : 0xcc4444);
      this.fuelBars[i].width = this.BAR_W * (p.fuel / PLAYER_PHYSICS.jetpackFuelMax);
      this.scoreTexts[i].setText(`${matchState.scores[i] ?? 0}`);
    }

    const mins = Math.floor(matchState.timeRemaining / 60);
    const secs = Math.floor(matchState.timeRemaining % 60);
    this.timerText.setText(`${mins}:${secs.toString().padStart(2, '0')}`);

    if (matchState.timeRemaining <= 10) {
      this.timerText.setColor(Math.sin(this.scene.time.now * 0.005) > 0 ? '#ff4444' : '#ffffff');
    }
  }

  setZoomCompensation(zoom: number): void {
    const invZoom = 1 / zoom;
    this.container.setScale(invZoom);
    this.container.setPosition(
      (1 - invZoom) * GAME_WIDTH / 2,
      (1 - invZoom) * GAME_HEIGHT / 2,
    );
  }

  destroy(): void {
    this.container.destroy(true);
  }
}
