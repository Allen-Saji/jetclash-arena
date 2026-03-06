import Phaser from 'phaser';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import {
  InitializeNewWorld,
  AddEntity,
  InitializeComponent,
  ApplySystem,
} from '@magicblock-labs/bolt-sdk';
import { WalletProvider } from '@/net/WalletProvider';
import { InputSender } from '@/net/InputSender';
import { StateSubscriber } from '@/net/StateSubscriber';
import { ClientPrediction } from '@/net/ClientPrediction';
import { LOCAL_CONFIG } from '@/net/NetworkConfig';
import { toPixel, SCALE } from '@/net/types';
import type {
  GameStateSnapshot,
  InputAction,
  OnChainProjectile,
  OnChainPlayerState,
  OnChainMatchState,
  OnChainPickup,
} from '@/net/types';
import { HUD } from '@/components/HUD';
import { GAME_WIDTH, GAME_HEIGHT, WORLD_WIDTH, WORLD_HEIGHT } from '@/config/game.config';
import { ARENA_PLATFORMS, PICKUP_SPAWNS, TREE_DECORATIONS } from '@/config/arena.config';
import { PLAYER_PHYSICS } from '@/config/player.config';
import { sfx } from '@/audio/SoundGenerator';
import type { MatchState } from '@/types';

// ---- Deserialization helpers ----

const HEADER = 40; // 8-byte discriminator + 32-byte BoltMetadata.authority

function readI32(buf: Uint8Array, offset: number): number {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return dv.getInt32(offset, true);
}

function readU32(buf: Uint8Array, offset: number): number {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return dv.getUint32(offset, true);
}

function readU16(buf: Uint8Array, offset: number): number {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return dv.getUint16(offset, true);
}

function readU8(buf: Uint8Array, offset: number): number {
  return buf[offset];
}

function readBool(buf: Uint8Array, offset: number): boolean {
  return buf[offset] !== 0;
}

function readPubkey(buf: Uint8Array, offset: number): PublicKey {
  return new PublicKey(buf.slice(offset, offset + 32));
}

function deserializePlayerState(data: Uint8Array): OnChainPlayerState {
  let o = HEADER;
  const playerAuthority = readPubkey(data, o); o += 32;
  const posX = readI32(data, o); o += 4;
  const posY = readI32(data, o); o += 4;
  const velX = readI32(data, o); o += 4;
  const velY = readI32(data, o); o += 4;
  const hp = readU8(data, o); o += 1;
  const fuel = readU16(data, o); o += 2;
  const primaryAmmo = readU8(data, o); o += 1;
  const secondaryAmmo = readU8(data, o); o += 1;
  const facingRight = readBool(data, o); o += 1;
  const isDead = readBool(data, o); o += 1;
  const isInvincible = readBool(data, o); o += 1;
  const dashActive = readBool(data, o); o += 1;
  const speedMultiplier = readU16(data, o); o += 2;
  const invincibleUntilTick = readU32(data, o); o += 4;
  const respawnAtTick = readU32(data, o); o += 4;
  const dashCooldownTick = readU32(data, o); o += 4;
  const primaryCooldownTick = readU32(data, o); o += 4;
  const secondaryCooldownTick = readU32(data, o); o += 4;
  const primaryReloadTick = readU32(data, o); o += 4;
  const secondaryReloadTick = readU32(data, o); o += 4;
  const speedBuffUntilTick = readU32(data, o); o += 4;
  const inputSeq = readU32(data, o); o += 4;
  const kills = readU16(data, o); o += 2;
  const deaths = readU16(data, o); o += 2;
  const score = readU32(data, o); o += 4;
  // playerIndex u8 is at o, but not in the interface so we skip it

  return {
    playerAuthority, posX, posY, velX, velY, hp, fuel,
    primaryAmmo, secondaryAmmo, facingRight, isDead, isInvincible,
    dashActive, speedMultiplier, invincibleUntilTick, respawnAtTick,
    dashCooldownTick, primaryCooldownTick, secondaryCooldownTick,
    primaryReloadTick, secondaryReloadTick, speedBuffUntilTick,
    inputSeq, kills, deaths, score,
  };
}

