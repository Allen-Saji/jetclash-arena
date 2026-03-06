import Phaser from 'phaser';
import { WeaponStats } from '@/types';

export class Projectile extends Phaser.Physics.Arcade.Sprite {
  damage: number = 0;
  ownerId: 1 | 2 = 1;
  isRocket: boolean = false;

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string) {
    super(scene, x, y, texture);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setActive(false).setVisible(false);
  }

  fire(
    x: number,
    y: number,
    facingRight: boolean,
    weapon: WeaponStats,
    ownerId: 1 | 2
  ): void {
    this.setPosition(x, y);
    this.setActive(true).setVisible(true);
    this.damage = weapon.damage;
    this.ownerId = ownerId;
    this.isRocket = weapon.projectileKey === 'rocket';

    const body = this.body as Phaser.Physics.Arcade.Body;
    const vx = facingRight ? weapon.projectileSpeed : -weapon.projectileSpeed;
    body.setVelocityX(vx);
    body.setAllowGravity(this.isRocket);
    body.setSize(30, 16);

    // Scale projectiles for visibility
    this.clearTint();
    this.setScale(this.isRocket ? 1.5 : 1.2);
    this.setFlipX(!facingRight);

    // Auto-destroy after 3 seconds
    this.scene.time.delayedCall(3000, () => {
      this.deactivate();
    });
  }

  deactivate(): void {
    this.setActive(false).setVisible(false);
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.setPosition(-100, -100);
  }
}

export class ProjectilePool {
  private pool: Projectile[] = [];
  private scene: Phaser.Scene;
  group: Phaser.Physics.Arcade.Group;

  constructor(scene: Phaser.Scene, size: number = 30) {
    this.scene = scene;
    this.group = scene.physics.add.group({
      classType: Projectile,
      runChildUpdate: false,
    });

    for (let i = 0; i < size; i++) {
      const proj = new Projectile(scene, -100, -100, 'bullet');
      this.pool.push(proj);
      this.group.add(proj);
    }
  }

  fire(
    x: number,
    y: number,
    facingRight: boolean,
    weapon: WeaponStats,
    ownerId: 1 | 2
  ): Projectile | null {
    const proj = this.pool.find(p => !p.active);
    if (!proj) return null;

    proj.setTexture(weapon.projectileKey);
    proj.fire(x, y, facingRight, weapon, ownerId);
    return proj;
  }
}
