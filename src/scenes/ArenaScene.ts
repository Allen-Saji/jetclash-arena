import Phaser from 'phaser';
import { Player } from '@/entities/Player';
import { AIController } from '@/entities/AIController';
import { ProjectilePool, Projectile } from '@/entities/Projectile';
import { Pickup } from '@/entities/Pickup';
import { HUD } from '@/components/HUD';
import { P1_CONFIG, P2_CONFIG } from '@/config/player.config';
import { PRIMARY_WEAPON, SECONDARY_WEAPON } from '@/config/weapons.config';
import { MATCH_DURATION, KILL_SCORE, KILL_CAP } from '@/config/match.config';
import { GAME_WIDTH, GAME_HEIGHT, WORLD_WIDTH, WORLD_HEIGHT } from '@/config/game.config';
import { ARENA_PLATFORMS, PICKUP_SPAWNS, SPAWN_POINTS, TREE_DECORATIONS } from '@/config/arena.config';
import { MatchState } from '@/types';
import { sfx } from '@/audio/SoundGenerator';

export class ArenaScene extends Phaser.Scene {
  private player1!: Player;
  private player2!: Player;
  private aiController: AIController | null = null;
  private aiMode: boolean = false;
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

  create(data: { aiMode?: boolean }): void {
    this.aiMode = data?.aiMode ?? false;

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
    this.aiController = null;

    // Init audio
    sfx.init();

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

    // AI controller for P2
    if (this.aiMode) {
      this.aiController = new AIController(this, this.player2, this.player1);
    }

    // Projectile pool
    this.projectiles = new ProjectilePool(this, 40);

    // Pickups
    this.createPickups();

    // Collisions
    this.setupCollisions();

    // Camera — fixed zoom showing full arena, smooth follow midpoint
    const cam = this.cameras.main;
    cam.setZoom(0.55);
    cam.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    cam.centerOn(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);

    // HUD (after camera so it's on top)
    this.hud = new HUD(this);

    // Mute key
    this.input.keyboard!.on('keydown-M', () => {
      sfx.toggleMute();
    });

    // Countdown
    this.startCountdown();
  }

  private bgTile!: Phaser.GameObjects.TileSprite;
  private bgLayer1!: Phaser.GameObjects.Image;
  private bgLayer2!: Phaser.GameObjects.Image;

