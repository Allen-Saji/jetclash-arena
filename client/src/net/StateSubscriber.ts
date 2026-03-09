import { Connection, PublicKey } from '@solana/web3.js';
import type {
  GameStateSnapshot,
  OnChainMatchState,
  OnChainPlayerData,
  OnChainProjectile,
  OnChainPickup,
} from './types';

type StateCallback = (snapshot: GameStateSnapshot) => void;

/**
 * Subscribes to on-chain account data via WebSocket (primary) or polling (fallback).
 * Uses raw byte deserialization (account owner changes after ER delegation).
 */
export class StateSubscriber {
  private connection: Connection;
  private wsConnection: Connection | null = null;
  private callback: StateCallback;
  private pollInterval: number | null = null;

  private matchStatePda: PublicKey;
  private playerPoolPda: PublicKey;
  private projectilePoolPda: PublicKey;
  private pickupStatePda: PublicKey;

  private latestSnapshot: GameStateSnapshot | null = null;
  private subscriptionIds: number[] = [];

  // Partial state buffers for WebSocket mode (accounts arrive independently)
  private wsMatch: OnChainMatchState | null = null;
  private wsPlayers: OnChainPlayerData[] | null = null;
  private wsProjectiles: OnChainProjectile[] | null = null;
  private wsPickups: OnChainPickup[] | null = null;

  // Throttle WebSocket emissions to avoid flickering from rapid account updates
  private emitScheduled = false;
  private lastEmitTime = 0;
  private readonly minEmitIntervalMs = 50; // Max ~20 updates/sec

  constructor(
    connection: Connection,
    pdas: {
      matchState: PublicKey;
      playerPool: PublicKey;
      projectilePool: PublicKey;
      pickupState: PublicKey;
    },
    callback: StateCallback,
  ) {
    this.connection = connection;
    this.matchStatePda = pdas.matchState;
    this.playerPoolPda = pdas.playerPool;
    this.projectilePoolPda = pdas.projectilePool;
    this.pickupStatePda = pdas.pickupState;
    this.callback = callback;
  }

  /**
   * Start WebSocket subscriptions via onAccountChange.
   * Uses a dedicated connection to the ER WebSocket endpoint.
   * @param wsUrl - WebSocket URL (ws:// or wss://), NOT an http URL.
   */
  startWebSocket(wsUrl: string): void {
    // Derive an RPC URL for the Connection constructor (it needs an HTTP endpoint),
    // but override the WebSocket endpoint to the actual WS URL.
    const rpcUrl = wsUrl.replace('ws://', 'http://').replace('wss://', 'https://');
    this.wsConnection = new Connection(rpcUrl, {
      commitment: 'confirmed',
      wsEndpoint: wsUrl,
    });

    const conn = this.wsConnection;

    // Subscribe to each account — deserialize on change and emit unified snapshot
    const matchSub = conn.onAccountChange(this.matchStatePda, (acct) => {
      this.wsMatch = deserializeMatchState(new Uint8Array(acct.data));
      this.emitSnapshot();
    }, 'confirmed');
    this.subscriptionIds.push(matchSub);

    const playerSub = conn.onAccountChange(this.playerPoolPda, (acct) => {
      this.wsPlayers = deserializePlayerPool(new Uint8Array(acct.data));
      this.emitSnapshot();
    }, 'confirmed');
    this.subscriptionIds.push(playerSub);

    const projSub = conn.onAccountChange(this.projectilePoolPda, (acct) => {
      this.wsProjectiles = deserializeProjectilePool(new Uint8Array(acct.data));
      this.emitSnapshot();
    }, 'confirmed');
    this.subscriptionIds.push(projSub);

    const pickupSub = conn.onAccountChange(this.pickupStatePda, (acct) => {
      this.wsPickups = deserializePickupState(new Uint8Array(acct.data));
      this.emitSnapshot();
    }, 'confirmed');
    this.subscriptionIds.push(pickupSub);

    // Do an initial poll to seed the buffers
    this.poll();
  }

  private emitSnapshot(): void {
    if (!this.wsMatch || !this.wsPlayers) return;

    // Throttle: batch rapid WebSocket updates into a single emission
    const now = Date.now();
    const elapsed = now - this.lastEmitTime;

    if (elapsed >= this.minEmitIntervalMs) {
      this.doEmit();
    } else if (!this.emitScheduled) {
      this.emitScheduled = true;
      setTimeout(() => {
        this.emitScheduled = false;
        this.doEmit();
      }, this.minEmitIntervalMs - elapsed);
    }
  }

