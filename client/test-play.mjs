/**
 * Play test: creates match, both players actively play, takes screenshots, verifies gameplay.
 */
import { chromium } from 'playwright';
import { Connection, PublicKey } from '@solana/web3.js';
import { FindEntityPda, FindComponentPda, FindWorldPda, BN } from '@magicblock-labs/bolt-sdk';

const URL = 'http://localhost:3000';
const RPC = 'http://127.0.0.1:7899';
const conn = new Connection(RPC, 'confirmed');
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getWorldCount() {
  const reg = new PublicKey('EHLkWwAT9oebVv9ht3mtqrvHhRVMKrt54tF3MfHTey2K');
  const acct = await conn.getAccountInfo(reg);
  return Number(acct.data.readBigUInt64LE(8));
}

async function readMatchState(wid) {
  const worldId = new BN(wid);
  const entity = FindEntityPda({ worldId, entityId: new BN(0) });
  const pda = FindComponentPda({ componentId: new PublicKey('5ycjVn86LtopfCGL8hLVYp3KTQzTvGyDfTVSXGAKirnB'), entity });
  const acct = await conn.getAccountInfo(pda);
  if (!acct) return null;
  const d = acct.data; const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  let o = 8 + 128;
  return { playerCount: d[o], readyMask: d[o+1], isLobby: d[o+2], minPlayers: d[o+3],
    tick: dv.getUint32(o+4, true), ticksRemaining: dv.getUint32(o+8, true), isActive: d[o+12], winner: d[o+13] };
}

async function readPlayerPool(wid) {
  const worldId = new BN(wid);
  const entity = FindEntityPda({ worldId, entityId: new BN(1) });
  const pda = FindComponentPda({ componentId: new PublicKey('4n1pmeKn5BkXqPDSuaTnrC8kJqo17tM9AVQbfpTExnbz'), entity });
  const acct = await conn.getAccountInfo(pda);
  if (!acct) return null;
  const pd = acct.data; const dv = new DataView(pd.buffer, pd.byteOffset, pd.byteLength);
  const players = [];
  let o = 8;
  for (let i = 0; i < 4; i++) {
    players.push({ posX: dv.getInt32(o, true), posY: dv.getInt32(o+4, true),
      velX: dv.getInt32(o+8, true), velY: dv.getInt32(o+12, true),
      hp: pd[o+16], fuel: dv.getUint16(o+17, true),
      inputSeq: dv.getUint32(o+59, true), isJoined: pd[o+72] });
    o += 74;
  }
  return players;
}

