/**
 * @fileoverview Core wallet lifecycle manager for agent personal wallets.
 *
 * Handles keypair generation, encrypted storage, balance queries, transaction
 * signing, and broadcasting across multiple chains. Works with the
 * SpendingPolicyEnforcer for guardrailed autonomous spending.
 *
 * @module wunderland/wallet/AgentWalletManager
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';

import type {
  AgentWalletRecord,
  ChainId,
  IChainWalletAdapter,
  SpendCategory,
  TokenSymbol,
  WalletConfig,
  WalletTransactionRecord,
  WalletTxStatus,
} from './types.js';
import type { SpendingPolicyEnforcer } from './SpendingPolicyEnforcer.js';

// ---------------------------------------------------------------------------
// DB store interface (agnostic — callers provide SQLite/Postgres impl)
// ---------------------------------------------------------------------------

export interface IWalletStore {
  getWallet(agentId: string, chain: ChainId): Promise<AgentWalletRecord | null>;
  getAllWallets(agentId: string): Promise<AgentWalletRecord[]>;
  saveWallet(record: AgentWalletRecord): Promise<void>;
  insertTransaction(record: WalletTransactionRecord): Promise<void>;
  updateTransactionStatus(id: string, status: WalletTxStatus, txHash?: string): Promise<void>;
  getTransactions(walletId: string, limit?: number): Promise<WalletTransactionRecord[]>;
}

// ---------------------------------------------------------------------------
// Encryption helpers
// ---------------------------------------------------------------------------

const ALGO = 'aes-256-gcm';
const KEY_LEN = 32;
const IV_LEN = 12;
const TAG_LEN = 16;
const SCRYPT_N = 16384;

/** Derive a 256-bit key from a master secret + salt. */
function deriveKey(masterSecret: string, salt: Buffer): Buffer {
  return scryptSync(masterSecret, salt, KEY_LEN, { N: SCRYPT_N }) as Buffer;
}

