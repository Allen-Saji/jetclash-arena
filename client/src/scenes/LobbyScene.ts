import Phaser from 'phaser';
import { Connection, PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import {
  InitializeNewWorld,
  AddEntity,
  InitializeComponent,
  ApplySystem,
  FindComponentPda,
  FindEntityPda,
  DelegateComponent,
  BN,
} from '@magicblock-labs/bolt-sdk';
import { World } from '@magicblock-labs/bolt-sdk';
import { WalletProvider } from '@/net/WalletProvider';
import { LOCAL_CONFIG, DEVNET_CONFIG } from '@/net/NetworkConfig';
import { GAME_WIDTH, GAME_HEIGHT } from '@/config/game.config';
import { sfx } from '@/audio/SoundGenerator';
import { deserializeMatchState } from '@/net/StateSubscriber';
import { TxLog } from '@/components/TxLog';
import type { NetworkConfig } from '@/net/types';

const MAX_PLAYERS = 4;

/**
 * Lobby scene for creating/joining rooms, selecting character, and readying up.
 * Flow: Connect Wallet → Create/Join Room → Ready Up → Start Match → Delegate → Play
 */
export class LobbyScene extends Phaser.Scene {
  private wallet!: WalletProvider;
  private config!: NetworkConfig;

  private worldPda: PublicKey | null = null;
  private worldId: InstanceType<typeof BN> | null = null;
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

  private playerIndex: number = -1;
  private isHost: boolean = false;
  private selectedCharacter: number = 1;
  private pollInterval: number | null = null;

  // UI elements
  private statusText!: Phaser.GameObjects.Text;
  private roomCodeText!: Phaser.GameObjects.Text;
  private playerListTexts: Phaser.GameObjects.Text[] = [];
  private readyBtn!: Phaser.GameObjects.Text;
  private startBtn!: Phaser.GameObjects.Text;
  private charPreview!: Phaser.GameObjects.Image;
  private charLabel!: Phaser.GameObjects.Text;
  private txLog!: TxLog;
  private walletInfoText!: Phaser.GameObjects.Text;

  // Tracks DOM elements for cleanup
  private domElements: Phaser.GameObjects.DOMElement[] = [];

  constructor() {
    super({ key: 'Lobby' });
  }

  create(data?: { roomCode?: string }): void {
    sfx.init();
    // Use devnet config (Solana devnet L1 + MagicBlock ER)
    // Falls back to LOCAL_CONFIG if ?local query param is set
    const useLocal = new URLSearchParams(window.location.search).has('local');
    this.config = useLocal ? LOCAL_CONFIG : DEVNET_CONFIG;

    // Background
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x111122);

    // Title
    this.add.text(GAME_WIDTH / 2, 40, 'ONLINE LOBBY', {
      fontSize: '36px', fontFamily: 'monospace', color: '#f5c542', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5);

    // Network indicator
    const netLabel = useLocal ? 'LOCAL' : 'DEVNET';
    const netColor = useLocal ? '#ff6644' : '#44cc66';
    this.add.text(GAME_WIDTH - 20, 20, netLabel, {
      fontSize: '12px', fontFamily: 'monospace', color: netColor,
    }).setOrigin(1, 0);

    // Status
    this.statusText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '', {
      fontSize: '20px', fontFamily: 'monospace', color: '#cccccc',
    }).setOrigin(0.5);

    // Wallet info (shown after connection)
    this.walletInfoText = this.add.text(GAME_WIDTH / 2, 70, '', {
      fontSize: '12px', fontFamily: 'monospace', color: '#888888',
    }).setOrigin(0.5).setVisible(false);

    // Room code display (hidden initially)
    this.roomCodeText = this.add.text(GAME_WIDTH / 2, 90, '', {
      fontSize: '14px', fontFamily: 'monospace', color: '#88ff88',
    }).setOrigin(0.5).setVisible(false);

    // Player list (hidden initially)
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const t = this.add.text(GAME_WIDTH / 2 - 200, 180 + i * 50, '', {
        fontSize: '18px', fontFamily: 'monospace', color: '#aaaaaa',
      }).setVisible(false);
      this.playerListTexts.push(t);
    }

    // Character selection
    this.charPreview = this.add.image(GAME_WIDTH / 2 + 220, 280, 'p1-idle-1')
      .setScale(2)
      .setVisible(false);
    this.charLabel = this.add.text(GAME_WIDTH / 2 + 220, 360, 'Char 01', {
      fontSize: '14px', fontFamily: 'monospace', color: '#ffffff',
    }).setOrigin(0.5).setVisible(false);

    // Ready button (hidden initially)
    this.readyBtn = this.add.text(GAME_WIDTH / 2, 450, '[ READY ]', {
      fontSize: '24px', fontFamily: 'monospace', color: '#44cc66', fontStyle: 'bold',
    }).setOrigin(0.5).setVisible(false).setInteractive({ useHandCursor: true });
    this.readyBtn.on('pointerdown', () => this.onReady());

    // Start button (host only, hidden initially)
    this.startBtn = this.add.text(GAME_WIDTH / 2, 510, '[ START MATCH ]', {
      fontSize: '24px', fontFamily: 'monospace', color: '#f5c542', fontStyle: 'bold',
    }).setOrigin(0.5).setVisible(false).setInteractive({ useHandCursor: true });
    this.startBtn.on('pointerdown', () => this.onStartMatch());

    // Back button
    this.add.text(20, GAME_HEIGHT - 30, '< BACK', {
      fontSize: '16px', fontFamily: 'monospace', color: '#888888',
    }).setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      this.cleanup();
      this.scene.start('MainMenu');
    });

    // Transaction log
    this.txLog = new TxLog(this);

    // Character arrows
    const leftArr = this.add.text(GAME_WIDTH / 2 + 160, 280, '<', {
      fontSize: '32px', fontFamily: 'monospace', color: '#ffffff',
    }).setOrigin(0.5).setVisible(false).setInteractive({ useHandCursor: true });
    leftArr.on('pointerdown', () => this.cycleCharacter(-1));

    const rightArr = this.add.text(GAME_WIDTH / 2 + 280, 280, '>', {
      fontSize: '32px', fontFamily: 'monospace', color: '#ffffff',
    }).setOrigin(0.5).setVisible(false).setInteractive({ useHandCursor: true });
    rightArr.on('pointerdown', () => this.cycleCharacter(1));

    // Store references for visibility toggling
    (this as any)._charArrows = [leftArr, rightArr];

    // Check if joining via room code — still need wallet first
    const roomCode = data?.roomCode || this.getUrlRoomCode();
    this.showConnectWallet(roomCode ?? undefined);
  }

  private getUrlRoomCode(): string | null {
    const params = new URLSearchParams(window.location.search);
    return params.get('room');
  }

  // ─── STEP 1: Connect Wallet ────────────────────────────────────

  private showConnectWallet(pendingRoomCode?: string): void {
    const useLocal = this.config === LOCAL_CONFIG;

    if (useLocal) {
      // Local mode: auto-generate keypair + airdrop, skip wallet UI
      this.statusText.setText('Connecting (local)...').setVisible(true);
      this.wallet = new WalletProvider(this.config.rpcUrl);
      this.wallet.useLocalKeypair();
      this.wallet.onTx = (label, sig, status) => this.txLog.add(label, sig, status);
      this.wallet.requestAirdrop().then(() => {
        this.setupAnchorProvider();
        this.onWalletConnected(pendingRoomCode);
      }).catch((err: any) => {
        this.statusText.setText(`Airdrop failed: ${err.message}`);
      });
      return;
    }

    // Devnet: show Connect Wallet button
    if (!WalletProvider.isPhantomAvailable()) {
      this.statusText.setText('Phantom wallet not found.\nInstall from phantom.app').setVisible(true);
      return;
    }

    this.statusText.setVisible(false);

    const connectBtn = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20, '[ CONNECT PHANTOM ]', {
      fontSize: '28px', fontFamily: 'monospace', color: '#ab9ff2', fontStyle: 'bold',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    connectBtn.on('pointerover', () => connectBtn.setScale(1.1));
    connectBtn.on('pointerout', () => connectBtn.setScale(1));

    const hint = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 30,
      'Connect Phantom to play (needs ~0.1 SOL on devnet)', {
      fontSize: '14px', fontFamily: 'monospace', color: '#666666',
    }).setOrigin(0.5);

    connectBtn.on('pointerdown', async () => {
      connectBtn.disableInteractive();
      connectBtn.setText('Connecting...');
      hint.setText('Approve the connection and fund transfer...');
      try {
        this.wallet = new WalletProvider(this.config.rpcUrl);
        // connectPhantom: connects + creates session key + funds it (2 popups total)
        await this.wallet.connectPhantom();
        this.wallet.onTx = (label, sig, status) => this.txLog.add(label, sig, status);

        this.setupAnchorProvider();
        connectBtn.destroy();
        hint.destroy();
        this.onWalletConnected(pendingRoomCode);
      } catch (err: any) {
        connectBtn.setText('[ CONNECT PHANTOM ]').setInteractive({ useHandCursor: true });
        hint.setText('Connect Phantom to play (needs ~0.1 SOL on devnet)');
        this.statusText.setText(`Failed: ${err.message}`).setVisible(true);
      }
    });
  }

  private onWalletConnected(pendingRoomCode?: string): void {
    const sessionAddr = this.wallet.publicKey.toBase58();
    const ownerAddr = this.wallet.ownerPublicKey.toBase58();
    this.walletInfoText.setText(
      `Wallet: ${ownerAddr.slice(0, 6)}...${ownerAddr.slice(-4)}  |  Session: ${sessionAddr.slice(0, 6)}...${sessionAddr.slice(-4)}`
    ).setVisible(true);

    if (pendingRoomCode) {
      this.joinRoom(pendingRoomCode);
    } else {
      this.showModeSelection();
    }
  }

  // ─── STEP 2: Create or Join ────────────────────────────────────

  private showModeSelection(): void {
    this.statusText.setVisible(false);

    const createBtn = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 30, '[ CREATE ROOM ]', {
      fontSize: '28px', fontFamily: 'monospace', color: '#44cc66', fontStyle: 'bold',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    createBtn.on('pointerover', () => createBtn.setScale(1.1));
    createBtn.on('pointerout', () => createBtn.setScale(1));
    createBtn.on('pointerdown', () => {
      createBtn.destroy();
      joinBtn.destroy();
      joinInput.destroy();
      joinLabel.destroy();
      this.createRoom();
    });

    const joinLabel = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 50, 'Or paste room code:', {
      fontSize: '14px', fontFamily: 'monospace', color: '#888888',
    }).setOrigin(0.5);

    // Simple text input via DOM
    const joinInput = this.add.dom(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 90).createFromHTML(
      `<input type="text" id="room-input" placeholder="Room code..." style="
        width: 400px; padding: 10px; font-size: 16px; font-family: monospace;
        background: #222; color: #fff; border: 2px solid #444; border-radius: 8px;
        text-align: center;
      ">`
    );
    this.domElements.push(joinInput);

    const joinBtn = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 140, '[ JOIN ]', {
      fontSize: '24px', fontFamily: 'monospace', color: '#4488ff', fontStyle: 'bold',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    joinBtn.on('pointerdown', () => {
      const input = document.getElementById('room-input') as HTMLInputElement;
      const code = input?.value?.trim();
      if (code) {
        createBtn.destroy();
        joinBtn.destroy();
        joinInput.destroy();
        joinLabel.destroy();
        this.joinRoom(code);
      }
    });
  }

  private async createRoom(): Promise<void> {
    this.statusText.setText('Creating room...').setVisible(true);
    this.isHost = true;
    this.playerIndex = 0;

    try {
      const conn = this.wallet.connection;

      // Create world
      this.statusText.setText('Creating world...');
      const initWorld = await InitializeNewWorld({
        payer: this.wallet.publicKey,
        connection: conn,
      });
      await this.wallet.sendTransaction(initWorld.transaction, 'InitWorld');
      this.worldPda = initWorld.worldPda;
      this.worldId = initWorld.worldId;

      // Create 5 entities (match, playerPool, projectile, pickup, arena)
      const entityNames = ['match', 'playerPool', 'projectile', 'pickup', 'arena'];
      const entityPdas: PublicKey[] = [];
      this.statusText.setText('Creating entities...');
      for (let i = 0; i < 5; i++) {
        const addEntity = await AddEntity({
          payer: this.wallet.publicKey,
          world: this.worldPda,
          connection: conn,
        });
        await this.wallet.sendTransaction(addEntity.transaction, `AddEntity:${entityNames[i]}`);
        entityPdas.push(addEntity.entityPda);
      }
      this.entities = {
        match: entityPdas[0],
        playerPool: entityPdas[1],
        projectile: entityPdas[2],
        pickup: entityPdas[3],
        arena: entityPdas[4],
      };

      // Initialize components
      const compNames = ['MatchState', 'PlayerPool', 'ProjectilePool', 'PickupState', 'ArenaConfig'];
      const compDefs = [
        { entity: this.entities.match, componentId: this.config.programIds.matchState },
        { entity: this.entities.playerPool, componentId: this.config.programIds.playerPool },
        { entity: this.entities.projectile, componentId: this.config.programIds.projectilePool },
        { entity: this.entities.pickup, componentId: this.config.programIds.pickupState },
        { entity: this.entities.arena, componentId: this.config.programIds.arenaConfig },
      ];

      const compPdas: PublicKey[] = [];
      this.statusText.setText('Initializing components...');
      for (let ci = 0; ci < compDefs.length; ci++) {
        const { entity, componentId } = compDefs[ci];
        const result = await InitializeComponent({
          payer: this.wallet.publicKey,
          entity,
          componentId,
        });
        await this.wallet.sendTransaction(result.transaction, `InitComp:${compNames[ci]}`);
        compPdas.push(result.componentPda);
      }
      this.pdas = {
        matchState: compPdas[0],
        playerPool: compPdas[1],
        projectilePool: compPdas[2],
        pickupState: compPdas[3],
        arenaConfig: compPdas[4],
      };

      // Init arena
      this.statusText.setText('Initializing arena...');
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
          { x: 176000, y: 100000 },
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
        systemId: this.config.programIds.initArena,
        world: this.worldPda,
        entities: [
          { entity: this.entities.arena, components: [{ componentId: this.config.programIds.arenaConfig }] },
          { entity: this.entities.pickup, components: [{ componentId: this.config.programIds.pickupState }] },
        ],
        args: arenaArgs,
      });
      await this.wallet.sendTransaction(initArena.transaction, 'InitArena');

      // Create match (host auto-joins as player 0)
      this.statusText.setText('Creating match...');
      const createMatchArgs = {
        host_authority: Array.from(this.wallet.publicKey.toBytes()),
        character_id: this.selectedCharacter,
        min_players: 2,
      };
      const createMatch = await ApplySystem({
        authority: this.wallet.publicKey,
        systemId: this.config.programIds.createMatch,
        world: this.worldPda,
        entities: [
          { entity: this.entities.match, components: [{ componentId: this.config.programIds.matchState }] },
          { entity: this.entities.playerPool, components: [{ componentId: this.config.programIds.playerPool }] },
          { entity: this.entities.projectile, components: [{ componentId: this.config.programIds.projectilePool }] },
          { entity: this.entities.pickup, components: [{ componentId: this.config.programIds.pickupState }] },
        ],
        args: createMatchArgs,
      });
      await this.wallet.sendTransaction(createMatch.transaction, 'CreateMatch');

      this.showLobby();
    } catch (err: any) {
      console.error('Room creation failed:', err);
      this.statusText.setText(`Failed: ${err.message}`);
    }
  }

  private async joinRoom(roomCode: string): Promise<void> {
    this.statusText.setText('Joining room...').setVisible(true);
    this.isHost = false;

    try {
      this.worldPda = new PublicKey(roomCode);

      // Fetch World account to get worldId for PDA derivation
      const conn = this.wallet.connection;
      const worldInstance = await World.fromAccountAddress(conn, this.worldPda);
      this.worldId = new BN(worldInstance.id);

      // Derive entity PDAs using bolt-sdk (uses worldId in big-endian)
      const entityPdas: PublicKey[] = [];
      for (let i = 0; i < 5; i++) {
        const pda = FindEntityPda({ worldId: this.worldId, entityId: new BN(i) });
        entityPdas.push(pda);
      }

      this.entities = {
        match: entityPdas[0],
        playerPool: entityPdas[1],
        projectile: entityPdas[2],
        pickup: entityPdas[3],
        arena: entityPdas[4],
      };

      // Derive component PDAs
      this.pdas = {
        matchState: FindComponentPda({ componentId: this.config.programIds.matchState, entity: this.entities.match }),
        playerPool: FindComponentPda({ componentId: this.config.programIds.playerPool, entity: this.entities.playerPool }),
        projectilePool: FindComponentPda({ componentId: this.config.programIds.projectilePool, entity: this.entities.projectile }),
        pickupState: FindComponentPda({ componentId: this.config.programIds.pickupState, entity: this.entities.pickup }),
        arenaConfig: FindComponentPda({ componentId: this.config.programIds.arenaConfig, entity: this.entities.arena }),
      };

      // Check match state exists
      const matchAcct = await conn.getAccountInfo(this.pdas.matchState);
      if (!matchAcct) {
        this.statusText.setText('Room not found!');
        return;
      }

      const ms = deserializeMatchState(new Uint8Array(matchAcct.data));
      if (!ms.isLobby) {
        this.statusText.setText('Match already in progress!');
        return;
      }
      if (ms.playerCount >= MAX_PLAYERS) {
        this.statusText.setText('Room is full!');
        return;
      }

      // Join match
      this.playerIndex = ms.playerCount;
      const joinArgs = {
        player_authority: Array.from(this.wallet.publicKey.toBytes()),
        character_id: this.selectedCharacter,
      };
      const joinMatch = await ApplySystem({
        authority: this.wallet.publicKey,
        systemId: this.config.programIds.joinMatch,
        world: this.worldPda,
        entities: [
          { entity: this.entities.match, components: [{ componentId: this.config.programIds.matchState }] },
          { entity: this.entities.playerPool, components: [{ componentId: this.config.programIds.playerPool }] },
        ],
        args: joinArgs,
      });
      await this.wallet.sendTransaction(joinMatch.transaction, 'JoinMatch');

      this.showLobby();
    } catch (err: any) {
      console.error('Join failed:', err);
      this.statusText.setText(`Join failed: ${err.message}`);
    }
  }

  private setupAnchorProvider(): void {
    const conn = this.wallet.connection;
    const sessionKey = this.wallet.keypair;

    // All TXs are signed by the session keypair — no wallet popups
    const anchorWallet = {
      publicKey: sessionKey.publicKey,
      signTransaction: async (tx: any) => { tx.sign(sessionKey); return tx; },
      signAllTransactions: async (txs: any[]) => { txs.forEach(tx => tx.sign(sessionKey)); return txs; },
    };
    const anchorProvider = new anchor.AnchorProvider(conn, anchorWallet as any, {
      commitment: 'confirmed',
      skipPreflight: true,
    });
    anchor.setProvider(anchorProvider);
  }

  // ─── STEP 3: In-Lobby UI ──────────────────────────────────────

  private showLobby(): void {
    this.statusText.setVisible(false);

    // Show room code
    const roomCode = this.worldPda!.toBase58();
    this.roomCodeText.setText(`Room: ${roomCode}`).setVisible(true);

    // Copy button
    const copyBtn = this.add.text(GAME_WIDTH / 2, 115, '[ COPY CODE ]', {
      fontSize: '14px', fontFamily: 'monospace', color: '#4488ff',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    copyBtn.on('pointerdown', () => {
      navigator.clipboard.writeText(roomCode).then(() => {
        copyBtn.setText('Copied!');
        this.time.delayedCall(1500, () => copyBtn.setText('[ COPY CODE ]'));
      });
    });

    // Show character selector
    this.charPreview.setVisible(true);
    this.charLabel.setVisible(true);
    ((this as any)._charArrows as Phaser.GameObjects.Text[]).forEach((a: Phaser.GameObjects.Text) => a.setVisible(true));

    // Show ready button
    this.readyBtn.setVisible(true);

    // Start polling match state
    this.startPolling();
  }

  private cycleCharacter(dir: number): void {
    this.selectedCharacter = ((this.selectedCharacter - 1 + dir + 8) % 8) + 1;
    const charStr = String(this.selectedCharacter).padStart(2, '0');
    this.charPreview.setTexture(`p1-idle-1`);
    this.charLabel.setText(`Char ${charStr}`);
  }

  private async onReady(): Promise<void> {
    if (!this.worldPda) return;
    try {
      const readyUp = await ApplySystem({
        authority: this.wallet.publicKey,
        systemId: this.config.programIds.readyUp,
        world: this.worldPda,
        entities: [
          { entity: this.entities.match, components: [{ componentId: this.config.programIds.matchState }] },
        ],
        args: { player_index: this.playerIndex },
      });
      await this.wallet.sendTransaction(readyUp.transaction, 'ReadyUp');
      this.readyBtn.setText('[ READY! ]').setColor('#88ff88');
    } catch (err: any) {
      console.warn('Ready up failed:', err.message);
    }
  }

  private async onStartMatch(): Promise<void> {
    if (!this.worldPda || !this.isHost) return;
    try {
      const spawnPositions = [
        [50000, 132000],
        [206000, 132000],
        [80000, 100000],
        [176000, 100000],
      ];

      // Start match on L1 — this sets is_active=true
      const startMatch = await ApplySystem({
        authority: this.wallet.publicKey,
        systemId: this.config.programIds.startMatch,
        world: this.worldPda,
        entities: [
          { entity: this.entities.match, components: [{ componentId: this.config.programIds.matchState }] },
          { entity: this.entities.playerPool, components: [{ componentId: this.config.programIds.playerPool }] },
          { entity: this.entities.projectile, components: [{ componentId: this.config.programIds.projectilePool }] },
          { entity: this.entities.pickup, components: [{ componentId: this.config.programIds.pickupState }] },
        ],
        args: { spawn_positions: spawnPositions },
      });
      await this.wallet.sendTransaction(startMatch.transaction, 'StartMatch');

      // Delegate accounts to ER for low-latency gameplay
      if (this.config.erRpcUrl) {
        this.statusText.setText('Delegating to ER...').setVisible(true);
        try {
          await this.delegateAllComponents();
          this.wallet.setErConnection(this.config.erRpcUrl);
          console.log('[Lobby] Delegation succeeded, gameplay will use ER');
        } catch (err: any) {
          console.warn('[Lobby] Delegation failed, staying on L1:', err.message);
        }
      }
      // Polling will detect is_active and transition
    } catch (err: any) {
      console.warn('Start match failed:', err.message);
      this.statusText.setText(`Start failed: ${err.message}`).setVisible(true);
    }
  }

  /**
   * Delegate all 5 component PDAs to the Ephemeral Rollup.
   */
  private async delegateAllComponents(): Promise<void> {
    const componentDefs = [
      { entity: this.entities.match, componentId: this.config.programIds.matchState, name: 'MatchState' },
      { entity: this.entities.playerPool, componentId: this.config.programIds.playerPool, name: 'PlayerPool' },
      { entity: this.entities.projectile, componentId: this.config.programIds.projectilePool, name: 'ProjectilePool' },
      { entity: this.entities.pickup, componentId: this.config.programIds.pickupState, name: 'PickupState' },
      { entity: this.entities.arena, componentId: this.config.programIds.arenaConfig, name: 'ArenaConfig' },
    ];

    for (const comp of componentDefs) {
      const result = await DelegateComponent({
        payer: this.wallet.publicKey,
        entity: comp.entity,
        componentId: comp.componentId,
      });
      await this.wallet.sendTransaction(result.transaction, `Delegate:${comp.name}`);
    }
    console.log('[Lobby] All 5 components delegated to ER');
  }

  // ─── Polling & Transition ─────────────────────────────────────

  private erConnection: Connection | null = null;
  private delegated = false;

  private startPolling(): void {
    if (this.config.erRpcUrl) {
      this.erConnection = new Connection(this.config.erRpcUrl, 'confirmed');
    }

    this.pollInterval = window.setInterval(async () => {
      if (!this.worldPda) return;
      try {
        const acct = await this.wallet.connection.getAccountInfo(this.pdas.matchState);

        let ms;
        if (acct && acct.data.length > 8) {
          try {
            ms = deserializeMatchState(new Uint8Array(acct.data));
          } catch {
            ms = null;
          }
        }

        if (!ms && this.erConnection) {
          const erAcct = await this.erConnection.getAccountInfo(this.pdas.matchState);
          if (erAcct) {
            ms = deserializeMatchState(new Uint8Array(erAcct.data));
            if (!this.delegated) {
              this.delegated = true;
              this.wallet.setErConnection(this.config.erRpcUrl!);
              console.log('[Lobby] Detected delegation, switching to ER');
            }
          }
        }

        if (!ms) return;

        this.updatePlayerList(ms);

        if (this.isHost) {
          const allReady = ms.playerCount >= ms.minPlayers &&
            (ms.readyMask & ((1 << ms.playerCount) - 1)) === ((1 << ms.playerCount) - 1);
          this.startBtn.setVisible(allReady);
        }

        if (ms.isActive && !ms.isLobby) {
          if (!this.wallet.erConnection && this.config.erRpcUrl && this.delegated) {
            this.wallet.setErConnection(this.config.erRpcUrl);
          }
          this.cleanup();
          this.scene.start('OnlineArena', {
            wallet: this.wallet,
            config: this.config,
            worldPda: this.worldPda,
            entities: this.entities,
            pdas: this.pdas,
            playerIndex: this.playerIndex,
          });
        }
      } catch (_e) {
        // retry next poll
      }
    }, 500);
  }

  private updatePlayerList(ms: any): void {
    const colors = ['#f5c542', '#ff6644', '#44cc66', '#4488ff'];
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const t = this.playerListTexts[i];
      if (i < ms.playerCount) {
        const ready = (ms.readyMask & (1 << i)) !== 0;
        const host = i === 0 ? ' (Host)' : '';
        const readyMark = ready ? ' [READY]' : '';
        const pubkey = ms.players[i].toBase58().slice(0, 8) + '...';
        t.setText(`P${i + 1}: ${pubkey}${host}${readyMark}`);
        t.setColor(colors[i]);
        t.setVisible(true);
      } else {
        t.setText(`P${i + 1}: (empty)`);
        t.setColor('#444444');
        t.setVisible(true);
      }
    }
  }

  update(): void {
    if (this.txLog) this.txLog.update();
  }

  private cleanup(): void {
    if (this.pollInterval !== null) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.domElements.forEach(el => el.destroy());
    this.domElements = [];
  }

  shutdown(): void {
    this.cleanup();
    if (this.txLog) this.txLog.destroy();
  }
}
