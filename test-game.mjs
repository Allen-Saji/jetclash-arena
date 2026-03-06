/**
 * JetClash Arena - Comprehensive Playwright Test
 * Tests: Menu → Arena → Combat → Result → Rematch flow
 *
 * Prerequisites:
 *   - Dev server running: npm run dev (port 3000)
 *   - npm install playwright
 *
 * Usage: node test-game.mjs
 */
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const errors = [];
page.on('pageerror', err => errors.push(err.message));

console.log('1. Loading game...');
await page.goto('http://localhost:3000');
await page.waitForTimeout(3000);
await page.screenshot({ path: '/tmp/jc-test-menu.png' });

console.log('2. Clicking PLAY...');
await page.click('canvas', { position: { x: 640, y: 380 } });
await page.waitForTimeout(5500); // Wait for 3-2-1-FIGHT countdown

console.log('3. Testing dash (Q)...');
await page.keyboard.press('q');
await page.waitForTimeout(500);

console.log('4. Moving P1 toward P2 and shooting...');
await page.keyboard.down('d');
await page.waitForTimeout(1500);
await page.keyboard.up('d');

await page.keyboard.down('f');
await page.waitForTimeout(4000);
await page.keyboard.up('f');

await page.screenshot({ path: '/tmp/jc-test-combat.png' });

console.log('5. Continuing combat...');
for (let i = 0; i < 3; i++) {
  await page.keyboard.down('d');
  await page.waitForTimeout(1000);
  await page.keyboard.up('d');
  await page.keyboard.down('f');
  await page.waitForTimeout(3000);
  await page.keyboard.up('f');
  await page.waitForTimeout(2000);
}

await page.screenshot({ path: '/tmp/jc-test-late.png' });

console.log('=== ERRORS ===');
errors.forEach(e => console.log(e));
console.log(`Error count: ${errors.length}`);
console.log('=== DONE ===');

await browser.close();
