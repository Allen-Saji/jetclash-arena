import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
} from '@solana/web3.js';

export type TxCallback = (label: string, sig: string, status: 'pending' | 'confirmed' | 'failed') => void;

/** Phantom-style wallet provider interface */
interface PhantomProvider {
  publicKey: PublicKey;
  isConnected: boolean;
  connect(): Promise<{ publicKey: PublicKey }>;
  disconnect(): Promise<void>;
  signTransaction(tx: Transaction): Promise<Transaction>;
  signAllTransactions(txs: Transaction[]): Promise<Transaction[]>;
}

function getPhantom(): PhantomProvider | null {
  const w = window as any;
  return w.solana?.isPhantom ? w.solana : null;
}

/** Default SOL to fund session key with (covers ~200 TXs on devnet) */
const SESSION_FUND_LAMPORTS = 100_000_000; // 0.1 SOL

/**
 * Wallet provider for gameplay transactions.
 *
 * Devnet flow (zero popups after connect):
 *   1. User connects Phantom (one popup)
 *   2. Phantom signs a SOL transfer to a temporary session keypair (one popup)
 *   3. All subsequent TXs use the session keypair — no more popups
 *
 * Local flow:
 *   Auto-generated keypair + airdrop, no wallet needed.
 *
 * Supports dual connections: L1 for lobby/setup, ER for gameplay.
 */
export class WalletProvider {
  readonly connection: Connection;
  /** Optional ER connection for fast gameplay TXs (input, crank) */
  erConnection: Connection | null = null;
  onTx: TxCallback | null = null;

  /** The Phantom provider (only used during initial funding TX) */
  private _phantom: PhantomProvider | null = null;
  /** The session keypair that signs ALL game transactions */
  private _sessionKey: Keypair | null = null;
  /** The user's main wallet pubkey (Phantom or local) */
  private _ownerPubkey: PublicKey | null = null;

  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl, 'confirmed');
  }

  /**
   * Connect Phantom and create a funded session keypair.
   * User sees exactly TWO popups: connect + fund transfer.
   * After this, all TXs are signed by the session key — zero popups.
   */
  async connectPhantom(fundLamports: number = SESSION_FUND_LAMPORTS): Promise<void> {
    const phantom = getPhantom();
    if (!phantom) throw new Error('Phantom wallet not found. Install it from phantom.app');

    // 1. Connect
    const resp = await phantom.connect();
    this._phantom = phantom;
    this._ownerPubkey = resp.publicKey;
    console.log('[Wallet] Phantom connected:', resp.publicKey.toBase58());

    // 2. Generate session keypair
    this._sessionKey = Keypair.generate();
    console.log('[Wallet] Session key:', this._sessionKey.publicKey.toBase58());

    // 3. Fund session key with a single Phantom-signed transfer
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: resp.publicKey,
        toPubkey: this._sessionKey.publicKey,
        lamports: fundLamports,
      }),
    );
    tx.feePayer = resp.publicKey;
    tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;

    const signed = await phantom.signTransaction(tx);
    const sig = await this.connection.sendRawTransaction(signed.serialize(), { skipPreflight: true });
    await this.connection.confirmTransaction(sig, 'confirmed');
    console.log('[Wallet] Session funded with', fundLamports / 1e9, 'SOL');
  }

  /** Use a local keypair (for localnet testing with airdrop). */
  useLocalKeypair(keypair?: Keypair): void {
    this._sessionKey = keypair ?? Keypair.generate();
    this._ownerPubkey = this._sessionKey.publicKey;
  }

  /** The session keypair used for all TX signing */
  get keypair(): Keypair {
    if (!this._sessionKey) throw new Error('Wallet not connected');
    return this._sessionKey;
  }

  get isPhantom(): boolean {
    return this._phantom !== null;
  }

  static isPhantomAvailable(): boolean {
    return getPhantom() !== null;
  }

  /** Set ER endpoint for fast gameplay TXs */
  setErConnection(erRpcUrl: string): void {
    this.erConnection = new Connection(erRpcUrl, 'confirmed');
  }

  /** The session key's public key (used as fee payer & authority for all TXs) */
  get publicKey(): PublicKey {
    if (!this._sessionKey) throw new Error('Wallet not connected');
    return this._sessionKey.publicKey;
  }

  /** The user's main wallet pubkey (Phantom address) */
  get ownerPublicKey(): PublicKey {
    if (!this._ownerPubkey) throw new Error('Wallet not connected');
    return this._ownerPubkey;
  }

  /** Get SOL balance of the session key */
  async getBalance(): Promise<number> {
    const lamports = await this.connection.getBalance(this.publicKey);
    return lamports / 1e9;
  }

  /** Get SOL balance of the Phantom wallet (owner) */
  async getOwnerBalance(): Promise<number> {
    const lamports = await this.connection.getBalance(this.ownerPublicKey);
    return lamports / 1e9;
  }

  /**
   * Send a transaction signed by the session keypair. No popups.
   */
  async sendTransaction(tx: Transaction, label?: string): Promise<string> {
    if (!this._sessionKey) throw new Error('Wallet not connected');

    tx.feePayer = this._sessionKey.publicKey;
    tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;

    const txLabel = label ?? 'tx';
    this.onTx?.(txLabel, '...', 'pending');

    try {
      const sig = await sendAndConfirmTransaction(this.connection, tx, [this._sessionKey], {
        commitment: 'confirmed',
        skipPreflight: true,
      });
      this.onTx?.(txLabel, sig, 'confirmed');
      return sig;
    } catch (err: any) {
      this.onTx?.(txLabel, '...', 'failed');
      throw err;
    }
  }

  /**
   * Send a transaction without waiting for confirmation.
   * Uses ER connection if available for lower latency.
   * No popups — signed by session keypair.
   */
  async sendTransactionFast(tx: Transaction, label?: string): Promise<string> {
    if (!this._sessionKey) throw new Error('Wallet not connected');

    const conn = this.erConnection ?? this.connection;
    tx.feePayer = this._sessionKey.publicKey;
    tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
    tx.sign(this._sessionKey);

    const txLabel = label ?? 'tx';
    const rawTx = tx.serialize();
    const sig = await conn.sendRawTransaction(rawTx, { skipPreflight: true });
    this.onTx?.(txLabel, sig.slice(0, 8) + '..', 'confirmed');
    return sig;
  }

  /**
   * Request airdrop to the session key (only works on localnet).
   */
  async requestAirdrop(lamports: number = 2_000_000_000): Promise<void> {
    this.onTx?.('airdrop', '...', 'pending');
    const sig = await this.connection.requestAirdrop(this.publicKey, lamports);
    await this.connection.confirmTransaction(sig, 'confirmed');
    this.onTx?.('airdrop', sig, 'confirmed');
  }
}
