// @ts-nocheck
/**
 * @fileoverview Types for the virtual card subsystem (Lithic integration).
 * @module wallet/cards/types
 */

import type { SpendCategory } from '../types.js';

// ---------------------------------------------------------------------------
// Card primitives
// ---------------------------------------------------------------------------

export type CardType = 'VIRTUAL' | 'PHYSICAL';
export type CardState = 'OPEN' | 'PAUSED' | 'CLOSED' | 'PENDING_FULFILLMENT';
export type CardNetwork = 'VISA' | 'MASTERCARD';
export type CardTxStatus = 'PENDING' | 'SETTLED' | 'DECLINED' | 'VOIDED';
export type SpendLimitDuration = 'TRANSACTION' | 'MONTHLY' | 'ANNUALLY' | 'FOREVER';

// ---------------------------------------------------------------------------
// Config (lives in WalletConfig.card)
// ---------------------------------------------------------------------------

export interface CardConfig {
  enabled: boolean;
  /** Card provider. Only 'lithic' is supported. */
  provider: 'lithic';
  /** Default per-card spending limit in USD. */
  defaultSpendLimitUsd: number;
  /** Whether physical card issuance is allowed. */
  allowPhysical: boolean;
}

export const DEFAULT_CARD_CONFIG: CardConfig = {
  enabled: false,
  provider: 'lithic',
  defaultSpendLimitUsd: 500,
  allowPhysical: false,
};

// ---------------------------------------------------------------------------
// Records (DB / runtime)
// ---------------------------------------------------------------------------

export interface AgentCardRecord {
  id: string;
  agentId: string;
  /** Lithic's card token identifier. */
  lithicCardToken: string;
  last4: string;
  cardType: CardType;
  state: CardState;
  spendLimitUsd: number;
  spendLimitDuration: SpendLimitDuration;
  network: CardNetwork;
  /** Agent-assigned label for the card. */
  memo?: string;
  createdAt: number;
}

export interface CardTransactionRecord {
  id: string;
  /** FK to AgentCardRecord.id */
  cardId: string;
  /** Lithic's transaction token. */
  lithicTxToken: string;
  merchantName?: string;
  /** 4-digit Merchant Category Code. */
  merchantMcc: string;
  /** Resolved spend category. */
  category: SpendCategory;
  amountUsd: number;
  status: CardTxStatus;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Card store interface (agnostic — callers provide SQLite/memory impl)
// ---------------------------------------------------------------------------

export interface ICardStore {
  getCard(agentId: string): Promise<AgentCardRecord | null>;
  saveCard(record: AgentCardRecord): Promise<void>;
  updateCardState(agentId: string, state: CardState): Promise<void>;
  insertTransaction(record: CardTransactionRecord): Promise<void>;
  updateTransactionStatus(id: string, status: CardTxStatus): Promise<void>;
  getTransactions(cardId: string, limit?: number): Promise<CardTransactionRecord[]>;
  getTransactionsByPeriod(cardId: string, since: number): Promise<CardTransactionRecord[]>;
}

// ---------------------------------------------------------------------------
// Lithic API types (subset we need)
// ---------------------------------------------------------------------------

export interface CreateCardParams {
  type: CardType;
  memo?: string;
  spend_limit: number;
  spend_limit_duration: SpendLimitDuration;
  state?: CardState;
}

export interface UpdateCardParams {
  state?: CardState;
  spend_limit?: number;
  spend_limit_duration?: SpendLimitDuration;
  memo?: string;
}

export interface LithicCardResponse {
  token: string;
  last_four: string;
  type: CardType;
  state: CardState;
  spend_limit: number;
  spend_limit_duration: SpendLimitDuration;
  pan?: string;
  cvv?: string;
  exp_month?: string;
  exp_year?: string;
  funding: { token: string; type: string };
}

export interface LithicTransaction {
  token: string;
  card_token: string;
  amount: number;
  merchant: {
    descriptor: string;
    mcc: string;
    city?: string;
    state?: string;
    country?: string;
  };
  status: 'PENDING' | 'SETTLED' | 'DECLINED' | 'VOIDED';
  created: string;
}

export interface ListTxOpts {
  begin?: string;
  end?: string;
  page_size?: number;
}

export interface AuthRuleParams {
  allowed_mcc?: string[];
  blocked_mcc?: string[];
}

export interface ICardAdapter {
  createCard(params: CreateCardParams): Promise<LithicCardResponse>;
  getCard(cardToken: string): Promise<LithicCardResponse>;
  updateCard(cardToken: string, updates: UpdateCardParams): Promise<LithicCardResponse>;
  pauseCard(cardToken: string): Promise<void>;
  resumeCard(cardToken: string): Promise<void>;
  closeCard(cardToken: string): Promise<void>;
  listTransactions(cardToken: string, opts?: ListTxOpts): Promise<LithicTransaction[]>;
  createAuthRule(cardToken: string, rule: AuthRuleParams): Promise<void>;
}

// ---------------------------------------------------------------------------
// Spending summary
// ---------------------------------------------------------------------------

export interface SpendingSummary {
  totalUsd: number;
  period: 'day' | 'month';
  byCategory: Array<{ category: SpendCategory; amountUsd: number }>;
  transactionCount: number;
}
