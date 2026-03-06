import { PublicKey } from '@solana/web3.js';
import { ApplySystem } from '@magicblock-labs/bolt-sdk';
import { WalletProvider } from './WalletProvider';
import type { InputAction, NetworkConfig } from './types';

/**
 * Sends player input transactions to the on-chain process-input system.
 * Runs at 30Hz — captures current keyboard state and fires async TXs.
 */
export class InputSender {
  private wallet: WalletProvider;
  private config: NetworkConfig;
  private worldPda: PublicKey;
  private playerEntity: PublicKey;
  private matchEntity: PublicKey;
  private projectileEntity: PublicKey;
  private inputSeq: number = 0;
  private sendInterval: number | null = null;
  private pendingInputs: InputAction[] = [];
  private getInput: () => InputAction;

  constructor(
    wallet: WalletProvider,
    config: NetworkConfig,
    worldPda: PublicKey,
    entities: {
      player: PublicKey;
      match: PublicKey;
      projectile: PublicKey;
    },
    getInput: () => InputAction,
  ) {
    this.wallet = wallet;
    this.config = config;
    this.worldPda = worldPda;
    this.playerEntity = entities.player;
    this.matchEntity = entities.match;
    this.projectileEntity = entities.projectile;
    this.getInput = getInput;
  }

  /** Start sending inputs at 30Hz */
  start(): void {
    if (this.sendInterval !== null) return;
    this.sendInterval = window.setInterval(() => this.tick(), 1000 / 30);
  }

  /** Stop sending inputs */
  stop(): void {
    if (this.sendInterval !== null) {
      clearInterval(this.sendInterval);
      this.sendInterval = null;
    }
  }

  /** Get unacknowledged inputs for client prediction reconciliation */
  getPendingInputs(): InputAction[] {
    return [...this.pendingInputs];
  }

  /** Mark inputs as acknowledged up to the given seq */
  acknowledgeUpTo(seq: number): void {
    this.pendingInputs = this.pendingInputs.filter((i) => i.inputSeq > seq);
  }

  private async tick(): Promise<void> {
    const rawInput = this.getInput();
    this.inputSeq++;

    const input: InputAction = {
      ...rawInput,
      inputSeq: this.inputSeq,
    };

    this.pendingInputs.push(input);

    // Fire and forget — don't await, keep the 30Hz cadence
    this.sendInput(input).catch((err) => {
      console.warn('[InputSender] TX failed:', err.message);
    });
  }

  private async sendInput(input: InputAction): Promise<void> {
    const args = {
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
          entity: this.playerEntity,
          components: [{ componentId: this.config.programIds.playerState }],
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

    await this.wallet.sendTransaction(applySystem.transaction);
  }
}
