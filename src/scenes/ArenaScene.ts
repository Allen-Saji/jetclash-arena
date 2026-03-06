import Phaser from 'phaser';
import { Player } from '@/entities/Player';
import { ProjectilePool, Projectile } from '@/entities/Projectile';
import { Pickup } from '@/entities/Pickup';
import { HUD } from '@/components/HUD';
import { P1_CONFIG, P2_CONFIG } from '@/config/player.config';
import { PRIMARY_WEAPON, SECONDARY_WEAPON } from '@/config/weapons.config';
import { MATCH_DURATION, KILL_SCORE, KILL_CAP } from '@/config/match.config';
import { GAME_WIDTH, GAME_HEIGHT, WORLD_WIDTH, WORLD_HEIGHT } from '@/config/game.config';
import { ARENA_PLATFORMS, PICKUP_SPAWNS, SPAWN_POINTS, TREE_DECORATIONS } from '@/config/arena.config';
import { MatchState } from '@/types';

export class ArenaScene extends Phaser.Scene {
  private player1!: Player;
  private player2!: Player;
  private projectiles!: ProjectilePool;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private pickups: Pickup[] = [];
  private hud!: HUD;

  private matchState: MatchState = {
    timeRemaining: MATCH_DURATION,
    scores: { p1: 0, p2: 0 },
    kills: { p1: 0, p2: 0 },
    isActive: false,
    winner: null,
  };

  private matchTimer!: Phaser.Time.TimerEvent;
  private countdownActive: boolean = true;

  constructor() {
    super({ key: 'Arena' });
  }

  create(): void {
    // Reset match state
    this.matchState = {
      timeRemaining: MATCH_DURATION,
      scores: { p1: 0, p2: 0 },
      kills: { p1: 0, p2: 0 },
      isActive: false,
      winner: null,
    };
    this.countdownActive = true;
    this.pickups = [];

    // World bounds
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    // Background
    this.createBackground();

    // Decorations (behind platforms)
    this.createDecorations();

    // Platforms
    this.createPlatforms();

    // Players
    this.player1 = new Player(this, P1_CONFIG);
    this.player2 = new Player(this, P2_CONFIG);

    // Projectile pool
    this.projectiles = new ProjectilePool(this, 40);

    // Pickups
    this.createPickups();

    // Collisions
    this.setupCollisions();

    // Camera - split screen style: follow midpoint between players
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setZoom(1);

    // HUD (after camera so it's on top)
    this.hud = new HUD(this);

    // Countdown
    this.startCountdown();
  }

  private createBackground(): void {
    // Tile the repeated background layer
    const bg = this.add.tileSprite(
      WORLD_WIDTH / 2, WORLD_HEIGHT / 2,
      WORLD_WIDTH, WORLD_HEIGHT,
      'bg1-repeated'
    );
    bg.setScrollFactor(0.2);
    bg.setDepth(-10);

    // Layer 1 - parallax mid
    const layer1 = this.add.image(WORLD_WIDTH / 2, WORLD_HEIGHT - 200, 'bg1-layer1');
    layer1.setDisplaySize(WORLD_WIDTH, 600);
    layer1.setScrollFactor(0.4);
    layer1.setDepth(-9);

    // Layer 2 - parallax near
    const layer2 = this.add.image(WORLD_WIDTH / 2, WORLD_HEIGHT - 100, 'bg1-layer2');
    layer2.setDisplaySize(WORLD_WIDTH, 400);
    layer2.setScrollFactor(0.6);
    layer2.setDepth(-8);
  }

  private createDecorations(): void {
    for (const tree of TREE_DECORATIONS) {
      this.add.image(tree.x, tree.y, tree.key)
        .setScale(tree.scale)
        .setDepth(-5)
        .setAlpha(0.7);
    }
  }

