// @ts-nocheck
/**
 * @fileoverview Wallet types, spending policy, and category definitions
 * for the Agent Personal Wallet system.
 *
 * Enables Wunderland agents to autonomously spend within user-configured
 * guardrails — covering crypto (Solana + EVM) and virtual cards (Lithic).
 *
 * @module wunderland/wallet/types
 */

// ---------------------------------------------------------------------------
// Chain & Token primitives
// ---------------------------------------------------------------------------

export type ChainId = 'solana' | 'ethereum' | 'base' | 'polygon';

export type TokenSymbol = 'SOL' | 'ETH' | 'USDC' | 'USDT';

/** Token metadata for a specific chain deployment. */
export interface TokenInfo {
  symbol: TokenSymbol;
  chain: ChainId;
  /** Mint address (Solana SPL) or contract address (ERC-20). Empty for native tokens. */
  address: string;
  decimals: number;
  /** CoinGecko ID for price lookups. */
  coingeckoId?: string;
}

// ---------------------------------------------------------------------------
// Spending categories
// ---------------------------------------------------------------------------

/**
 * Spend categories used for budget enforcement and card MCC mapping.
 *
 * Crypto categories: api_costs, web_services, subscriptions, transfers, defi
 * Card categories: shopping, dining, travel, entertainment, utilities
 * Catch-all: other
 */
export type SpendCategory =
  | 'api_costs'        // LLM calls, search credits, SaaS APIs
  | 'web_services'     // Domain registration, hosting, cloud compute
  | 'shopping'         // Physical/digital goods
  | 'subscriptions'    // Recurring services
  | 'transfers'        // Crypto sends to external wallets
  | 'defi'             // Swaps, staking, lending, LP
  | 'dining'           // Restaurants (MCC 5812-5814)
  | 'travel'           // Airlines, hotels (MCC 3000-3999, 7011)
  | 'entertainment'    // Streaming, gaming (MCC 7832, 7841, etc.)
  | 'utilities'        // Bills, phone (MCC 4812, 4900, etc.)
  | 'other';

export interface CategoryBudget {
  category: SpendCategory;
  /** Max daily spend in USD for this category. */
  dailyLimitUsd: number;
  /** Max monthly spend in USD for this category. */
  monthlyLimitUsd: number;
}

// ---------------------------------------------------------------------------
// Spending policy
// ---------------------------------------------------------------------------

export interface SpendingPolicyConfig {
  /** Global daily spending cap in USD across all categories. */
  dailyLimitUsd: number;
  /** Max single transaction amount in USD. */
  perTransactionLimitUsd: number;
  /** Global monthly spending cap in USD. */
  monthlyLimitUsd: number;
  /** Per-category budget overrides. Categories not listed inherit global limits. */
  categoryBudgets: CategoryBudget[];
  /** Transactions above this USD amount require human approval. */
  requireApprovalAboveUsd: number;
  /** Categories the agent is completely blocked from spending in. */
  blockedCategories: SpendCategory[];
  /** Crypto address whitelist — if set, only these addresses can receive funds. */
  allowedAddresses?: string[];
  /** Crypto address blacklist — these addresses are always blocked. */
  blockedAddresses?: string[];
}

// ---------------------------------------------------------------------------
// Wallet config (lives in agent.config.json)
// ---------------------------------------------------------------------------

export interface WalletConfig {
  /** Master switch for wallet functionality. */
  enabled: boolean;
  /** Which chains the agent has wallets on. */
  chains: ChainId[];
  /**
   * Key custody mode:
   * - hot: plaintext in memory (dev/testing only)
   * - encrypted-hot: AES-256-GCM encrypted at rest, decrypted on sign
   */
  custodyMode: 'hot' | 'encrypted-hot';
  /** Tokens the agent is allowed to hold/send. */
  allowedTokens: TokenSymbol[];
  /** Spending guardrails. */
  spendingPolicy: SpendingPolicyConfig;
  /** Virtual card configuration (Lithic). */
  card?: import('./cards/types.js').CardConfig;
}

