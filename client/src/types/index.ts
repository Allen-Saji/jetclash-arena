export interface PlayerConfig {
  id: 1 | 2;
  spriteKey: string;
  controls: ControlScheme;
  spawnX: number;
  spawnY: number;
  facingRight: boolean;
}

export interface ControlScheme {
  left: string;
  right: string;
  up: string;
  down: string;
  shoot: string;
  secondary: string;
  utility: string;
}

export interface WeaponStats {
  damage: number;
  fireRate: number;       // ms between shots
  projectileSpeed: number;
  projectileKey: string;
  ammo: number;
  maxAmmo: number;
  reloadTime: number;
}

export interface MatchState {
  timeRemaining: number;
  playerCount: number;
  scores: number[];      // per-player scores indexed by slot
  kills: number[];       // per-player kills indexed by slot
  isActive: boolean;
  winner: number | null;  // 0=none, 1-4=player slot+1, 5=draw
}

export interface PickupConfig {
  type: 'health' | 'speed' | 'ammo' | 'damage';
  spriteKey: string;
  value: number;
  duration?: number;      // for timed buffs
  respawnTime: number;
}

export type SceneKey = 'Boot' | 'MainMenu' | 'Arena' | 'Lobby' | 'OnlineArena' | 'Result';
