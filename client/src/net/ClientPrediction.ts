import type { InputAction, OnChainPlayerData, PlatformAABB } from './types';
import { toPixel } from './types';

/** Predicted local player state for instant-feel rendering */
export interface PredictedState {
  posX: number;
  posY: number;
  velX: number;
  velY: number;
  facingRight: boolean;
  hp: number;
  fuel: number;
  primaryAmmo: number;
  secondaryAmmo: number;
  isDead: boolean;
  isInvincible: boolean;
  dashActive: boolean;
}

// Physics constants matching on-chain (in fixed-point units, /100 = pixels)
// process-input: move_per_tick = (25000 * speed_mult) / (30 * 100), default speed_mult=100
const MOVE_SPEED = 25000;
const JETPACK_FORCE = 42000;
const GRAVITY_DEFAULT = 80000;
const FUEL_DRAIN = 100;
const FUEL_REGEN_PER_TICK = 67;
const FUEL_MAX = 10000;
const PLAYER_HALF_W = 2500;
const PLAYER_HALF_H = 3000;

export class ClientPrediction {
  private serverState: OnChainPlayerData | null = null;
  private predicted: PredictedState | null = null;
  private unackedInputs: InputAction[] = [];
  private platforms: PlatformAABB[] = [];
  private worldWidth: number = 256000;
  private worldHeight: number = 144000;
  private gravity: number = GRAVITY_DEFAULT;
  private speedMultiplier: number = 100;

  constructor(
    platforms?: PlatformAABB[],
    arenaConfig?: { worldWidth: number; worldHeight: number; gravity: number },
  ) {
    if (platforms) this.platforms = platforms;
    if (arenaConfig) {
      this.worldWidth = arenaConfig.worldWidth;
      this.worldHeight = arenaConfig.worldHeight;
      this.gravity = arenaConfig.gravity;
    }
  }

  onServerState(state: OnChainPlayerData): void {
    this.serverState = state;
    this.speedMultiplier = state.speedMultiplier;
    const serverSeq = state.inputSeq;
    this.unackedInputs = this.unackedInputs.filter((i) => i.inputSeq > serverSeq);
    this.predicted = this.repredict(state, this.unackedInputs);
  }

  addInput(input: InputAction): void {
    this.unackedInputs.push(input);
    if (this.predicted) {
      this.predicted = this.applyInput(this.predicted, input);
    }
  }

  getPredictedPixels(): { x: number; y: number; facingRight: boolean } | null {
    if (!this.predicted) {
      if (this.serverState) {
        return {
          x: toPixel(this.serverState.posX),
          y: toPixel(this.serverState.posY),
          facingRight: this.serverState.facingRight,
        };
      }
      return null;
    }
    return {
      x: toPixel(this.predicted.posX),
      y: toPixel(this.predicted.posY),
      facingRight: this.predicted.facingRight,
    };
  }

  getPredicted(): PredictedState | null {
    return this.predicted;
  }

  getServerState(): OnChainPlayerData | null {
    return this.serverState;
  }

  /** Number of unacknowledged inputs pending server confirmation */
  getPendingCount(): number {
    return this.unackedInputs.length;
  }

  private repredict(
    serverState: OnChainPlayerData,
    inputs: InputAction[],
  ): PredictedState {
    let state: PredictedState = {
      posX: serverState.posX,
      posY: serverState.posY,
      velX: serverState.velX,
      velY: serverState.velY,
      facingRight: serverState.facingRight,
      hp: serverState.hp,
      fuel: serverState.fuel,
      primaryAmmo: serverState.primaryAmmo,
      secondaryAmmo: serverState.secondaryAmmo,
      isDead: serverState.isDead,
      isInvincible: serverState.isInvincible,
      dashActive: serverState.dashActive,
    };

    for (const input of inputs) {
      state = this.applyInput(state, input);
    }

    return state;
  }

  private applyInput(state: PredictedState, input: InputAction): PredictedState {
    const next = { ...state };
    if (next.isDead) return next;

    // Movement (matches process-input on-chain)
    const movePerTick = Math.trunc((MOVE_SPEED * this.speedMultiplier) / (30 * 100));

    if (input.moveDir < 0) {
      next.velX = -movePerTick;
      next.facingRight = false;
    } else if (input.moveDir > 0) {
      next.velX = movePerTick;
      next.facingRight = true;
    } else {
      next.velX = 0;
    }

    // Jetpack
    if (input.jet && next.fuel > 0) {
      next.velY -= Math.trunc(JETPACK_FORCE / 30);
      next.fuel = Math.max(0, next.fuel - FUEL_DRAIN);
    }

    // Gravity (matches tick-physics)
    const gravityPerTick = Math.trunc(this.gravity / 30);
    next.velY += gravityPerTick;

    // Apply velocity
    next.posX += next.velX;
    next.posY += next.velY;

    // Ground fuel regen (matches tick-physics: ground_y = world_height - 6000)
    const groundY = this.worldHeight - 6000;
    if (next.posY >= groundY) {
      next.fuel = Math.min(FUEL_MAX, next.fuel + FUEL_REGEN_PER_TICK);
    }

    // World bounds (matches tick-physics)
    next.posX = Math.max(0, Math.min(this.worldWidth, next.posX));
    if (next.posY > this.worldHeight) {
      next.posY = this.worldHeight;
      next.velY = 0;
    }
    if (next.posY < 0) {
      next.posY = 0;
      next.velY = 0;
    }

    // Platform collision (matches tick-physics resolve_platforms)
    for (const plat of this.platforms) {
      const playerBottom = next.posY + PLAYER_HALF_H;
      const playerTop = next.posY - PLAYER_HALF_H;
      const platTop = plat.y;

      if (
        next.posX + PLAYER_HALF_W > plat.x &&
        next.posX - PLAYER_HALF_W < plat.x + plat.w &&
        next.velY >= 0 &&
        playerBottom >= platTop &&
        playerTop < platTop
      ) {
        next.posY = platTop - PLAYER_HALF_H;
        next.velY = 0;
        next.fuel = Math.min(FUEL_MAX, next.fuel + FUEL_REGEN_PER_TICK);
      }
    }

    return next;
  }
}
