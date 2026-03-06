import Phaser from 'phaser';
import { PlayerConfig, ControlScheme } from '@/types';
import { PLAYER_PHYSICS } from '@/config/player.config';
import { PRIMARY_WEAPON, SECONDARY_WEAPON } from '@/config/weapons.config';
import { sfx } from '@/audio/SoundGenerator';

export class Player {
  scene: Phaser.Scene;
  sprite: Phaser.GameObjects.Sprite;
  body: Phaser.Physics.Arcade.Body;
  config: PlayerConfig;
  keys: Record<string, Phaser.Input.Keyboard.Key>;

  // State
  hp: number = PLAYER_PHYSICS.maxHP;
  fuel: number = PLAYER_PHYSICS.jetpackFuelMax;
  facingRight: boolean;
  isDead: boolean = false;
  isInvincible: boolean = false;

  // Weapons
  primaryAmmo: number = PRIMARY_WEAPON.ammo;
  secondaryAmmo: number = SECONDARY_WEAPON.ammo;
  lastPrimaryFire: number = 0;
  lastSecondaryFire: number = 0;

  // Jetpack smoke
  private smokeEmitter: Phaser.GameObjects.Sprite | null = null;

  // Prefix for animation keys
  private animPrefix: string;

  // Speed buff
  speedMultiplier: number = 1;
  private speedBuffTimer?: Phaser.Time.TimerEvent;

  // Dash
  private lastDash: number = 0;
  private dashActive: boolean = false;
  private static DASH_COOLDOWN = 3000; // ms
  private static DASH_SPEED = 600;
  private static DASH_DURATION = 200; // ms

  constructor(scene: Phaser.Scene, config: PlayerConfig) {
    this.scene = scene;
    this.config = config;
    this.facingRight = config.facingRight;
    this.animPrefix = config.id === 1 ? 'p1' : 'p2';

    // Create sprite
    this.sprite = scene.add.sprite(config.spawnX, config.spawnY, `${this.animPrefix}-idle-1`);
    this.sprite.setScale(1.3);
    this.sprite.setFlipX(!this.facingRight);

    // Physics
    scene.physics.add.existing(this.sprite);
    this.body = this.sprite.body as Phaser.Physics.Arcade.Body;
    this.body.setCollideWorldBounds(true);
    this.body.setSize(40, 50);
    this.body.setOffset(55, 58);
    this.body.setMaxVelocity(PLAYER_PHYSICS.moveSpeed * 1.5, 600);

    // Input
    this.keys = this.setupKeys(config.controls);

    // Smoke effect
    this.smokeEmitter = scene.add.sprite(0, 0, 'smoke-1');
    this.smokeEmitter.setScale(0.6);
    this.smokeEmitter.setVisible(false);

    // Start idle animation
    this.sprite.play(`${this.animPrefix}-idle`);

    // Store player ref on sprite for collision callbacks
    this.sprite.setData('player', this);
  }

  private setupKeys(controls: ControlScheme): Record<string, Phaser.Input.Keyboard.Key> {
    const keyboard = this.scene.input.keyboard!;
    return {
      left: keyboard.addKey(controls.left),
      right: keyboard.addKey(controls.right),
      up: keyboard.addKey(controls.up),
      down: keyboard.addKey(controls.down),
      shoot: keyboard.addKey(controls.shoot),
      secondary: keyboard.addKey(controls.secondary),
      utility: keyboard.addKey(controls.utility),
    };
  }

  update(delta: number): void {
    if (this.isDead) return;

    const onGround = this.body.blocked.down || this.body.touching.down;
    const speed = PLAYER_PHYSICS.moveSpeed * this.speedMultiplier;
    let moving = false;

    // Horizontal movement (skip if dashing)
    if (!this.dashActive) {
      if (this.keys.left.isDown) {
        this.body.setVelocityX(-speed);
        this.facingRight = false;
        this.sprite.setFlipX(true);
        moving = true;
      } else if (this.keys.right.isDown) {
        this.body.setVelocityX(speed);
        this.facingRight = true;
        this.sprite.setFlipX(false);
        moving = true;
      } else {
        this.body.setVelocityX(0);
      }
    } else {
      moving = true;
    }

    // Jetpack
    const jetting = this.keys.up.isDown && this.fuel > 0;
    if (jetting) {
      this.body.setVelocityY(PLAYER_PHYSICS.jetpackForce);
      this.fuel -= PLAYER_PHYSICS.jetpackFuelDrain * (delta / 1000);
      if (this.fuel < 0) this.fuel = 0;
    }

    // Dash
    if (Phaser.Input.Keyboard.JustDown(this.keys.utility) && !this.dashActive) {
      const now = this.scene.time.now;
      if (now - this.lastDash >= Player.DASH_COOLDOWN) {
        this.lastDash = now;
        this.dashActive = true;
        sfx.dash();
        const dashVx = this.facingRight ? Player.DASH_SPEED : -Player.DASH_SPEED;
        this.body.setVelocityX(dashVx);
        this.isInvincible = true;
        this.sprite.setAlpha(0.5);
        this.scene.time.delayedCall(Player.DASH_DURATION, () => {
          this.dashActive = false;
          this.isInvincible = false;
          this.sprite.setAlpha(1);
        });
      }
    }

    // Fuel regen on ground
    if (onGround && !jetting) {
      this.fuel = Math.min(
        this.fuel + PLAYER_PHYSICS.jetpackFuelRegen * (delta / 1000),
        PLAYER_PHYSICS.jetpackFuelMax
      );
    }

    // Animations
    if (this.isDead) return;
    const currentAnim = this.sprite.anims.currentAnim?.key || '';

    if (jetting) {
      if (currentAnim !== `${this.animPrefix}-fly`) {
        this.sprite.play(`${this.animPrefix}-fly`);
      }
    } else if (!onGround) {
      if (currentAnim !== `${this.animPrefix}-jump`) {
        this.sprite.play(`${this.animPrefix}-jump`);
      }
    } else if (moving) {
      if (currentAnim !== `${this.animPrefix}-walk`) {
        this.sprite.play(`${this.animPrefix}-walk`);
      }
    } else {
      if (currentAnim !== `${this.animPrefix}-idle`) {
        this.sprite.play(`${this.animPrefix}-idle`);
      }
    }

    // Jetpack smoke
    if (this.smokeEmitter) {
      if (jetting) {
        this.smokeEmitter.setVisible(true);
        this.smokeEmitter.setPosition(
          this.sprite.x + (this.facingRight ? -20 : 20),
          this.sprite.y + 45
        );
        if (!this.smokeEmitter.anims.isPlaying) {
          this.smokeEmitter.play('jetpack-smoke');
        }
      } else {
        this.smokeEmitter.setVisible(false);
        this.smokeEmitter.stop();
      }
    }

    // Invincibility flash
    if (this.isInvincible) {
      this.sprite.setAlpha(Math.sin(this.scene.time.now * 0.01) > 0 ? 1 : 0.3);
    }
  }

