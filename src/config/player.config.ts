import { ControlScheme, PlayerConfig } from '@/types';

export const PLAYER_PHYSICS = {
  moveSpeed: 250,
  jumpForce: -350,
  jetpackForce: -420,
  jetpackFuelMax: 100,
  jetpackFuelDrain: 30,    // per second while thrusting
  jetpackFuelRegen: 20,    // per second while grounded
  maxHP: 100,
  respawnDelay: 2500,       // ms
  invincibilityTime: 1500,  // ms after respawn
};

export const P1_CONTROLS: ControlScheme = {
  left: 'A',
  right: 'D',
  up: 'W',
  down: 'S',
  shoot: 'F',
  secondary: 'G',
  utility: 'Q',
};

export const P2_CONTROLS: ControlScheme = {
  left: 'LEFT',
  right: 'RIGHT',
  up: 'UP',
  down: 'DOWN',
  shoot: 'NUMPAD_ONE',
  secondary: 'NUMPAD_TWO',
  utility: 'NUMPAD_ZERO',
};

export const P1_CONFIG: PlayerConfig = {
  id: 1,
  spriteKey: 'player1',
  controls: P1_CONTROLS,
  spawnX: 700,
  spawnY: 1200,
  facingRight: true,
};

export const P2_CONFIG: PlayerConfig = {
  id: 2,
  spriteKey: 'player2',
  controls: P2_CONTROLS,
  spawnX: 1860,
  spawnY: 1200,
  facingRight: false,
};