function deserializeMatchState(data: Uint8Array): OnChainMatchState {
  let o = HEADER;
  const matchId = readPubkey(data, o); o += 32;
  const player1 = readPubkey(data, o); o += 32;
  const player2 = readPubkey(data, o); o += 32;
  const tick = readU32(data, o); o += 4;
  const ticksRemaining = readU32(data, o); o += 4;
  const p1Score = readU32(data, o); o += 4;
  const p1Kills = readU16(data, o); o += 2;
  const p2Score = readU32(data, o); o += 4;
  const p2Kills = readU16(data, o); o += 2;
  const isActive = readBool(data, o); o += 1;
  const winner = readU8(data, o); o += 1;

  return {
    matchId, player1, player2, tick, ticksRemaining,
    p1Score, p2Score, p1Kills, p2Kills, isActive, winner,
  };
}

/** Each ProjectileData is 22 bytes in Borsh */
const PROJECTILE_SIZE = 22;
const MAX_PROJECTILES = 10;

function deserializeProjectilePool(data: Uint8Array): OnChainProjectile[] {
  // Borsh serializes [T; N] as a Vec: 4-byte LE length prefix + N * element_size
  let o = HEADER;
  const count = readU32(data, o); o += 4;
  const projectiles: OnChainProjectile[] = [];
  for (let i = 0; i < count && i < MAX_PROJECTILES; i++) {
    const posX = readI32(data, o); o += 4;
    const posY = readI32(data, o); o += 4;
    const velX = readI32(data, o); o += 4;
    const velY = readI32(data, o); o += 4;
    const damage = readU8(data, o); o += 1;
    const owner = readU8(data, o); o += 1;
    const isRocket = readBool(data, o); o += 1;
    const ttlTicks = readU16(data, o); o += 2;
    const active = readBool(data, o); o += 1;
    projectiles.push({ posX, posY, velX, velY, damage, owner, isRocket, ttlTicks, active });
  }
  return projectiles;
}

/** Each PickupData is 14 bytes in Borsh */
const MAX_PICKUPS = 5;

function deserializePickupState(data: Uint8Array): OnChainPickup[] {
  let o = HEADER;
  const count = readU32(data, o); o += 4;
  const pickups: OnChainPickup[] = [];
  for (let i = 0; i < count && i < MAX_PICKUPS; i++) {
    const posX = readI32(data, o); o += 4;
    const posY = readI32(data, o); o += 4;
    const pickupType = readU8(data, o); o += 1;
    const isConsumed = readBool(data, o); o += 1;
    const respawnAtTick = readU32(data, o); o += 4;
    pickups.push({ posX, posY, pickupType, isConsumed, respawnAtTick });
  }
  return pickups;
}

// ---- Ticks-to-seconds conversion (crank runs at 10Hz) ----
const TICKS_PER_SECOND = 10;

/**
 * Online Arena Scene -- renders game state from on-chain BOLT ECS components.
 * Physics, combat, and pickups run on-chain; client only renders + sends input.
 */
export class OnlineArenaScene extends Phaser.Scene {
  private wallet!: WalletProvider;
  private inputSender!: InputSender;
  private stateSubscriber!: StateSubscriber;
  private prediction!: ClientPrediction;
  private hud!: HUD;

  // Visual-only sprites (no local physics)
  private p1Sprite!: Phaser.GameObjects.Sprite;
  private p2Sprite!: Phaser.GameObjects.Sprite;
  private projectileSprites: Map<number, Phaser.GameObjects.Sprite> = new Map();
  private pickupSprites: Phaser.GameObjects.Sprite[] = [];
  private platforms!: Phaser.Physics.Arcade.StaticGroup;

