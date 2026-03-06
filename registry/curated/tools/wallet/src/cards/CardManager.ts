/**
 * @fileoverview High-level card lifecycle manager.
 *
 * Mirrors AgentWalletManager's pattern: one card per agent, spending policy
 * enforcement via the shared SpendingPolicyEnforcer, and in-memory/DB store
 * abstraction via ICardStore.
 *
 * @module wallet/cards/CardManager
 */

import { v4 as uuidv4 } from 'uuid';
import type { SpendingPolicyEnforcer } from '../SpendingPolicyEnforcer.js';
import type { SpendCategory } from '../types.js';
import type { MccCategoryMap } from './MccCategoryMap.js';
import type {
  AgentCardRecord,
  CardConfig,
  CardTransactionRecord,
  ICardAdapter,
  ICardStore,
  LithicTransaction,
  SpendingSummary,
} from './types.js';

// ---------------------------------------------------------------------------
// CardManager
// ---------------------------------------------------------------------------

export interface CardManagerOptions {
  adapter: ICardAdapter;
  store: ICardStore;
  policyEnforcer: SpendingPolicyEnforcer;
  mccMap: MccCategoryMap;
  config: CardConfig;
}

export class CardManager {
  private readonly adapter: ICardAdapter;
  private readonly store: ICardStore;
  private readonly policy: SpendingPolicyEnforcer;
  private readonly mccMap: MccCategoryMap;
  private readonly config: CardConfig;

  constructor(opts: CardManagerOptions) {
    this.adapter = opts.adapter;
    this.store = opts.store;
    this.policy = opts.policyEnforcer;
    this.mccMap = opts.mccMap;
    this.config = opts.config;
  }

  // -----------------------------------------------------------------------
  // Card lifecycle
  // -----------------------------------------------------------------------

  /**
   * Issue a new virtual card for the agent.
   * One card per agent — throws if card already exists.
   */
  async issueCard(
    agentId: string,
    opts?: { memo?: string; spendLimitUsd?: number },
  ): Promise<AgentCardRecord> {
    const existing = await this.store.getCard(agentId);
    if (existing) {
      throw new Error(`Agent ${agentId} already has a card (last4: ${existing.last4})`);
    }

    const spendLimit = opts?.spendLimitUsd ?? this.config.defaultSpendLimitUsd;

    const lithicCard = await this.adapter.createCard({
      type: 'VIRTUAL',
      memo: opts?.memo || `Agent ${agentId} virtual card`,
      spend_limit: Math.round(spendLimit * 100), // Lithic uses cents
      spend_limit_duration: 'MONTHLY',
      state: 'OPEN',
    });

    // Set auth rules for blocked categories
    const blockedMccs = this.getBlockedMccs();
    if (blockedMccs.length > 0) {
      await this.adapter.createAuthRule(lithicCard.token, {
        blocked_mcc: blockedMccs,
      });
    }

    const record: AgentCardRecord = {
      id: uuidv4(),
      agentId,
      lithicCardToken: lithicCard.token,
      last4: lithicCard.last_four,
      cardType: lithicCard.type,
      state: lithicCard.state,
      spendLimitUsd: spendLimit,
      spendLimitDuration: 'MONTHLY',
      network: 'VISA',
      memo: opts?.memo,
      createdAt: Date.now(),
    };

    await this.store.saveCard(record);
    return record;
  }

  /** Get the agent's card record, or null. */
  async getCard(agentId: string): Promise<AgentCardRecord | null> {
    return this.store.getCard(agentId);
  }

  /**
   * Get sensitive card details (PAN, CVV, expiry) for online payments.
   * Enforces spending policy before revealing details.
   */
  async getCardDetails(
    agentId: string,
    estimatedAmountUsd?: number,
    category?: SpendCategory,
  ): Promise<{ last4: string; expMonth: string; expYear: string; cvv: string; pan: string }> {
    const card = await this.requireCard(agentId);

    // If an estimated amount is provided, check spending policy first
    if (estimatedAmountUsd !== undefined) {
      const check = await this.policy.canSpend(agentId, estimatedAmountUsd, category || 'shopping');
      if (!check.allowed) {
        throw new CardSpendingBlockedError(check.reason || 'Spending policy violation');
      }
    }

    const lithicCard = await this.adapter.getCard(card.lithicCardToken);

    return {
      last4: lithicCard.last_four,
      expMonth: lithicCard.exp_month || '',
      expYear: lithicCard.exp_year || '',
      cvv: lithicCard.cvv || '',
      pan: lithicCard.pan || '',
    };
  }

