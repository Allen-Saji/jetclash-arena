import { Connection, Keypair, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';

/**
 * Wallet provider for gameplay transactions.
 * Currently uses a local keypair; will be replaced with Privy embedded wallet in M5.
 */
export class WalletProvider {
  readonly connection: Connection;
  readonly keypair: Keypair;

  constructor(rpcUrl: string, keypair?: Keypair) {
    this.connection = new Connection(rpcUrl, 'confirmed');
    this.keypair = keypair ?? Keypair.generate();
  }

  get publicKey() {
    return this.keypair.publicKey;
  }

  async sendTransaction(tx: Transaction): Promise<string> {
    tx.feePayer = this.keypair.publicKey;
    tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    return sendAndConfirmTransaction(this.connection, tx, [this.keypair], {
      commitment: 'confirmed',
      skipPreflight: true,
    });
  }

  async requestAirdrop(lamports: number = 2_000_000_000): Promise<void> {
    const sig = await this.connection.requestAirdrop(this.keypair.publicKey, lamports);
    await this.connection.confirmTransaction(sig, 'confirmed');
  }
}
