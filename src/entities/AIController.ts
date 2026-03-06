import Phaser from 'phaser';
import { Player } from './Player';
import { PLAYER_PHYSICS } from '@/config/player.config';
import { PRIMARY_WEAPON, SECONDARY_WEAPON } from '@/config/weapons.config';
import { SPAWN_POINTS } from '@/config/arena.config';
import { sfx } from '@/audio/SoundGenerator';

/**
 * AI controller that drives a Player entity by simulating key presses.
 * Replaces keyboard input with decision-making logic.
 */
export class AIController {
  private scene: Phaser.Scene;
  private ai: Player;
  private target: Player;

  // AI decision state
  private moveDir: -1 | 0 | 1 = 0;
  private wantJet: boolean = false;
  private wantShoot: boolean = false;
  private wantSecondary: boolean = false;
  private wantDash: boolean = false;

  // Timing
  private decisionTimer: number = 0;
  private static DECISION_INTERVAL = 200; // ms between AI decisions
  private lastDashTime: number = 0;
  private lastSecondaryTime: number = 0;

  // Difficulty tuning
  private accuracy: number = 0.7; // 0-1, chance to shoot when aligned
  private aggression: number = 0.6; // 0-1, how much it pushes toward target
  private reactionDelay: number = 150; // ms delay before reacting to events

  constructor(scene: Phaser.Scene, ai: Player, target: Player) {
    this.scene = scene;
    this.ai = ai;
    this.target = target;
  }

  update(delta: number): void {
    if (this.ai.isDead) {
      this.moveDir = 0;
      this.wantJet = false;
      this.wantShoot = false;
      this.wantSecondary = false;
      this.wantDash = false;
      return;
    }

    this.decisionTimer += delta;
    if (this.decisionTimer >= AIController.DECISION_INTERVAL) {
      this.decisionTimer = 0;
      this.makeDecision();
    }

    this.applyInputs(delta);
  }

  private makeDecision(): void {
    const aiX = this.ai.sprite.x;
    const aiY = this.ai.sprite.y;
    const targetX = this.target.sprite.x;
    const targetY = this.target.sprite.y;

    const dx = targetX - aiX;
    const dy = targetY - aiY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    const body = this.ai.body;
    const onGround = body.blocked.down || body.touching.down;
    const now = this.scene.time.now;

    // --- Movement ---
    // Move toward target with some randomness
    if (Math.random() < this.aggression) {
      if (absDx > 80) {
        this.moveDir = dx > 0 ? 1 : -1;
      } else {
        // Close enough, strafe randomly
        this.moveDir = Math.random() > 0.5 ? 1 : -1;
      }
    } else {
      // Random movement
      const r = Math.random();
      if (r < 0.3) this.moveDir = -1;
      else if (r < 0.6) this.moveDir = 1;
      else this.moveDir = 0;
    }

    // --- Jetpack ---
    // Fly toward target if they're above us, or to reach platforms
    if (dy < -100 && this.ai.fuel > 20) {
      this.wantJet = true;
    } else if (!onGround && body.velocity.y > 200 && this.ai.fuel > 10) {
      // Slow fall
      this.wantJet = Math.random() < 0.4;
    } else if (this.ai.fuel > 50 && Math.random() < 0.15) {
      // Random jetpack burst for unpredictability
      this.wantJet = true;
    } else {
      this.wantJet = false;
    }

    // --- Shooting ---
    // Face toward target
    const facingTarget = (dx > 0 && this.ai.facingRight) || (dx < 0 && !this.ai.facingRight);

    // Check vertical alignment for shooting (bullets travel horizontally)
    const verticallyAligned = absDy < 80;

    if (facingTarget && verticallyAligned && dist < 800) {
      this.wantShoot = Math.random() < this.accuracy;
    } else if (facingTarget && dist < 400) {
      // Close range, shoot even if not perfectly aligned
      this.wantShoot = Math.random() < this.accuracy * 0.6;
    } else {
      this.wantShoot = false;
    }

    // --- Secondary weapon (rocket) ---
    if (facingTarget && verticallyAligned && dist < 500 && dist > 150
      && this.ai.secondaryAmmo > 0 && now - this.lastSecondaryTime > 2000) {
      this.wantSecondary = Math.random() < 0.3;
      if (this.wantSecondary) this.lastSecondaryTime = now;
    } else {
      this.wantSecondary = false;
    }

    // --- Dash ---
    // Dash to close distance or dodge when taking fire
    if (dist < 200 && dist > 60 && now - this.lastDashTime > 4000 && Math.random() < 0.25) {
      this.wantDash = true;
      this.lastDashTime = now;
    } else if (this.ai.hp < 40 && dist < 300 && now - this.lastDashTime > 4000 && Math.random() < 0.3) {
      // Dash away when low HP
      this.moveDir = dx > 0 ? -1 : 1; // move away
      this.wantDash = true;
      this.lastDashTime = now;
    } else {
      this.wantDash = false;
    }

    // --- Pickup awareness ---
    // If low HP, try to move toward nearest health pickup
    if (this.ai.hp < 50) {
      let nearestPickupDist = Infinity;
      let nearestPickupX = 0;
      let nearestPickupY = 0;
      // Check pickup spawns (we don't have direct pickup refs, but we know the spawn positions)
      for (const sp of SPAWN_POINTS) {
        // Use spawn points as proxy — imperfect but adds interesting behavior
        const pdx = sp.x - aiX;
        const pdy = sp.y - aiY;
        const pd = Math.sqrt(pdx * pdx + pdy * pdy);
        if (pd < nearestPickupDist) {
          nearestPickupDist = pd;
          nearestPickupX = sp.x;
          nearestPickupY = sp.y;
        }
      }
      // Bias movement toward pickup if closer than target
      if (nearestPickupDist < dist * 0.7) {
        const pdx = nearestPickupX - aiX;
        this.moveDir = pdx > 0 ? 1 : -1;
        if (nearestPickupY < aiY - 50 && this.ai.fuel > 20) {
          this.wantJet = true;
        }
      }
    }
  }