  private doEmit(): void {
    if (!this.wsMatch || !this.wsPlayers) return;
    this.lastEmitTime = Date.now();
    this.latestSnapshot = {
      match: this.wsMatch,
      players: this.wsPlayers,
      projectiles: this.wsProjectiles ?? [],
      pickups: this.wsPickups ?? [],
      timestamp: Date.now(),
    };
    this.callback(this.latestSnapshot);
  }

  startPolling(intervalMs: number = 100): void {
    if (this.pollInterval !== null) return;
    this.pollInterval = window.setInterval(() => this.poll(), intervalMs);
    this.poll();
  }

  stopPolling(): void {
    if (this.pollInterval !== null) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  stop(): void {
    this.stopPolling();
    // Unsubscribe WebSocket listeners
    const conn = this.wsConnection ?? this.connection;
    for (const id of this.subscriptionIds) {
      conn.removeAccountChangeListener(id).catch(() => {});
    }
    this.subscriptionIds = [];
    this.wsConnection = null;
  }

  getLatest(): GameStateSnapshot | null {
    return this.latestSnapshot;
  }

  private async poll(): Promise<void> {
    try {
      // Always use the RPC connection for polling (wsConnection may have wrong HTTP port)
      const conn = this.connection;
      const [matchAcct, poolAcct, projAcct, pickupAcct] = await Promise.all([
        conn.getAccountInfo(this.matchStatePda),
        conn.getAccountInfo(this.playerPoolPda),
        conn.getAccountInfo(this.projectilePoolPda),
        conn.getAccountInfo(this.pickupStatePda),
      ]);

      if (!matchAcct || !poolAcct) return;

      const match = deserializeMatchState(new Uint8Array(matchAcct.data));
      const players = deserializePlayerPool(new Uint8Array(poolAcct.data));
      const projectiles = projAcct
        ? deserializeProjectilePool(new Uint8Array(projAcct.data))
        : [];
      const pickups = pickupAcct
        ? deserializePickupState(new Uint8Array(pickupAcct.data))
        : [];

      // Seed WS buffers
      this.wsMatch = match;
      this.wsPlayers = players;
      this.wsProjectiles = projectiles;
      this.wsPickups = pickups;

      this.latestSnapshot = { match, players, projectiles, pickups, timestamp: Date.now() };
      this.callback(this.latestSnapshot);
    } catch (_e) {
      // silently retry next poll
    }
  }
}

// ---- Raw byte deserialization helpers ----

const HEADER = 8; // 8-byte Anchor discriminator (bolt_metadata at END)

function readI32(buf: Uint8Array, offset: number): number {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return dv.getInt32(offset, true);
}

function readU32(buf: Uint8Array, offset: number): number {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return dv.getUint32(offset, true);
}

function readU16(buf: Uint8Array, offset: number): number {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return dv.getUint16(offset, true);
}

function readU8(buf: Uint8Array, offset: number): number {
  return buf[offset];
}

function readBool(buf: Uint8Array, offset: number): boolean {
  return buf[offset] !== 0;
}

function readPubkey(buf: Uint8Array, offset: number): PublicKey {
  return new PublicKey(buf.slice(offset, offset + 32));
}

/**
 * MatchState layout (after 8-byte discriminator):
 * [Pubkey; 4] players (4 * 32 = 128 bytes, fixed array — no length prefix)
 * u8 player_count, u8 ready_mask, bool is_lobby, u8 min_players
 * u32 tick, u32 ticks_remaining, bool is_active, u8 winner
 */
export function deserializeMatchState(data: Uint8Array): OnChainMatchState {
  let o = HEADER;
  // Fixed-size array [Pubkey; 4] — no Borsh Vec prefix
  const players: PublicKey[] = [];
  for (let i = 0; i < 4; i++) {
    players.push(readPubkey(data, o)); o += 32;
  }

  const playerCount = readU8(data, o); o += 1;
  const readyMask = readU8(data, o); o += 1;
  const isLobby = readBool(data, o); o += 1;
  const minPlayers = readU8(data, o); o += 1;
  const tick = readU32(data, o); o += 4;
  const ticksRemaining = readU32(data, o); o += 4;
  const isActive = readBool(data, o); o += 1;
  const winner = readU8(data, o); o += 1;

  return { players, playerCount, readyMask, isLobby, minPlayers, tick, ticksRemaining, isActive, winner };
}

/**
 * PlayerData size: 4+4+4+4 + 1+2+1+1 + 1+1+1+1 + 2 + 4*8 + 4 + 2+2+4 + 1+1+1 = 74 bytes
 * PlayerPool: [PlayerData; 4] = 4 * 74 = 296 bytes (fixed array, no length prefix)
 */
const PLAYER_DATA_SIZE = 74;

export function deserializePlayerPool(data: Uint8Array): OnChainPlayerData[] {
  let o = HEADER;
  // Fixed-size array [PlayerData; 4] — no Borsh Vec prefix
  const players: OnChainPlayerData[] = [];
  for (let i = 0; i < 4; i++) {
    const posX = readI32(data, o); o += 4;
    const posY = readI32(data, o); o += 4;
    const velX = readI32(data, o); o += 4;
    const velY = readI32(data, o); o += 4;
    const hp = readU8(data, o); o += 1;
    const fuel = readU16(data, o); o += 2;
    const primaryAmmo = readU8(data, o); o += 1;
    const secondaryAmmo = readU8(data, o); o += 1;
    const facingRight = readBool(data, o); o += 1;
    const isDead = readBool(data, o); o += 1;
    const isInvincible = readBool(data, o); o += 1;
    const dashActive = readBool(data, o); o += 1;
    const speedMultiplier = readU16(data, o); o += 2;
    const invincibleUntilTick = readU32(data, o); o += 4;
    const respawnAtTick = readU32(data, o); o += 4;
    const dashCooldownTick = readU32(data, o); o += 4;
    const primaryCooldownTick = readU32(data, o); o += 4;
    const secondaryCooldownTick = readU32(data, o); o += 4;
    const primaryReloadTick = readU32(data, o); o += 4;
    const secondaryReloadTick = readU32(data, o); o += 4;
    const speedBuffUntilTick = readU32(data, o); o += 4;
    const inputSeq = readU32(data, o); o += 4;
    const kills = readU16(data, o); o += 2;
    const deaths = readU16(data, o); o += 2;
    const score = readU32(data, o); o += 4;
    const playerIndex = readU8(data, o); o += 1;
    const isJoined = readBool(data, o); o += 1;
    const characterId = readU8(data, o); o += 1;

    players.push({
      posX, posY, velX, velY, hp, fuel, primaryAmmo, secondaryAmmo,
      facingRight, isDead, isInvincible, dashActive, speedMultiplier,
      invincibleUntilTick, respawnAtTick, dashCooldownTick,
      primaryCooldownTick, secondaryCooldownTick, primaryReloadTick,
      secondaryReloadTick, speedBuffUntilTick, inputSeq,
      kills, deaths, score, playerIndex, isJoined, characterId,
    });
  }
  return players;
}

const MAX_PROJECTILES = 10;

export function deserializeProjectilePool(data: Uint8Array): OnChainProjectile[] {
  let o = HEADER;
  // Fixed-size array [ProjectileData; 10] — no Borsh Vec prefix
  const projectiles: OnChainProjectile[] = [];
  for (let i = 0; i < MAX_PROJECTILES; i++) {
    const posX = readI32(data, o); o += 4;
    const posY = readI32(data, o); o += 4;
    const velX = readI32(data, o); o += 4;
    const velY = readI32(data, o); o += 4;
    const damage = readU8(data, o); o += 1;
    const owner = readU8(data, o); o += 1;
    const isRocket = readBool(data, o); o += 1;
    const ttlTicks = readU16(data, o); o += 2;
    const active = readBool(data, o); o += 1;
    projectiles.push({ posX, posY, velX, velY, damage, owner, isRocket, ttlTicks, active });
  }
  return projectiles;
}

const MAX_PICKUPS = 5;

export function deserializePickupState(data: Uint8Array): OnChainPickup[] {
  let o = HEADER;
  // Fixed-size array [PickupData; 5] — no Borsh Vec prefix
  const pickups: OnChainPickup[] = [];
  for (let i = 0; i < MAX_PICKUPS; i++) {
    const posX = readI32(data, o); o += 4;
    const posY = readI32(data, o); o += 4;
    const pickupType = readU8(data, o); o += 1;
    const isConsumed = readBool(data, o); o += 1;
    const respawnAtTick = readU32(data, o); o += 4;
    pickups.push({ posX, posY, pickupType, isConsumed, respawnAtTick });
  }
  return pickups;
}
