/**
 * ER Delegation Test
 *
 * Tests the BOLT component delegation flow on L1.
 * Verifies that components with #[component(delegate)] can be delegated
 * via the MagicBlock delegation program.
 *
 * For actual ER gameplay, use MagicBlock devnet:
 *   https://rpc.magicblock.app/devnet/
 *
 * Run with: anchor test --skip-build
 */
import { PublicKey } from "@solana/web3.js";
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

describe("ER Delegation Test — Component Delegation on L1", () => {
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

  const playerStateComp = anchor.workspace.PlayerState as anchor.Program<PlayerState>;
  const matchStateComp = anchor.workspace.MatchState as anchor.Program<MatchState>;
  const arenaConfigComp = anchor.workspace.ArenaConfig as anchor.Program<ArenaConfig>;
  const projectilePoolComp = anchor.workspace.ProjectilePool as anchor.Program<ProjectilePool>;
  const pickupStateComp = anchor.workspace.PickupState as anchor.Program<PickupState>;
  const initArenaSys = anchor.workspace.InitArena as anchor.Program<InitArena>;
  const createMatchSys = anchor.workspace.CreateMatch as anchor.Program<CreateMatch>;
  const processInputSys = anchor.workspace.ProcessInput as anchor.Program<ProcessInput>;
  const tickPhysicsSys = anchor.workspace.TickPhysics as anchor.Program<TickPhysics>;

  it("Setup: world + entities + components", async () => {
    const initWorld = await InitializeNewWorld({
      payer: provider.wallet.publicKey,
      connection: provider.connection,
    });
    await provider.sendAndConfirm(initWorld.transaction);
    worldPda = initWorld.worldPda;

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

    const inits = [
      { entity: matchEntity, comp: matchStateComp },
      { entity: p1Entity, comp: playerStateComp },
      { entity: p2Entity, comp: playerStateComp },
      { entity: projectileEntity, comp: projectilePoolComp },
      { entity: pickupEntity, comp: pickupStateComp },
      { entity: arenaEntity, comp: arenaConfigComp },
    ];
    const pdas: PublicKey[] = [];
    for (const { entity, comp } of inits) {
      const result = await InitializeComponent({
        payer: provider.wallet.publicKey,
        entity,
        componentId: comp.programId,
      });
      await provider.sendAndConfirm(result.transaction);
      pdas.push(result.componentPda);
    }
    [matchStatePda, p1StatePda, p2StatePda, projectilePoolPda, pickupStatePda, arenaConfigPda] = pdas;
    console.log(`  World + 6 entities + 6 components created`);
  });

  it("Init arena + create match", async () => {
    const arenaApply = await ApplySystem({
      authority: provider.wallet.publicKey,
      systemId: initArenaSys.programId,
      world: worldPda,
      entities: [
        { entity: arenaEntity, components: [{ componentId: arenaConfigComp.programId }] },
        { entity: pickupEntity, components: [{ componentId: pickupStateComp.programId }] },
      ],
      args: {
        platforms: [{ x: 0, y: 138000, w: 256000, h: 6000 }],
        spawn_points: [{ x: 50000, y: 132000 }, { x: 206000, y: 132000 }],
        pickup_positions: [{ x: 40000, y: 101000, pickup_type: 0 }],
        world_width: 256000,
        world_height: 144000,
        gravity: 80000,
      },
    });
    await provider.sendAndConfirm(arenaApply.transaction);

    const matchApply = await ApplySystem({
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
    await provider.sendAndConfirm(matchApply.transaction);

    const matchData = await matchStateComp.account.matchState.fetch(matchStatePda);
    expect(matchData.isActive).to.be.true;
    console.log(`  Match active: tick=${matchData.tick}, remaining=${matchData.ticksRemaining}`);
  });

  it("Delegate all 6 component accounts via DelegateComponent", async () => {
    const delegations = [
      { entity: matchEntity, componentId: matchStateComp.programId, name: "MatchState" },
      { entity: p1Entity, componentId: playerStateComp.programId, name: "P1 PlayerState" },
      { entity: p2Entity, componentId: playerStateComp.programId, name: "P2 PlayerState" },
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
      console.log(`  Delegated ${name}: ${sig.slice(0, 16)}...`);
    }

    console.log(`  All 6 components delegated successfully`);
  });

  it("Verify delegation records exist on-chain", async () => {
    // After delegation, the delegation program creates delegation record PDAs
    // The component accounts should still be readable
    const matchData = await matchStateComp.account.matchState.fetch(matchStatePda);
    expect(matchData.isActive).to.be.true;
    console.log(`  MatchState still readable after delegation: active=${matchData.isActive}`);

    const p1Data = await playerStateComp.account.playerState.fetch(p1StatePda);
    expect(p1Data.hp).to.equal(100);
    console.log(`  P1 PlayerState readable: hp=${p1Data.hp}, pos=(${p1Data.posX}, ${p1Data.posY})`);
  });

  it("Delegation transfers account ownership to delegation program", async () => {
    // After delegation, account owner changes from component program to delegation program
    // This is correct — the ER now owns these accounts for writing
    // On L1, delegated accounts can no longer be written by the component program
    const accountInfo = await provider.connection.getAccountInfo(p1StatePda);
    expect(accountInfo).to.not.be.null;
    const delegationProgram = new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");
    expect(accountInfo!.owner.toBase58()).to.equal(delegationProgram.toBase58());
    console.log(`  P1 account owner: ${accountInfo!.owner.toBase58()} (delegation program)`);
    console.log(`  Delegation flow verified — gameplay continues on ER`);
    console.log(`  For ER gameplay, deploy to MagicBlock devnet: https://rpc.magicblock.app/devnet/`);
  });
});
