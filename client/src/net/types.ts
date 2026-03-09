import { PublicKey } from '@solana/web3.js';

export const MAX_PLAYERS = 4;

/** On-chain player data deserialized from PlayerPool component */
export interface OnChainPlayerData {
  posX: number;
  posY: number;
  velX: number;
  velY: number;
  hp: number;
  fuel: number;
  primaryAmmo: number;
  secondaryAmmo: number;
  facingRight: boolean;
  isDead: boolean;
  isInvincible: boolean;
  dashActive: boolean;
  speedMultiplier: number;
  invincibleUntilTick: number;
  respawnAtTick: number;
  dashCooldownTick: number;
  primaryCooldownTick: number;
  secondaryCooldownTick: number;
  primaryReloadTick: number;
  secondaryReloadTick: number;
  speedBuffUntilTick: number;
  inputSeq: number;
  kills: number;
  deaths: number;
  score: number;
  playerIndex: number;
  isJoined: boolean;
  characterId: number;
}

/** On-chain match state */
export interface OnChainMatchState {
  players: PublicKey[];
  playerCount: number;
  readyMask: number;
  isLobby: boolean;
  minPlayers: number;
  tick: number;
  ticksRemaining: number;
  isActive: boolean;
  winner: number;
}

/** On-chain projectile data */
export interface OnChainProjectile {
  posX: number;
  posY: number;
  velX: number;
  velY: number;
  damage: number;
  owner: number;
  isRocket: boolean;
  ttlTicks: number;
  active: boolean;
}

/** On-chain pickup data */
export interface OnChainPickup {
  posX: number;
  posY: number;
  pickupType: number;
  isConsumed: boolean;
  respawnAtTick: number;
}

/** Input action sent to the chain */
export interface InputAction {
  moveDir: -1 | 0 | 1;
  jet: boolean;
  dash: boolean;
  shootPrimary: boolean;
  shootSecondary: boolean;
  inputSeq: number;
}

/** Full snapshot of on-chain game state */
export interface GameStateSnapshot {
  match: OnChainMatchState;
  players: OnChainPlayerData[];
  projectiles: OnChainProjectile[];
  pickups: OnChainPickup[];
  timestamp: number;
}

/** Network connection config */
export interface NetworkConfig {
  rpcUrl: string;
  wsUrl: string;
  /** Ephemeral Rollup RPC URL for gameplay (state sync + crank). Falls back to rpcUrl if unset. */
  erRpcUrl?: string;
  /** Ephemeral Rollup WebSocket URL for subscriptions. Falls back to wsUrl if unset. */
  erWsUrl?: string;
  programIds: {
    playerPool: PublicKey;
    matchState: PublicKey;
    arenaConfig: PublicKey;
    projectilePool: PublicKey;
    pickupState: PublicKey;
    processInput: PublicKey;
    tickPhysics: PublicKey;
    tickCombat: PublicKey;
    tickPickups: PublicKey;
    tickProjectiles: PublicKey;
    delegateMatch: PublicKey;
    settleMatch: PublicKey;
    initArena: PublicKey;
    createMatch: PublicKey;
    joinMatch: PublicKey;
    readyUp: PublicKey;
    startMatch: PublicKey;
  };
}

/** Platform AABB matching on-chain ArenaConfig */
export interface PlatformAABB {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Scale factor: on-chain values use *100 fixed-point */
export const SCALE = 100;

/** Convert on-chain fixed-point coordinate to Phaser pixel */
export function toPixel(onChainValue: number): number {
  return onChainValue / SCALE;
}

/** Convert Phaser pixel to on-chain fixed-point */
export function toOnChain(pixelValue: number): number {
  return Math.round(pixelValue * SCALE);
}
