import Phaser from 'phaser';
import { Player } from '@/entities/Player';
import { PLAYER_PHYSICS } from '@/config/player.config';
import { MATCH_DURATION, KILL_CAP } from '@/config/match.config';
import { MatchState } from '@/types';

export class HUD {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;

  // P1 elements
  private p1HPBar!: Phaser.GameObjects.Rectangle;
  private p1HPBg!: Phaser.GameObjects.Rectangle;
  private p1FuelBar!: Phaser.GameObjects.Rectangle;
  private p1FuelBg!: Phaser.GameObjects.Rectangle;
  private p1ScoreText!: Phaser.GameObjects.Text;
  private p1NameText!: Phaser.GameObjects.Text;

  // P2 elements
  private p2HPBar!: Phaser.GameObjects.Rectangle;
  private p2HPBg!: Phaser.GameObjects.Rectangle;
  private p2FuelBar!: Phaser.GameObjects.Rectangle;
  private p2FuelBg!: Phaser.GameObjects.Rectangle;
  private p2ScoreText!: Phaser.GameObjects.Text;
  private p2NameText!: Phaser.GameObjects.Text;

  // Center
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

    this.createP1HUD();
    this.createP2HUD();
    this.createCenterHUD();
  }

  private createP1HUD(): void {
    const x = 20;
    const y = 15;

    // Name
    this.p1NameText = this.scene.add.text(x, y, 'P1', {
      fontSize: '16px', fontFamily: 'monospace', color: '#f5c542', fontStyle: 'bold',
    });
    this.container.add(this.p1NameText);

    // HP bar
    this.p1HPBg = this.scene.add.rectangle(x, y + 24, this.BAR_W, this.BAR_H, 0x333333).setOrigin(0, 0);
    this.p1HPBar = this.scene.add.rectangle(x, y + 24, this.BAR_W, this.BAR_H, 0x44cc44).setOrigin(0, 0);
    this.container.add([this.p1HPBg, this.p1HPBar]);

    // Fuel bar
    this.p1FuelBg = this.scene.add.rectangle(x, y + 44, this.BAR_W, this.FUEL_H, 0x222244).setOrigin(0, 0);
    this.p1FuelBar = this.scene.add.rectangle(x, y + 44, this.BAR_W, this.FUEL_H, 0x4488ff).setOrigin(0, 0);
    this.container.add([this.p1FuelBg, this.p1FuelBar]);

    // Score
    this.p1ScoreText = this.scene.add.text(x, y + 58, '0', {
      fontSize: '24px', fontFamily: 'monospace', color: '#ffffff', fontStyle: 'bold',
    });
    this.container.add(this.p1ScoreText);
  }

  private createP2HUD(): void {
    const x = 1280 - 20 - this.BAR_W;
    const y = 15;

    this.p2NameText = this.scene.add.text(x + this.BAR_W, y, 'P2', {
      fontSize: '16px', fontFamily: 'monospace', color: '#ff6644', fontStyle: 'bold',
    }).setOrigin(1, 0);
    this.container.add(this.p2NameText);

    this.p2HPBg = this.scene.add.rectangle(x, y + 24, this.BAR_W, this.BAR_H, 0x333333).setOrigin(0, 0);
    this.p2HPBar = this.scene.add.rectangle(x + this.BAR_W, y + 24, this.BAR_W, this.BAR_H, 0x44cc44).setOrigin(1, 0);
    this.container.add([this.p2HPBg, this.p2HPBar]);

    this.p2FuelBg = this.scene.add.rectangle(x, y + 44, this.BAR_W, this.FUEL_H, 0x222244).setOrigin(0, 0);
    this.p2FuelBar = this.scene.add.rectangle(x + this.BAR_W, y + 44, this.BAR_W, this.FUEL_H, 0x4488ff).setOrigin(1, 0);
    this.container.add([this.p2FuelBg, this.p2FuelBar]);

    this.p2ScoreText = this.scene.add.text(x + this.BAR_W, y + 58, '0', {
      fontSize: '24px', fontFamily: 'monospace', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(1, 0);
    this.container.add(this.p2ScoreText);
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

  update(p1: Player, p2: Player, matchState: MatchState): void {
    // HP bars
    const p1HPRatio = p1.hp / PLAYER_PHYSICS.maxHP;
    const p2HPRatio = p2.hp / PLAYER_PHYSICS.maxHP;
    this.p1HPBar.width = this.BAR_W * p1HPRatio;
    this.p2HPBar.width = this.BAR_W * p2HPRatio;

    // HP color
    this.p1HPBar.setFillStyle(p1HPRatio > 0.5 ? 0x44cc44 : p1HPRatio > 0.25 ? 0xcccc44 : 0xcc4444);
    this.p2HPBar.setFillStyle(p2HPRatio > 0.5 ? 0x44cc44 : p2HPRatio > 0.25 ? 0xcccc44 : 0xcc4444);

    // Fuel bars
    this.p1FuelBar.width = this.BAR_W * (p1.fuel / PLAYER_PHYSICS.jetpackFuelMax);
    this.p2FuelBar.width = this.BAR_W * (p2.fuel / PLAYER_PHYSICS.jetpackFuelMax);

    // Scores
    this.p1ScoreText.setText(`${matchState.scores.p1}`);
    this.p2ScoreText.setText(`${matchState.scores.p2}`);

    // Timer
    const mins = Math.floor(matchState.timeRemaining / 60);
    const secs = Math.floor(matchState.timeRemaining % 60);
    this.timerText.setText(`${mins}:${secs.toString().padStart(2, '0')}`);

    // Timer flash when low
    if (matchState.timeRemaining <= 10) {
      this.timerText.setColor(Math.sin(this.scene.time.now * 0.005) > 0 ? '#ff4444' : '#ffffff');
    }
  }

  destroy(): void {
    this.container.destroy(true);
  }
}