  // On-chain entity/component PDAs
  private worldPda!: PublicKey;
  private entities!: {
    match: PublicKey;
    p1: PublicKey;
    p2: PublicKey;
    projectile: PublicKey;
    pickup: PublicKey;
    arena: PublicKey;
  };
  private pdas!: {
    matchState: PublicKey;
    p1State: PublicKey;
    p2State: PublicKey;
    projectilePool: PublicKey;
    pickupState: PublicKey;
    arenaConfig: PublicKey;
  };

  // Latest deserialized state
  private latestSnapshot: GameStateSnapshot | null = null;

  // Match state for HUD compatibility
  private matchState: MatchState = {
    timeRemaining: 120,
    scores: { p1: 0, p2: 0 },
    kills: { p1: 0, p2: 0 },
    isActive: false,
    winner: null,
  };

  // Keyboard state
  private cursors!: {
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    up: Phaser.Input.Keyboard.Key;
    shoot: Phaser.Input.Keyboard.Key;
    secondary: Phaser.Input.Keyboard.Key;
    dash: Phaser.Input.Keyboard.Key;
  };

  // Status
  private isSetup = false;
  private statusText!: Phaser.GameObjects.Text;

  // Crank interval for ticking on-chain systems
  private crankInterval: number | null = null;
  private pollInterval: number | null = null;

  // Background
  private bgTile!: Phaser.GameObjects.TileSprite;

  constructor() {
    super({ key: 'OnlineArena' });
  }

