import Phaser from 'phaser';

export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

export const WORLD_WIDTH = 2560;
export const WORLD_HEIGHT = 1440;

export const PHYSICS_CONFIG: Phaser.Types.Core.PhysicsConfig = {
  default: 'arcade',
  arcade: {
    gravity: { x: 0, y: 800 },
    debug: false,
  },
};

export const GAME_CONFIG: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#1a1a2e',
  physics: PHYSICS_CONFIG,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  pixelArt: true,
  antialias: false,
};
