import { WORLD_WIDTH, WORLD_HEIGHT } from './game.config';

// Platform layout for the arena (Mini Militia style - multi-level)
export interface PlatformDef {
  x: number;
  y: number;
  textureKey: string;
  scaleX?: number;
  scaleY?: number;
}

// Ground floor
const GROUND_Y = WORLD_HEIGHT - 60;
const MID_Y = WORLD_HEIGHT - 380;
const HIGH_Y = WORLD_HEIGHT - 650;
const TOP_Y = WORLD_HEIGHT - 900;

export const ARENA_PLATFORMS: PlatformDef[] = [
  // Ground level - full floor using terrain pieces (wider, thinner)
  { x: 300, y: GROUND_Y, textureKey: 'terrain-1', scaleX: 0.6, scaleY: 0.3 },
  { x: 700, y: GROUND_Y, textureKey: 'terrain-2', scaleX: 0.6, scaleY: 0.3 },
  { x: 1100, y: GROUND_Y, textureKey: 'terrain-3', scaleX: 0.6, scaleY: 0.3 },
  { x: 1500, y: GROUND_Y, textureKey: 'terrain-1', scaleX: 0.6, scaleY: 0.3 },
  { x: 1900, y: GROUND_Y, textureKey: 'terrain-2', scaleX: 0.6, scaleY: 0.3 },
  { x: 2300, y: GROUND_Y, textureKey: 'terrain-3', scaleX: 0.6, scaleY: 0.3 },

  // Mid-level platforms (smaller floating ledges)
  { x: 400, y: MID_Y, textureKey: 'tile-5', scaleX: 1.5, scaleY: 0.7 },
  { x: 950, y: MID_Y + 60, textureKey: 'tile-5', scaleX: 1.2, scaleY: 0.7 },
  { x: 1550, y: MID_Y - 20, textureKey: 'tile-5', scaleX: 1.5, scaleY: 0.7 },
  { x: 2100, y: MID_Y + 30, textureKey: 'tile-5', scaleX: 1.2, scaleY: 0.7 },

  // High platforms
  { x: 650, y: HIGH_Y, textureKey: 'tile-5', scaleX: 1.1, scaleY: 0.7 },
  { x: 1280, y: HIGH_Y - 30, textureKey: 'tile-5', scaleX: 1.5, scaleY: 0.7 },
  { x: 1900, y: HIGH_Y + 20, textureKey: 'tile-5', scaleX: 1.1, scaleY: 0.7 },

  // Top platforms (sniper perches - small)
  { x: 450, y: TOP_Y, textureKey: 'tile-5', scaleX: 0.9, scaleY: 0.7 },
  { x: 1280, y: TOP_Y - 50, textureKey: 'tile-5', scaleX: 1.2, scaleY: 0.7 },
  { x: 2100, y: TOP_Y, textureKey: 'tile-5', scaleX: 0.9, scaleY: 0.7 },
];

// Pickup spawn positions
export const PICKUP_SPAWNS = [
  { x: 400, y: MID_Y - 50, type: 'health' as const },
  { x: 1280, y: HIGH_Y - 70, type: 'speed' as const },
  { x: 2100, y: MID_Y - 20, type: 'health' as const },
  { x: 950, y: MID_Y + 10, type: 'speed' as const },
  { x: 1900, y: HIGH_Y - 30, type: 'health' as const },
];

// Spawn points for respawning
export const SPAWN_POINTS = [
  { x: 500, y: GROUND_Y - 80 },
  { x: 2060, y: GROUND_Y - 80 },
  { x: 650, y: HIGH_Y - 60 },
  { x: 1900, y: HIGH_Y - 40 },
  { x: 1280, y: TOP_Y - 80 },
];

// Tree decorations
export const TREE_DECORATIONS = [
  { x: 150, y: GROUND_Y - 120, key: 'tile-1', scale: 0.5 },
  { x: 850, y: GROUND_Y - 110, key: 'tile-2', scale: 0.4 },
  { x: 1650, y: GROUND_Y - 120, key: 'tile-1', scale: 0.5 },
  { x: 2400, y: GROUND_Y - 110, key: 'tile-2', scale: 0.4 },
];
