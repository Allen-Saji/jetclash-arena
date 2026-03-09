/**
 * Debug test: directly triggers Phaser scene transitions and verifies on-chain state.
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
  console.log('=== Online Multiplayer Debug Test v2 ===\n');

  const worldCountBefore = await getWorldCount();
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });

  const p1Warns = [], p2Warns = [];
  const page1 = await ctx.newPage();
  page1.on('console', m => { if (m.type() === 'warning') p1Warns.push(m.text()); });
  page1.on('pageerror', e => p1Warns.push(`PAGE_ERROR: ${e.message}`));
  const page2 = await ctx.newPage();
  page2.on('console', m => { if (m.type() === 'warning') p2Warns.push(m.text()); });
  page2.on('pageerror', e => p2Warns.push(`PAGE_ERROR: ${e.message}`));

  try {
    // --- P1: Navigate and use page.evaluate to start scene directly ---
    console.log('1. P1 navigating...');
    await page1.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(2000);

    // Use scene manager to go to Lobby then create room
    console.log('2. P1 starting Lobby scene via evaluate...');
    await page1.evaluate(() => {
      const game = window.__PHASER_GAME__;
      if (game) game.scene.start('Lobby');
    });
    // Fallback: click the canvas at ONLINE button position
    await page1.click('canvas', { position: { x: 640, y: 480 } });
    await sleep(2000);

    // Click CREATE ROOM
    console.log('3. P1 clicking CREATE ROOM...');
    await page1.click('canvas', { position: { x: 640, y: 330 } });

    // Wait for world creation
    console.log('   Waiting for room...');
    let newWorldId = -1;
    for (let i = 0; i < 60; i++) {
      await sleep(1000);
      const wc = await getWorldCount();
      if (wc > worldCountBefore) {
        newWorldId = wc - 1;
        const ms = await readMatchState(newWorldId);
        if (ms && ms.playerCount >= 1) {
          console.log(`   Room created! World: ${newWorldId}, players: ${ms.playerCount}`);
          break;
        }
      }
      if (i % 10 === 0) console.log(`   ...waiting (${i}s)`);
    }
    if (newWorldId === -1) throw new Error('Room creation timed out after 60s');

    const worldPda = FindWorldPda({ worldId: new BN(newWorldId) });
    const roomCode = worldPda.toBase58();

    // --- P2: Join via URL ---
    console.log(`\n4. P2 joining room ${roomCode.slice(0,8)}...`);
    await page2.goto(`${URL}?room=${roomCode}`, { waitUntil: 'networkidle', timeout: 30000 });

    // Wait for join
    for (let i = 0; i < 30; i++) {
      await sleep(1000);
      const ms = await readMatchState(newWorldId);
      if (ms && ms.playerCount >= 2) {
        console.log(`   P2 joined! playerCount: ${ms.playerCount}`);
        break;
      }
      if (i === 29) console.log('   WARNING: P2 join timed out');
    }

    let ms = await readMatchState(newWorldId);
    if (ms.playerCount < 2) {
      console.log('   P2 did not join. MatchState:', JSON.stringify(ms));
      console.log('   P2 warnings:', p2Warns.slice(-5));
      throw new Error('P2 failed to join');
    }

    // --- Ready up ---
    console.log('\n5. Both players ready up...');
    // P1 READY at y=450
    await page1.click('canvas', { position: { x: 640, y: 450 } });
    await sleep(3000);
    // P2 READY at y=450
    await page2.click('canvas', { position: { x: 640, y: 450 } });
    await sleep(3000);

    ms = await readMatchState(newWorldId);
    console.log(`   readyMask: ${ms.readyMask} (need 3)`);

    if (ms.readyMask !== 3) {
      // Try clicking again at slightly different positions
      console.log('   Retrying ready clicks...');
      await page1.click('canvas', { position: { x: 640, y: 445 } });
      await sleep(2000);
      await page2.click('canvas', { position: { x: 640, y: 445 } });
      await sleep(2000);
      ms = await readMatchState(newWorldId);
      console.log(`   readyMask: ${ms.readyMask}`);
    }

    // --- Start match ---
    console.log('\n6. P1 starting match...');
    // START MATCH button at y=510
    await page1.click('canvas', { position: { x: 640, y: 510 } });
    await sleep(5000);

    ms = await readMatchState(newWorldId);
    console.log(`   isActive: ${ms.isActive}, isLobby: ${ms.isLobby}, tick: ${ms.tick}`);

    if (!ms.isActive) {
      // One more try
      await page1.click('canvas', { position: { x: 640, y: 505 } });
      await sleep(5000);
      ms = await readMatchState(newWorldId);
      console.log(`   Retry: isActive: ${ms.isActive}, tick: ${ms.tick}`);
    }

    if (!ms.isActive) {
      throw new Error('Match did not start');
    }

    // --- Check crank ---
    console.log('\n7. Checking crank (3s wait)...');
    const tickBefore = ms.tick;
    await sleep(3000);
    ms = await readMatchState(newWorldId);
    console.log(`   tick: ${tickBefore} -> ${ms.tick} (delta: ${ms.tick - tickBefore})`);

    if (ms.tick > tickBefore) {
      console.log(`   CRANK OK: ~${Math.round((ms.tick - tickBefore)/3)} ticks/sec`);
    } else {
      console.log('   *** CRANK NOT RUNNING ***');
    }

    // --- Check input ---
    console.log('\n8. P1 pressing D (move right) 3s...');
    let pool = await readPlayerPool(newWorldId);
    const initSeq = pool[0].inputSeq;
    const initPosX = pool[0].posX;

    // Focus canvas and press key
    await page1.focus('canvas');
    await page1.keyboard.down('d');
    await sleep(3000);
    await page1.keyboard.up('d');
    await sleep(500);

    pool = await readPlayerPool(newWorldId);
    ms = await readMatchState(newWorldId);
    console.log(`   inputSeq: ${initSeq} -> ${pool[0].inputSeq}`);
    console.log(`   posX: ${initPosX} -> ${pool[0].posX} (delta: ${pool[0].posX - initPosX})`);
    console.log(`   velX: ${pool[0].velX}`);

    // --- Check jetpack ---
    console.log('\n9. P1 pressing W (jetpack) 2s...');
    const fuelBefore = pool[0].fuel;
    await page1.focus('canvas');
    await page1.keyboard.down('w');
    await sleep(2000);
    await page1.keyboard.up('w');
    await sleep(500);

    pool = await readPlayerPool(newWorldId);
    console.log(`   fuel: ${fuelBefore} -> ${pool[0].fuel}`);
    console.log(`   velY: ${pool[0].velY}, posY: ${pool[0].posY}`);

    // --- Summary ---
    console.log('\n=== SUMMARY ===');
    ms = await readMatchState(newWorldId);
    pool = await readPlayerPool(newWorldId);
    console.log('Match:', JSON.stringify(ms));
    pool.filter(p => p.isJoined).forEach((p, i) => console.log(`P${i}:`, JSON.stringify(p)));
    console.log('P1 warns:', p1Warns.filter(w => !w.includes('GPU') && !w.includes('WebGL')).slice(-5));
    console.log('P2 warns:', p2Warns.filter(w => !w.includes('GPU') && !w.includes('WebGL')).slice(-5));

  } catch (err) {
    console.error('\nFAILED:', err.message);
    console.log('P1 warns:', p1Warns.filter(w => !w.includes('GPU')).slice(-10));
    console.log('P2 warns:', p2Warns.filter(w => !w.includes('GPU')).slice(-10));
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
