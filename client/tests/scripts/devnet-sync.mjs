/**
 * Devnet sync diagnostic — focused on finding exactly where sync breaks
 *
 * Usage: node test-devnet-sync.mjs [p1-keypair.json] [p2-keypair.json]
 */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { Connection, PublicKey } from '@solana/web3.js';

const bs58 = (await import('bs58')).default;
const p1KeyFile = process.argv[2] || '/tmp/jc-p1.json';
const p2KeyFile = process.argv[3] || '/tmp/jc-p2.json';
const p1Key = bs58.encode(Buffer.from(JSON.parse(readFileSync(p1KeyFile))));
const p2Key = bs58.encode(Buffer.from(JSON.parse(readFileSync(p2KeyFile))));

const GAME_URL = 'http://localhost:3000';
const ER_RPC = 'https://devnet.magicblock.app';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

console.log('=== JetClash Devnet Sync Diagnostic ===\n');

// Check Vite
try {
  const res = await fetch(GAME_URL);
  if (!res.ok) throw new Error('not ok');
} catch {
  console.error('✗ Vite not running on :3000');
  process.exit(1);
}

const browser = await chromium.launch({ headless: false, slowMo: 50 });

// Collect ALL logs (not just filtered ones)
const ctx1 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const p1 = await ctx1.newPage();
const p1Logs = [];
p1.on('console', msg => {
  const t = msg.text();
  p1Logs.push(t);
  // Log everything interesting
  if (t.includes('[') && !t.includes('[vite]') && !t.includes('[HMR]'))
    console.log(`  [P1] ${t.slice(0, 200)}`);
});
p1.on('pageerror', err => console.error(`  [P1 ERROR] ${err.message.slice(0, 300)}`));

const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const p2 = await ctx2.newPage();
const p2Logs = [];
p2.on('console', msg => {
  const t = msg.text();
  p2Logs.push(t);
  if (t.includes('[') && !t.includes('[vite]') && !t.includes('[HMR]'))
    console.log(`  [P2] ${t.slice(0, 200)}`);
});
p2.on('pageerror', err => console.error(`  [P2 ERROR] ${err.message.slice(0, 300)}`));