  /** Freeze (pause) the agent's card. */
  async freezeCard(agentId: string): Promise<void> {
    const card = await this.requireCard(agentId);
    if (card.state === 'PAUSED') return;
    if (card.state === 'CLOSED') throw new Error('Cannot freeze a closed card');

    await this.adapter.pauseCard(card.lithicCardToken);
    await this.store.updateCardState(agentId, 'PAUSED');
  }

  /** Unfreeze (resume) the agent's card. */
  async unfreezeCard(agentId: string): Promise<void> {
    const card = await this.requireCard(agentId);
    if (card.state === 'OPEN') return;
    if (card.state === 'CLOSED') throw new Error('Cannot unfreeze a closed card');

    await this.adapter.resumeCard(card.lithicCardToken);
    await this.store.updateCardState(agentId, 'OPEN');
  }

  /** Permanently close the agent's card. */
  async closeCard(agentId: string): Promise<void> {
    const card = await this.requireCard(agentId);
    if (card.state === 'CLOSED') return;

    await this.adapter.closeCard(card.lithicCardToken);
    await this.store.updateCardState(agentId, 'CLOSED');
  }

  // -----------------------------------------------------------------------
  // Spending summary
  // -----------------------------------------------------------------------

  async getSpendingSummary(agentId: string, period: 'day' | 'month' = 'month'): Promise<SpendingSummary> {
    const card = await this.requireCard(agentId);

    const now = new Date();
    let since: number;
    if (period === 'day') {
      since = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    } else {
      since = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    }

    const txs = await this.store.getTransactionsByPeriod(card.id, since);
    const settled = txs.filter(t => t.status === 'SETTLED' || t.status === 'PENDING');

    const byCategory = new Map<SpendCategory, number>();
    let totalUsd = 0;

    for (const tx of settled) {
      totalUsd += tx.amountUsd;
      byCategory.set(tx.category, (byCategory.get(tx.category) || 0) + tx.amountUsd);
    }

    return {
      totalUsd,
      period,
      byCategory: [...byCategory.entries()].map(([category, amountUsd]) => ({ category, amountUsd })),
      transactionCount: settled.length,
    };
  }

  // -----------------------------------------------------------------------
  // Webhook processing
  // -----------------------------------------------------------------------

  /**
   * Process a Lithic transaction webhook event.
   * Resolves MCC → category and records the spend in the shared ledger.
   */
  async processWebhookTransaction(agentId: string, lithicTx: LithicTransaction): Promise<void> {
    const card = await this.store.getCard(agentId);
    if (!card) return; // Unknown card — ignore

    const category = this.mccMap.mccToCategory(lithicTx.merchant.mcc);
    const amountUsd = Math.abs(lithicTx.amount) / 100; // Lithic amounts are in cents

    const txRecord: CardTransactionRecord = {
      id: uuidv4(),
      cardId: card.id,
      lithicTxToken: lithicTx.token,
      merchantName: lithicTx.merchant.descriptor,
      merchantMcc: lithicTx.merchant.mcc,
      category,
      amountUsd,
      status: lithicTx.status,
      createdAt: Date.now(),
    };

    await this.store.insertTransaction(txRecord);

    // Record in shared spending ledger (same as crypto sends)
    if (lithicTx.status === 'SETTLED' || lithicTx.status === 'PENDING') {
      await this.policy.recordSpend(agentId, amountUsd, category);
    }
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private async requireCard(agentId: string): Promise<AgentCardRecord> {
    const card = await this.store.getCard(agentId);
    if (!card) {
      throw new Error(`No card found for agent ${agentId}. Issue one first.`);
    }
    return card;
  }

  /**
   * Build a flat list of blocked MCC codes from the spending policy's
   * blockedCategories, expanded via the MCC map.
   */
  private getBlockedMccs(): string[] {
    // Access the policy's config to get blocked categories
    // The SpendingPolicyEnforcer doesn't expose config directly,
    // so we pass blocked categories through the card config or
    // use the MCC map to expand known blocked categories.
    // For now, this is handled at the extension pack level.
    return [];
  }
}

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

export class CardSpendingBlockedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'CardSpendingBlockedError';
  }
}
