import Phaser from 'phaser';
import { Player } from './Player';
import { PICKUP_RESPAWN_TIME } from '@/config/match.config';

export type PickupType = 'health' | 'speed';

export class Pickup {
  scene: Phaser.Scene;
  sprite: Phaser.Physics.Arcade.Sprite;
  type: PickupType;
  spawnX: number;
  spawnY: number;
  isConsumed: boolean = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    type: PickupType
  ) {
    this.scene = scene;
    this.type = type;
    this.spawnX = x;
    this.spawnY = y;

    const textureKey = type === 'health' ? 'heal-1' : 'speed-1';
    this.sprite = scene.physics.add.sprite(x, y, textureKey);
    this.sprite.setScale(1.2);

    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setImmovable(true);

    // Play animation
    const animKey = type === 'health' ? 'heal-spin' : 'speed-spin';
    this.sprite.play(animKey);

    // Float bob
    scene.tweens.add({
      targets: this.sprite,
      y: y - 8,
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.sprite.setData('pickup', this);
  }

  consume(player: Player): void {
    if (this.isConsumed) return;
    this.isConsumed = true;

    if (this.type === 'health') {
      player.heal(30);
    } else if (this.type === 'speed') {
      player.applySpeedBuff(1.5, 5000);
    }

    this.sprite.setVisible(false);
    this.sprite.setActive(false);
    (this.sprite.body as Phaser.Physics.Arcade.Body).enable = false;

    // Respawn after delay
    this.scene.time.delayedCall(PICKUP_RESPAWN_TIME, () => {
      this.respawn();
    });
  }

  private respawn(): void {
    this.isConsumed = false;
    this.sprite.setPosition(this.spawnX, this.spawnY);
    this.sprite.setVisible(true);
    this.sprite.setActive(true);
    (this.sprite.body as Phaser.Physics.Arcade.Body).enable = true;
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
