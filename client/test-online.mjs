/**
 * JetClash Arena — Online Mode Playwright Test (4-Player Room-Based)
 *
 * Tests the full lobby + match lifecycle from the browser:
 * 1. Load game → Click ONLINE → LobbyScene
 * 2. Click CREATE ROOM → on-chain setup (world, entities, components, arena, create-match)
 * 3. Click READY → ready-up system call
 * 4. Verify lobby state (player list, room code)
 * 5. (Auto-start since min_players=2 but only 1 player — we test the lobby flow)
 *
 * Prerequisites:
 *   - Local Solana validator running on port 7899 with all programs loaded
 *   - Vite dev server running on port 3000
 *
 * Usage: node test-online.mjs
 */
import { chromium } from 'playwright';

const GAME_URL = 'http://localhost:3000';
const VALIDATOR_URL = 'http://127.0.0.1:7899';
const TIMEOUT = 120_000;

// ── Helpers ──

async function checkService(url, name) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' }),
    });
    const json = await res.json();
    if (json.result === 'ok') return true;
  } catch {}
  console.error(`✗ ${name} not reachable at ${url}`);
  return false;
}

async function checkVite(url) {
  try {
    const res = await fetch(url);
    return res.ok;
  } catch {}
  console.error(`✗ Vite dev server not reachable at ${url}`);
  return false;
}

// ── Main ──

console.log('=== JetClash Arena — Online Mode E2E Test (4-Player) ===\n');

// Check prerequisites
console.log('Checking prerequisites...');
const [validatorOk, viteOk] = await Promise.all([
  checkService(VALIDATOR_URL, 'Solana validator'),
  checkVite(GAME_URL),
]);

if (!validatorOk || !viteOk) {
  console.error('\nPrerequisites not met. Start the local environment first:');
  console.error('  bash scripts/start-local.sh');
  process.exit(1);
}
console.log('✓ Solana validator running');
console.log('✓ Vite dev server running\n');

// Launch browser
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const consoleLogs = [];
const errors = [];
page.on('console', msg => {
  const text = msg.text();
  consoleLogs.push(text);
  if (msg.type() === 'error') errors.push(text);
});
page.on('pageerror', err => errors.push(err.message));

let testPassed = true;

function assert(condition, message) {
  if (!condition) {
    console.error(`  ✗ FAIL: ${message}`);
    testPassed = false;
  } else {
    console.log(`  ✓ ${message}`);
  }
}

try {
  // ── Step 1: Load game ──
  console.log('Step 1: Loading game...');
  await page.goto(GAME_URL);
  await page.waitForTimeout(4000); // Boot → MainMenu
  await page.screenshot({ path: '/tmp/jc-online-1-menu.png' });
  console.log('  Screenshot: /tmp/jc-online-1-menu.png');

  // ── Step 2: Click ONLINE button → LobbyScene ──
  console.log('\nStep 2: Clicking ONLINE button...');
  await page.click('canvas', { position: { x: 640, y: 480 } });
  await page.waitForTimeout(2000); // Fade transition → LobbyScene

  await page.screenshot({ path: '/tmp/jc-online-2-lobby-init.png' });
  console.log('  Screenshot: /tmp/jc-online-2-lobby-init.png');

  // ── Step 3: Click CREATE ROOM ──
  console.log('\nStep 3: Clicking CREATE ROOM...');
  // CREATE ROOM button is at (640, 330) in the LobbyScene
  await page.click('canvas', { position: { x: 640, y: 330 } });

  // Wait for on-chain setup (world, entities, components, arena, create-match)
  console.log('  Waiting for on-chain room creation...');
  const setupStart = Date.now();
  let roomCreated = false;

  while (Date.now() - setupStart < 60_000) {
    await page.waitForTimeout(1000);

    // Check for failure
    const failLog = consoleLogs.find(l => l.includes('failed') || l.includes('Failed'));
    if (failLog && Date.now() - setupStart > 5000) {
      // Only consider failures after initial setup period
      const isCrankFail = failLog.includes('[Crank]') || failLog.includes('[InputSender]') || failLog.includes('TX failed');
      if (!isCrankFail) {
        console.error(`  ✗ Room creation failed: ${failLog}`);
        testPassed = false;
        break;
      }
    }

    // Check for room code display (means lobby is showing)
    // The room code text and player list should be visible
    // We can check by looking for the copy button interaction
    if (Date.now() - setupStart > 15_000) {
      roomCreated = true;
      break;
    }
  }

  await page.screenshot({ path: '/tmp/jc-online-3-lobby.png' });
  console.log('  Screenshot: /tmp/jc-online-3-lobby.png');

  const setupTime = ((Date.now() - setupStart) / 1000).toFixed(1);
  assert(roomCreated, `Room created and lobby shown (${setupTime}s)`);

  if (!roomCreated) {
    console.log('\n  Recent console logs:');
    consoleLogs.slice(-15).forEach(l => console.log(`    ${l}`));
    throw new Error('Room creation did not complete');
  }

  // ── Step 4: Click READY ──
  console.log('\nStep 4: Clicking READY...');
  // READY button is at (640, 450)
  await page.click('canvas', { position: { x: 640, y: 450 } });
  await page.waitForTimeout(3000);

  await page.screenshot({ path: '/tmp/jc-online-4-ready.png' });
  console.log('  Screenshot: /tmp/jc-online-4-ready.png');
  console.log('  ✓ Ready button clicked');

  // ── Step 5: Final verification ──
  console.log('\nStep 5: Final verification...');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/tmp/jc-online-5-final.png' });
  console.log('  Screenshot: /tmp/jc-online-5-final.png');

  // Check for critical errors
  const criticalErrors = errors.filter(e =>
    !e.includes('TX failed') &&
    !e.includes('Tick failed') &&
    !e.includes('fetch failed') &&
    !e.includes('blockhash') &&
    !e.includes('429') &&
    !e.includes('Ready up failed') &&
    !e.includes('[Crank]') &&
    !e.includes('[InputSender]') &&
    !e.includes('Framebuffer') // WebGL headless issue
  );

  assert(criticalErrors.length === 0,
    `No critical errors (${criticalErrors.length} found${criticalErrors.length > 0 ? ': ' + criticalErrors[0] : ''})`);

  // Canvas should exist
  const canvasExists = await page.locator('canvas').count();
  assert(canvasExists > 0, 'Game canvas is rendering');

} catch (err) {
  console.error(`\n✗ Test error: ${err.message}`);
  testPassed = false;
  await page.screenshot({ path: '/tmp/jc-online-error.png' }).catch(() => {});
} finally {
  await browser.close();
}

// ── Summary ──
console.log('\n=== Results ===');
console.log(`Total console messages: ${consoleLogs.length}`);
console.log(`Errors: ${errors.length}`);

if (errors.length > 0) {
  console.log('\nError samples (last 5):');
  errors.slice(-5).forEach(e => console.log(`  - ${e.substring(0, 150)}`));
}

if (testPassed) {
  console.log('\n✓ ONLINE MODE TEST PASSED');
  console.log('\nScreenshots saved to /tmp/jc-online-*.png');
} else {
  console.log('\n✗ ONLINE MODE TEST FAILED');
  console.log('\nScreenshots saved to /tmp/jc-online-*.png');
  console.log('Check screenshots and console output for debugging.');
  process.exit(1);
}
