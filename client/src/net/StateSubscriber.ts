import { Connection, PublicKey } from '@solana/web3.js';
import type {
  GameStateSnapshot,
  OnChainMatchState,
  OnChainPlayerState,
  OnChainProjectile,
  OnChainPickup,
} from './types';

type StateCallback = (snapshot: GameStateSnapshot) => void;

/**
 * Subscribes to on-chain account changes via WebSocket.
 * Deserializes BOLT component data and emits unified game state snapshots.
 */
export class StateSubscriber {
  private connection: Connection;
  private subscriptionIds: number[] = [];
  private callback: StateCallback;

  // PDAs for each component account
  private matchStatePda: PublicKey;
  private p1StatePda: PublicKey;
  private p2StatePda: PublicKey;
  private projectilePoolPda: PublicKey;
  private pickupStatePda: PublicKey;

  // Anchor programs for deserialization
  private matchStateProgram: any;
  private playerStateProgram: any;
  private projectilePoolProgram: any;
  private pickupStateProgram: any;

  // Latest known state
  private latestMatch: OnChainMatchState | null = null;
  private latestP1: OnChainPlayerState | null = null;
  private latestP2: OnChainPlayerState | null = null;
  private latestProjectiles: OnChainProjectile[] = [];
  private latestPickups: OnChainPickup[] = [];

  constructor(
    connection: Connection,
    pdas: {
      matchState: PublicKey;
      p1State: PublicKey;
      p2State: PublicKey;
      projectilePool: PublicKey;
      pickupState: PublicKey;
    },
    programs: {
      matchState: any;
      playerState: any;
      projectilePool: any;
      pickupState: any;
    },
    callback: StateCallback,
  ) {
    this.connection = connection;
    this.matchStatePda = pdas.matchState;
    this.p1StatePda = pdas.p1State;
    this.p2StatePda = pdas.p2State;
    this.projectilePoolPda = pdas.projectilePool;
    this.pickupStatePda = pdas.pickupState;
    this.matchStateProgram = programs.matchState;
    this.playerStateProgram = programs.playerState;
    this.projectilePoolProgram = programs.projectilePool;
    this.pickupStateProgram = programs.pickupState;
    this.callback = callback;
  }

  /** Subscribe to all 5 match accounts */
  async subscribe(): Promise<void> {
    // Initial fetch
    await this.fetchAll();

    // Subscribe to changes
    this.subscriptionIds.push(
      this.connection.onAccountChange(this.matchStatePda, async () => {
        await this.fetchMatch();
        this.emit();
      }),
      this.connection.onAccountChange(this.p1StatePda, async () => {
        await this.fetchP1();
        this.emit();
      }),
      this.connection.onAccountChange(this.p2StatePda, async () => {
        await this.fetchP2();
        this.emit();
      }),
      this.connection.onAccountChange(this.projectilePoolPda, async () => {
        await this.fetchProjectiles();
        this.emit();
      }),
      this.connection.onAccountChange(this.pickupStatePda, async () => {
        await this.fetchPickups();
        this.emit();
      }),
    );
  }

  /** Unsubscribe from all accounts */
  async unsubscribe(): Promise<void> {
    for (const id of this.subscriptionIds) {
      await this.connection.removeAccountChangeListener(id);
    }
    this.subscriptionIds = [];
  }

  /** Get latest snapshot without waiting for a change */
  getLatest(): GameStateSnapshot | null {
    if (!this.latestMatch || !this.latestP1 || !this.latestP2) return null;
    return {
      match: this.latestMatch,
      player1: this.latestP1,
      player2: this.latestP2,
      projectiles: this.latestProjectiles,
      pickups: this.latestPickups,
      timestamp: Date.now(),
    };
  }

  private async fetchAll(): Promise<void> {
    await Promise.all([
      this.fetchMatch(),
      this.fetchP1(),
      this.fetchP2(),
      this.fetchProjectiles(),
      this.fetchPickups(),
    ]);
  }

  private async fetchMatch(): Promise<void> {
    try {
      this.latestMatch = await this.matchStateProgram.account.matchState.fetch(
        this.matchStatePda,
      );
    } catch (e) {
      console.warn('[StateSubscriber] Failed to fetch match state:', e);
    }
  }

  private async fetchP1(): Promise<void> {
    try {
      this.latestP1 = await this.playerStateProgram.account.playerState.fetch(
        this.p1StatePda,
      );
    } catch (e) {
      console.warn('[StateSubscriber] Failed to fetch P1 state:', e);
    }
  }

  private async fetchP2(): Promise<void> {
    try {
      this.latestP2 = await this.playerStateProgram.account.playerState.fetch(
        this.p2StatePda,
      );
    } catch (e) {
      console.warn('[StateSubscriber] Failed to fetch P2 state:', e);
    }
  }

  private async fetchProjectiles(): Promise<void> {
    try {
      const pool = await this.projectilePoolProgram.account.projectilePool.fetch(
        this.projectilePoolPda,
      );
      this.latestProjectiles = pool.projectiles;
    } catch (e) {
      console.warn('[StateSubscriber] Failed to fetch projectile pool:', e);
    }
  }

  private async fetchPickups(): Promise<void> {
    try {
      const state = await this.pickupStateProgram.account.pickupState.fetch(
        this.pickupStatePda,
      );
      this.latestPickups = state.pickups;
    } catch (e) {
      console.warn('[StateSubscriber] Failed to fetch pickup state:', e);
    }
  }

  private emit(): void {
    const snapshot = this.getLatest();
    if (snapshot) {
      this.callback(snapshot);
    }
  }
}