async function main() {
  console.log('=== Gameplay Play Test ===\n');
  const worldCountBefore = await getWorldCount();

  const browser = await chromium.launch({ headless: true }); // visible browser!
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });

  const p1Warns = [], p2Warns = [];
  const page1 = await ctx.newPage();
  page1.on('console', m => { if (m.type() === 'warning') p1Warns.push(m.text()); });
  page1.on('pageerror', e => p1Warns.push(`PAGE: ${e.message}`));
  const page2 = await ctx.newPage();
  page2.on('console', m => { if (m.type() === 'warning') p2Warns.push(m.text()); });
  page2.on('pageerror', e => p2Warns.push(`PAGE: ${e.message}`));

  try {
    // --- Create Room ---
    console.log('1. P1 opens game and creates room...');
    await page1.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(2000);
    await page1.click('canvas', { position: { x: 640, y: 480 } }); // ONLINE
    await sleep(1500);
    await page1.click('canvas', { position: { x: 640, y: 330 } }); // CREATE ROOM

    let newWorldId = -1;
    for (let i = 0; i < 60; i++) {
      await sleep(1000);
      const wc = await getWorldCount();
      if (wc > worldCountBefore) {
        newWorldId = wc - 1;
        const ms = await readMatchState(newWorldId);
        if (ms && ms.playerCount >= 1) break;
      }
    }
    if (newWorldId === -1) throw new Error('Room creation timed out');
    const roomCode = FindWorldPda({ worldId: new BN(newWorldId) }).toBase58();
    console.log(`   Room created (world ${newWorldId})`);

    // --- P2 Joins ---
    console.log('2. P2 joins via URL...');
    await page2.goto(`${URL}?room=${roomCode}`, { waitUntil: 'networkidle', timeout: 30000 });
    for (let i = 0; i < 30; i++) {
      await sleep(1000);
      const ms = await readMatchState(newWorldId);
      if (ms && ms.playerCount >= 2) break;
    }
    let ms = await readMatchState(newWorldId);
    if (ms.playerCount < 2) throw new Error('P2 failed to join');
    console.log('   P2 joined!');

    // --- Ready & Start ---
    console.log('3. Ready up and start...');
    await page1.click('canvas', { position: { x: 640, y: 450 } }); // P1 READY
    await sleep(2000);
    await page2.click('canvas', { position: { x: 640, y: 450 } }); // P2 READY
    await sleep(2000);
    await page1.click('canvas', { position: { x: 640, y: 510 } }); // P1 START
    await sleep(5000);

    ms = await readMatchState(newWorldId);
    if (!ms.isActive) throw new Error('Match did not start, isActive=' + ms.isActive);
    console.log('   Match started! tick:', ms.tick);

    // Wait for game scenes to load
    await sleep(3000);

    // --- Take screenshot of initial state ---
    await page1.screenshot({ path: '/tmp/play-test-p1-start.png' });
    await page2.screenshot({ path: '/tmp/play-test-p2-start.png' });
    console.log('   Screenshots saved: /tmp/play-test-p1-start.png, p2-start.png');

    // --- PLAY: P1 moves right + jets, P2 moves left + jets ---
    console.log('\n4. Playing for 10 seconds...');
    let pool = await readPlayerPool(newWorldId);
    const initP0 = { ...pool[0] };
    const initP1 = { ...pool[1] };
    ms = await readMatchState(newWorldId);
    const initTick = ms.tick;

    // P1: hold D (right) + W (jetpack)
    await page1.focus('canvas');
    await page1.keyboard.down('d');
    await page1.keyboard.down('w');

    // P2: hold A (left - but P2 uses WASD too since both are in OnlineArenaScene)
    await page2.focus('canvas');
    await page2.keyboard.down('a');
    await page2.keyboard.down('w');

    // Play for 10 seconds, sampling state every 2 seconds
    for (let t = 0; t < 5; t++) {
      await sleep(2000);
      pool = await readPlayerPool(newWorldId);
      ms = await readMatchState(newWorldId);
      const p0 = pool[0], p1 = pool[1];
      console.log(`   t=${(t+1)*2}s: tick=${ms.tick} P0=(${p0.posX},${p0.posY}) fuel=${p0.fuel} seq=${p0.inputSeq} | P1=(${p1.posX},${p1.posY}) fuel=${p1.fuel} seq=${p1.inputSeq}`);
    }

    // Release keys
    await page1.keyboard.up('d');
    await page1.keyboard.up('w');
    await page2.keyboard.up('a');
    await page2.keyboard.up('w');
    await sleep(1000);

    // --- Take screenshot after playing ---
    await page1.screenshot({ path: '/tmp/play-test-p1-after.png' });
    await page2.screenshot({ path: '/tmp/play-test-p2-after.png' });
    console.log('   Screenshots: /tmp/play-test-p1-after.png, p2-after.png');

    // --- Verify gameplay ---
    pool = await readPlayerPool(newWorldId);
    ms = await readMatchState(newWorldId);
    const p0 = pool[0], p1 = pool[1];
    const tickDelta = ms.tick - initTick;

    console.log('\n=== RESULTS ===');
    console.log(`Ticks: ${initTick} -> ${ms.tick} (delta: ${tickDelta}, ~${(tickDelta/10).toFixed(1)} ticks/sec)`);
    console.log(`P0 moved: dx=${p0.posX - initP0.posX} dy=${p0.posY - initP0.posY} fuel=${initP0.fuel}->${p0.fuel} seq=${initP0.inputSeq}->${p0.inputSeq}`);
    console.log(`P1 moved: dx=${p1.posX - initP1.posX} dy=${p1.posY - initP1.posY} fuel=${initP1.fuel}->${p1.fuel} seq=${initP1.inputSeq}->${p1.inputSeq}`);

    const issues = [];
    if (tickDelta < 5) issues.push('CRANK TOO SLOW: only ' + tickDelta + ' ticks in 10s');
    if (p0.posX === initP0.posX && p0.posY === initP0.posY) issues.push('P0 DID NOT MOVE');
    if (p0.inputSeq === initP0.inputSeq) issues.push('P0 INPUTS NOT LANDING');
    if (p1.inputSeq === initP1.inputSeq) issues.push('P1 INPUTS NOT LANDING');
    if (p0.fuel === initP0.fuel) issues.push('P0 FUEL DID NOT DRAIN (jetpack not working)');

    if (issues.length) {
      console.log('\nISSUES:');
      issues.forEach(i => console.log('  - ' + i));
    } else {
      console.log('\nALL CHECKS PASSED!');
    }

    console.log('\nWarnings P1:', p1Warns.filter(w => !w.includes('GPU') && !w.includes('WebGL')).slice(-5));
    console.log('Warnings P2:', p2Warns.filter(w => !w.includes('GPU') && !w.includes('WebGL')).slice(-5));

    // Keep browser open for 5s so user can see
    await sleep(5000);

  } catch (err) {
    console.error('\nFAILED:', err.message);
    await page1.screenshot({ path: '/tmp/play-test-fail-p1.png' }).catch(() => {});
    await page2.screenshot({ path: '/tmp/play-test-fail-p2.png' }).catch(() => {});
    console.log('Failure screenshots saved to /tmp/play-test-fail-*.png');
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
