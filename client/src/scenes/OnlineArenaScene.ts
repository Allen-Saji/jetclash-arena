import Phaser from 'phaser';
import { Connection, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { ApplySystem } from '@magicblock-labs/bolt-sdk';
import { WalletProvider } from '@/net/WalletProvider';
import { InputSender } from '@/net/InputSender';
import { StateSubscriber } from '@/net/StateSubscriber';
import { ClientPrediction } from '@/net/ClientPrediction';
import { toPixel } from '@/net/types';
import type {
  GameStateSnapshot,
  InputAction,
  OnChainProjectile,
  OnChainPlayerData,
  OnChainMatchState,
  OnChainPickup,
  NetworkConfig,
  PlatformAABB,
} from '@/net/types';
import { HUD } from '@/components/HUD';
import type { HUDPlayerInfo } from '@/components/HUD';
import { TxLog } from '@/components/TxLog';
import { Player } from '@/entities/Player';
import { ProjectilePool } from '@/entities/Projectile';
import { P1_CONTROLS } from '@/config/player.config';
import { PLAYER_PHYSICS } from '@/config/player.config';
import { PRIMARY_WEAPON, SECONDARY_WEAPON } from '@/config/weapons.config';
import { GAME_WIDTH, GAME_HEIGHT, WORLD_WIDTH, WORLD_HEIGHT } from '@/config/game.config';
import { ARENA_PLATFORMS, PICKUP_SPAWNS, TREE_DECORATIONS } from '@/config/arena.config';
import { sfx } from '@/audio/SoundGenerator';
import type { MatchState } from '@/types';

const TICKS_PER_SECOND = 10; // Must match crank rate
const MAX_PLAYERS = 4;
const PLAYER_SPRITE_PREFIXES = ['p1', 'p2', 'p1', 'p2'];

const SPAWN_POSITIONS = [
  { x: 500, y: 1200 },
  { x: 2060, y: 1200 },
  { x: 800, y: 1000 },
  { x: 1760, y: 1000 },
];

// On-chain platform AABBs (fixed-point) matching init-arena args in LobbyScene
const ARENA_PLATFORM_AABBS: PlatformAABB[] = [
  { x: 0, y: 138000, w: 256000, h: 6000 },
  { x: 30000, y: 106000, w: 20000, h: 3000 },
  { x: 145000, y: 106000, w: 20000, h: 3000 },
  { x: 200000, y: 106000, w: 20000, h: 3000 },
];

export class OnlineArenaScene extends Phaser.Scene {
  private wallet!: WalletProvider;
  private config!: NetworkConfig;
  private inputSender!: InputSender;
  private stateSubscriber!: StateSubscriber;
  private prediction!: ClientPrediction;
  private hud!: HUD;
  private txLog!: TxLog;

  private playerIndex!: number;

  // Local player — full Player entity with Phaser physics
  private localPlayer!: Player;

  // Remote players — interpolated plain sprites
  private remoteSprites: (Phaser.GameObjects.Sprite | null)[] = [];
  private remoteSmoke: (Phaser.GameObjects.Sprite | null)[] = [];
  private remoteRender: {
    targetX: number;
    targetY: number;
    velX: number;
    velY: number;
    initialized: boolean;
    prevHp: number;
  }[] = [];

  // Local visual-only projectiles
  private localProjectiles!: ProjectilePool;

  // Chain-rendered projectiles (for remote players)
  private projectileSprites: Map<number, Phaser.GameObjects.Sprite> = new Map();
  private pickupSprites: Phaser.GameObjects.Sprite[] = [];
  private platforms!: Phaser.Physics.Arcade.StaticGroup;

  private worldPda!: PublicKey;
  private entities!: {
    match: PublicKey;
    playerPool: PublicKey;
    projectile: PublicKey;
    pickup: PublicKey;
    arena: PublicKey;
  };
  private pdas!: {
    matchState: PublicKey;
    playerPool: PublicKey;
    projectilePool: PublicKey;
    pickupState: PublicKey;
    arenaConfig: PublicKey;
  };

  private latestSnapshot: GameStateSnapshot | null = null;

  private matchState: MatchState = {
    timeRemaining: 120,
    playerCount: 2,
    scores: [0, 0, 0, 0],
    kills: [0, 0, 0, 0],
    isActive: false,
    winner: null,
  };

  // Chain reconciliation tracking for local player
  private prevChainHp: number = PLAYER_PHYSICS.maxHP;
  private prevChainIsDead: boolean = false;

  private isSetup = false;
  private statusText!: Phaser.GameObjects.Text;
  private crankInterval: number | null = null;
  private bgTile!: Phaser.GameObjects.TileSprite;

  // ER connection for gameplay (state sync, crank, input)
  private erConnection!: Connection;

  constructor() {
    super({ key: 'OnlineArena' });
  }

  create(data: {
    wallet: WalletProvider;
    config: NetworkConfig;
    worldPda: PublicKey;
    entities: {
      match: PublicKey;
      playerPool: PublicKey;
      projectile: PublicKey;
      pickup: PublicKey;
      arena: PublicKey;
    };
    pdas: {
      matchState: PublicKey;
      playerPool: PublicKey;
      projectilePool: PublicKey;
      pickupState: PublicKey;
      arenaConfig: PublicKey;
    };
    playerIndex: number;
  }): void {
    sfx.init();

    this.txLog = new TxLog(this);

    this.wallet = data.wallet;
    this.wallet.onTx = (label, sig, status) => this.txLog.add(label, sig, status);
    this.config = data.config;
    this.worldPda = data.worldPda;
    this.entities = data.entities;
    this.pdas = data.pdas;
    this.playerIndex = data.playerIndex;

    // Gameplay connection — after delegation, accounts live on ER.
    // wallet.erConnection is set by LobbyScene after delegation.
    // If no ER configured, fall back to L1 (wallet.connection).
    this.erConnection = this.wallet.erConnection ?? this.wallet.connection;

    // Reset reconciliation state
    this.prevChainHp = PLAYER_PHYSICS.maxHP;
    this.prevChainIsDead = false;

    // Client-side prediction with platform collision
    this.prediction = new ClientPrediction(
      ARENA_PLATFORM_AABBS,
      { worldWidth: 256000, worldHeight: 144000, gravity: 80000 },
    );

    // Visual setup
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.createBackground();
    this.createDecorations();
    this.createPlatforms();

    // Local player — real Player entity with full physics
    const sp = SPAWN_POSITIONS[this.playerIndex];
    const localId = ((this.playerIndex % 2) + 1) as 1 | 2;
    this.localPlayer = new Player(this, {
      id: localId,
      spriteKey: localId === 1 ? 'player1' : 'player2',
      controls: P1_CONTROLS,
      spawnX: sp.x,
      spawnY: sp.y,
      facingRight: this.playerIndex < 2,
    });
    this.physics.add.collider(this.localPlayer.sprite, this.platforms);

    // Local visual-only projectile pool (no damage overlaps)
    this.localProjectiles = new ProjectilePool(this, 20);
    this.physics.add.collider(
      this.localProjectiles.group,
      this.platforms,
      (obj1) => {
        const proj = obj1 as any;
        if (typeof proj.deactivate !== 'function') return;
        if (proj.isRocket) this.spawnExplosion(proj.x, proj.y);
        proj.deactivate();
      },
    );

    // Remote player sprites
    this.createRemoteSprites();
    this.createPickupSprites();

    // Camera follows local player
    const cam = this.cameras.main;
    cam.setZoom(0.55);
    cam.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    cam.startFollow(this.localPlayer.sprite, true, 0.08, 0.08);

    // HUD
    this.hud = new HUD(this);

    // Status overlay
    this.statusText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'Match starting...', {
      fontSize: '24px',
      fontFamily: 'monospace',
      color: '#f5c542',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(300);

    // Mute key
    this.input.keyboard!.on('keydown-M', () => sfx.toggleMute());

    // Input sender (20Hz to chain) — uses ER connection
    this.inputSender = new InputSender(
      this.wallet,
      this.config,
      this.worldPda,
      {
        playerPool: this.entities.playerPool,
        match: this.entities.match,
        projectile: this.entities.projectile,
      },
      this.playerIndex,
      () => this.captureInput(),
    );

    // Focus canvas
    this.game.canvas.focus();
    this.input.keyboard!.enabled = true;

    // Start networking
    // If erConnection == L1 connection (delegation failed), warmup is unnecessary.
    const useER = this.erConnection !== this.wallet.connection;
    const startNetworking = () => {
      this.inputSender.start(10); // 10Hz input (matches crank rate)
      if (this.playerIndex === 0) this.startCrank(); // Only host cranks
      this.setupStateSync();
      this.isSetup = true;
      this.statusText.setVisible(false);
      this.matchState.isActive = true;
    };

    if (useER) {
      this.warmupER().then(startNetworking);
    } else {
      console.log('[OnlineArena] Using L1 for all TXs (no ER delegation)');
      startNetworking();
    }
  }

  private createRemoteSprites(): void {
    this.remoteSprites = [];
    this.remoteSmoke = [];
    this.remoteRender = [];

    for (let i = 0; i < MAX_PLAYERS; i++) {
      if (i === this.playerIndex) {
        // Local player slot — no remote sprite
        this.remoteSprites.push(null);
        this.remoteSmoke.push(null);
        this.remoteRender.push({ targetX: 0, targetY: 0, velX: 0, velY: 0, initialized: false, prevHp: PLAYER_PHYSICS.maxHP });
        continue;
      }

      const prefix = PLAYER_SPRITE_PREFIXES[i];
      const sp = SPAWN_POSITIONS[i];
      const sprite = this.add.sprite(sp.x, sp.y, `${prefix}-idle-1`).setScale(1.3);
      sprite.play(`${prefix}-idle`);
      sprite.setVisible(false);
      this.remoteSprites.push(sprite);

      // Smoke sprite for jetpack visual
      const smoke = this.add.sprite(0, 0, 'smoke-1').setScale(0.6).setVisible(false);
      this.remoteSmoke.push(smoke);

      this.remoteRender.push({ targetX: sp.x, targetY: sp.y, velX: 0, velY: 0, initialized: false, prevHp: PLAYER_PHYSICS.maxHP });
    }
  }

  /**
   * Pre-fetch all game accounts on ER to trigger cloning in programs-replica mode.
   * Without this, crank TXs fail because accounts don't exist on ER yet.
   */
  private async warmupER(): Promise<void> {
    console.log('[ER] Warming up accounts on ER...');
    const allPdas = [
      this.worldPda,
      this.pdas.matchState,
      this.pdas.playerPool,
      this.pdas.projectilePool,
      this.pdas.pickupState,
      this.pdas.arenaConfig,
      this.entities.match,
      this.entities.playerPool,
      this.entities.projectile,
      this.entities.pickup,
      this.entities.arena,
    ];

    const results = await Promise.allSettled(
      allPdas.map(pda => this.erConnection.getAccountInfo(pda))
    );
    const found = results.filter(r => r.status === 'fulfilled' && r.value !== null).length;
    console.log(`[ER] Warmed up ${found}/${allPdas.length} accounts`);
  }

  /**
   * Set up state sync — poll/subscribe on the connection where accounts live.
   * After delegation: ER (erConnection). Without delegation: L1 (wallet.connection).
   */
  private setupStateSync(): void {
    this.stateSubscriber = new StateSubscriber(
      this.erConnection,
      {
        matchState: this.pdas.matchState,
        playerPool: this.pdas.playerPool,
        projectilePool: this.pdas.projectilePool,
        pickupState: this.pdas.pickupState,
      },
      (snapshot) => {
        this.latestSnapshot = snapshot;
        this.onStateUpdate();
      },
    );

    const useER = this.erConnection !== this.wallet.connection;
    if (useER && this.config.erWsUrl) {
      this.stateSubscriber.startWebSocket(this.config.erWsUrl);
      console.log(`[StateSync] WS on ${this.config.erWsUrl}`);
    } else {
      this.stateSubscriber.startPolling(100);
      console.log(`[StateSync] Polling at 10Hz (${useER ? 'ER' : 'L1'})`);
    }
  }

  private onStateUpdate(): void {
    const snap = this.latestSnapshot;
    if (!snap) return;

    const { match, players, projectiles, pickups } = snap;

    // Update match state for HUD
    this.matchState.timeRemaining = match.ticksRemaining / TICKS_PER_SECOND;
    this.matchState.playerCount = match.playerCount;
    for (let i = 0; i < players.length; i++) {
      this.matchState.scores[i] = players[i].score;
      this.matchState.kills[i] = players[i].kills;
    }

    // Feed server state to prediction engine + reconcile local player
    if (this.playerIndex < players.length && players[this.playerIndex].isJoined) {
      const chainPlayer = players[this.playerIndex];

      // Feed prediction engine — replays unacked inputs on top of server state
      this.prediction.onServerState(chainPlayer);

      // Acknowledge inputs up to server's latest seq
      this.inputSender.acknowledgeUpTo(chainPlayer.inputSeq);

      // Reconcile combat state (HP, death, ammo — not position)
      this.reconcileLocalPlayer(chainPlayer);
    }

    // Update remote player sprites from chain
    for (let i = 0; i < MAX_PLAYERS && i < players.length; i++) {
      if (i === this.playerIndex) continue;
      this.updateRemoteFromChain(i, players[i]);
    }

    // Projectiles (remote — chain-positioned)
    this.updateProjectiles(projectiles);

    // Pickups
    this.updatePickups(pickups);

    // Match end
    if (!match.isActive && match.winner !== 0) {
      this.matchState.isActive = false;
      this.matchState.winner = match.winner;

      if (this.crankInterval) {
        clearInterval(this.crankInterval);
        this.crankInterval = null;
      }

      this.time.delayedCall(1500, () => {
        this.shutdown();
        this.scene.start('Result', {
          matchState: { ...this.matchState },
          fromOnline: true,
        });
      });
    }
  }

  /**
   * Reconcile combat state from chain. Position is handled by prediction engine.
   */
  private reconcileLocalPlayer(chain: OnChainPlayerData): void {
    const lp = this.localPlayer;

    // HP — always sync, trigger effects on decrease
    const chainHp = chain.hp;
    if (chainHp < this.prevChainHp && !lp.isDead) {
      const dmg = this.prevChainHp - chainHp;
      const intensity = dmg >= 30 ? 0.01 : 0.005;
      const duration = dmg >= 30 ? 200 : 100;
      this.cameras.main.shake(duration, intensity);
      sfx.hit();

      lp.sprite.setTint(0xff0000);
      this.time.delayedCall(100, () => {
        if (!lp.isDead) lp.sprite.clearTint();
      });
    }
    lp.hp = chainHp;
    this.prevChainHp = chainHp;

    // Death/respawn transitions
    if (chain.isDead && !this.prevChainIsDead) {
      lp.die();
      sfx.kill();
    } else if (!chain.isDead && this.prevChainIsDead) {
      const rx = toPixel(chain.posX);
      const ry = toPixel(chain.posY);
      lp.respawn(rx, ry);
      this.prevChainHp = PLAYER_PHYSICS.maxHP;
    }
    this.prevChainIsDead = chain.isDead;

    // Invincibility — sync from chain, but override Player's harsh blink
    // Set the flag to false so Player.update() doesn't run its own blink logic.
    // We render invincibility ourselves with a gentle pulse.
    lp.isInvincible = false;
    if (chain.isInvincible) {
      lp.sprite.setAlpha(0.5 + 0.3 * Math.sin(this.time.now * 0.008));
    } else {
      lp.sprite.setAlpha(1);
    }

    // Ammo — sync from chain
    lp.primaryAmmo = chain.primaryAmmo;
    lp.secondaryAmmo = chain.secondaryAmmo;

    // Speed multiplier
    lp.speedMultiplier = chain.speedMultiplier / 100;

    // Position reconciliation via prediction engine
    if (!chain.isDead) {
      const predicted = this.prediction.getPredictedPixels();
      if (predicted) {
        const dx = predicted.x - lp.sprite.x;
        const dy = predicted.y - lp.sprite.y;
        const drift = Math.hypot(dx, dy);

        if (drift > 500) {
          // Hard snap on extreme misprediction
          lp.sprite.setPosition(predicted.x, predicted.y);
          lp.body.setVelocity(0, 0);
        } else if (drift > 30) {
          // Smooth correction toward predicted position
          // Stronger correction for larger drift
          const correctionStrength = Math.min(0.3, drift / 500);
          lp.sprite.x += dx * correctionStrength;
          lp.sprite.y += dy * correctionStrength;
        }
      }
    }
  }

  private updateRemoteFromChain(idx: number, state: OnChainPlayerData): void {
    const sprite = this.remoteSprites[idx];
    if (!sprite) return;

    if (!state.isJoined) {
      sprite.setVisible(false);
      const smoke = this.remoteSmoke[idx];
      if (smoke) smoke.setVisible(false);
      return;
    }

    const rr = this.remoteRender[idx];
    const newX = toPixel(state.posX);
    const newY = toPixel(state.posY);

    if (!rr.initialized || Math.abs(newX - rr.targetX) > 300 || Math.abs(newY - rr.targetY) > 300) {
      sprite.setPosition(newX, newY);
      rr.initialized = true;
    }

    rr.targetX = newX;
    rr.targetY = newY;
    rr.velX = toPixel(state.velX) * TICKS_PER_SECOND;
    rr.velY = toPixel(state.velY) * TICKS_PER_SECOND;

    // Damage flash on HP decrease
    if (state.hp < rr.prevHp && !state.isDead) {
      sprite.setTint(0xff0000);
      this.time.delayedCall(100, () => {
        if (sprite.visible) sprite.clearTint();
      });
    }
    rr.prevHp = state.hp;

    // Visual state
    sprite.setFlipX(!state.facingRight);
    sprite.setVisible(!state.isDead);

    if (state.isInvincible) {
      // Gentle pulse instead of harsh blink
      sprite.setAlpha(0.5 + 0.3 * Math.sin(this.time.now * 0.008));
    } else {
      sprite.setAlpha(1);
    }

    const prefix = PLAYER_SPRITE_PREFIXES[idx];
    const animKey = this.chooseAnim(prefix, state);
    if (sprite.anims.currentAnim?.key !== animKey) {
      sprite.play(animKey, true);
    }
  }

  private chooseAnim(prefix: string, state: OnChainPlayerData): string {
    if (state.isDead) return `${prefix}-die`;
    if (state.velY < 0) return `${prefix}-fly`;
    if (state.velY > 200) return `${prefix}-jump`;
    if (state.velX !== 0) return `${prefix}-walk`;
    return `${prefix}-idle`;
  }

  private updateProjectiles(projectiles: OnChainProjectile[]): void {
    const activeSlots = new Set<number>();

    for (let i = 0; i < projectiles.length; i++) {
      const proj = projectiles[i];
      if (!proj.active) continue;

      activeSlots.add(i);
      let sprite = this.projectileSprites.get(i);

      if (!sprite) {
        const textureKey = proj.isRocket ? 'rocket' : 'bullet';
        sprite = this.add.sprite(0, 0, textureKey).setScale(0.8).setDepth(10);
        this.projectileSprites.set(i, sprite);
      }

      sprite.x = toPixel(proj.posX);
      sprite.y = toPixel(proj.posY);
      sprite.setVisible(true);
      sprite.setFlipX(proj.velX < 0);
    }

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
      if (pickup.posX !== 0 || pickup.posY !== 0) {
        sprite.x = toPixel(pickup.posX);
        sprite.y = toPixel(pickup.posY);
      }
      sprite.setVisible(!pickup.isConsumed);
    }
  }

  private captureInput(): InputAction {
    const keys = this.localPlayer.keys;
    const input: InputAction = {
      moveDir: keys.left.isDown ? -1 : keys.right.isDown ? 1 : 0,
      jet: keys.up.isDown,
      dash: Phaser.Input.Keyboard.JustDown(keys.utility),
      shootPrimary: keys.shoot.isDown,
      shootSecondary: keys.secondary.isDown,
      inputSeq: 0,
    };

    // Feed to prediction engine (inputSeq set by InputSender, but we predict locally)
    // InputSender will set the real seq — this is for immediate local prediction
    return input;
  }

  // --- Local shooting (visual + SFX only, no damage) ---
  private lastLocalPrimaryFire = 0;
  private lastLocalSecondaryFire = 0;

  private handleLocalShooting(): void {
    if (!this.matchState.isActive) return;
    const lp = this.localPlayer;
    if (lp.isDead) return;

    const now = this.time.now;
    const keys = lp.keys;

    if (keys.shoot.isDown && now - this.lastLocalPrimaryFire >= PRIMARY_WEAPON.fireRate && lp.primaryAmmo > 0) {
      this.lastLocalPrimaryFire = now;
      sfx.shoot();
      const offsetX = lp.facingRight ? 35 : -35;
      const weapon = { ...PRIMARY_WEAPON };
      if (lp.config.id === 2) weapon.projectileKey = 'bullet-p2';
      this.localProjectiles.fire(
        lp.sprite.x + offsetX,
        lp.sprite.y - 20,
        lp.facingRight,
        weapon,
        lp.config.id,
      );
    }

    if (keys.secondary.isDown && now - this.lastLocalSecondaryFire >= SECONDARY_WEAPON.fireRate && lp.secondaryAmmo > 0) {
      this.lastLocalSecondaryFire = now;
      sfx.rocket();
      const offsetX = lp.facingRight ? 35 : -35;
      this.localProjectiles.fire(
        lp.sprite.x + offsetX,
        lp.sprite.y - 20,
        lp.facingRight,
        SECONDARY_WEAPON,
        lp.config.id,
      );
    }
  }

  private spawnExplosion(x: number, y: number): void {
    sfx.explosion();
    const explosion = this.add.sprite(x, y, 'collision1-1');
    explosion.setScale(1.5);
    explosion.play('explosion');
    explosion.on('animationcomplete', () => explosion.destroy());
  }

  // --- Crank (all players, 20Hz) ---
  private crankBusy = false;
  private crankInstructions: TransactionInstruction[] | null = null;

  private async buildCrankInstructions(): Promise<void> {
    const [physics, projTick, combat, pickups] = await Promise.all([
      ApplySystem({
        authority: this.wallet.publicKey,
        systemId: this.config.programIds.tickPhysics,
        world: this.worldPda,
        entities: [
          { entity: this.entities.match, components: [{ componentId: this.config.programIds.matchState }] },
          { entity: this.entities.playerPool, components: [{ componentId: this.config.programIds.playerPool }] },
          { entity: this.entities.arena, components: [{ componentId: this.config.programIds.arenaConfig }] },
        ],
      }),
      ApplySystem({
        authority: this.wallet.publicKey,
        systemId: this.config.programIds.tickProjectiles,
        world: this.worldPda,
        entities: [
          { entity: this.entities.projectile, components: [{ componentId: this.config.programIds.projectilePool }] },
          { entity: this.entities.arena, components: [{ componentId: this.config.programIds.arenaConfig }] },
        ],
      }),
      ApplySystem({
        authority: this.wallet.publicKey,
        systemId: this.config.programIds.tickCombat,
        world: this.worldPda,
        entities: [
          { entity: this.entities.match, components: [{ componentId: this.config.programIds.matchState }] },
          { entity: this.entities.playerPool, components: [{ componentId: this.config.programIds.playerPool }] },
          { entity: this.entities.projectile, components: [{ componentId: this.config.programIds.projectilePool }] },
        ],
      }),
      ApplySystem({
        authority: this.wallet.publicKey,
        systemId: this.config.programIds.tickPickups,
        world: this.worldPda,
        entities: [
          { entity: this.entities.match, components: [{ componentId: this.config.programIds.matchState }] },
          { entity: this.entities.playerPool, components: [{ componentId: this.config.programIds.playerPool }] },
          { entity: this.entities.pickup, components: [{ componentId: this.config.programIds.pickupState }] },
        ],
      }),
    ]);
    this.crankInstructions = [
      physics.transaction.instructions[0],
      projTick.transaction.instructions[0],
      combat.transaction.instructions[0],
      pickups.transaction.instructions[0],
    ];
  }

  /**
   * Host (player 0) cranks the game loop at 10Hz.
   * Each tick system is sent as a separate TX for reliability.
   */
  private crankTxCount = 0;

  private startCrank(): void {
    this.buildCrankInstructions().then(() => {
      console.log('[Crank] Instructions built, starting 10Hz loop');
      // Confirm first crank TX to catch errors early
      this.sendCrankWithConfirm();
    }).catch(err => {
      console.warn('[Crank] Failed to build instructions:', err.message);
    });

    this.crankInterval = window.setInterval(async () => {
      if (!this.matchState.isActive || this.crankBusy || !this.crankInstructions) return;
      this.crankBusy = true;

      try {
        const bh = (await this.erConnection.getLatestBlockhash()).blockhash;
        const ixs = this.crankInstructions;

        // Send each system as individual TX for reliability
        for (const ix of ixs) {
          const tx = new Transaction();
          tx.add(ix);
          tx.feePayer = this.wallet.publicKey;
          tx.recentBlockhash = bh;
          tx.sign(this.wallet.keypair);
          this.erConnection.sendRawTransaction(tx.serialize(), { skipPreflight: true })
            .then(() => { this.crankTxCount++; })
            .catch((e) => console.warn('[Crank] TX send error:', e.message?.slice(0, 120)));
        }
      } catch (err: any) {
        console.warn('[Crank] Error:', err.message?.slice(0, 120));
      } finally {
        this.crankBusy = false;
      }
    }, 100); // 10Hz
  }

  /** Send first crank TX with confirmation to detect execution errors */
  private async sendCrankWithConfirm(): Promise<void> {
    if (!this.crankInstructions) return;
    try {
      const bh = await this.erConnection.getLatestBlockhash();
      const ix = this.crankInstructions[0]; // tick-physics
      const tx = new Transaction();
      tx.add(ix);
      tx.feePayer = this.wallet.publicKey;
      tx.recentBlockhash = bh.blockhash;
      tx.sign(this.wallet.keypair);
      const sig = await this.erConnection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
      console.log('[Crank] First TX sig:', sig.slice(0, 16) + '..');
      const result = await this.erConnection.confirmTransaction(
        { signature: sig, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight },
        'confirmed',
      );
      if (result.value.err) {
        console.error('[Crank] First TX FAILED on-chain:', JSON.stringify(result.value.err));
      } else {
        console.log('[Crank] First TX confirmed OK');
      }
    } catch (err: any) {
      console.error('[Crank] First TX error:', err.message?.slice(0, 200));
      if (err.logs) {
        console.error('[Crank] TX logs:', err.logs.slice(-5).join('\n'));
      }
    }
  }

  // --- Visual creation ---
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

    const floor = this.add.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT - 10, WORLD_WIDTH, 20, 0x000000, 0);
    this.physics.add.existing(floor, true);
    this.platforms.add(floor);
  }

  private createPickupSprites(): void {
    for (const spawn of PICKUP_SPAWNS) {
      const key = spawn.type === 'health' ? 'heal-1' : 'speed-1';
      const s = this.add.sprite(spawn.x, spawn.y, key).setScale(0.8);
      this.pickupSprites.push(s);
    }
  }

  // --- Main update loop (60fps) ---
  update(_time: number, delta: number): void {
    if (!this.isSetup) return;

    const snap = this.latestSnapshot;

    // 1. Local player physics at 60fps
    if (this.matchState.isActive) {
      this.localPlayer.update(delta);
    }

    // 2. Local shooting (visual + SFX only)
    this.handleLocalShooting();

    // 3. Interpolate remote player sprites
    const dtSec = delta / 1000;
    for (let i = 0; i < MAX_PLAYERS; i++) {
      if (i === this.playerIndex) continue;
      const sprite = this.remoteSprites[i];
      if (!sprite || !sprite.visible) continue;

      const rr = this.remoteRender[i];
      if (!rr.initialized) continue;

      // Velocity-based extrapolation + smooth lerp
      const extraX = rr.velX * dtSec * 0.6; // Increased from 0.4 to 0.6 for smoother movement
      const extraY = rr.velY * dtSec * 0.6;
      const lerpFactor = 1 - Math.pow(0.005, dtSec); // Tighter lerp (was 0.01)
      sprite.x += (rr.targetX + extraX - sprite.x) * lerpFactor;
      sprite.y += (rr.targetY + extraY - sprite.y) * lerpFactor;

      if (sprite.y > WORLD_HEIGHT - 30) {
        sprite.y = WORLD_HEIGHT - 30;
      }

      // Remote smoke
      const smoke = this.remoteSmoke[i];
      if (smoke) {
        if (rr.velY < 0 && sprite.visible) {
          smoke.setVisible(true);
          const flipX = sprite.flipX;
          smoke.setPosition(
            sprite.x + (flipX ? 20 : -20),
            sprite.y + 45,
          );
          if (!smoke.anims.isPlaying) {
            smoke.play('jetpack-smoke');
          }
        } else {
          smoke.setVisible(false);
          smoke.stop();
        }
      }
    }

    // 4. Camera bg parallax
    const cam = this.cameras.main;
    this.bgTile.setPosition(cam.scrollX + cam.width / 2, cam.scrollY + cam.height / 2);

    // 5. HUD + TxLog
    this.hud.setZoomCompensation(cam.zoom);
    this.txLog.setZoomCompensation(cam.zoom);
    this.txLog.update();

    if (snap) {
      const hudPlayers: HUDPlayerInfo[] = snap.players
        .filter(p => p.isJoined)
        .map((p, i) => {
          // For local player, use local fuel (more responsive)
          if (i === this.playerIndex) {
            return { hp: this.localPlayer.hp, fuel: this.localPlayer.fuel };
          }
          return { hp: p.hp, fuel: p.fuel };
        });
      this.hud.update(hudPlayers, this.matchState);
    }
  }

  shutdown(): void {
    if (this.inputSender) this.inputSender.stop();
    if (this.stateSubscriber) this.stateSubscriber.stop();
    if (this.crankInterval) clearInterval(this.crankInterval);
    if (this.txLog) this.txLog.destroy();
    if (this.localPlayer) this.localPlayer.destroy();
  }
}
