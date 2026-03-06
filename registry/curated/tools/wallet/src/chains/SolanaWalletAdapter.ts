/**
 * @fileoverview Solana chain adapter for the Agent Personal Wallet.
 *
 * Uses dynamic imports for @solana/web3.js so it remains an optional dependency.
 * Patterns derived from the existing SolanaProvider in anchor-providers.
 *
 * @module wunderland/wallet/chains/SolanaWalletAdapter
 */

import type { IChainWalletAdapter, WalletTxStatus } from '../types.js';

// Lazily resolved modules
let _web3: typeof import('@solana/web3.js') | null = null;

async function getWeb3() {
  if (!_web3) {
    try {
      _web3 = await import('@solana/web3.js');
    } catch {
      throw new Error(
        'Missing dependency: @solana/web3.js is required for Solana wallet support. '
        + 'Install it with: npm install @solana/web3.js',
      );
    }
  }
  return _web3;
}

export interface SolanaWalletAdapterOptions {
  /** RPC endpoint URL. Defaults to mainnet-beta. */
  rpcUrl?: string;
  /** Commitment level for queries. */
  commitment?: 'processed' | 'confirmed' | 'finalized';
}

export class SolanaWalletAdapter implements IChainWalletAdapter {
  readonly chain = 'solana' as const;
  private rpcUrl: string;
  private commitment: 'processed' | 'confirmed' | 'finalized';

  constructor(opts: SolanaWalletAdapterOptions = {}) {
    this.rpcUrl = opts.rpcUrl || 'https://api.mainnet-beta.solana.com';
    this.commitment = opts.commitment || 'confirmed';
  }

  async generateKeypair(): Promise<{ publicKey: string; secretKey: Uint8Array }> {
    const { Keypair } = await getWeb3();
    const kp = Keypair.generate();
    return {
      publicKey: kp.publicKey.toBase58(),
      secretKey: kp.secretKey,
    };
  }

  async getBalance(address: string): Promise<bigint> {
    const { Connection, PublicKey } = await getWeb3();
    const conn = new Connection(this.rpcUrl, this.commitment);
    const lamports = await conn.getBalance(new PublicKey(address));
    return BigInt(lamports);
  }

  async getTokenBalance(address: string, tokenMint: string): Promise<bigint> {
    const { Connection, PublicKey } = await getWeb3();
    const conn = new Connection(this.rpcUrl, this.commitment);
    const ownerPk = new PublicKey(address);
    const mintPk = new PublicKey(tokenMint);

    // Find the associated token account
    const accounts = await conn.getTokenAccountsByOwner(ownerPk, { mint: mintPk });
    if (accounts.value.length === 0) return 0n;

    // Parse account data to get amount
    const info = await conn.getTokenAccountBalance(accounts.value[0].pubkey);
    return BigInt(info.value.amount);
  }

  async signTransfer(
    secretKey: Uint8Array,
    to: string,
    amountRaw: bigint,
  ): Promise<Uint8Array> {
    const { Keypair, PublicKey, SystemProgram, Transaction, Connection } = await getWeb3();
    const conn = new Connection(this.rpcUrl, this.commitment);
    const signer = Keypair.fromSecretKey(secretKey);

    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: signer.publicKey,
        toPubkey: new PublicKey(to),
        lamports: Number(amountRaw),
      }),
    );

    tx.feePayer = signer.publicKey;
    tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
    tx.sign(signer);

    return tx.serialize();
  }

  async signTokenTransfer(
    secretKey: Uint8Array,
    to: string,
    tokenMint: string,
    amountRaw: bigint,
  ): Promise<Uint8Array> {
    // SPL token transfers require @solana/spl-token — use dynamic import
    const { Keypair, PublicKey, Transaction, Connection } = await getWeb3();
    let splToken: any;
    try {
      splToken = await import('@solana/spl-token' as string);
    } catch {
      throw new Error(
        'Missing dependency: @solana/spl-token is required for SPL token transfers. '
        + 'Install it with: npm install @solana/spl-token',
      );
    }

    const conn = new Connection(this.rpcUrl, this.commitment);
    const signer = Keypair.fromSecretKey(secretKey);
    const mintPk = new PublicKey(tokenMint);
    const destPk = new PublicKey(to);

    // Get or create associated token accounts
    const sourceAta = splToken.getAssociatedTokenAddressSync(mintPk, signer.publicKey);
    const destAta = splToken.getAssociatedTokenAddressSync(mintPk, destPk);

    const tx = new Transaction();

    // Create destination ATA if it doesn't exist
    const destAccount = await conn.getAccountInfo(destAta);
    if (!destAccount) {
      tx.add(
        splToken.createAssociatedTokenAccountInstruction(
          signer.publicKey,
          destAta,
          destPk,
          mintPk,
        ),
      );
    }

    tx.add(
      splToken.createTransferInstruction(
        sourceAta,
        destAta,
        signer.publicKey,
        Number(amountRaw),
      ),
    );

    tx.feePayer = signer.publicKey;
    tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
    tx.sign(signer);

    return tx.serialize();
  }

  async broadcast(signedTx: Uint8Array): Promise<string> {
    const { Connection } = await getWeb3();
    const conn = new Connection(this.rpcUrl, this.commitment);
    const sig = await conn.sendRawTransaction(signedTx, {
      skipPreflight: false,
      preflightCommitment: this.commitment,
    });
    // Wait for confirmation
    await conn.confirmTransaction(sig, this.commitment);
    return sig;
  }

  async getTransactionStatus(txHash: string): Promise<WalletTxStatus> {
    const { Connection } = await getWeb3();
    const conn = new Connection(this.rpcUrl, this.commitment);
    const status = await conn.getSignatureStatus(txHash);

    if (!status.value) return 'pending';
    if (status.value.err) return 'failed';
    if (status.value.confirmationStatus === 'finalized' || status.value.confirmationStatus === 'confirmed') {
      return 'confirmed';
    }
    return 'pending';
  }
}
