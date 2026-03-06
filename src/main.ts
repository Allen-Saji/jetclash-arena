import Phaser from 'phaser';
import { GAME_CONFIG } from '@/config/game.config';
import { BootScene } from '@/scenes/BootScene';
import { MainMenuScene } from '@/scenes/MainMenuScene';
import { ArenaScene } from '@/scenes/ArenaScene';
import { ResultScene } from '@/scenes/ResultScene';

const game = new Phaser.Game({
  ...GAME_CONFIG,
  scene: [BootScene, MainMenuScene, ArenaScene, ResultScene],
});

// Hot module replacement for dev
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game.destroy(true);
  });
}
