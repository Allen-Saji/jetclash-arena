/**
 * Devnet Integration Test
 *
 * Tests the full match lifecycle on Solana devnet + MagicBlock ER devnet:
 * 1. Create world + entities + components on Solana devnet
 * 2. Init arena + create match
 * 3. Delegate components to MagicBlock ER
 * 4. Send inputs + run ticks on ER
 * 5. Verify state updates on ER
 *
 * Run with:
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *   npx ts-mocha -p ./tsconfig.anchor.json -t 300000 tests/devnet-test.ts
 */
import { Connection, PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import {
  InitializeNewWorld,
  AddEntity,
  InitializeComponent,
  ApplySystem,
  DelegateComponent,
  FindComponentPda,
} from "@magicblock-labs/bolt-sdk";
import { expect } from "chai";
import { PlayerState } from "../target/types/player_state";
import { MatchState } from "../target/types/match_state";
import { ArenaConfig } from "../target/types/arena_config";
import { ProjectilePool } from "../target/types/projectile_pool";
import { PickupState } from "../target/types/pickup_state";
import { InitArena } from "../target/types/init_arena";
import { CreateMatch } from "../target/types/create_match";
import { ProcessInput } from "../target/types/process_input";
import { TickPhysics } from "../target/types/tick_physics";
import { TickCombat } from "../target/types/tick_combat";
import { TickPickups } from "../target/types/tick_pickups";

const ER_RPC = "https://devnet.magicblock.app";
const ER_WS = "wss://devnet.magicblock.app";

describe("Devnet Integration Test — Full Match Lifecycle", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const erConnection = new Connection(ER_RPC, {
    commitment: "confirmed",
    wsEndpoint: ER_WS,
  });
  const erProvider = new anchor.AnchorProvider(
    erConnection,
    provider.wallet,
    { commitment: "confirmed", skipPreflight: true }
  );

  let worldPda: PublicKey;
  let matchEntity: PublicKey;
  let p1Entity: PublicKey;
  let p2Entity: PublicKey;
  let projectileEntity: PublicKey;
  let pickupEntity: PublicKey;
  let arenaEntity: PublicKey;

  let matchStatePda: PublicKey;
  let p1StatePda: PublicKey;
  let p2StatePda: PublicKey;
  let projectilePoolPda: PublicKey;
  let pickupStatePda: PublicKey;
  let arenaConfigPda: PublicKey;

  const playerStateComp = anchor.workspace.PlayerState as anchor.Program<PlayerState>;
  const matchStateComp = anchor.workspace.MatchState as anchor.Program<MatchState>;
  const arenaConfigComp = anchor.workspace.ArenaConfig as anchor.Program<ArenaConfig>;
  const projectilePoolComp = anchor.workspace.ProjectilePool as anchor.Program<ProjectilePool>;
  const pickupStateComp = anchor.workspace.PickupState as anchor.Program<PickupState>;
  const initArenaSys = anchor.workspace.InitArena as anchor.Program<InitArena>;
  const createMatchSys = anchor.workspace.CreateMatch as anchor.Program<CreateMatch>;
  const processInputSys = anchor.workspace.ProcessInput as anchor.Program<ProcessInput>;
  const tickPhysicsSys = anchor.workspace.TickPhysics as anchor.Program<TickPhysics>;
  const tickCombatSys = anchor.workspace.TickCombat as anchor.Program<TickCombat>;
  const tickPickupsSys = anchor.workspace.TickPickups as anchor.Program<TickPickups>;

  // ── Phase 1: Setup on Solana Devnet ──

  it("Phase 1a: Create world on Solana devnet", async () => {
    const initWorld = await InitializeNewWorld({
      payer: provider.wallet.publicKey,
      connection: provider.connection,
    });
    const sig = await provider.sendAndConfirm(initWorld.transaction);
    worldPda = initWorld.worldPda;
    console.log(`  World: ${worldPda.toBase58()}`);
    console.log(`  Tx: ${sig.slice(0, 20)}...`);
  });

  it("Phase 1b: Create 6 entities", async () => {
    const entities: PublicKey[] = [];
    for (let i = 0; i < 6; i++) {
      const add = await AddEntity({
        payer: provider.wallet.publicKey,
        world: worldPda,
        connection: provider.connection,
      });
      await provider.sendAndConfirm(add.transaction);
      entities.push(add.entityPda);
    }
    [matchEntity, p1Entity, p2Entity, projectileEntity, pickupEntity, arenaEntity] = entities;
    console.log(`  6 entities created`);
  });

  it("Phase 1c: Initialize 6 components", async () => {
    const inits = [
      { entity: matchEntity, comp: matchStateComp, name: "MatchState" },
      { entity: p1Entity, comp: playerStateComp, name: "P1 PlayerState" },
      { entity: p2Entity, comp: playerStateComp, name: "P2 PlayerState" },
      { entity: projectileEntity, comp: projectilePoolComp, name: "ProjectilePool" },
      { entity: pickupEntity, comp: pickupStateComp, name: "PickupState" },
      { entity: arenaEntity, comp: arenaConfigComp, name: "ArenaConfig" },
    ];
    const pdas: PublicKey[] = [];
    for (const { entity, comp, name } of inits) {
      const result = await InitializeComponent({
        payer: provider.wallet.publicKey,
        entity,
        componentId: comp.programId,
      });
      await provider.sendAndConfirm(result.transaction);
      pdas.push(result.componentPda);
    }
    [matchStatePda, p1StatePda, p2StatePda, projectilePoolPda, pickupStatePda, arenaConfigPda] = pdas;
    console.log(`  6 components initialized`);
    console.log(`  MatchState PDA: ${matchStatePda.toBase58()}`);
    console.log(`  P1 PDA: ${p1StatePda.toBase58()}`);
  });

  // ── Phase 2: Init Arena + Create Match on Devnet ──

  it("Phase 2a: Init arena (platforms + spawns + pickups)", async () => {
    const apply = await ApplySystem({
      authority: provider.wallet.publicKey,
      systemId: initArenaSys.programId,
      world: worldPda,
      entities: [
        { entity: arenaEntity, components: [{ componentId: arenaConfigComp.programId }] },
        { entity: pickupEntity, components: [{ componentId: pickupStateComp.programId }] },
      ],
      args: {
        platforms: [
          { x: 0, y: 138000, w: 256000, h: 6000 },
          { x: 30000, y: 106000, w: 20000, h: 3000 },
          { x: 145000, y: 106000, w: 20000, h: 3000 },
          { x: 200000, y: 106000, w: 20000, h: 3000 },
        ],
        spawn_points: [
          { x: 50000, y: 132000 },
          { x: 206000, y: 132000 },
        ],
        pickup_positions: [
          { x: 40000, y: 101000, pickup_type: 0 },
          { x: 128000, y: 73000, pickup_type: 1 },
          { x: 210000, y: 103000, pickup_type: 0 },
        ],
        world_width: 256000,
        world_height: 144000,
        gravity: 80000,
      },
    });
    await provider.sendAndConfirm(apply.transaction);

    const arenaData = await arenaConfigComp.account.arenaConfig.fetch(arenaConfigPda);
    expect(arenaData.worldWidth).to.equal(256000);
    console.log(`  Arena: ${arenaData.platformCount} platforms, ${arenaData.spawnPointCount} spawns`);
  });

  it("Phase 2b: Create match", async () => {
    const apply = await ApplySystem({
      authority: provider.wallet.publicKey,
      systemId: createMatchSys.programId,
      world: worldPda,
      entities: [
        { entity: matchEntity, components: [{ componentId: matchStateComp.programId }] },
        { entity: p1Entity, components: [{ componentId: playerStateComp.programId }] },
        { entity: p2Entity, components: [{ componentId: playerStateComp.programId }] },
        { entity: projectileEntity, components: [{ componentId: projectilePoolComp.programId }] },
        { entity: pickupEntity, components: [{ componentId: pickupStateComp.programId }] },
      ],
      args: { p1_spawn_x: 50000, p1_spawn_y: 132000, p2_spawn_x: 206000, p2_spawn_y: 132000 },
    });
    await provider.sendAndConfirm(apply.transaction);

    const matchData = await matchStateComp.account.matchState.fetch(matchStatePda);
    expect(matchData.isActive).to.be.true;
    expect(matchData.ticksRemaining).to.equal(3600);

    const p1 = await playerStateComp.account.playerState.fetch(p1StatePda);
    expect(p1.hp).to.equal(100);

    console.log(`  Match: active=${matchData.isActive}, ticks=${matchData.ticksRemaining}`);
    console.log(`  P1: hp=${p1.hp}, pos=(${p1.posX}, ${p1.posY})`);
  });

  // ── Phase 3: Delegate to MagicBlock ER ──

  it("Phase 3: Delegate all 6 components to MagicBlock ER", async () => {
    const delegations = [
      { entity: matchEntity, componentId: matchStateComp.programId, name: "MatchState" },
      { entity: p1Entity, componentId: playerStateComp.programId, name: "P1" },
      { entity: p2Entity, componentId: playerStateComp.programId, name: "P2" },
      { entity: projectileEntity, componentId: projectilePoolComp.programId, name: "ProjectilePool" },
      { entity: pickupEntity, componentId: pickupStateComp.programId, name: "PickupState" },
      { entity: arenaEntity, componentId: arenaConfigComp.programId, name: "ArenaConfig" },
    ];

    for (const { entity, componentId, name } of delegations) {
      const result = await DelegateComponent({
        payer: provider.wallet.publicKey,
        entity,
        componentId,
      });
      const sig = await provider.sendAndConfirm(result.transaction);
      console.log(`  Delegated ${name}: ${sig.slice(0, 20)}...`);
    }
    console.log(`  All 6 components delegated to MagicBlock ER`);
  });

  // ── Phase 4: Gameplay on ER ──

  it("Phase 4a: Send process-input on ER (P1 moves right)", async () => {
    const apply = await ApplySystem({
      authority: erProvider.wallet.publicKey,
      systemId: processInputSys.programId,
      world: worldPda,
      entities: [
        { entity: p1Entity, components: [{ componentId: playerStateComp.programId }] },
        { entity: matchEntity, components: [{ componentId: matchStateComp.programId }] },
        { entity: projectileEntity, components: [{ componentId: projectilePoolComp.programId }] },
      ],
      args: { move_dir: 1, jet: false, dash: false, shoot_primary: false, shoot_secondary: false, input_seq: 1 },
    });
    const sig = await erProvider.sendAndConfirm(apply.transaction);
    console.log(`  process-input on ER: ${sig.slice(0, 20)}...`);

    // Fetch state from ER
    const p1Account = await erConnection.getAccountInfo(p1StatePda);
    expect(p1Account).to.not.be.null;
    console.log(`  P1 state on ER: ${p1Account!.data.length} bytes`);
  });

  it("Phase 4b: Run tick-physics on ER", async () => {
    const apply = await ApplySystem({
      authority: erProvider.wallet.publicKey,
      systemId: tickPhysicsSys.programId,
      world: worldPda,
      entities: [
        { entity: matchEntity, components: [{ componentId: matchStateComp.programId }] },
        { entity: p1Entity, components: [{ componentId: playerStateComp.programId }] },
        { entity: p2Entity, components: [{ componentId: playerStateComp.programId }] },
        { entity: arenaEntity, components: [{ componentId: arenaConfigComp.programId }] },
      ],
    });
    const sig = await erProvider.sendAndConfirm(apply.transaction);
    console.log(`  tick-physics on ER: ${sig.slice(0, 20)}...`);
  });

  it("Phase 4c: Run tick-combat on ER", async () => {
    const apply = await ApplySystem({
      authority: erProvider.wallet.publicKey,
      systemId: tickCombatSys.programId,
      world: worldPda,
      entities: [
        { entity: matchEntity, components: [{ componentId: matchStateComp.programId }] },
        { entity: p1Entity, components: [{ componentId: playerStateComp.programId }] },
        { entity: p2Entity, components: [{ componentId: playerStateComp.programId }] },
        { entity: projectileEntity, components: [{ componentId: projectilePoolComp.programId }] },
        { entity: arenaEntity, components: [{ componentId: arenaConfigComp.programId }] },
      ],
    });
    const sig = await erProvider.sendAndConfirm(apply.transaction);
    console.log(`  tick-combat on ER: ${sig.slice(0, 20)}...`);
  });

  it("Phase 4d: Run tick-pickups on ER", async () => {
    const apply = await ApplySystem({
      authority: erProvider.wallet.publicKey,
      systemId: tickPickupsSys.programId,
      world: worldPda,
      entities: [
        { entity: matchEntity, components: [{ componentId: matchStateComp.programId }] },
        { entity: p1Entity, components: [{ componentId: playerStateComp.programId }] },
        { entity: p2Entity, components: [{ componentId: playerStateComp.programId }] },
        { entity: pickupEntity, components: [{ componentId: pickupStateComp.programId }] },
      ],
    });
    const sig = await erProvider.sendAndConfirm(apply.transaction);
    console.log(`  tick-pickups on ER: ${sig.slice(0, 20)}...`);
  });

  // ── Phase 5: Verify state on ER ──

  it("Phase 5: Verify game state advanced on ER", async () => {
    // Read raw account data from ER and manually deserialize
    // (account owner on ER is delegation program, so anchor fetch() won't work)
    const matchAccount = await erConnection.getAccountInfo(matchStatePda);
    expect(matchAccount).to.not.be.null;
    const md = matchAccount!.data;
    console.log(`  MatchState on ER: ${md.length} bytes, owner=${matchAccount!.owner.toBase58()}`);

    // MatchState layout after 8-byte discriminator:
    //   match_id: Pubkey(32) @8, player1: Pubkey(32) @40, player2: Pubkey(32) @72
    //   tick: u32 @104, ticks_remaining: u32 @108
    //   p1_score: u32 @112, p1_kills: u16 @116, p2_score: u32 @118, p2_kills: u16 @122
    //   is_active: bool @124, winner: u8 @125
    const tick = md.readUInt32LE(104);
    const ticksRemaining = md.readUInt32LE(108);
    const isActive = md.readUInt8(124) !== 0;
    console.log(`  Match: tick=${tick}, ticksRemaining=${ticksRemaining}, active=${isActive}`);
    expect(tick).to.be.greaterThan(0);
    expect(ticksRemaining).to.be.lessThan(3600);

    const p1Account = await erConnection.getAccountInfo(p1StatePda);
    expect(p1Account).to.not.be.null;
    const pd = p1Account!.data;
    console.log(`  P1 PlayerState on ER: ${pd.length} bytes`);

    // PlayerState layout after 8-byte discriminator:
    //   player_authority: Pubkey(32) @8
    //   pos_x: i32 @40, pos_y: i32 @44, vel_x: i32 @48, vel_y: i32 @52
    //   hp: u8 @56, fuel: u16 @57, primary_ammo: u8 @59, secondary_ammo: u8 @60
    //   facing_right..dash_active: 4 bools @61-64, speed_multiplier: u16 @65
    //   invincible_until_tick: u32 @67, respawn_at_tick: u32 @71
    //   dash_cooldown_tick: u32 @75, primary_cooldown_tick: u32 @79
    //   secondary_cooldown_tick: u32 @83, primary_reload_tick: u32 @87
    //   secondary_reload_tick: u32 @91, speed_buff_until_tick: u32 @95
    //   input_seq: u32 @99, kills: u16 @103, deaths: u16 @105, score: u32 @107
    //   player_index: u8 @111
    const posX = pd.readInt32LE(40);
    const posY = pd.readInt32LE(44);
    const velX = pd.readInt32LE(48);
    const hp = pd.readUInt8(56);
    const inputSeq = pd.readUInt32LE(99);
    console.log(`  P1: hp=${hp}, pos=(${posX}, ${posY}), velX=${velX}, inputSeq=${inputSeq}`);
    expect(inputSeq).to.equal(1);

    console.log(`\n  === DEVNET TEST COMPLETE ===`);
    console.log(`  All systems executed successfully on MagicBlock ER!`);
    console.log(`  World: ${worldPda.toBase58()}`);
  });
});
