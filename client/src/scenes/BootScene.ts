import Phaser from 'phaser';
import {
  CHARACTER_FRAMES,
  BACKGROUND_ASSETS,
  PROJECTILE_ASSETS,
  ITEM_ASSETS,
  FX_ASSETS,
  PLATFORM_ASSETS,
  TILE_ASSETS,
  UI_ASSETS,
} from '@/config/assets.config';
import { GAME_WIDTH, GAME_HEIGHT } from '@/config/game.config';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Boot' });
  }

  preload(): void {
    this.createLoadingBar();
    this.loadAllAssets();
  }

  create(): void {
    this.createAnimations();
    this.scene.start('MainMenu');
  }

  private createLoadingBar(): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    const bg = this.add.rectangle(cx, cy, 400, 30, 0x222222);
    const fill = this.add.rectangle(cx - 198, cy, 0, 26, 0xf5c542);
    fill.setOrigin(0, 0.5);

    const text = this.add.text(cx, cy - 40, 'LOADING...', {
      fontSize: '20px',
      color: '#ffffff',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.load.on('progress', (value: number) => {
      fill.width = 396 * value;
    });

    this.load.on('complete', () => {
      bg.destroy();
      fill.destroy();
      text.destroy();
    });
  }

  private loadAllAssets(): void {
    // Characters
    const players = ['player1', 'player2'] as const;
    for (const p of players) {
      const frames = CHARACTER_FRAMES[p];
      for (const anim of Object.values(frames)) {
        for (const entry of anim) {
          this.load.image(entry.key, entry.path);
        }
      }
    }

    // Backgrounds
    for (const bg of BACKGROUND_ASSETS) {
      this.load.image(bg.key, bg.path);
    }

    // Projectiles
    for (const proj of PROJECTILE_ASSETS) {
      this.load.image(proj.key, proj.path);
    }

    // Items
    for (const group of Object.values(ITEM_ASSETS)) {
      for (const entry of group) {
        this.load.image(entry.key, entry.path);
      }
    }

    // FX
    for (const group of Object.values(FX_ASSETS)) {
      for (const entry of group) {
        this.load.image(entry.key, entry.path);
      }
    }

    // Platforms
    for (const entry of PLATFORM_ASSETS) {
      this.load.image(entry.key, entry.path);
    }

    // Tiles
    for (const entry of TILE_ASSETS) {
      this.load.image(entry.key, entry.path);
    }

    // UI
    for (const entry of UI_ASSETS) {
      this.load.image(entry.key, entry.path);
    }
  }

  private createAnimations(): void {
    const players = [
      { prefix: 'p1', idle: 4, fly: 4, walk: 8, jump: 3, die: 4 } as const,
      { prefix: 'p2', idle: 4, fly: 4, walk: 8, jump: 3, die: 4 } as const,
    ];

    for (const p of players) {
      this.anims.create({
        key: `${p.prefix}-idle`,
        frames: Array.from({ length: p.idle }, (_, i) => ({
          key: `${p.prefix}-idle-${i + 1}`,
        })),
        frameRate: 6,
        repeat: -1,
      });

      this.anims.create({
        key: `${p.prefix}-fly`,
        frames: Array.from({ length: p.fly }, (_, i) => ({
          key: `${p.prefix}-fly-${i + 1}`,
        })),
        frameRate: 8,
        repeat: -1,
      });

      this.anims.create({
        key: `${p.prefix}-walk`,
        frames: Array.from({ length: p.walk }, (_, i) => ({
          key: `${p.prefix}-walk-${i + 1}`,
        })),
        frameRate: 10,
        repeat: -1,
      });

      this.anims.create({
        key: `${p.prefix}-jump`,
        frames: Array.from({ length: p.jump }, (_, i) => ({
          key: `${p.prefix}-jump-${i + 1}`,
        })),
        frameRate: 8,
        repeat: 0,
      });

      this.anims.create({
        key: `${p.prefix}-die`,
        frames: Array.from({ length: p.die }, (_, i) => ({
          key: `${p.prefix}-die-${i + 1}`,
        })),
        frameRate: 8,
        repeat: 0,
      });
    }

    // Collision FX
    this.anims.create({
      key: 'explosion',
      frames: Array.from({ length: 8 }, (_, i) => ({
        key: `collision1-${i + 1}`,
      })),
      frameRate: 16,
      repeat: 0,
    });

    // Jetpack smoke
    this.anims.create({
      key: 'jetpack-smoke',
      frames: Array.from({ length: 4 }, (_, i) => ({
        key: `smoke-${i + 1}`,
      })),
      frameRate: 12,
      repeat: -1,
    });

    // Heal pickup
    this.anims.create({
      key: 'heal-spin',
      frames: Array.from({ length: 4 }, (_, i) => ({
        key: `heal-${i + 1}`,
      })),
      frameRate: 6,
      repeat: -1,
    });

    // Speed pickup
    this.anims.create({
      key: 'speed-spin',
      frames: Array.from({ length: 4 }, (_, i) => ({
        key: `speed-${i + 1}`,
      })),
      frameRate: 6,
      repeat: -1,
    });

    // Coin
    this.anims.create({
      key: 'coin-spin',
      frames: Array.from({ length: 4 }, (_, i) => ({
        key: `coin-${i + 1}`,
      })),
      frameRate: 8,
      repeat: -1,
    });
  }
}
