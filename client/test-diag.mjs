/**
 * Diagnostic play test: thorough screenshot capture to identify all bugs.
 * Tests: player movement, platform collision, shooting, timer, jitter, remote player sync
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
      primaryAmmo: pd[o+19], secondaryAmmo: pd[o+20],
      facingRight: pd[o+21], isDead: pd[o+22], isInvincible: pd[o+23],
      inputSeq: dv.getUint32(o+59, true), isJoined: pd[o+72] });
    o += 74;
  }
  return players;
}

async function main() {
  console.log('=== DIAGNOSTIC PLAY TEST ===\n');
  const worldCountBefore = await getWorldCount();

  const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });

  const p1Errors = [], p2Errors = [];
  const page1 = await ctx.newPage();
  page1.on('pageerror', e => p1Errors.push(e.message));
  page1.on('console', m => { if (m.type() === 'error') p1Errors.push(m.text()); });
  const page2 = await ctx.newPage();
  page2.on('pageerror', e => p2Errors.push(e.message));
  page2.on('console', m => { if (m.type() === 'error') p2Errors.push(m.text()); });

  const DIR = '/tmp/diag';
  const fs = await import('fs');
  fs.mkdirSync(DIR, { recursive: true });

  try {
    // --- Create Room ---
    console.log('1. Creating room...');
    await page1.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(3000);
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
    console.log('2. P2 joining...');
    await page2.goto(`${URL}?room=${roomCode}`, { waitUntil: 'networkidle', timeout: 30000 });
    for (let i = 0; i < 30; i++) {
      await sleep(1000);
      const ms = await readMatchState(newWorldId);
      if (ms && ms.playerCount >= 2) break;
    }

    // --- Ready & Start ---
    console.log('3. Ready + Start...');
    await page1.click('canvas', { position: { x: 640, y: 450 } });
    await sleep(2000);
    await page2.click('canvas', { position: { x: 640, y: 450 } });
    await sleep(2000);
    await page1.click('canvas', { position: { x: 640, y: 510 } });
    await sleep(5000);

    let ms = await readMatchState(newWorldId);
    if (!ms.isActive) throw new Error('Match did not start');
    console.log('   Match started! tick:', ms.tick);
    await sleep(2000);

    // === TEST 1: Initial state screenshot ===
    console.log('\n--- TEST 1: Initial state ---');
    await page1.screenshot({ path: `${DIR}/01-p1-initial.png` });
    await page2.screenshot({ path: `${DIR}/01-p2-initial.png` });
    let pool = await readPlayerPool(newWorldId);
    ms = await readMatchState(newWorldId);
    console.log(`   Timer: ticksRemaining=${ms.ticksRemaining} tick=${ms.tick}`);
    console.log(`   P0: pos=(${pool[0].posX},${pool[0].posY}) hp=${pool[0].hp} fuel=${pool[0].fuel} joined=${pool[0].isJoined}`);
    console.log(`   P1: pos=(${pool[1].posX},${pool[1].posY}) hp=${pool[1].hp} fuel=${pool[1].fuel} joined=${pool[1].isJoined}`);

    // === TEST 2: P1 walks right for 2s ===
    console.log('\n--- TEST 2: P1 walks right (2s) ---');
    await page1.focus('canvas');
    await page1.keyboard.down('d');
    await sleep(500);
    await page1.screenshot({ path: `${DIR}/02-p1-walking-0.5s.png` });
    await sleep(500);
    await page1.screenshot({ path: `${DIR}/02-p1-walking-1s.png` });
    await sleep(1000);
    await page1.keyboard.up('d');
    await page1.screenshot({ path: `${DIR}/02-p1-walking-2s-stopped.png` });
    pool = await readPlayerPool(newWorldId);
    console.log(`   P0 after walk: pos=(${pool[0].posX},${pool[0].posY}) vel=(${pool[0].velX},${pool[0].velY})`);

    // === TEST 3: P1 jetpacks up for 2s ===
    console.log('\n--- TEST 3: P1 jetpacks up (2s) ---');
    await page1.keyboard.down('w');
    await sleep(500);
    await page1.screenshot({ path: `${DIR}/03-p1-jet-0.5s.png` });
    await sleep(1500);
    await page1.keyboard.up('w');
    await page1.screenshot({ path: `${DIR}/03-p1-jet-2s.png` });
    pool = await readPlayerPool(newWorldId);
    console.log(`   P0 after jet: pos=(${pool[0].posX},${pool[0].posY}) fuel=${pool[0].fuel}`);

    // === TEST 4: P1 falls back down (gravity) ===
    console.log('\n--- TEST 4: P1 falls (2s, no input) ---');
    await sleep(1000);
    await page1.screenshot({ path: `${DIR}/04-p1-falling-1s.png` });
    await sleep(1000);
    await page1.screenshot({ path: `${DIR}/04-p1-falling-2s.png` });
    pool = await readPlayerPool(newWorldId);
    console.log(`   P0 after fall: pos=(${pool[0].posX},${pool[0].posY}) vel=(${pool[0].velX},${pool[0].velY})`);

    // === TEST 5: P1 shoots ===
    console.log('\n--- TEST 5: P1 shoots primary + secondary ---');
    await page1.keyboard.press('f');
    await sleep(200);
    await page1.screenshot({ path: `${DIR}/05-p1-shoot-primary.png` });
    await sleep(500);
    await page1.keyboard.press('g');
    await sleep(200);
    await page1.screenshot({ path: `${DIR}/05-p1-shoot-secondary.png` });
    await sleep(1000);

    // === TEST 6: P2 moves left toward P1 ===
    console.log('\n--- TEST 6: P2 walks left (2s) ---');
    await page2.focus('canvas');
    await page2.keyboard.down('a');
    await sleep(1000);
    await page2.screenshot({ path: `${DIR}/06-p2-walking-1s.png` });
    await sleep(1000);
    await page2.keyboard.up('a');
    await page2.screenshot({ path: `${DIR}/06-p2-walking-2s.png` });
    pool = await readPlayerPool(newWorldId);
    console.log(`   P1 after walk: pos=(${pool[1].posX},${pool[1].posY}) vel=(${pool[1].velX},${pool[1].velY})`);

    // === TEST 7: Both players simultaneous movement ===
    console.log('\n--- TEST 7: Both move simultaneously (3s) ---');
    await page1.focus('canvas');
    await page1.keyboard.down('d');
    await page1.keyboard.down('w');
    await page2.focus('canvas');
    await page2.keyboard.down('a');
    await page2.keyboard.down('w');
    for (let t = 0; t < 3; t++) {
      await sleep(1000);
      await page1.screenshot({ path: `${DIR}/07-p1-both-${t+1}s.png` });
      await page2.screenshot({ path: `${DIR}/07-p2-both-${t+1}s.png` });
    }
    await page1.keyboard.up('d');
    await page1.keyboard.up('w');
    await page2.keyboard.up('a');
    await page2.keyboard.up('w');
    pool = await readPlayerPool(newWorldId);
    ms = await readMatchState(newWorldId);
    console.log(`   After: tick=${ms.tick} ticksRemaining=${ms.ticksRemaining}`);
    console.log(`   P0: pos=(${pool[0].posX},${pool[0].posY}) hp=${pool[0].hp} dead=${pool[0].isDead}`);
    console.log(`   P1: pos=(${pool[1].posX},${pool[1].posY}) hp=${pool[1].hp} dead=${pool[1].isDead}`);

    // === TEST 8: Check timer progression ===
    console.log('\n--- TEST 8: Timer check (5s wait) ---');
    const tick1 = ms.tick;
    const tr1 = ms.ticksRemaining;
    await sleep(5000);
    ms = await readMatchState(newWorldId);
    console.log(`   tick: ${tick1} -> ${ms.tick} (delta: ${ms.tick - tick1})`);
    console.log(`   ticksRemaining: ${tr1} -> ${ms.ticksRemaining} (delta: ${tr1 - ms.ticksRemaining})`);
    await page1.screenshot({ path: `${DIR}/08-p1-timer.png` });

    // === Final state ===
    console.log('\n--- FINAL STATE ---');
    pool = await readPlayerPool(newWorldId);
    ms = await readMatchState(newWorldId);
    for (let i = 0; i < 2; i++) {
      const p = pool[i];
      console.log(`   P${i}: pos=(${p.posX},${p.posY}) vel=(${p.velX},${p.velY}) hp=${p.hp} fuel=${p.fuel} ammo=${p.primaryAmmo}/${p.secondaryAmmo} dead=${p.isDead} inv=${p.isInvincible} seq=${p.inputSeq}`);
    }
    console.log(`   Match: tick=${ms.tick} remaining=${ms.ticksRemaining} active=${ms.isActive}`);

    // === Console errors ===
    const realP1Errors = p1Errors.filter(e => !e.includes('GPU') && !e.includes('WebGL') && !e.includes('swiftshader'));
    const realP2Errors = p2Errors.filter(e => !e.includes('GPU') && !e.includes('WebGL') && !e.includes('swiftshader'));
    if (realP1Errors.length) console.log('\n   P1 ERRORS:', realP1Errors);
    if (realP2Errors.length) console.log('\n   P2 ERRORS:', realP2Errors);

    console.log(`\nScreenshots saved to ${DIR}/`);

  } catch (err) {
    console.error('\nFAILED:', err.message);
    await page1.screenshot({ path: `${DIR}/FAIL-p1.png` }).catch(() => {});
    await page2.screenshot({ path: `${DIR}/FAIL-p2.png` }).catch(() => {});
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