  takeDamage(amount: number): void {
    if (this.isDead || this.isInvincible) return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
    } else {
      // Damage flash
      this.sprite.setTint(0xff0000);
      this.scene.time.delayedCall(100, () => {
        if (!this.isDead) this.sprite.clearTint();
      });
    }
  }

  die(): void {
    this.isDead = true;
    this.sprite.play(`${this.animPrefix}-die`);
    this.body.setVelocity(0, 0);
    this.body.setAllowGravity(false);
    if (this.smokeEmitter) this.smokeEmitter.setVisible(false);
  }

  respawn(x: number, y: number): void {
    this.isDead = false;
    this.hp = PLAYER_PHYSICS.maxHP;
    this.fuel = PLAYER_PHYSICS.jetpackFuelMax;
    this.primaryAmmo = PRIMARY_WEAPON.ammo;
    this.secondaryAmmo = SECONDARY_WEAPON.ammo;
    this.sprite.setPosition(x, y);
    this.sprite.setAlpha(1);
    this.sprite.clearTint();
    this.body.setAllowGravity(true);
    this.body.setVelocity(0, 0);
    this.sprite.play(`${this.animPrefix}-idle`);

    // Brief invincibility
    this.isInvincible = true;
    this.scene.time.delayedCall(PLAYER_PHYSICS.invincibilityTime, () => {
      this.isInvincible = false;
      this.sprite.setAlpha(1);
    });
  }

  canFirePrimary(now: number): boolean {
    if (this.isDead) return false;
    if (this.primaryAmmo <= 0) {
      // Auto reload
      if (now - this.lastPrimaryFire >= PRIMARY_WEAPON.reloadTime) {
        this.primaryAmmo = PRIMARY_WEAPON.maxAmmo;
      }
      return false;
    }
    return now - this.lastPrimaryFire >= PRIMARY_WEAPON.fireRate;
  }

  canFireSecondary(now: number): boolean {
    if (this.isDead) return false;
    if (this.secondaryAmmo <= 0) {
      if (now - this.lastSecondaryFire >= SECONDARY_WEAPON.reloadTime) {
        this.secondaryAmmo = SECONDARY_WEAPON.maxAmmo;
      }
      return false;
    }
    return now - this.lastSecondaryFire >= SECONDARY_WEAPON.fireRate;
  }

  applySpeedBuff(multiplier: number, duration: number): void {
    this.speedMultiplier = multiplier;
    if (this.speedBuffTimer) this.speedBuffTimer.destroy();
    this.speedBuffTimer = this.scene.time.delayedCall(duration, () => {
      this.speedMultiplier = 1;
    });
  }

  heal(amount: number): void {
    if (this.isDead) return;
    this.hp = Math.min(this.hp + amount, PLAYER_PHYSICS.maxHP);
  }

  /** Update jetpack smoke visual — called by AIController when bypassing update() */
  updateSmoke(jetting: boolean): void {
    if (!this.smokeEmitter) return;
    if (jetting) {
      this.smokeEmitter.setVisible(true);
      this.smokeEmitter.setPosition(
        this.sprite.x + (this.facingRight ? -20 : 20),
        this.sprite.y + 45
      );
      if (!this.smokeEmitter.anims.isPlaying) {
        this.smokeEmitter.play('jetpack-smoke');
      }
    } else {
      this.smokeEmitter.setVisible(false);
      this.smokeEmitter.stop();
    }
  }

  destroy(): void {
    this.sprite.destroy();
    if (this.smokeEmitter) this.smokeEmitter.destroy();
  }
}
