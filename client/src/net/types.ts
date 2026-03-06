import { PublicKey } from '@solana/web3.js';

/** On-chain player state deserialized from BOLT component */
export interface OnChainPlayerState {
  playerAuthority: PublicKey;
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
}

/** On-chain match state */
export interface OnChainMatchState {
  matchId: PublicKey;
  player1: PublicKey;
  player2: PublicKey;
  tick: number;
  ticksRemaining: number;
  p1Score: number;
  p2Score: number;
  p1Kills: number;
  p2Kills: number;
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
  player1: OnChainPlayerState;
  player2: OnChainPlayerState;
  projectiles: OnChainProjectile[];
  pickups: OnChainPickup[];
  timestamp: number;
}

/** Network connection config */
export interface NetworkConfig {
  rpcUrl: string;
  wsUrl: string;
  programIds: {
    playerState: PublicKey;
    matchState: PublicKey;
    arenaConfig: PublicKey;
    projectilePool: PublicKey;
    pickupState: PublicKey;
    processInput: PublicKey;
    tickPhysics: PublicKey;
    tickCombat: PublicKey;
    tickPickups: PublicKey;
    delegateMatch: PublicKey;
    settleMatch: PublicKey;
    initArena: PublicKey;
    createMatch: PublicKey;
  };
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
