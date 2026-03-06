/**
 * JetClash Arena - Comprehensive Playwright Test
 * Tests: Menu → VS AI → Arena → Combat flow
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

console.log('2. Clicking VS AI...');
await page.click('canvas', { position: { x: 640, y: 410 } });
await page.waitForTimeout(6000); // countdown

console.log('3. AI match started...');
await page.screenshot({ path: '/tmp/jc-test-start.png' });

console.log('4. Fighting...');
for (let i = 0; i < 5; i++) {
  await page.keyboard.down('d');
  await page.waitForTimeout(1000);
  await page.keyboard.up('d');
  await page.keyboard.down('f');
  await page.waitForTimeout(3000);
  await page.keyboard.up('f');
  await page.waitForTimeout(500);
}

await page.screenshot({ path: '/tmp/jc-test-combat.png' });

console.log('=== ERRORS ===');
errors.forEach(e => console.log(e));
console.log(`Error count: ${errors.length}`);
console.log('=== DONE ===');

await browser.close();