  private createPlatforms(): void {
    this.platforms = this.physics.add.staticGroup();

    for (const plat of ARENA_PLATFORMS) {
      const p = this.platforms.create(plat.x, plat.y, plat.textureKey) as Phaser.Physics.Arcade.Sprite;
      p.setScale(plat.scaleX ?? 1, plat.scaleY ?? 1);
      p.refreshBody();
    }

    // World floor (invisible safety net)
    const floor = this.add.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT - 10, WORLD_WIDTH, 20, 0x000000, 0);
    this.physics.add.existing(floor, true);
    this.platforms.add(floor);
  }

  private createPickups(): void {
    for (const spawn of PICKUP_SPAWNS) {
      const pickup = new Pickup(this, spawn.x, spawn.y, spawn.type);
      this.pickups.push(pickup);
    }
  }

  private setupCollisions(): void {
    // Players vs platforms
    this.physics.add.collider(this.player1.sprite, this.platforms);
    this.physics.add.collider(this.player2.sprite, this.platforms);

    // Players vs each other (prevent overlap)
    this.physics.add.collider(this.player1.sprite, this.player2.sprite);

    // Projectiles vs platforms
    this.physics.add.collider(
      this.projectiles.group,
      this.platforms,
      (obj1, _obj2) => {
        const proj = obj1 as Projectile;
        if (typeof proj.deactivate !== 'function') return;
        if (proj.isRocket) {
          this.spawnExplosion(proj.x, proj.y);
        }
        proj.deactivate();
      }
    );

    // Projectiles vs players
    this.physics.add.overlap(
      this.projectiles.group,
      this.player1.sprite,
      (obj1, obj2) => {
        let proj: Projectile;
        if (typeof (obj1 as any).deactivate === 'function') {
          proj = obj1 as Projectile;
        } else if (typeof (obj2 as any).deactivate === 'function') {
          proj = obj2 as unknown as Projectile;
        } else {
          return;
        }
        if (!proj.active || proj.ownerId === 1) return;
        this.onPlayerHit(this.player1, proj);
      }
    );

    this.physics.add.overlap(
      this.projectiles.group,
      this.player2.sprite,
      (obj1, obj2) => {
        // Try both args — Phaser may pass them in either order
        let proj: Projectile;
        if (typeof (obj1 as any).deactivate === 'function') {
          proj = obj1 as Projectile;
        } else if (typeof (obj2 as any).deactivate === 'function') {
          proj = obj2 as unknown as Projectile;
        } else {
          return;
        }
        if (!proj.active || proj.ownerId === 2) return;
        this.onPlayerHit(this.player2, proj);
      }
    );

    // Players vs pickups
    for (const pickup of this.pickups) {
      this.physics.add.overlap(this.player1.sprite, pickup.sprite, () => {
        pickup.consume(this.player1);
      });
      this.physics.add.overlap(this.player2.sprite, pickup.sprite, () => {
        pickup.consume(this.player2);
      });
    }
  }

  private onPlayerHit(player: Player, proj: Projectile): void {
    if (player.isDead || player.isInvincible || !proj.active) return;

    player.takeDamage(proj.damage);

    // Screen shake on hit
    const intensity = proj.isRocket ? 0.01 : 0.005;
    const duration = proj.isRocket ? 200 : 100;
    this.cameras.main.shake(duration, intensity);

    if (proj.isRocket) {
      this.spawnExplosion(proj.x, proj.y);
    }
    proj.deactivate();

    // Check kill
    if (player.hp <= 0) {
      const killer = proj.ownerId;
      this.onPlayerKill(killer, player);
    }
  }

  private onPlayerKill(killerId: 1 | 2, victim: Player): void {
    if (killerId === 1) {
      this.matchState.kills.p1++;
      this.matchState.scores.p1 += KILL_SCORE;
    } else {
      this.matchState.kills.p2++;
      this.matchState.scores.p2 += KILL_SCORE;
    }

    // Respawn after delay
    this.time.delayedCall(2500, () => {
      if (!this.matchState.isActive) return;
      const spawnIdx = Phaser.Math.Between(0, SPAWN_POINTS.length - 1);
      const sp = SPAWN_POINTS[spawnIdx];
      victim.respawn(sp.x, sp.y);
    });

    // Check kill cap
    if (this.matchState.kills.p1 >= KILL_CAP || this.matchState.kills.p2 >= KILL_CAP) {
      this.endMatch();
    }
  }

  private spawnExplosion(x: number, y: number): void {
    const explosion = this.add.sprite(x, y, 'collision1-1');
    explosion.setScale(1.5);
    explosion.play('explosion');
    explosion.on('animationcomplete', () => explosion.destroy());
  }

  private startCountdown(): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    const countText = this.add.text(cx, cy, '3', {
      fontSize: '80px',
      fontFamily: 'monospace',
      color: '#f5c542',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 6,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(200);

    let count = 3;
    const countInterval = this.time.addEvent({
      delay: 1000,
      callback: () => {
        count--;
        if (count > 0) {
          countText.setText(`${count}`);
          this.tweens.add({
            targets: countText,
            scale: { from: 1.5, to: 1 },
            duration: 300,
            ease: 'Back.easeOut',
          });
        } else if (count === 0) {
          countText.setText('FIGHT!');
          countText.setFontSize(60);
          this.tweens.add({
            targets: countText,
            scale: { from: 1.5, to: 1 },
            alpha: { from: 1, to: 0 },
            duration: 800,
            ease: 'Power2',
            onComplete: () => countText.destroy(),
          });
          this.matchState.isActive = true;
          this.countdownActive = false;
          this.startMatchTimer();
        } else {
          countInterval.destroy();
        }
      },
      repeat: 3,
    });
  }

  private startMatchTimer(): void {
    this.matchTimer = this.time.addEvent({
      delay: 1000,
      callback: () => {
        if (!this.matchState.isActive) return;
        this.matchState.timeRemaining--;
        if (this.matchState.timeRemaining <= 0) {
          this.matchState.timeRemaining = 0;
          this.endMatch();
        }
      },
      repeat: MATCH_DURATION - 1,
    });
  }

  private endMatch(): void {
    this.matchState.isActive = false;
    if (this.matchTimer) this.matchTimer.destroy();

    // Determine winner
    if (this.matchState.scores.p1 > this.matchState.scores.p2) {
      this.matchState.winner = 1;
    } else if (this.matchState.scores.p2 > this.matchState.scores.p1) {
      this.matchState.winner = 2;
    } else {
      // Tie goes to whoever has more kills; if still tied, P1 wins
      this.matchState.winner = this.matchState.kills.p1 >= this.matchState.kills.p2 ? 1 : 2;
    }

    // Brief delay then result screen
    this.time.delayedCall(1500, () => {
      this.scene.start('Result', { matchState: this.matchState });
    });
  }

  private handleShooting(): void {
    if (!this.matchState.isActive) return;
    const now = this.time.now;

    // P1 primary
    if (this.player1.keys.shoot.isDown && this.player1.canFirePrimary(now)) {
      this.fireWeapon(this.player1, PRIMARY_WEAPON);
      this.player1.lastPrimaryFire = now;
      this.player1.primaryAmmo--;
    }
    // P1 secondary
    if (Phaser.Input.Keyboard.JustDown(this.player1.keys.secondary) && this.player1.canFireSecondary(now)) {
      this.fireWeapon(this.player1, SECONDARY_WEAPON);
      this.player1.lastSecondaryFire = now;
      this.player1.secondaryAmmo--;
    }

    // P2 primary
    if (this.player2.keys.shoot.isDown && this.player2.canFirePrimary(now)) {
      this.fireWeapon(this.player2, PRIMARY_WEAPON);
      this.player2.lastPrimaryFire = now;
      this.player2.primaryAmmo--;
    }
    // P2 secondary
    if (Phaser.Input.Keyboard.JustDown(this.player2.keys.secondary) && this.player2.canFireSecondary(now)) {
      this.fireWeapon(this.player2, SECONDARY_WEAPON);
      this.player2.lastSecondaryFire = now;
      this.player2.secondaryAmmo--;
    }
  }

  private fireWeapon(player: Player, weapon: typeof PRIMARY_WEAPON): void {
    const offsetX = player.facingRight ? 50 : -50;
    // Use different bullet texture per player
    const actualWeapon = { ...weapon };
    if (weapon.projectileKey === 'bullet' && player.config.id === 2) {
      actualWeapon.projectileKey = 'bullet-p2';
    }
    this.projectiles.fire(
      player.sprite.x + offsetX,
      player.sprite.y - 20,
      player.facingRight,
      actualWeapon,
      player.config.id
    );
  }

  update(_time: number, delta: number): void {
    if (this.countdownActive) return;

    this.player1.update(delta);
    this.player2.update(delta);
    this.handleShooting();
    this.hud.update(this.player1, this.player2, this.matchState);

    // Camera follows midpoint between players
    const midX = (this.player1.sprite.x + this.player2.sprite.x) / 2;
    const midY = (this.player1.sprite.y + this.player2.sprite.y) / 2;
    this.cameras.main.centerOn(midX, midY);
  }
}
