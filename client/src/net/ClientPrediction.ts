import type { InputAction, OnChainPlayerState, GameStateSnapshot } from './types';
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

// Physics constants matching on-chain (scaled to pixels)
const MOVE_SPEED = 25000 / (30 * 100); // per tick in on-chain units
const JETPACK_FORCE = 42000 / 30;
const GRAVITY = 80000 / 30;
const FUEL_DRAIN = 100;

/**
 * Client-side prediction with server reconciliation.
 *
 * Flow:
 * 1. Each frame, apply unacked inputs locally for instant response
 * 2. When server state arrives, compare input_seq
 * 3. Re-apply unacked inputs on top of server state
 * 4. If delta is small, interpolate; if large, snap
 */
export class ClientPrediction {
  private serverState: OnChainPlayerState | null = null;
  private predicted: PredictedState | null = null;
  private unackedInputs: InputAction[] = [];
  private snapThreshold: number;

  /** @param snapThreshold - pixel distance beyond which we snap instead of interpolate */
  constructor(snapThreshold: number = 50) {
    this.snapThreshold = snapThreshold;
  }

  /** Called when new server state arrives */
  onServerState(state: OnChainPlayerState): void {
    this.serverState = state;

    // Drop all inputs the server has already processed
    const serverSeq = state.inputSeq;
    this.unackedInputs = this.unackedInputs.filter((i) => i.inputSeq > serverSeq);

    // Re-predict from server state + unacked inputs
    this.predicted = this.repredict(state, this.unackedInputs);
  }

  /** Called when local input is sent */
  addInput(input: InputAction): void {
    this.unackedInputs.push(input);

    // Apply optimistically
    if (this.predicted) {
      this.predicted = this.applyInput(this.predicted, input);
    }
  }

  /** Get the current best-guess state for rendering (in pixels) */
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

  /** Get full predicted state */
  getPredicted(): PredictedState | null {
    return this.predicted;
  }

  private repredict(
    serverState: OnChainPlayerState,
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

    // Movement
    if (input.moveDir < 0) {
      next.velX = -MOVE_SPEED;
      next.facingRight = false;
    } else if (input.moveDir > 0) {
      next.velX = MOVE_SPEED;
      next.facingRight = true;
    } else {
      next.velX = 0;
    }

    // Jetpack
    if (input.jet && next.fuel > 0) {
      next.velY -= JETPACK_FORCE;
      next.fuel = Math.max(0, next.fuel - FUEL_DRAIN);
    }

    // Gravity
    next.velY += GRAVITY;

    // Integrate
    next.posX += next.velX;
    next.posY += next.velY;

    return next;
  }
}
