import { PublicKey } from "@solana/web3.js";
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
import {
  InitializeNewWorld,
  AddEntity,
  InitializeComponent,
  ApplySystem,
  Program,
} from "@magicblock-labs/bolt-sdk";
import { expect } from "chai";
import * as anchor from "@coral-xyz/anchor";

describe("JetClash Arena On-Chain", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

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

  const playerStateComp = anchor.workspace.PlayerState as Program<PlayerState>;
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

  it("Initialize world", async () => {
    const initNewWorld = await InitializeNewWorld({
      payer: provider.wallet.publicKey,
      connection: provider.connection,
    });
    const txSign = await provider.sendAndConfirm(initNewWorld.transaction);
    worldPda = initNewWorld.worldPda;
    console.log(`  World: ${worldPda}`);
  });

  it("Create entities", async () => {
    const entities: PublicKey[] = [];
    for (let i = 0; i < 6; i++) {
      const addEntity = await AddEntity({
        payer: provider.wallet.publicKey,
        world: worldPda,
        connection: provider.connection,
      });
      await provider.sendAndConfirm(addEntity.transaction);
      entities.push(addEntity.entityPda);
    }
    [matchEntity, p1Entity, p2Entity, projectileEntity, pickupEntity, arenaEntity] = entities;
    console.log(`  Created 6 entities`);
  });

  it("Initialize components", async () => {
    const inits = [
      { entity: matchEntity, comp: matchStateComp, name: "matchState" },
      { entity: p1Entity, comp: playerStateComp, name: "p1State" },
      { entity: p2Entity, comp: playerStateComp, name: "p2State" },
      { entity: projectileEntity, comp: projectilePoolComp, name: "projectilePool" },
      { entity: pickupEntity, comp: pickupStateComp, name: "pickupState" },
      { entity: arenaEntity, comp: arenaConfigComp, name: "arenaConfig" },
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
    [matchStatePda, p1StatePda, p2StatePda, projectilePoolPda, pickupStatePda, arenaConfigPda] = pdas;
    console.log(`  All 6 components initialized`);
  });

  it("Init arena (2 components: ArenaConfig + PickupState)", async () => {
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
    expect(arenaData.spawnPointCount).to.equal(2);
    console.log(`  Arena: ${arenaData.platformCount} platforms, ${arenaData.spawnPointCount} spawns`);
  });

  it("Create match (5 components: Match + P1 + P2 + Pool + Pickups)", async () => {
    const createArgs = {
      p1_spawn_x: 50000,
      p1_spawn_y: 132000,
      p2_spawn_x: 206000,
      p2_spawn_y: 132000,
    };

    const applySystem = await ApplySystem({
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
      args: createArgs,
    });
    await provider.sendAndConfirm(applySystem.transaction);

    const matchData = await matchStateComp.account.matchState.fetch(matchStatePda);
    expect(matchData.isActive).to.be.true;
    expect(matchData.ticksRemaining).to.equal(3600);

    const p1 = await playerStateComp.account.playerState.fetch(p1StatePda);
    expect(p1.hp).to.equal(100);
    expect(p1.posX).to.equal(50000);
    expect(p1.posY).to.equal(132000);
    expect(p1.facingRight).to.be.true;
    console.log(`  Match active, P1 at (${p1.posX}, ${p1.posY})`);

    const p2 = await playerStateComp.account.playerState.fetch(p2StatePda);
    expect(p2.posX).to.equal(206000);
    expect(p2.facingRight).to.be.false;
    console.log(`  P2 at (${p2.posX}, ${p2.posY})`);
  });

  it("Process input - P1 moves right (3 components)", async () => {
    const inputArgs = {
      move_dir: 1, jet: false, dash: false,
      shoot_primary: false, shoot_secondary: false,
      input_seq: 1,
    };

    const applySystem = await ApplySystem({
      authority: provider.wallet.publicKey,
      systemId: processInputSys.programId,
      world: worldPda,
      entities: [
        { entity: p1Entity, components: [{ componentId: playerStateComp.programId }] },
        { entity: matchEntity, components: [{ componentId: matchStateComp.programId }] },
        { entity: projectileEntity, components: [{ componentId: projectilePoolComp.programId }] },
      ],
      args: inputArgs,
    });
    await provider.sendAndConfirm(applySystem.transaction);

    const p1 = await playerStateComp.account.playerState.fetch(p1StatePda);
    expect(p1.velX).to.be.greaterThan(0);
    expect(p1.inputSeq).to.equal(1);
    console.log(`  P1 vel_x=${p1.velX}, input_seq=${p1.inputSeq}`);
  });

  it("Tick physics (4 components: Match + P1 + P2 + Arena)", async () => {
    const applySystem = await ApplySystem({
      authority: provider.wallet.publicKey,
      systemId: tickPhysicsSys.programId,
      world: worldPda,
      entities: [
        { entity: matchEntity, components: [{ componentId: matchStateComp.programId }] },
        { entity: p1Entity, components: [{ componentId: playerStateComp.programId }] },
        { entity: p2Entity, components: [{ componentId: playerStateComp.programId }] },
        { entity: arenaEntity, components: [{ componentId: arenaConfigComp.programId }] },
      ],
    });
    await provider.sendAndConfirm(applySystem.transaction);

    const matchData = await matchStateComp.account.matchState.fetch(matchStatePda);
    expect(matchData.tick).to.equal(1);
    expect(matchData.ticksRemaining).to.equal(3599);

    const p1 = await playerStateComp.account.playerState.fetch(p1StatePda);
    expect(p1.posX).to.be.greaterThan(50000);
    console.log(`  Tick=${matchData.tick}, P1 pos=(${p1.posX}, ${p1.posY})`);
  });

  it("Process input - P1 shoots (3 components)", async () => {
    const inputArgs = {
      move_dir: 0, jet: false, dash: false,
      shoot_primary: true, shoot_secondary: false,
      input_seq: 2,
    };

    const applySystem = await ApplySystem({
      authority: provider.wallet.publicKey,
      systemId: processInputSys.programId,
      world: worldPda,
      entities: [
        { entity: p1Entity, components: [{ componentId: playerStateComp.programId }] },
        { entity: matchEntity, components: [{ componentId: matchStateComp.programId }] },
        { entity: projectileEntity, components: [{ componentId: projectilePoolComp.programId }] },
      ],
      args: inputArgs,
    });
    await provider.sendAndConfirm(applySystem.transaction);

    const p1 = await playerStateComp.account.playerState.fetch(p1StatePda);
    expect(p1.primaryAmmo).to.equal(49);

    const pool = await projectilePoolComp.account.projectilePool.fetch(projectilePoolPda);
    const active = (pool.projectiles as any[]).filter((p: any) => p.active);
    expect(active.length).to.equal(1);
    expect(active[0].owner).to.equal(0);
    expect(active[0].damage).to.equal(12);
    console.log(`  Bullet fired: vel_x=${active[0].velX}, ammo=${p1.primaryAmmo}`);
  });

  it("Tick combat - projectile moves (5 components)", async () => {
    const applySystem = await ApplySystem({
      authority: provider.wallet.publicKey,
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
    await provider.sendAndConfirm(applySystem.transaction);

    const pool = await projectilePoolComp.account.projectilePool.fetch(projectilePoolPda);
    const active = (pool.projectiles as any[]).filter((p: any) => p.active);
    if (active.length > 0) {
      console.log(`  Projectile at (${active[0].posX}, ${active[0].posY}), ttl=${active[0].ttlTicks}`);
    }
    console.log(`  Combat tick complete, ${active.length} active projectiles`);
  });

  it("Tick pickups (4 components)", async () => {
    const applySystem = await ApplySystem({
      authority: provider.wallet.publicKey,
      systemId: tickPickupsSys.programId,
      world: worldPda,
      entities: [
        { entity: matchEntity, components: [{ componentId: matchStateComp.programId }] },
        { entity: p1Entity, components: [{ componentId: playerStateComp.programId }] },
        { entity: p2Entity, components: [{ componentId: playerStateComp.programId }] },
        { entity: pickupEntity, components: [{ componentId: pickupStateComp.programId }] },
      ],
    });
    await provider.sendAndConfirm(applySystem.transaction);

    const pickups = await pickupStateComp.account.pickupState.fetch(pickupStatePda);
    const available = (pickups.pickups as any[]).filter((p: any) => !p.isConsumed);
    console.log(`  Pickup tick complete, ${available.length} available pickups`);
  });
});