  async create(): Promise<void> {
    sfx.init();

    // Setup keyboard
    const kb = this.input.keyboard!;
    this.cursors = {
      left: kb.addKey('A'),
      right: kb.addKey('D'),
      up: kb.addKey('W'),
      shoot: kb.addKey('F'),
      secondary: kb.addKey('G'),
      dash: kb.addKey('Q'),
    };
    kb.on('keydown-M', () => sfx.toggleMute());

    // Visual setup
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.createBackground();
    this.createDecorations();
    this.createPlatforms();
    this.createPlayerSprites();
    this.createPickupSprites();

    // Camera
    const cam = this.cameras.main;
    cam.setZoom(0.55);
    cam.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    cam.centerOn(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);

    // HUD
    this.hud = new HUD(this);

    // Status overlay
    this.statusText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'Connecting to chain...', {
      fontSize: '24px',
      fontFamily: 'monospace',
      color: '#f5c542',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(300);

    // Initialize on-chain match
    try {
      await this.setupOnChain();
      this.statusText.setText('Match starting...');
      this.isSetup = true;

      // Start input sender and crank
      this.inputSender.start();
      this.startCrank();

      // Hide status after brief delay
      this.time.delayedCall(1000, () => {
        this.statusText.setVisible(false);
        this.matchState.isActive = true;
      });
    } catch (err: any) {
      console.error('On-chain setup failed:', err);
      this.statusText.setText(`Setup failed: ${err.message}`);
    }
  }

  private async setupOnChain(): Promise<void> {
    const config = LOCAL_CONFIG;

    // Create wallet and fund it
    this.wallet = new WalletProvider(config.rpcUrl);
    await this.wallet.requestAirdrop();

    const conn = this.wallet.connection;

    // Initialize world
    const initWorld = await InitializeNewWorld({
      payer: this.wallet.publicKey,
      connection: conn,
    });
    await this.wallet.sendTransaction(initWorld.transaction);
    this.worldPda = initWorld.worldPda;

    // Create 6 entities
    const entityPdas: PublicKey[] = [];
    for (let i = 0; i < 6; i++) {
      const addEntity = await AddEntity({
        payer: this.wallet.publicKey,
        world: this.worldPda,
        connection: conn,
      });
      await this.wallet.sendTransaction(addEntity.transaction);
      entityPdas.push(addEntity.entityPda);
    }
    this.entities = {
      match: entityPdas[0],
      p1: entityPdas[1],
      p2: entityPdas[2],
      projectile: entityPdas[3],
      pickup: entityPdas[4],
      arena: entityPdas[5],
    };

    // Initialize components
    const compIds = [
      { entity: this.entities.match, componentId: config.programIds.matchState },
      { entity: this.entities.p1, componentId: config.programIds.playerState },
      { entity: this.entities.p2, componentId: config.programIds.playerState },
      { entity: this.entities.projectile, componentId: config.programIds.projectilePool },
      { entity: this.entities.pickup, componentId: config.programIds.pickupState },
      { entity: this.entities.arena, componentId: config.programIds.arenaConfig },
    ];

    const compPdas: PublicKey[] = [];
    for (const { entity, componentId } of compIds) {
      const result = await InitializeComponent({
        payer: this.wallet.publicKey,
        entity,
        componentId,
      });
      await this.wallet.sendTransaction(result.transaction);
      compPdas.push(result.componentPda);
    }
    this.pdas = {
      matchState: compPdas[0],
      p1State: compPdas[1],
      p2State: compPdas[2],
      projectilePool: compPdas[3],
      pickupState: compPdas[4],
      arenaConfig: compPdas[5],
    };

    // Init arena
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

    const initArena = await ApplySystem({
      authority: this.wallet.publicKey,
      systemId: new PublicKey('Ep4V1sF7RM1o2kBwQG3y86oxrYhd9F9FaCfjdfBYwSyh'),
      world: this.worldPda,
      entities: [
        { entity: this.entities.arena, components: [{ componentId: config.programIds.arenaConfig }] },
        { entity: this.entities.pickup, components: [{ componentId: config.programIds.pickupState }] },
      ],
      args: arenaArgs,
    });
    await this.wallet.sendTransaction(initArena.transaction);

    // Create match
    const createMatch = await ApplySystem({
      authority: this.wallet.publicKey,
      systemId: new PublicKey('4vrZHTpdz97cCtyhbQuAd2XmvipjuyBQGzqfF4SEgrKX'),
      world: this.worldPda,
      entities: [
        { entity: this.entities.match, components: [{ componentId: config.programIds.matchState }] },
        { entity: this.entities.p1, components: [{ componentId: config.programIds.playerState }] },
        { entity: this.entities.p2, components: [{ componentId: config.programIds.playerState }] },
        { entity: this.entities.projectile, components: [{ componentId: config.programIds.projectilePool }] },
        { entity: this.entities.pickup, components: [{ componentId: config.programIds.pickupState }] },
      ],
      args: { p1_spawn_x: 50000, p1_spawn_y: 132000, p2_spawn_x: 206000, p2_spawn_y: 132000 },
    });
    await this.wallet.sendTransaction(createMatch.transaction);

    // Setup prediction
    this.prediction = new ClientPrediction();

    // Setup input sender
    this.inputSender = new InputSender(
      this.wallet,
      config,
      this.worldPda,
      {
        player: this.entities.p1,
        match: this.entities.match,
        projectile: this.entities.projectile,
      },
      () => this.captureInput(),
    );

    // Setup state subscriber (poll-based for local validator since WS can be flaky)
    this.setupPolling();
  }

  private setupPolling(): void {
    const conn = this.wallet.connection;

    this.pollInterval = window.setInterval(async () => {
      try {
        // Fetch all accounts in parallel
        const [matchAcct, p1Acct, p2Acct, poolAcct, pickupAcct] = await Promise.all([
          conn.getAccountInfo(this.pdas.matchState),
          conn.getAccountInfo(this.pdas.p1State),
          conn.getAccountInfo(this.pdas.p2State),
          conn.getAccountInfo(this.pdas.projectilePool),
          conn.getAccountInfo(this.pdas.pickupState),
        ]);

        if (!matchAcct || !p1Acct || !p2Acct) return;

        // Deserialize raw account data
        const match = deserializeMatchState(new Uint8Array(matchAcct.data));
        const player1 = deserializePlayerState(new Uint8Array(p1Acct.data));
        const player2 = deserializePlayerState(new Uint8Array(p2Acct.data));
        const projectiles = poolAcct
          ? deserializeProjectilePool(new Uint8Array(poolAcct.data))
          : [];
        const pickups = pickupAcct
          ? deserializePickupState(new Uint8Array(pickupAcct.data))
          : [];

        this.latestSnapshot = {
          match,
          player1,
          player2,
          projectiles,
          pickups,
          timestamp: Date.now(),
        };

        this.onStateUpdate();
      } catch (e) {
        // Silently retry next poll
      }
    }, 100); // 10Hz polling
  }

  private onStateUpdate(): void {
    const snap = this.latestSnapshot;
    if (!snap) return;

    const { match, player1, player2, projectiles, pickups } = snap;

    // ---- Update match state for HUD ----
    this.matchState.timeRemaining = match.ticksRemaining / TICKS_PER_SECOND;
    this.matchState.scores.p1 = match.p1Score;
    this.matchState.scores.p2 = match.p2Score;
    this.matchState.kills.p1 = match.p1Kills;
    this.matchState.kills.p2 = match.p2Kills;

    // ---- Position player sprites ----
    this.updatePlayerSprite(this.p1Sprite, player1, 'p1');
    this.updatePlayerSprite(this.p2Sprite, player2, 'p2');

    // ---- Projectile sprites ----
    this.updateProjectiles(projectiles);

    // ---- Pickup sprites ----
    this.updatePickups(pickups);

    // ---- Match end detection ----
    if (!match.isActive || match.winner !== 0) {
      this.matchState.isActive = false;
      this.matchState.winner = match.winner === 1 ? 1 : match.winner === 2 ? 2 : null;

      // Stop the crank
      if (this.crankInterval) {
        clearInterval(this.crankInterval);
        this.crankInterval = null;
      }

      // Transition to result scene
      this.time.delayedCall(1500, () => {
        this.shutdown();
        this.scene.start('Result', {
          matchState: { ...this.matchState },
          aiMode: false,
        });
      });
    }
  }

  private updatePlayerSprite(
    sprite: Phaser.GameObjects.Sprite,
    state: OnChainPlayerState,
    prefix: 'p1' | 'p2',
  ): void {
    // Position from on-chain fixed-point
    sprite.x = toPixel(state.posX);
    sprite.y = toPixel(state.posY);

    // Facing direction
    sprite.setFlipX(!state.facingRight);

    // Visibility (hide when dead)
    sprite.setVisible(!state.isDead);

    // Invincibility flash
    if (state.isInvincible) {
      sprite.setAlpha(Math.sin(this.time.now * 0.01) > 0 ? 1 : 0.3);
    } else {
      sprite.setAlpha(1);
    }

    // Animation based on velocity
    const animKey = this.chooseAnim(prefix, state);
    if (sprite.anims.currentAnim?.key !== animKey) {
      sprite.play(animKey, true);
    }
  }

  private chooseAnim(prefix: 'p1' | 'p2', state: OnChainPlayerState): string {
    if (state.isDead) return `${prefix}-die`;
    if (state.velY < 0) return `${prefix}-fly`;        // ascending = jetpack/jump
    if (state.velY > 200) return `${prefix}-jump`;      // falling
    if (state.velX !== 0) return `${prefix}-walk`;
    return `${prefix}-idle`;
  }

  private updateProjectiles(projectiles: OnChainProjectile[]): void {
    // Track which slots are still active
    const activeSlots = new Set<number>();

    for (let i = 0; i < projectiles.length; i++) {
      const proj = projectiles[i];
      if (!proj.active) continue;

      activeSlots.add(i);
      let sprite = this.projectileSprites.get(i);

      if (!sprite) {
        // Create a new sprite for this slot
        const textureKey = proj.isRocket ? 'rocket' : 'bullet';
        sprite = this.add.sprite(0, 0, textureKey).setScale(0.8).setDepth(10);
        this.projectileSprites.set(i, sprite);
      }

      sprite.x = toPixel(proj.posX);
      sprite.y = toPixel(proj.posY);
      sprite.setVisible(true);

      // Flip based on velocity direction
      sprite.setFlipX(proj.velX < 0);
    }

    // Hide sprites for inactive slots
    for (const [idx, sprite] of this.projectileSprites) {
      if (!activeSlots.has(idx)) {
        sprite.setVisible(false);
      }
    }
  }

  private updatePickups(pickups: OnChainPickup[]): void {
    for (let i = 0; i < pickups.length && i < this.pickupSprites.length; i++) {
      const pickup = pickups[i];
      const sprite = this.pickupSprites[i];

      // Update position (in case the chain sets it)
      if (pickup.posX !== 0 || pickup.posY !== 0) {
        sprite.x = toPixel(pickup.posX);
        sprite.y = toPixel(pickup.posY);
      }

      // Toggle visibility based on consumed state
      sprite.setVisible(!pickup.isConsumed);
    }
  }

  private captureInput(): InputAction {
    return {
      moveDir: this.cursors.left.isDown ? -1 : this.cursors.right.isDown ? 1 : 0,
      jet: this.cursors.up.isDown,
      dash: Phaser.Input.Keyboard.JustDown(this.cursors.dash),
      shootPrimary: this.cursors.shoot.isDown,
      shootSecondary: this.cursors.secondary.isDown,
      inputSeq: 0, // InputSender will assign
    };
  }

  /** Crank: call tick-physics, tick-combat, tick-pickups at ~10Hz */
  private startCrank(): void {
    const config = LOCAL_CONFIG;
    this.crankInterval = window.setInterval(async () => {
      if (!this.matchState.isActive) return;
      try {
        // tick-physics
        const physics = await ApplySystem({
          authority: this.wallet.publicKey,
          systemId: config.programIds.tickPhysics,
          world: this.worldPda,
          entities: [
            { entity: this.entities.match, components: [{ componentId: config.programIds.matchState }] },
            { entity: this.entities.p1, components: [{ componentId: config.programIds.playerState }] },
            { entity: this.entities.p2, components: [{ componentId: config.programIds.playerState }] },
            { entity: this.entities.arena, components: [{ componentId: config.programIds.arenaConfig }] },
          ],
        });
        await this.wallet.sendTransaction(physics.transaction);

        // tick-combat
        const combat = await ApplySystem({
          authority: this.wallet.publicKey,
          systemId: config.programIds.tickCombat,
          world: this.worldPda,
          entities: [
            { entity: this.entities.match, components: [{ componentId: config.programIds.matchState }] },
            { entity: this.entities.p1, components: [{ componentId: config.programIds.playerState }] },
            { entity: this.entities.p2, components: [{ componentId: config.programIds.playerState }] },
            { entity: this.entities.projectile, components: [{ componentId: config.programIds.projectilePool }] },
            { entity: this.entities.arena, components: [{ componentId: config.programIds.arenaConfig }] },
          ],
        });
        await this.wallet.sendTransaction(combat.transaction);

        // tick-pickups
        const pickups = await ApplySystem({
          authority: this.wallet.publicKey,
          systemId: config.programIds.tickPickups,
          world: this.worldPda,
          entities: [
            { entity: this.entities.match, components: [{ componentId: config.programIds.matchState }] },
            { entity: this.entities.p1, components: [{ componentId: config.programIds.playerState }] },
            { entity: this.entities.p2, components: [{ componentId: config.programIds.playerState }] },
            { entity: this.entities.pickup, components: [{ componentId: config.programIds.pickupState }] },
          ],
        });
        await this.wallet.sendTransaction(pickups.transaction);
      } catch (err: any) {
        console.warn('[Crank] Tick failed:', err.message);
      }
    }, 100); // 10Hz crank
  }

  private createBackground(): void {
    const bgW = WORLD_WIDTH * 2;
    const bgH = WORLD_HEIGHT * 2;
    this.bgTile = this.add.tileSprite(0, 0, bgW, bgH, 'bg1-repeated');
    this.bgTile.setScrollFactor(0);
    this.bgTile.setDepth(-10);

    this.add.image(WORLD_WIDTH / 2, WORLD_HEIGHT - 200, 'bg1-layer1')
      .setDisplaySize(WORLD_WIDTH * 2, 800)
      .setScrollFactor(0.3)
      .setDepth(-9)
      .setAlpha(0.5);

    this.add.image(WORLD_WIDTH / 2, WORLD_HEIGHT - 100, 'bg1-layer2')
      .setDisplaySize(WORLD_WIDTH * 2, 600)
      .setScrollFactor(0.5)
      .setDepth(-8)
      .setAlpha(0.6);
  }

  private createDecorations(): void {
    for (const tree of TREE_DECORATIONS) {
      this.add.image(tree.x, tree.y, tree.key)
        .setScale(tree.scale)
        .setDepth(-5)
        .setAlpha(0.7);
    }
  }

  private createPlatforms(): void {
    this.platforms = this.physics.add.staticGroup();
    for (const plat of ARENA_PLATFORMS) {
      const p = this.platforms.create(plat.x, plat.y, plat.textureKey) as Phaser.Physics.Arcade.Sprite;
      p.setScale(plat.scaleX ?? 1, plat.scaleY ?? 1);
      p.refreshBody();
    }
  }

  private createPlayerSprites(): void {
    // Visual-only sprites -- positions driven by on-chain state
    this.p1Sprite = this.add.sprite(700, 1200, 'p1-idle-1').setScale(1.3);
    this.p2Sprite = this.add.sprite(1860, 1200, 'p2-idle-1').setScale(1.3).setFlipX(true);
    this.p1Sprite.play('p1-idle');
    this.p2Sprite.play('p2-idle');
  }

  private createPickupSprites(): void {
    for (const spawn of PICKUP_SPAWNS) {
      const key = spawn.type === 'health' ? 'heal-1' : 'speed-1';
      const s = this.add.sprite(spawn.x, spawn.y, key).setScale(0.8);
      this.pickupSprites.push(s);
    }
  }

  update(_time: number, _delta: number): void {
    if (!this.isSetup) return;

    const snap = this.latestSnapshot;

    // Camera follow midpoint
    const midX = (this.p1Sprite.x + this.p2Sprite.x) / 2;
    const midY = (this.p1Sprite.y + this.p2Sprite.y) / 2;
    const cam = this.cameras.main;
    cam.scrollX += (midX - cam.width / 2 - cam.scrollX) * 0.08;
    cam.scrollY += (midY - cam.height / 2 - cam.scrollY) * 0.08;
    this.bgTile.setPosition(cam.scrollX + cam.width / 2, cam.scrollY + cam.height / 2);

    // HUD update with on-chain state
    this.hud.setZoomCompensation(cam.zoom);

    if (snap) {
      // Build lightweight player-like objects for the HUD
      const p1Proxy = {
        hp: snap.player1.hp,
        fuel: snap.player1.fuel,
      };
      const p2Proxy = {
        hp: snap.player2.hp,
        fuel: snap.player2.fuel,
      };
      // HUD.update expects Player objects; cast the proxies since HUD only reads .hp and .fuel
      this.hud.update(p1Proxy as any, p2Proxy as any, this.matchState);
    }
  }

  shutdown(): void {
    if (this.inputSender) this.inputSender.stop();
    if (this.crankInterval) clearInterval(this.crankInterval);
    if (this.pollInterval) clearInterval(this.pollInterval);
    if (this.stateSubscriber) this.stateSubscriber.unsubscribe();
  }
}
