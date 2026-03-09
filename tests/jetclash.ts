import { PublicKey, Keypair } from "@solana/web3.js";
import { PlayerPool } from "../target/types/player_pool";
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
import { TickProjectiles } from "../target/types/tick_projectiles";
import { JoinMatch } from "../target/types/join_match";
import { ReadyUp } from "../target/types/ready_up";
import { StartMatch } from "../target/types/start_match";
import { SettleMatch } from "../target/types/settle_match";
import {
  InitializeNewWorld,
  AddEntity,
  InitializeComponent,
  ApplySystem,
  Program,
} from "@magicblock-labs/bolt-sdk";
import { expect } from "chai";
import * as anchor from "@coral-xyz/anchor";

describe("JetClash Arena On-Chain (4-Player)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  let worldPda: PublicKey;
  let matchEntity: PublicKey;
  let playerPoolEntity: PublicKey;
  let projectileEntity: PublicKey;
  let pickupEntity: PublicKey;
  let arenaEntity: PublicKey;

  let matchStatePda: PublicKey;
  let playerPoolPda: PublicKey;
  let projectilePoolPda: PublicKey;
  let pickupStatePda: PublicKey;
  let arenaConfigPda: PublicKey;

  const playerPoolComp = anchor.workspace.PlayerPool as Program<PlayerPool>;
  const matchStateComp = anchor.workspace.MatchState as Program<MatchState>;
  const arenaConfigComp = anchor.workspace.ArenaConfig as Program<ArenaConfig>;
  const projectilePoolComp = anchor.workspace.ProjectilePool as Program<ProjectilePool>;
  const pickupStateComp = anchor.workspace.PickupState as Program<PickupState>;

  const initArenaSys = anchor.workspace.InitArena as Program<InitArena>;
  const createMatchSys = anchor.workspace.CreateMatch as Program<CreateMatch>;
  const processInputSys = anchor.workspace.ProcessInput as Program<ProcessInput>;
  const tickPhysicsSys = anchor.workspace.TickPhysics as Program<TickPhysics>;
  const tickCombatSys = anchor.workspace.TickCombat as Program<TickCombat>;
  const tickPickupsSys = anchor.workspace.TickPickups as Program<TickPickups>;
  const tickProjectilesSys = anchor.workspace.TickProjectiles as Program<TickProjectiles>;
  const joinMatchSys = anchor.workspace.JoinMatch as Program<JoinMatch>;
  const readyUpSys = anchor.workspace.ReadyUp as Program<ReadyUp>;
  const startMatchSys = anchor.workspace.StartMatch as Program<StartMatch>;
  const settleMatchSys = anchor.workspace.SettleMatch as Program<SettleMatch>;

  const player2Kp = Keypair.generate();

  // ─── Setup ──────────────────────────────────────────────────

  it("Initialize world", async () => {
    const initNewWorld = await InitializeNewWorld({
      payer: provider.wallet.publicKey,
      connection: provider.connection,
    });
    await provider.sendAndConfirm(initNewWorld.transaction);
    worldPda = initNewWorld.worldPda;
    console.log(`  World: ${worldPda}`);
  });

  it("Create 5 entities", async () => {
    const entities: PublicKey[] = [];
    for (let i = 0; i < 5; i++) {
      const addEntity = await AddEntity({
        payer: provider.wallet.publicKey,
        world: worldPda,
        connection: provider.connection,
      });
      await provider.sendAndConfirm(addEntity.transaction);
      entities.push(addEntity.entityPda);
    }
    [matchEntity, playerPoolEntity, projectileEntity, pickupEntity, arenaEntity] = entities;
    console.log(`  Created 5 entities`);
  });

  it("Initialize 5 components", async () => {
    const inits = [
      { entity: matchEntity, comp: matchStateComp },
      { entity: playerPoolEntity, comp: playerPoolComp },
      { entity: projectileEntity, comp: projectilePoolComp },
      { entity: pickupEntity, comp: pickupStateComp },
      { entity: arenaEntity, comp: arenaConfigComp },
    ];

    const pdas: PublicKey[] = [];
    for (const init of inits) {
      const result = await InitializeComponent({
        payer: provider.wallet.publicKey,
        entity: init.entity,
        componentId: init.comp.programId,
      });
      await provider.sendAndConfirm(result.transaction);
      pdas.push(result.componentPda);
    }
    [matchStatePda, playerPoolPda, projectilePoolPda, pickupStatePda, arenaConfigPda] = pdas;
    console.log(`  All 5 components initialized`);
  });

  // ─── Arena Init ─────────────────────────────────────────────

  it("Init arena", async () => {
    const arenaArgs = {
      platforms: [
        { x: 0, y: 138000, w: 256000, h: 6000 },
        { x: 30000, y: 106000, w: 20000, h: 3000 },
        { x: 145000, y: 106000, w: 20000, h: 3000 },
        { x: 200000, y: 106000, w: 20000, h: 3000 },
      ],
      spawn_points: [
        { x: 50000, y: 132000 },
        { x: 206000, y: 132000 },
        { x: 80000, y: 100000 },
        { x: 170000, y: 100000 },
      ],
      pickup_positions: [
        { x: 40000, y: 101000, pickup_type: 0 },
        { x: 128000, y: 73000, pickup_type: 1 },
        { x: 210000, y: 103000, pickup_type: 0 },
      ],
      world_width: 256000,
      world_height: 144000,
      gravity: 80000,
    };

    const applySystem = await ApplySystem({
      authority: provider.wallet.publicKey,
      systemId: initArenaSys.programId,
      world: worldPda,
      entities: [
        { entity: arenaEntity, components: [{ componentId: arenaConfigComp.programId }] },
        { entity: pickupEntity, components: [{ componentId: pickupStateComp.programId }] },
      ],
      args: arenaArgs,
    });
    await provider.sendAndConfirm(applySystem.transaction);

    const arenaData = await arenaConfigComp.account.arenaConfig.fetch(arenaConfigPda);
    expect(arenaData.worldWidth).to.equal(256000);
    expect(arenaData.platformCount).to.equal(4);
    expect(arenaData.spawnPointCount).to.equal(4);
    console.log(`  Arena: ${arenaData.platformCount} platforms, ${arenaData.spawnPointCount} spawns`);
  });

  // ─── Lobby Flow ─────────────────────────────────────────────

  it("Create match (lobby)", async () => {
    const hostKey = provider.wallet.publicKey;
    const createArgs = {
      host_authority: Array.from(hostKey.toBytes()),
      character_id: 0,
      min_players: 2,
    };

    const applySystem = await ApplySystem({
      authority: provider.wallet.publicKey,
      systemId: createMatchSys.programId,
      world: worldPda,
      entities: [
        { entity: matchEntity, components: [{ componentId: matchStateComp.programId }] },
        { entity: playerPoolEntity, components: [{ componentId: playerPoolComp.programId }] },
        { entity: projectileEntity, components: [{ componentId: projectilePoolComp.programId }] },
        { entity: pickupEntity, components: [{ componentId: pickupStateComp.programId }] },
      ],
      args: createArgs,
    });
    await provider.sendAndConfirm(applySystem.transaction);

    const matchData = await matchStateComp.account.matchState.fetch(matchStatePda);
    expect(matchData.isLobby).to.be.true;
    expect(matchData.isActive).to.be.false;
    expect(matchData.playerCount).to.equal(1);
    expect(matchData.players[0].toBase58()).to.equal(hostKey.toBase58());
    console.log(`  Lobby created, host=${hostKey.toBase58().slice(0, 8)}..., players=${matchData.playerCount}`);

    const poolData = await playerPoolComp.account.playerPool.fetch(playerPoolPda);
    const p0 = (poolData.players as any[])[0];
    expect(p0.isJoined).to.be.true;
    expect(p0.hp).to.equal(100);
    console.log(`  Host auto-joined as player 0`);
  });

  it("Player 2 joins match", async () => {
    const joinArgs = {
      player_authority: Array.from(player2Kp.publicKey.toBytes()),
      character_id: 1,
    };

    const applySystem = await ApplySystem({
      authority: provider.wallet.publicKey,
      systemId: joinMatchSys.programId,
      world: worldPda,
      entities: [
        { entity: matchEntity, components: [{ componentId: matchStateComp.programId }] },
        { entity: playerPoolEntity, components: [{ componentId: playerPoolComp.programId }] },
      ],
      args: joinArgs,
    });
    await provider.sendAndConfirm(applySystem.transaction);

    const matchData = await matchStateComp.account.matchState.fetch(matchStatePda);
    expect(matchData.playerCount).to.equal(2);

    const poolData = await playerPoolComp.account.playerPool.fetch(playerPoolPda);
    const p1 = (poolData.players as any[])[1];
    expect(p1.isJoined).to.be.true;
    expect(p1.characterId).to.equal(1);
    console.log(`  Player 2 joined, count=${matchData.playerCount}`);
  });

  it("Both players ready up", async () => {
    // Player 0 ready
    const applyR0 = await ApplySystem({
      authority: provider.wallet.publicKey,
      systemId: readyUpSys.programId,
      world: worldPda,
      entities: [
        { entity: matchEntity, components: [{ componentId: matchStateComp.programId }] },
      ],
      args: { player_index: 0 },
    });
    await provider.sendAndConfirm(applyR0.transaction);

    // Player 1 ready
    const applyR1 = await ApplySystem({
      authority: provider.wallet.publicKey,
      systemId: readyUpSys.programId,
      world: worldPda,
      entities: [
        { entity: matchEntity, components: [{ componentId: matchStateComp.programId }] },
      ],
      args: { player_index: 1 },
    });
    await provider.sendAndConfirm(applyR1.transaction);

    const matchData = await matchStateComp.account.matchState.fetch(matchStatePda);
    expect(matchData.readyMask).to.equal(3); // 0b11
    console.log(`  Ready mask: ${matchData.readyMask.toString(2)}`);
  });

  it("Start match", async () => {
    const startArgs = {
      spawn_positions: [
        [50000, 132000],
        [206000, 132000],
        [80000, 100000],
        [170000, 100000],
      ],
    };

    const applySystem = await ApplySystem({
      authority: provider.wallet.publicKey,
      systemId: startMatchSys.programId,
      world: worldPda,
      entities: [
        { entity: matchEntity, components: [{ componentId: matchStateComp.programId }] },
        { entity: playerPoolEntity, components: [{ componentId: playerPoolComp.programId }] },
        { entity: projectileEntity, components: [{ componentId: projectilePoolComp.programId }] },
        { entity: pickupEntity, components: [{ componentId: pickupStateComp.programId }] },
      ],
      args: startArgs,
    });
    await provider.sendAndConfirm(applySystem.transaction);

    const matchData = await matchStateComp.account.matchState.fetch(matchStatePda);
    expect(matchData.isActive).to.be.true;
    expect(matchData.isLobby).to.be.false;
    expect(matchData.ticksRemaining).to.equal(3600);

    const poolData = await playerPoolComp.account.playerPool.fetch(playerPoolPda);
    const p0 = (poolData.players as any[])[0];
    expect(p0.posX).to.equal(50000);
    expect(p0.hp).to.equal(100);
    expect(p0.isInvincible).to.be.true;
    const p1 = (poolData.players as any[])[1];
    expect(p1.posX).to.equal(206000);
    console.log(`  Match started! P0=(${p0.posX},${p0.posY}) P1=(${p1.posX},${p1.posY})`);
  });

  // ─── Gameplay ───────────────────────────────────────────────

  it("Process input - P0 moves right", async () => {
    const inputArgs = {
      player_index: 0,
      move_dir: 1, jet: false, dash: false,
      shoot_primary: false, shoot_secondary: false,
      input_seq: 1,
    };

    const applySystem = await ApplySystem({
      authority: provider.wallet.publicKey,
      systemId: processInputSys.programId,
      world: worldPda,
      entities: [
        { entity: playerPoolEntity, components: [{ componentId: playerPoolComp.programId }] },
        { entity: matchEntity, components: [{ componentId: matchStateComp.programId }] },
        { entity: projectileEntity, components: [{ componentId: projectilePoolComp.programId }] },
      ],
      args: inputArgs,
    });
    await provider.sendAndConfirm(applySystem.transaction);

    const poolData = await playerPoolComp.account.playerPool.fetch(playerPoolPda);
    const p0 = (poolData.players as any[])[0];
    expect(p0.velX).to.be.greaterThan(0);
    expect(p0.inputSeq).to.equal(1);
    console.log(`  P0 vel_x=${p0.velX}, input_seq=${p0.inputSeq}`);
  });

  it("Tick physics", async () => {
    const applySystem = await ApplySystem({
      authority: provider.wallet.publicKey,
      systemId: tickPhysicsSys.programId,
      world: worldPda,
      entities: [
        { entity: matchEntity, components: [{ componentId: matchStateComp.programId }] },
        { entity: playerPoolEntity, components: [{ componentId: playerPoolComp.programId }] },
        { entity: arenaEntity, components: [{ componentId: arenaConfigComp.programId }] },
      ],
    });
    await provider.sendAndConfirm(applySystem.transaction);

    const matchData = await matchStateComp.account.matchState.fetch(matchStatePda);
    expect(matchData.tick).to.equal(1);
    expect(matchData.ticksRemaining).to.equal(3599);

    const poolData = await playerPoolComp.account.playerPool.fetch(playerPoolPda);
    const p0 = (poolData.players as any[])[0];
    expect(p0.posX).to.be.greaterThan(50000);
    console.log(`  Tick=${matchData.tick}, P0 pos=(${p0.posX}, ${p0.posY})`);
  });

  it("Process input - P0 shoots", async () => {
    const inputArgs = {
      player_index: 0,
      move_dir: 0, jet: false, dash: false,
      shoot_primary: true, shoot_secondary: false,
      input_seq: 2,
    };

    const applySystem = await ApplySystem({
      authority: provider.wallet.publicKey,
      systemId: processInputSys.programId,
      world: worldPda,
      entities: [
        { entity: playerPoolEntity, components: [{ componentId: playerPoolComp.programId }] },
        { entity: matchEntity, components: [{ componentId: matchStateComp.programId }] },
        { entity: projectileEntity, components: [{ componentId: projectilePoolComp.programId }] },
      ],
      args: inputArgs,
    });
    await provider.sendAndConfirm(applySystem.transaction);

    const poolData = await playerPoolComp.account.playerPool.fetch(playerPoolPda);
    const p0 = (poolData.players as any[])[0];
    expect(p0.primaryAmmo).to.equal(49);

    const projPool = await projectilePoolComp.account.projectilePool.fetch(projectilePoolPda);
    const active = (projPool.projectiles as any[]).filter((p: any) => p.active);
    expect(active.length).to.equal(1);
    expect(active[0].owner).to.equal(0);
    expect(active[0].damage).to.equal(12);
    console.log(`  Bullet fired: vel_x=${active[0].velX}, ammo=${p0.primaryAmmo}`);
  });

  it("Tick projectiles - move and check bounds", async () => {
    const applySystem = await ApplySystem({
      authority: provider.wallet.publicKey,
      systemId: tickProjectilesSys.programId,
      world: worldPda,
      entities: [
        { entity: projectileEntity, components: [{ componentId: projectilePoolComp.programId }] },
        { entity: arenaEntity, components: [{ componentId: arenaConfigComp.programId }] },
      ],
    });
    await provider.sendAndConfirm(applySystem.transaction);

    const projPool = await projectilePoolComp.account.projectilePool.fetch(projectilePoolPda);
    const active = (projPool.projectiles as any[]).filter((p: any) => p.active);
    if (active.length > 0) {
      console.log(`  Projectile at (${active[0].posX}, ${active[0].posY}), ttl=${active[0].ttlTicks}`);
    }
    console.log(`  Projectile tick complete, ${active.length} active projectiles`);
  });

  it("Tick combat - player collision", async () => {
    const applySystem = await ApplySystem({
      authority: provider.wallet.publicKey,
      systemId: tickCombatSys.programId,
      world: worldPda,
      entities: [
        { entity: matchEntity, components: [{ componentId: matchStateComp.programId }] },
        { entity: playerPoolEntity, components: [{ componentId: playerPoolComp.programId }] },
        { entity: projectileEntity, components: [{ componentId: projectilePoolComp.programId }] },
      ],
    });
    await provider.sendAndConfirm(applySystem.transaction);
    console.log(`  Combat tick complete`);
  });

  it("Tick pickups", async () => {
    const applySystem = await ApplySystem({
      authority: provider.wallet.publicKey,
      systemId: tickPickupsSys.programId,
      world: worldPda,
      entities: [
        { entity: matchEntity, components: [{ componentId: matchStateComp.programId }] },
        { entity: playerPoolEntity, components: [{ componentId: playerPoolComp.programId }] },
        { entity: pickupEntity, components: [{ componentId: pickupStateComp.programId }] },
      ],
    });
    await provider.sendAndConfirm(applySystem.transaction);

    const pickups = await pickupStateComp.account.pickupState.fetch(pickupStatePda);
    const available = (pickups.pickups as any[]).filter((p: any) => !p.isConsumed);
    console.log(`  Pickup tick complete, ${available.length} available pickups`);
  });

  // ─── Multiple ticks ─────────────────────────────────────────

  it("Run 5 physics ticks", async () => {
    for (let i = 0; i < 5; i++) {
      const applySystem = await ApplySystem({
        authority: provider.wallet.publicKey,
        systemId: tickPhysicsSys.programId,
        world: worldPda,
        entities: [
          { entity: matchEntity, components: [{ componentId: matchStateComp.programId }] },
          { entity: playerPoolEntity, components: [{ componentId: playerPoolComp.programId }] },
          { entity: arenaEntity, components: [{ componentId: arenaConfigComp.programId }] },
        ],
      });
      await provider.sendAndConfirm(applySystem.transaction);
    }

    const matchData = await matchStateComp.account.matchState.fetch(matchStatePda);
    expect(matchData.tick).to.equal(6);
    console.log(`  After 5 more ticks: tick=${matchData.tick}, remaining=${matchData.ticksRemaining}`);
  });

  // ─── Settle ─────────────────────────────────────────────────

  it("Settle match (requires match ended)", async () => {
    // Run ticks until match ends (fast forward by draining ticks_remaining)
    // For test purposes, we just verify the error when trying to settle an active match
    try {
      const applySystem = await ApplySystem({
        authority: provider.wallet.publicKey,
        systemId: settleMatchSys.programId,
        world: worldPda,
        entities: [
          { entity: matchEntity, components: [{ componentId: matchStateComp.programId }] },
          { entity: playerPoolEntity, components: [{ componentId: playerPoolComp.programId }] },
        ],
      });
      await provider.sendAndConfirm(applySystem.transaction);
      expect.fail("Should have thrown - match still active");
    } catch (e: any) {
      expect(e.toString()).to.include("MatchStillActive");
      console.log(`  Correctly rejected settle on active match`);
    }
  });
});