  private createBackground(): void {
    // Tile sprite covers viewport at lowest zoom (0.55) — needs ~2x world size
    const bgW = WORLD_WIDTH * 2;
    const bgH = WORLD_HEIGHT * 2;
    this.bgTile = this.add.tileSprite(0, 0, bgW, bgH, 'bg1-repeated');
    this.bgTile.setScrollFactor(0);
    this.bgTile.setDepth(-10);

    // Parallax layers anchored to world bottom
    this.bgLayer1 = this.add.image(WORLD_WIDTH / 2, WORLD_HEIGHT - 200, 'bg1-layer1');
    this.bgLayer1.setDisplaySize(WORLD_WIDTH * 2, 800);
    this.bgLayer1.setScrollFactor(0.3);
    this.bgLayer1.setDepth(-9);
    this.bgLayer1.setAlpha(0.5);

    this.bgLayer2 = this.add.image(WORLD_WIDTH / 2, WORLD_HEIGHT - 100, 'bg1-layer2');
    this.bgLayer2.setDisplaySize(WORLD_WIDTH * 2, 600);
    this.bgLayer2.setScrollFactor(0.5);
    this.bgLayer2.setDepth(-8);
    this.bgLayer2.setAlpha(0.6);
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

    // Players vs each other
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
        if (!pickup.isConsumed) sfx.pickup();
        pickup.consume(this.player1);
      });
      this.physics.add.overlap(this.player2.sprite, pickup.sprite, () => {
        if (!pickup.isConsumed) sfx.pickup();
        pickup.consume(this.player2);
      });
    }
  }

  private onPlayerHit(player: Player, proj: Projectile): void {
    if (player.isDead || player.isInvincible || !proj.active) return;

    player.takeDamage(proj.damage);
    sfx.hit();

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
    sfx.kill();

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
    sfx.explosion();
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

    // Show AI mode indicator
    if (this.aiMode) {
      const aiLabel = this.add.text(cx, cy + 80, 'VS AI', {
        fontSize: '24px',
        fontFamily: 'monospace',
        color: '#ff6644',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 3,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(200);

      this.time.delayedCall(4000, () => aiLabel.destroy());
    }

    sfx.countdownBeep();

    let count = 3;
    const countInterval = this.time.addEvent({
      delay: 1000,
      callback: () => {
        count--;
        if (count > 0) {
          countText.setText(`${count}`);
          sfx.countdownBeep();
          this.tweens.add({
            targets: countText,
            scale: { from: 1.5, to: 1 },
            duration: 300,
            ease: 'Back.easeOut',
          });
        } else if (count === 0) {
          countText.setText('FIGHT!');
          countText.setFontSize(60);
          sfx.fightBeep();
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
    sfx.matchEnd();

    // Determine winner
    if (this.matchState.scores.p1 > this.matchState.scores.p2) {
      this.matchState.winner = 1;
    } else if (this.matchState.scores.p2 > this.matchState.scores.p1) {
      this.matchState.winner = 2;
    } else {
      this.matchState.winner = this.matchState.kills.p1 >= this.matchState.kills.p2 ? 1 : 2;
    }

    this.time.delayedCall(1500, () => {
      this.scene.start('Result', { matchState: this.matchState, aiMode: this.aiMode });
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
    // P1 secondary (G key - use isDown since fireRate handles limiting)
    if (this.player1.keys.secondary.isDown && this.player1.canFireSecondary(now)) {
      this.fireWeapon(this.player1, SECONDARY_WEAPON);
      this.player1.lastSecondaryFire = now;
      this.player1.secondaryAmmo--;
    }

    if (this.aiMode && this.aiController) {
      // AI shooting
      if (this.aiController.shouldShootPrimary() && this.player2.canFirePrimary(now)) {
        this.fireWeapon(this.player2, PRIMARY_WEAPON);
        this.player2.lastPrimaryFire = now;
        this.player2.primaryAmmo--;
      }
      if (this.aiController.shouldShootSecondary() && this.player2.canFireSecondary(now)) {
        this.fireWeapon(this.player2, SECONDARY_WEAPON);
        this.player2.lastSecondaryFire = now;
        this.player2.secondaryAmmo--;
      }
    } else {
      // P2 primary (keyboard)
      if (this.player2.keys.shoot.isDown && this.player2.canFirePrimary(now)) {
        this.fireWeapon(this.player2, PRIMARY_WEAPON);
        this.player2.lastPrimaryFire = now;
        this.player2.primaryAmmo--;
      }
      // P2 secondary
      if (this.player2.keys.secondary.isDown && this.player2.canFireSecondary(now)) {
        this.fireWeapon(this.player2, SECONDARY_WEAPON);
        this.player2.lastSecondaryFire = now;
        this.player2.secondaryAmmo--;
      }
    }
  }

  private fireWeapon(player: Player, weapon: typeof PRIMARY_WEAPON): void {
    const offsetX = player.facingRight ? 35 : -35;
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

    // Sound
    if (weapon === SECONDARY_WEAPON) {
      sfx.rocket();
    } else {
      sfx.shoot();
    }
  }

  update(_time: number, delta: number): void {
    if (this.countdownActive) return;

    // Update P1 always via keyboard
    this.player1.update(delta);

    // P2: AI or keyboard
    if (this.aiMode && this.aiController) {
      this.aiController.update(delta);
    } else {
      this.player2.update(delta);
    }

    this.handleShooting();
    this.hud.update(this.player1, this.player2, this.matchState);

    // Camera: smooth follow midpoint between players
    const midX = (this.player1.sprite.x + this.player2.sprite.x) / 2;
    const midY = (this.player1.sprite.y + this.player2.sprite.y) / 2;
    const cam = this.cameras.main;
    const lerpFactor = 0.08;
    cam.scrollX += (midX - cam.width / 2 - cam.scrollX) * lerpFactor;
    cam.scrollY += (midY - cam.height / 2 - cam.scrollY) * lerpFactor;

    // Keep bg tile centered on camera viewport
    this.bgTile.setPosition(cam.scrollX + cam.width / 2, cam.scrollY + cam.height / 2);

    // Scale HUD inversely to zoom so it stays readable
    this.hud.setZoomCompensation(cam.zoom);
  }
}
