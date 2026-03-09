import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '@/config/game.config';

export interface TxEntry {
  label: string;
  sig: string;
  status: 'pending' | 'confirmed' | 'failed';
  time: number;
}

const MAX_VISIBLE = 8;
const FADE_MS = 6000;

/**
 * On-screen transaction log overlay.
 * Shows recent on-chain transactions scrolling upward.
 */
export class TxLog {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private entries: TxEntry[] = [];
  private textObjects: Phaser.GameObjects.Text[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0);
    this.container.setScrollFactor(0);
    this.container.setDepth(500);
  }

  add(label: string, sig: string, status: 'pending' | 'confirmed' | 'failed' = 'pending'): void {
    const entry: TxEntry = { label, sig, status, time: Date.now() };
    this.entries.push(entry);

    // Trim old entries
    if (this.entries.length > 30) {
      this.entries = this.entries.slice(-30);
    }

    this.rebuild();
  }

  confirm(sig: string): void {
    const entry = this.entries.find(e => e.sig === sig);
    if (entry) {
      entry.status = 'confirmed';
      this.rebuild();
    }
  }

  fail(sig: string): void {
    const entry = this.entries.find(e => e.sig === sig);
    if (entry) {
      entry.status = 'failed';
      this.rebuild();
    }
  }

  update(): void {
    // Fade out old entries
    const now = Date.now();
    let needsRebuild = false;
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (now - this.entries[i].time > FADE_MS && this.entries[i].status !== 'pending') {
        this.entries.splice(i, 1);
        needsRebuild = true;
      }
    }
    if (needsRebuild) this.rebuild();
  }

  setZoomCompensation(zoom: number): void {
    const invZoom = 1 / zoom;
    this.container.setScale(invZoom);
    this.container.setPosition(
      (1 - invZoom) * GAME_WIDTH / 2,
      (1 - invZoom) * GAME_HEIGHT / 2,
    );
  }

  private rebuild(): void {
    // Clear old text objects
    for (const t of this.textObjects) t.destroy();
    this.textObjects = [];

    const visible = this.entries.slice(-MAX_VISIBLE);
    const x = 10;
    const baseY = GAME_HEIGHT - 20;

    for (let i = 0; i < visible.length; i++) {
      const entry = visible[visible.length - 1 - i]; // newest at bottom
      const y = baseY - i * 18;
      const sigShort = entry.sig.slice(0, 8) + '..';
      const icon = entry.status === 'confirmed' ? '\u2713' // checkmark
        : entry.status === 'failed' ? '\u2717'  // X
        : '\u25CB'; // circle
      const color = entry.status === 'confirmed' ? '#44ff88'
        : entry.status === 'failed' ? '#ff4444'
        : '#ffff88';

      const age = Date.now() - entry.time;
      const alpha = entry.status === 'pending' ? 1 : Math.max(0.3, 1 - age / FADE_MS);

      const t = this.scene.add.text(x, y, `${icon} ${entry.label}  ${sigShort}`, {
        fontSize: '11px',
        fontFamily: 'monospace',
        color,
      }).setAlpha(alpha);
      this.container.add(t);
      this.textObjects.push(t);
    }
  }

  destroy(): void {
    this.container.destroy(true);
  }
}
