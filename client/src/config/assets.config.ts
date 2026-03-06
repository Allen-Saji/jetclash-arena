export interface AssetEntry {
  key: string;
  path: string;
  frameWidth?: number;
  frameHeight?: number;
}

// Individual frame loading for sprite animations
export const CHARACTER_FRAMES = {
  player1: {
    idle: Array.from({ length: 4 }, (_, i) => ({
      key: `p1-idle-${i + 1}`,
      path: `assets/characters/player1/idle/${i + 1}.png`,
    })),
    fly: Array.from({ length: 4 }, (_, i) => ({
      key: `p1-fly-${i + 1}`,
      path: `assets/characters/player1/fly/${i + 1}.png`,
    })),
    walk: Array.from({ length: 8 }, (_, i) => ({
      key: `p1-walk-${i + 1}`,
      path: `assets/characters/player1/walk/${i + 1}.png`,
    })),
    jump: Array.from({ length: 3 }, (_, i) => ({
      key: `p1-jump-${i + 1}`,
      path: `assets/characters/player1/jump/${i + 1}.png`,
    })),
    die: Array.from({ length: 4 }, (_, i) => ({
      key: `p1-die-${i + 1}`,
      path: `assets/characters/player1/die/${i + 1}.png`,
    })),
  },
  player2: {
    idle: Array.from({ length: 4 }, (_, i) => ({
      key: `p2-idle-${i + 1}`,
      path: `assets/characters/player2/idle/${i + 1}.png`,
    })),
    fly: Array.from({ length: 4 }, (_, i) => ({
      key: `p2-fly-${i + 1}`,
      path: `assets/characters/player2/fly/${i + 1}.png`,
    })),
    walk: Array.from({ length: 8 }, (_, i) => ({
      key: `p2-walk-${i + 1}`,
      path: `assets/characters/player2/walk/${i + 1}.png`,
    })),
    jump: Array.from({ length: 3 }, (_, i) => ({
      key: `p2-jump-${i + 1}`,
      path: `assets/characters/player2/jump/${i + 1}.png`,
    })),
    die: Array.from({ length: 4 }, (_, i) => ({
      key: `p2-die-${i + 1}`,
      path: `assets/characters/player2/die/${i + 1}.png`,
    })),
  },
};

export const BACKGROUND_ASSETS = [
  { key: 'bg1-layer1', path: 'assets/backgrounds/bg1/Layer1.png' },
  { key: 'bg1-layer2', path: 'assets/backgrounds/bg1/Layer2.png' },
  { key: 'bg1-repeated', path: 'assets/backgrounds/bg1/Repeated.png' },
];

export const PROJECTILE_ASSETS = [
  { key: 'bullet', path: 'assets/projectiles/3.png' },
  { key: 'bullet-p2', path: 'assets/projectiles/7.png' },
  { key: 'rocket', path: 'assets/projectiles/8.png' },
];

export const ITEM_ASSETS = {
  heals: Array.from({ length: 4 }, (_, i) => ({
    key: `heal-${i + 1}`,
    path: `assets/items/heals/${i + 1}.png`,
  })),
  speedUp: Array.from({ length: 4 }, (_, i) => ({
    key: `speed-${i + 1}`,
    path: `assets/items/speed-up/${i + 1}.png`,
  })),
  coins: Array.from({ length: 4 }, (_, i) => ({
    key: `coin-${i + 1}`,
    path: `assets/items/coins/${i + 1}.png`,
  })),
};

export const FX_ASSETS = {
  collision1: Array.from({ length: 8 }, (_, i) => ({
    key: `collision1-${i + 1}`,
    path: `assets/fx/collision1/${i + 1}.png`,
  })),
  jetpackSmoke: Array.from({ length: 4 }, (_, i) => ({
    key: `smoke-${i + 1}`,
    path: `assets/fx/jetpack-smoke/${i + 1}.png`,
  })),
};

export const PLATFORM_ASSETS = Array.from({ length: 10 }, (_, i) => ({
  key: `terrain-${i + 1}`,
  path: `assets/platforms/terrain/${i + 1}.png`,
}));

export const TILE_ASSETS = Array.from({ length: 9 }, (_, i) => ({
  key: `tile-${i + 1}`,
  path: `assets/platforms/tiles/${i + 1}.png`,
}));

export const UI_ASSETS = [
  { key: 'btn-play', path: 'assets/ui/PlayBtn.png' },
  { key: 'btn-restart', path: 'assets/ui/RestartBtn.png' },
  { key: 'btn-menu', path: 'assets/ui/MenuBtn.png' },
  { key: 'btn-pause', path: 'assets/ui/PauseBtn.png' },
  { key: 'btn-close', path: 'assets/ui/CloseBtn.png' },
  { key: 'btn-yes', path: 'assets/ui/YesBtn.png' },
  { key: 'hud-line1', path: 'assets/ui/hudLine1.png' },
  { key: 'hud-line2', path: 'assets/ui/hudLine2.png' },
  { key: 'hud-line3', path: 'assets/ui/hudLine3.png' },
  { key: 'hud-player-ico', path: 'assets/ui/hudplayerIco.png' },
  { key: 'popup-box', path: 'assets/ui/PopupBox.png' },
  { key: 'title-ribbon', path: 'assets/ui/RibonTitle.png' },
  { key: 'title', path: 'assets/ui/Tittle.png' },
  { key: 'loadbar-bg', path: 'assets/ui/Loadbar01.png' },
  { key: 'loadbar-fill', path: 'assets/ui/Loadbar02.png' },
  { key: 'arrow-left', path: 'assets/ui/LeftArrow.png' },
  { key: 'arrow-right', path: 'assets/ui/RightArrow.png' },
];