try {
  // P1: load + create room
  console.log('\n── Step 1: P1 creates room ──');
  await p1.goto(`${GAME_URL}?devnet&key=${p1Key}`);
  await sleep(4000);
  await p1.click('canvas', { position: { x: 640, y: 480 } }); // ONLINE
  await sleep(8000);
  await p1.click('canvas', { position: { x: 640, y: 330 } }); // CREATE ROOM

  let roomCode = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 120_000) {
    await sleep(2000);
    const roomLog = p1Logs.find(l => l.includes('[Lobby] Room code:'));
    if (roomLog) { roomCode = roomLog.split('Room code: ')[1]?.trim(); break; }
    if (p1Logs.find(l => l.includes('Room creation failed'))) throw new Error('Room creation failed');
  }
  if (!roomCode) throw new Error('Room code not found');
  console.log(`\n✓ Room: ${roomCode}\n`);

  // P2: join room
  console.log('── Step 2: P2 joins room ──');
  await p2.goto(`${GAME_URL}?devnet&key=${p2Key}&room=${roomCode}`);
  await sleep(12000);

  // Both ready
  console.log('\n── Step 3: Ready up ──');
  await p1.click('canvas', { position: { x: 640, y: 450 } });
  await sleep(3000);
  await p2.click('canvas', { position: { x: 640, y: 450 } });
  await sleep(5000);

  // Start match
  console.log('\n── Step 4: Start match + delegation ──');
  await p1.click('canvas', { position: { x: 640, y: 510 } });
  await sleep(25000); // delegation + warmup + first crank

  await p1.screenshot({ path: '/tmp/jc-diag-gameplay.png' });

  // Now inject diagnostics: query ER directly for account data
  console.log('\n── Step 5: Direct ER account query ──');

  // Get the player pool PDA from P1's logs
  const pPoolLog = p1Logs.find(l => l.includes('playerPool:'));
  const mStateLog = p1Logs.find(l => l.includes('matchState:'));
  console.log('  PDA logs:', pPoolLog?.slice(0, 100), mStateLog?.slice(0, 100));

  // Query ER directly from this script
  const erConn = new Connection(ER_RPC, 'confirmed');

  // Find world PDA from room code
  const worldPda = new PublicKey(roomCode);
  console.log('  World PDA:', worldPda.toBase58());

  // Try to read accounts on ER
  const MATCH_STATE_ID = new PublicKey('5ycjVn86LtopfCGL8hLVYp3KTQzTvGyDfTVSXGAKirnB');
  const PLAYER_POOL_ID = new PublicKey('4n1pmeKn5BkXqPDSuaTnrC8kJqo17tM9AVQbfpTExnbz');

  // Get program accounts on ER owned by matchState and playerPool
  const erMatchAccts = await erConn.getProgramAccounts(MATCH_STATE_ID).catch(e => { console.log('  ER matchState fetch err:', e.message.slice(0,100)); return []; });
  const erPlayerAccts = await erConn.getProgramAccounts(PLAYER_POOL_ID).catch(e => { console.log('  ER playerPool fetch err:', e.message.slice(0,100)); return []; });
  console.log(`  ER matchState accounts: ${erMatchAccts.length}`);
  console.log(`  ER playerPool accounts: ${erPlayerAccts.length}`);

  // Also check L1 for same accounts
  const l1Conn = new Connection('https://api.devnet.solana.com', 'confirmed');

  // Read match state from both L1 and ER to compare
  if (erMatchAccts.length > 0) {
    const matchPda = erMatchAccts[0].pubkey;
    console.log(`\n  Match PDA: ${matchPda.toBase58()}`);

    const erMatch = erMatchAccts[0].account;
    const l1Match = await l1Conn.getAccountInfo(matchPda);

    // Parse tick from both
    const erData = new Uint8Array(erMatch.data);
    const erTick = new DataView(erData.buffer, erData.byteOffset).getUint32(8 + 128 + 4, true); // after discriminator + 4 pubkeys + player_count+ready_mask+is_lobby+min_players
    console.log(`  ER matchState tick: ${erTick}`);
    console.log(`  ER matchState owner: ${erMatch.owner.toBase58()}`);

    if (l1Match) {
      const l1Data = new Uint8Array(l1Match.data);
      const l1Tick = new DataView(l1Data.buffer, l1Data.byteOffset).getUint32(8 + 128 + 4, true);
      console.log(`  L1 matchState tick: ${l1Tick}`);
      console.log(`  L1 matchState owner: ${l1Match.owner.toBase58()}`);
    } else {
      console.log('  L1 matchState: not found (delegated?)');
    }
  }

  if (erPlayerAccts.length > 0) {
    const poolPda = erPlayerAccts[0].pubkey;
    console.log(`\n  PlayerPool PDA: ${poolPda.toBase58()}`);

    const erPool = erPlayerAccts[0].account;
    const erData = new Uint8Array(erPool.data);

    // Parse first player's pos from ER
    // PlayerData starts at offset 8 (discriminator)
    // posX: i32, posY: i32, velX: i32, velY: i32, hp: u8, ...
    const dv = new DataView(erData.buffer, erData.byteOffset);
    for (let i = 0; i < 2; i++) {
      const base = 8 + i * 74;
      const px = dv.getInt32(base, true);
      const py = dv.getInt32(base + 4, true);
      const vx = dv.getInt32(base + 8, true);
      const vy = dv.getInt32(base + 12, true);
      const hp = erData[base + 16];
      const inputSeq = dv.getUint32(base + 62, true); // offset within PlayerData
      const isJoined = erData[base + 71];
      console.log(`  ER Player ${i}: pos=(${px},${py}) vel=(${vx},${vy}) hp=${hp} inputSeq=${inputSeq} joined=${isJoined}`);
    }

    // Check L1 for same account
    const l1Pool = await l1Conn.getAccountInfo(poolPda);
    if (l1Pool) {
      const l1Data = new Uint8Array(l1Pool.data);
      const ldv = new DataView(l1Data.buffer, l1Data.byteOffset);
      for (let i = 0; i < 2; i++) {
        const base = 8 + i * 74;
        const px = ldv.getInt32(base, true);
        const py = ldv.getInt32(base + 4, true);
        const inputSeq = ldv.getUint32(base + 62, true);
        const isJoined = l1Data[base + 71];
        console.log(`  L1 Player ${i}: pos=(${px},${py}) inputSeq=${inputSeq} joined=${isJoined}`);
      }
    }
  }

  // Step 6: P1 moves right for 5 seconds, then re-query
  console.log('\n── Step 6: P1 moves right for 5s ──');
  await p1.keyboard.down('KeyD');
  await sleep(5000);
  await p1.keyboard.up('KeyD');
  await sleep(2000);

  // Re-query ER
  console.log('\n── Step 7: Re-query ER after P1 input ──');
  const erPlayerAccts2 = await erConn.getProgramAccounts(PLAYER_POOL_ID).catch(() => []);
  if (erPlayerAccts2.length > 0) {
    const erPool = erPlayerAccts2[0].account;
    const erData = new Uint8Array(erPool.data);
    const dv = new DataView(erData.buffer, erData.byteOffset);
    for (let i = 0; i < 2; i++) {
      const base = 8 + i * 74;
      const px = dv.getInt32(base, true);
      const py = dv.getInt32(base + 4, true);
      const vx = dv.getInt32(base + 8, true);
      const vy = dv.getInt32(base + 12, true);
      const inputSeq = dv.getUint32(base + 62, true);
      console.log(`  ER Player ${i}: pos=(${px},${py}) vel=(${vx},${vy}) inputSeq=${inputSeq}`);
    }
  }

  // Also re-query matchState for tick advancement
  const erMatchAccts2 = await erConn.getProgramAccounts(MATCH_STATE_ID).catch(() => []);
  if (erMatchAccts2.length > 0) {
    const erData = new Uint8Array(erMatchAccts2[0].account.data);
    const erTick = new DataView(erData.buffer, erData.byteOffset).getUint32(8 + 128 + 4, true);
    const ticksRem = new DataView(erData.buffer, erData.byteOffset).getUint32(8 + 128 + 8, true);
    const isActive = erData[8 + 128 + 12];
    console.log(`  ER matchState: tick=${erTick} ticksRemaining=${ticksRem} isActive=${isActive}`);
  }

  await p1.screenshot({ path: '/tmp/jc-diag-after-input.png' });
  await p2.screenshot({ path: '/tmp/jc-diag-p2-after-input.png' });

  // Check crank TX count
  const crankCountLog = p1Logs.filter(l => l.includes('[Crank]'));
  console.log(`\nCrank log messages: ${crankCountLog.length}`);
  crankCountLog.forEach(l => console.log(`  ${l.slice(0, 150)}`));

  const inputLogs = p1Logs.filter(l => l.includes('ProcessInput') || l.includes('[InputSender]'));
  console.log(`\nInput log messages: ${inputLogs.length}`);
  inputLogs.slice(-10).forEach(l => console.log(`  ${l.slice(0, 150)}`));

  const syncLogs = [...p1Logs, ...p2Logs].filter(l => l.includes('[StateSync]'));
  console.log(`\nStateSync messages: ${syncLogs.length}`);
  syncLogs.forEach(l => console.log(`  ${l.slice(0, 150)}`));

  console.log('\n✓ Diagnostic complete');

} catch (err) {
  console.error(`\n✗ Error: ${err.message}`);
  await p1.screenshot({ path: '/tmp/jc-diag-error-p1.png' }).catch(() => {});
  await p2.screenshot({ path: '/tmp/jc-diag-error-p2.png' }).catch(() => {});
  console.log('\nP1 recent logs:');
  p1Logs.slice(-25).forEach(l => console.log(`  ${l.slice(0, 200)}`));
  console.log('\nP2 recent logs:');
  p2Logs.slice(-25).forEach(l => console.log(`  ${l.slice(0, 200)}`));
} finally {
  await browser.close();
}