  private applyInputs(delta: number): void {
    const body = this.ai.body;
    const speed = PLAYER_PHYSICS.moveSpeed * this.ai.speedMultiplier;
    const onGround = body.blocked.down || body.touching.down;

    // Movement
    if (this.moveDir === -1) {
      body.setVelocityX(-speed);
      this.ai.facingRight = false;
      this.ai.sprite.setFlipX(true);
    } else if (this.moveDir === 1) {
      body.setVelocityX(speed);
      this.ai.facingRight = true;
      this.ai.sprite.setFlipX(false);
    } else {
      body.setVelocityX(0);
    }

    // Jetpack
    if (this.wantJet && this.ai.fuel > 0) {
      body.setVelocityY(PLAYER_PHYSICS.jetpackForce);
      this.ai.fuel -= PLAYER_PHYSICS.jetpackFuelDrain * (delta / 1000);
      if (this.ai.fuel < 0) this.ai.fuel = 0;
    }

    // Fuel regen on ground
    if (onGround && !this.wantJet) {
      this.ai.fuel = Math.min(
        this.ai.fuel + PLAYER_PHYSICS.jetpackFuelRegen * (delta / 1000),
        PLAYER_PHYSICS.jetpackFuelMax
      );
    }

    // Dash
    if (this.wantDash) {
      sfx.dash();
      const dashVx = this.ai.facingRight ? 600 : -600;
      body.setVelocityX(dashVx);
      this.ai.isInvincible = true;
      this.ai.sprite.setAlpha(0.5);
      this.scene.time.delayedCall(180, () => {
        this.ai.isInvincible = false;
        this.ai.sprite.setAlpha(1);
      });
      this.wantDash = false;
    }

    // Smoke effect
    const jetting = this.wantJet && this.ai.fuel > 0;
    this.ai.updateSmoke(jetting);

    // Animations
    const moving = this.moveDir !== 0;
    const prefix = this.ai.config.id === 1 ? 'p1' : 'p2';
    const currentAnim = this.ai.sprite.anims.currentAnim?.key || '';

    if (jetting) {
      if (currentAnim !== `${prefix}-fly`) this.ai.sprite.play(`${prefix}-fly`);
    } else if (!onGround) {
      if (currentAnim !== `${prefix}-jump`) this.ai.sprite.play(`${prefix}-jump`);
    } else if (moving) {
      if (currentAnim !== `${prefix}-walk`) this.ai.sprite.play(`${prefix}-walk`);
    } else {
      if (currentAnim !== `${prefix}-idle`) this.ai.sprite.play(`${prefix}-idle`);
    }

    // Invincibility flash (same as Player)
    if (this.ai.isInvincible) {
      this.ai.sprite.setAlpha(Math.sin(this.scene.time.now * 0.01) > 0 ? 1 : 0.3);
    }
  }

  /** Called by ArenaScene to check if AI wants to fire primary */
  shouldShootPrimary(): boolean {
    return this.wantShoot && !this.ai.isDead;
  }

  /** Called by ArenaScene to check if AI wants to fire secondary */
  shouldShootSecondary(): boolean {
    const result = this.wantSecondary && !this.ai.isDead;
    if (result) this.wantSecondary = false; // consume
    return result;
  }
}
