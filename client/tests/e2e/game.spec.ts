import { test, expect, Page } from '@playwright/test';

/**
 * JetClash Arena - E2E Test Suite
 *
 * Tests the Phaser 3 canvas game through the full flow:
 * page load -> boot -> main menu -> singleplayer match -> gameplay -> result
 *
 * Since Phaser renders entirely to a <canvas>, we rely on:
 * - Canvas element presence and dimensions
 * - Console error monitoring
 * - Timed waits for scene transitions (asset loading, countdown, etc.)
 * - Screenshot capture for visual verification
 * - Keyboard input simulation for gameplay
 */

// Game world is 2560x1440, camera viewport is 1280x720.
// Menu buttons are placed at these world coords (which map 1:1 to camera
// since the menu scene does not scroll):
//   SINGLEPLAYER button: center x=640, y=340, size 220x48
//   MULTIPLAYER  button: center x=640, y=410, size 220x48
//   ONLINE       button: center x=640, y=480, size 220x48

const CANVAS_SELECTOR = 'canvas';

/** Collect console errors throughout each test. */
function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

// ---------------------------------------------------------------------------
// 1. Page load & canvas basics
// ---------------------------------------------------------------------------

test.describe('Page load', () => {
  test('page loads without console errors', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto('/');
    // Wait long enough for Boot scene to load assets and transition to MainMenu
    await page.waitForTimeout(4000);

    expect(errors).toEqual([]);
  });

  test('canvas element is present and sized correctly', async ({ page }) => {
    await page.goto('/');
    const canvas = page.locator(CANVAS_SELECTOR);

    await expect(canvas).toBeVisible({ timeout: 10_000 });

    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    // Canvas should fill the viewport (1280x720)
    expect(box!.width).toBeGreaterThanOrEqual(1280);
    expect(box!.height).toBeGreaterThanOrEqual(720);
  });
});

// ---------------------------------------------------------------------------
// 2. Boot scene -> Main menu
// ---------------------------------------------------------------------------

test.describe('Boot and Main Menu', () => {
  test('boot scene loads assets and transitions to main menu', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto('/');
    const canvas = page.locator(CANVAS_SELECTOR);
    await expect(canvas).toBeVisible({ timeout: 10_000 });

    // Wait for asset loading + transition to MainMenu
    await page.waitForTimeout(5000);

    // Take a screenshot to verify main menu rendered
    await page.screenshot({ path: 'test-results/main-menu.png' });

    // No errors during boot + menu
    expect(errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. Singleplayer match start
// ---------------------------------------------------------------------------

test.describe('Singleplayer flow', () => {
  test('clicking SINGLEPLAYER starts the arena scene', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto('/');
    await page.waitForTimeout(5000); // wait for main menu

    // Click the SINGLEPLAYER button (canvas coords x=640, y=340)
    await page.click(CANVAS_SELECTOR, { position: { x: 640, y: 340 } });

    // ArenaScene has a ~3s countdown before match becomes active
    await page.waitForTimeout(6000);

    await page.screenshot({ path: 'test-results/arena-start.png' });

    // The game should still be running without errors
    expect(errors).toEqual([]);
  });

  test('WASD keys work without crashing', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto('/');
    await page.waitForTimeout(5000);

    // Start singleplayer
    await page.click(CANVAS_SELECTOR, { position: { x: 640, y: 340 } });
    await page.waitForTimeout(6000); // countdown

    // Move right with D
    await page.keyboard.down('d');
    await page.waitForTimeout(800);
    await page.keyboard.up('d');

    // Move left with A
    await page.keyboard.down('a');
    await page.waitForTimeout(800);
    await page.keyboard.up('a');

    // Jump with W (jetpack)
    await page.keyboard.down('w');
    await page.waitForTimeout(600);
    await page.keyboard.up('w');

    // Shoot with F
    await page.keyboard.press('f');
    await page.waitForTimeout(300);

    // Dash with Q
    await page.keyboard.press('q');
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/after-movement.png' });

    expect(errors).toEqual([]);
  });

  test('game survives extended combat without errors', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto('/');
    await page.waitForTimeout(5000);

    // Start singleplayer
    await page.click(CANVAS_SELECTOR, { position: { x: 640, y: 340 } });
    await page.waitForTimeout(6000);

    // Simulate a series of combat actions
    for (let i = 0; i < 3; i++) {
      // Move and shoot
      await page.keyboard.down('d');
      await page.waitForTimeout(500);
      await page.keyboard.press('f');
      await page.waitForTimeout(500);
      await page.keyboard.up('d');

      // Rocket
      await page.keyboard.press('g');
      await page.waitForTimeout(1000);

      // Move left and jetpack
      await page.keyboard.down('a');
      await page.keyboard.down('w');
      await page.waitForTimeout(600);
      await page.keyboard.up('w');
      await page.keyboard.up('a');
      await page.waitForTimeout(500);
    }

    await page.screenshot({ path: 'test-results/combat.png' });

    expect(errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. Match end -> Result screen
// ---------------------------------------------------------------------------

test.describe('Result screen', () => {
  test('ESC key during match does not crash the game', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto('/');
    await page.waitForTimeout(5000);

    // Start singleplayer
    await page.click(CANVAS_SELECTOR, { position: { x: 640, y: 340 } });
    await page.waitForTimeout(6000);

    // Press Escape - depending on implementation this may pause or do nothing
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'test-results/after-escape.png' });

    expect(errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 5. Mute toggle
// ---------------------------------------------------------------------------

test.describe('Audio controls', () => {
  test('M key toggles mute without errors', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto('/');
    await page.waitForTimeout(5000);

    // Press M to toggle mute
    await page.keyboard.press('m');
    await page.waitForTimeout(500);

    // Press M again to unmute
    await page.keyboard.press('m');
    await page.waitForTimeout(500);

    expect(errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 6. Multiplayer button
// ---------------------------------------------------------------------------

test.describe('Multiplayer mode', () => {
  test('clicking MULTIPLAYER starts local 2P arena', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto('/');
    await page.waitForTimeout(5000);

    // Click MULTIPLAYER button (canvas coords x=640, y=410)
    await page.click(CANVAS_SELECTOR, { position: { x: 640, y: 410 } });
    await page.waitForTimeout(6000);

    await page.screenshot({ path: 'test-results/multiplayer-arena.png' });

    expect(errors).toEqual([]);
  });
});
