import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', err => errors.push(err.message));
await page.goto('http://localhost:3000');
await page.waitForTimeout(3000);
await page.click('canvas', { position: { x: 640, y: 340 } });
await page.waitForTimeout(7000);

// Stand still on ground
await page.screenshot({ path: '/tmp/jc-x1.png' });

// Jetpack up
await page.keyboard.down('w');
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/jc-x2-jet.png' });
await page.keyboard.up('w');
await page.waitForTimeout(2000);

// Land on platform
await page.screenshot({ path: '/tmp/jc-x3-land.png' });

// Walk on ground
await page.keyboard.down('d');
await page.waitForTimeout(2000);
await page.keyboard.up('d');
await page.screenshot({ path: '/tmp/jc-x4-walk.png' });

console.log('Errors:', errors.length);
errors.forEach(e => console.log(e));
await browser.close();