// ---------------------------------------------------------------------------
// Wallet records (DB / runtime)
// ---------------------------------------------------------------------------

export type WalletDirection = 'inbound' | 'outbound';
export type WalletTxStatus = 'pending' | 'confirmed' | 'failed';

export interface AgentWalletRecord {
  id: string;
  agentId: string;
  chain: ChainId;
  /** Public address (base58 for Solana, 0x-prefixed hex for EVM). */
  address: string;
  /** AES-256-GCM encrypted private key (base64). */
  encryptedKey: string;
  /** Salt used for key derivation (hex). */
  keyDerivationSalt: string;
  createdAt: number;
}

export interface WalletTransactionRecord {
  id: string;
  walletId: string;
  txHash?: string;
  direction: WalletDirection;
  toAddress?: string;
  fromAddress?: string;
  /** Raw token amount as string (lamports, wei, etc.). */
  amountRaw: string;
  /** USD equivalent at time of transaction. */
  amountUsd?: number;
  token: TokenSymbol;
  category?: SpendCategory;
  status: WalletTxStatus;
  description?: string;
  createdAt: number;
}

export interface SpendingLedgerEntry {
  id: string;
  agentId: string;
  category: SpendCategory;
  amountUsd: number;
  /** Date key: 'YYYY-MM-DD' for daily, 'YYYY-MM' for monthly. */
  periodKey: string;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Spending policy check result
// ---------------------------------------------------------------------------

export interface SpendCheckResult {
  allowed: boolean;
  /** Human-readable reason if blocked. */
  reason?: string;
  /** True if the transaction needs explicit human approval (above threshold but within limits). */
  requiresApproval?: boolean;
  /** Remaining daily budget in USD after this transaction (if allowed). */
  remainingDailyUsd?: number;
  /** Remaining monthly budget in USD after this transaction (if allowed). */
  remainingMonthlyUsd?: number;
}

// ---------------------------------------------------------------------------
// Chain adapter interface
// ---------------------------------------------------------------------------

export interface IChainWalletAdapter {
  readonly chain: ChainId;

  /** Generate a new keypair. Returns { publicKey, secretKey (raw bytes) }. */
  generateKeypair(): Promise<{ publicKey: string; secretKey: Uint8Array }>;

  /** Get native token balance in raw units (lamports, wei). */
  getBalance(address: string): Promise<bigint>;

  /** Get SPL/ERC-20 token balance in raw units. */
  getTokenBalance(address: string, tokenMint: string): Promise<bigint>;

  /** Build and sign a native transfer transaction. Returns serialized signed tx. */
  signTransfer(
    secretKey: Uint8Array,
    to: string,
    amountRaw: bigint,
  ): Promise<Uint8Array>;

  /** Build and sign a token transfer. Returns serialized signed tx. */
  signTokenTransfer(
    secretKey: Uint8Array,
    to: string,
    tokenMint: string,
    amountRaw: bigint,
  ): Promise<Uint8Array>;

  /** Broadcast a signed transaction and return the tx hash. */
  broadcast(signedTx: Uint8Array): Promise<string>;

  /** Check if a transaction is confirmed. */
  getTransactionStatus(txHash: string): Promise<WalletTxStatus>;
}

// ---------------------------------------------------------------------------
// Default spending policy
// ---------------------------------------------------------------------------

export const DEFAULT_SPENDING_POLICY: SpendingPolicyConfig = {
  dailyLimitUsd: 50,
  perTransactionLimitUsd: 20,
  monthlyLimitUsd: 500,
  categoryBudgets: [],
  requireApprovalAboveUsd: 10,
  blockedCategories: [],
};

export const DEFAULT_WALLET_CONFIG: WalletConfig = {
  enabled: false,
  chains: ['solana'],
  custodyMode: 'encrypted-hot',
  allowedTokens: ['SOL', 'USDC'],
  spendingPolicy: DEFAULT_SPENDING_POLICY,
};
