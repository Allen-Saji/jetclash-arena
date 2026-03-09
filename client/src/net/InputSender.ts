import { PublicKey } from '@solana/web3.js';
import { ApplySystem } from '@magicblock-labs/bolt-sdk';
import { WalletProvider } from './WalletProvider';
import type { InputAction, NetworkConfig } from './types';

/**
 * Sends player input transactions to the on-chain process-input system.
 * Runs at 30Hz -- captures current keyboard state and fires async TXs.
 */
export class InputSender {
  private wallet: WalletProvider;
  private config: NetworkConfig;
  private worldPda: PublicKey;
  private playerPoolEntity: PublicKey;
  private matchEntity: PublicKey;
  private projectileEntity: PublicKey;
  private playerIndex: number;
  private inputSeq: number = 0;
  private sendInterval: number | null = null;
  private pendingInputs: InputAction[] = [];
  private getInput: () => InputAction;

  constructor(
    wallet: WalletProvider,
    config: NetworkConfig,
    worldPda: PublicKey,
    entities: {
      playerPool: PublicKey;
      match: PublicKey;
      projectile: PublicKey;
    },
    playerIndex: number,
    getInput: () => InputAction,
  ) {
    this.wallet = wallet;
    this.config = config;
    this.worldPda = worldPda;
    this.playerPoolEntity = entities.playerPool;
    this.matchEntity = entities.match;
    this.projectileEntity = entities.projectile;
    this.playerIndex = playerIndex;
    this.getInput = getInput;
  }

  start(rateHz: number = 20): void {
    if (this.sendInterval !== null) return;
    this.sendInterval = window.setInterval(() => this.tick(), 1000 / rateHz);
  }

  stop(): void {
    if (this.sendInterval !== null) {
      clearInterval(this.sendInterval);
      this.sendInterval = null;
    }
  }

  getPendingInputs(): InputAction[] {
    return [...this.pendingInputs];
  }

  acknowledgeUpTo(seq: number): void {
    this.pendingInputs = this.pendingInputs.filter((i) => i.inputSeq > seq);
  }

  private async tick(): Promise<void> {
    const rawInput = this.getInput();

    // Skip sending if no meaningful input (avoid idle TX spam)
    if (rawInput.moveDir === 0 && !rawInput.jet && !rawInput.dash && !rawInput.shootPrimary && !rawInput.shootSecondary) {
      return;
    }

    this.inputSeq++;

    const input: InputAction = {
      ...rawInput,
      inputSeq: this.inputSeq,
    };

    this.pendingInputs.push(input);

    this.sendInput(input).catch((err) => {
      console.warn('[InputSender] TX failed:', err.message);
    });
  }

  private async sendInput(input: InputAction): Promise<void> {
    const args = {
      player_index: this.playerIndex,
      move_dir: input.moveDir,
      jet: input.jet,
      dash: input.dash,
      shoot_primary: input.shootPrimary,
      shoot_secondary: input.shootSecondary,
      input_seq: input.inputSeq,
    };

    const applySystem = await ApplySystem({
      authority: this.wallet.publicKey,
      systemId: this.config.programIds.processInput,
      world: this.worldPda,
      entities: [
        {
          entity: this.playerPoolEntity,
          components: [{ componentId: this.config.programIds.playerPool }],
        },
        {
          entity: this.matchEntity,
          components: [{ componentId: this.config.programIds.matchState }],
        },
        {
          entity: this.projectileEntity,
          components: [{ componentId: this.config.programIds.projectilePool }],
        },
      ],
      args,
    });

    await this.wallet.sendTransactionFast(applySystem.transaction, 'ProcessInput');
  }
}