/** Encrypt raw bytes → base64 string (IV + ciphertext + authTag). */
function encrypt(data: Uint8Array, masterSecret: string, salt: Buffer): string {
  const key = deriveKey(masterSecret, salt);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Pack: IV (12) + Tag (16) + Ciphertext
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

/** Decrypt base64 string → raw bytes. */
function decrypt(packed: string, masterSecret: string, salt: Buffer): Uint8Array {
  const buf = Buffer.from(packed, 'base64');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = buf.subarray(IV_LEN + TAG_LEN);
  const key = deriveKey(masterSecret, salt);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return new Uint8Array(decrypted);
}

// ---------------------------------------------------------------------------
// AgentWalletManager
// ---------------------------------------------------------------------------

export interface AgentWalletManagerOptions {
  /** Master secret for key encryption. Should come from env (WALLET_MASTER_SECRET). */
  masterSecret: string;
  walletConfig: WalletConfig;
  store: IWalletStore;
  policyEnforcer: SpendingPolicyEnforcer;
  /** Chain adapters keyed by ChainId. */
  adapters: Map<ChainId, IChainWalletAdapter>;
}

export class AgentWalletManager {
  private readonly masterSecret: string;
  readonly walletConfig: WalletConfig;
  private readonly store: IWalletStore;
  private readonly policy: SpendingPolicyEnforcer;
  private readonly adapters: Map<ChainId, IChainWalletAdapter>;

  /** In-memory balance cache: `${agentId}:${chain}:${token}` → { value, ts }. */
  private balanceCache = new Map<string, { value: bigint; ts: number }>();
  private readonly cacheTtlMs = 30_000;

  constructor(opts: AgentWalletManagerOptions) {
    this.masterSecret = opts.masterSecret;
    this.walletConfig = opts.walletConfig;
    this.store = opts.store;
    this.policy = opts.policyEnforcer;
    this.adapters = opts.adapters;
  }

  // -----------------------------------------------------------------------
  // Wallet lifecycle
  // -----------------------------------------------------------------------

  /** Create a new wallet for the agent on the specified chain. */
  async createWallet(agentId: string, chain: ChainId): Promise<AgentWalletRecord> {
    const adapter = this.getAdapter(chain);

    // Check if wallet already exists
    const existing = await this.store.getWallet(agentId, chain);
    if (existing) {
      throw new Error(`Agent ${agentId} already has a ${chain} wallet at ${existing.address}`);
    }

    const { publicKey, secretKey } = await adapter.generateKeypair();

    // Encrypt the secret key
    const salt = randomBytes(32);
    const encryptedKey = encrypt(secretKey, this.masterSecret, salt);

    const record: AgentWalletRecord = {
      id: uuidv4(),
      agentId,
      chain,
      address: publicKey,
      encryptedKey,
      keyDerivationSalt: salt.toString('hex'),
      createdAt: Date.now(),
    };

    await this.store.saveWallet(record);
    return record;
  }

  /** Get an existing wallet or null. */
  async getWallet(agentId: string, chain: ChainId): Promise<AgentWalletRecord | null> {
    return this.store.getWallet(agentId, chain);
  }

  /** Get all wallets for an agent. */
  async getAllWallets(agentId: string): Promise<AgentWalletRecord[]> {
    return this.store.getAllWallets(agentId);
  }

  // -----------------------------------------------------------------------
  // Balance queries (cached)
  // -----------------------------------------------------------------------

  /** Get native token balance (e.g. SOL, ETH). */
  async getBalance(agentId: string, chain: ChainId): Promise<bigint> {
    const wallet = await this.requireWallet(agentId, chain);
    const cacheKey = `${agentId}:${chain}:native`;
    const cached = this.balanceCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < this.cacheTtlMs) return cached.value;

    const adapter = this.getAdapter(chain);
    const balance = await adapter.getBalance(wallet.address);
    this.balanceCache.set(cacheKey, { value: balance, ts: Date.now() });
    return balance;
  }

  /** Get token balance (e.g. USDC on Solana). */
  async getTokenBalance(agentId: string, chain: ChainId, tokenMint: string): Promise<bigint> {
    const wallet = await this.requireWallet(agentId, chain);
    const cacheKey = `${agentId}:${chain}:${tokenMint}`;
    const cached = this.balanceCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < this.cacheTtlMs) return cached.value;

    const adapter = this.getAdapter(chain);
    const balance = await adapter.getTokenBalance(wallet.address, tokenMint);
    this.balanceCache.set(cacheKey, { value: balance, ts: Date.now() });
    return balance;
  }

  // -----------------------------------------------------------------------
  // Spending (with policy enforcement)
  // -----------------------------------------------------------------------

  /**
   * Send native token with spending policy enforcement.
   * Returns the transaction record (pending until broadcast confirms).
   */
  async sendNative(
    agentId: string,
    chain: ChainId,
    to: string,
    amountRaw: bigint,
    amountUsd: number,
    category: SpendCategory,
    description?: string,
  ): Promise<WalletTransactionRecord> {
    // Enforce spending policy
    const check = await this.policy.canSpend(agentId, amountUsd, category, to);
    if (!check.allowed) {
      throw new SpendingPolicyViolation(check.reason || 'Spending policy violation');
    }
    if (check.requiresApproval) {
      throw new ApprovalRequiredError(amountUsd, category);
    }

    const wallet = await this.requireWallet(agentId, chain);
    const adapter = this.getAdapter(chain);
    const secretKey = this.decryptKey(wallet);

    // Create pending transaction record
    const txRecord: WalletTransactionRecord = {
      id: uuidv4(),
      walletId: wallet.id,
      direction: 'outbound',
      toAddress: to,
      fromAddress: wallet.address,
      amountRaw: amountRaw.toString(),
      amountUsd,
      token: nativeTokenForChain(chain),
      category,
      status: 'pending',
      description,
      createdAt: Date.now(),
    };
    await this.store.insertTransaction(txRecord);

    try {
      // Sign and broadcast
      const signedTx = await adapter.signTransfer(secretKey, to, amountRaw);
      const txHash = await adapter.broadcast(signedTx);

      // Update record
      await this.store.updateTransactionStatus(txRecord.id, 'confirmed', txHash);
      txRecord.status = 'confirmed';
      txRecord.txHash = txHash;

      // Record in spending ledger
      await this.policy.recordSpend(agentId, amountUsd, category);

      // Invalidate balance cache
      this.balanceCache.delete(`${agentId}:${chain}:native`);
    } catch (err) {
      await this.store.updateTransactionStatus(txRecord.id, 'failed');
      txRecord.status = 'failed';
      throw err;
    }

    return txRecord;
  }

  /** Get recent transactions for a wallet. */
  async getTransactionHistory(agentId: string, chain: ChainId, limit = 20): Promise<WalletTransactionRecord[]> {
    const wallet = await this.requireWallet(agentId, chain);
    return this.store.getTransactions(wallet.id, limit);
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private getAdapter(chain: ChainId): IChainWalletAdapter {
    const adapter = this.adapters.get(chain);
    if (!adapter) {
      throw new Error(`No wallet adapter registered for chain: ${chain}`);
    }
    return adapter;
  }

  private async requireWallet(agentId: string, chain: ChainId): Promise<AgentWalletRecord> {
    const wallet = await this.store.getWallet(agentId, chain);
    if (!wallet) {
      throw new Error(`No ${chain} wallet found for agent ${agentId}. Create one first.`);
    }
    return wallet;
  }

  private decryptKey(wallet: AgentWalletRecord): Uint8Array {
    const salt = Buffer.from(wallet.keyDerivationSalt, 'hex');
    return decrypt(wallet.encryptedKey, this.masterSecret, salt);
  }
}

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

export class SpendingPolicyViolation extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'SpendingPolicyViolation';
  }
}

export class ApprovalRequiredError extends Error {
  constructor(
    public readonly amountUsd: number,
    public readonly category: SpendCategory,
  ) {
    super(
      `Transaction of $${amountUsd.toFixed(2)} in category "${category}" requires human approval.`,
    );
    this.name = 'ApprovalRequiredError';
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function nativeTokenForChain(chain: ChainId): TokenSymbol {
  switch (chain) {
    case 'solana': return 'SOL';
    case 'ethereum': return 'ETH';
    case 'base': return 'ETH';
    case 'polygon': return 'ETH'; // MATIC wraps to ETH for simplicity
    default: return 'ETH';
  }
}
