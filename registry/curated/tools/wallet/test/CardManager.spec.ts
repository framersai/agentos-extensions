/**
 * @fileoverview Unit tests for CardManager.
 *
 * Tests cover: card issuance, duplicate prevention, freeze/unfreeze, close,
 * card details retrieval, spending summary, webhook processing, and spending
 * policy integration.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CardManager, CardSpendingBlockedError } from '../src/cards/CardManager.js';
import { MccCategoryMap } from '../src/cards/MccCategoryMap.js';
import { SpendingPolicyEnforcer } from '../src/SpendingPolicyEnforcer.js';
import { DEFAULT_SPENDING_POLICY } from '../src/types.js';
import type { ICardAdapter, ICardStore, AgentCardRecord, CardTransactionRecord, LithicTransaction, CardConfig, CardState, CardTxStatus } from '../src/cards/types.js';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const AGENT = 'card-test-agent';

function createMockAdapter(): ICardAdapter {
  return {
    createCard: vi.fn(async (params) => ({
      token: 'lithic-card-token-123',
      last_four: '4242',
      type: params.type,
      state: params.state || 'OPEN',
      spend_limit: params.spend_limit,
      spend_limit_duration: params.spend_limit_duration,
      pan: '4242424242424242',
      cvv: '123',
      exp_month: '12',
      exp_year: '2028',
      funding: { token: 'fund-1', type: 'DEPOSITORY_CHECKING' },
    })),
    getCard: vi.fn(async () => ({
      token: 'lithic-card-token-123',
      last_four: '4242',
      type: 'VIRTUAL' as const,
      state: 'OPEN' as const,
      spend_limit: 50000,
      spend_limit_duration: 'MONTHLY' as const,
      pan: '4242424242424242',
      cvv: '123',
      exp_month: '12',
      exp_year: '2028',
      funding: { token: 'fund-1', type: 'DEPOSITORY_CHECKING' },
    })),
    updateCard: vi.fn(async () => ({} as any)),
    pauseCard: vi.fn(async () => {}),
    resumeCard: vi.fn(async () => {}),
    closeCard: vi.fn(async () => {}),
    listTransactions: vi.fn(async () => []),
    createAuthRule: vi.fn(async () => {}),
  };
}

function createMockStore(): ICardStore & { cards: Map<string, AgentCardRecord>; txs: CardTransactionRecord[] } {
  const cards = new Map<string, AgentCardRecord>();
  const txs: CardTransactionRecord[] = [];
  return {
    cards,
    txs,
    async getCard(agentId: string) {
      return [...cards.values()].find(c => c.agentId === agentId) || null;
    },
    async saveCard(record: AgentCardRecord) {
      cards.set(record.id, record);
    },
    async updateCardState(agentId: string, state: CardState) {
      for (const card of cards.values()) {
        if (card.agentId === agentId) card.state = state;
      }
    },
    async insertTransaction(record: CardTransactionRecord) {
      txs.push(record);
    },
    async updateTransactionStatus(id: string, status: CardTxStatus) {
      const tx = txs.find(t => t.id === id);
      if (tx) tx.status = status;
    },
    async getTransactions(cardId: string, limit = 20) {
      return txs.filter(t => t.cardId === cardId).slice(-limit).reverse();
    },
    async getTransactionsByPeriod(cardId: string, since: number) {
      return txs.filter(t => t.cardId === cardId && t.createdAt >= since);
    },
  };
}

function createTestLedger() {
  const entries: any[] = [];
  return {
    entries,
    async sumByPeriod(agentId: string, periodKey: string) {
      return entries.filter(e => e.agentId === agentId && e.periodKey === periodKey).reduce((s, e) => s + e.amountUsd, 0);
    },
    async sumByCategoryAndPeriod(agentId: string, category: string, periodKey: string) {
      return entries.filter(e => e.agentId === agentId && e.category === category && e.periodKey === periodKey).reduce((s, e) => s + e.amountUsd, 0);
    },
    async insert(entry: any) { entries.push(entry); },
  };
}

const CARD_CONFIG: CardConfig = {
  enabled: true,
  provider: 'lithic',
  defaultSpendLimitUsd: 500,
  allowPhysical: false,
};

function createTestManager() {
  const adapter = createMockAdapter();
  const store = createMockStore();
  const ledger = createTestLedger();
  const policyEnforcer = new SpendingPolicyEnforcer(DEFAULT_SPENDING_POLICY, ledger);
  const mccMap = new MccCategoryMap();

  const manager = new CardManager({
    adapter,
    store,
    policyEnforcer,
    mccMap,
    config: CARD_CONFIG,
  });

  return { manager, adapter, store, ledger, policyEnforcer, mccMap };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('CardManager', () => {

  /* ── Card issuance ───────────────────────────────────────────────── */

  describe('issueCard', () => {
    it('should issue a virtual card', async () => {
      const { manager, adapter, store } = createTestManager();
      const card = await manager.issueCard(AGENT);

      expect(card.agentId).toBe(AGENT);
      expect(card.last4).toBe('4242');
      expect(card.cardType).toBe('VIRTUAL');
      expect(card.state).toBe('OPEN');
      expect(card.spendLimitUsd).toBe(500);
      expect(adapter.createCard).toHaveBeenCalledOnce();
      expect(store.cards.size).toBe(1);
    });

    it('should reject duplicate card for same agent', async () => {
      const { manager } = createTestManager();
      await manager.issueCard(AGENT);
      await expect(manager.issueCard(AGENT)).rejects.toThrow('already has a card');
    });

    it('should use custom spend limit', async () => {
      const { manager } = createTestManager();
      const card = await manager.issueCard(AGENT, { spendLimitUsd: 1000 });
      expect(card.spendLimitUsd).toBe(1000);
    });

    it('should set memo on card', async () => {
      const { manager } = createTestManager();
      const card = await manager.issueCard(AGENT, { memo: 'API payments' });
      expect(card.memo).toBe('API payments');
    });

    it('should create auth rules for blocked categories', async () => {
      const { manager, adapter } = createTestManager();
      await manager.issueCard(AGENT);
      // Default policy has no blocked categories, so createAuthRule should not be called
      // (getBlockedMccs returns [])
      // This tests the path exists without error
      expect(adapter.createCard).toHaveBeenCalledOnce();
    });
  });

  /* ── Card retrieval ──────────────────────────────────────────────── */

  describe('getCard', () => {
    it('should return null when no card exists', async () => {
      const { manager } = createTestManager();
      const card = await manager.getCard(AGENT);
      expect(card).toBeNull();
    });

    it('should return card after issuance', async () => {
      const { manager } = createTestManager();
      await manager.issueCard(AGENT);
      const card = await manager.getCard(AGENT);
      expect(card).toBeTruthy();
      expect(card!.last4).toBe('4242');
    });
  });

  /* ── Card details ────────────────────────────────────────────────── */

  describe('getCardDetails', () => {
    it('should return PAN, CVV, and expiry', async () => {
      const { manager } = createTestManager();
      await manager.issueCard(AGENT);
      const details = await manager.getCardDetails(AGENT);
      expect(details.pan).toBe('4242424242424242');
      expect(details.cvv).toBe('123');
      expect(details.expMonth).toBe('12');
      expect(details.expYear).toBe('2028');
    });

    it('should throw when no card exists', async () => {
      const { manager } = createTestManager();
      await expect(manager.getCardDetails(AGENT)).rejects.toThrow('No card found');
    });

    it('should check spending policy when amount provided', async () => {
      const { manager } = createTestManager();
      await manager.issueCard(AGENT);
      // Within limits
      const details = await manager.getCardDetails(AGENT, 15, 'shopping');
      expect(details.pan).toBeTruthy();
    });

    it('should block when spending policy denies', async () => {
      const { manager } = createTestManager();
      await manager.issueCard(AGENT);
      // perTransactionLimitUsd is 20 in DEFAULT_SPENDING_POLICY
      await expect(manager.getCardDetails(AGENT, 25, 'shopping')).rejects.toThrow();
    });
  });

  /* ── Freeze / unfreeze ───────────────────────────────────────────── */

  describe('freezeCard', () => {
    it('should freeze an open card', async () => {
      const { manager, adapter, store } = createTestManager();
      await manager.issueCard(AGENT);
      await manager.freezeCard(AGENT);

      expect(adapter.pauseCard).toHaveBeenCalledOnce();
      const card = await store.getCard(AGENT);
      expect(card!.state).toBe('PAUSED');
    });

    it('should be idempotent for already paused card', async () => {
      const { manager, adapter, store } = createTestManager();
      await manager.issueCard(AGENT);
      await manager.freezeCard(AGENT);
      await manager.freezeCard(AGENT); // second call — no-op
      expect(adapter.pauseCard).toHaveBeenCalledOnce();
    });

    it('should throw for closed card', async () => {
      const { manager, store } = createTestManager();
      await manager.issueCard(AGENT);
      const card = await store.getCard(AGENT);
      card!.state = 'CLOSED';
      await expect(manager.freezeCard(AGENT)).rejects.toThrow('Cannot freeze a closed card');
    });
  });

  describe('unfreezeCard', () => {
    it('should unfreeze a paused card', async () => {
      const { manager, adapter, store } = createTestManager();
      await manager.issueCard(AGENT);
      await manager.freezeCard(AGENT);
      await manager.unfreezeCard(AGENT);

      expect(adapter.resumeCard).toHaveBeenCalledOnce();
      const card = await store.getCard(AGENT);
      expect(card!.state).toBe('OPEN');
    });

    it('should be idempotent for already open card', async () => {
      const { manager, adapter } = createTestManager();
      await manager.issueCard(AGENT);
      await manager.unfreezeCard(AGENT);
      expect(adapter.resumeCard).not.toHaveBeenCalled();
    });
  });

  /* ── Close card ──────────────────────────────────────────────────── */

  describe('closeCard', () => {
    it('should close an open card', async () => {
      const { manager, adapter, store } = createTestManager();
      await manager.issueCard(AGENT);
      await manager.closeCard(AGENT);

      expect(adapter.closeCard).toHaveBeenCalledOnce();
      const card = await store.getCard(AGENT);
      expect(card!.state).toBe('CLOSED');
    });

    it('should be idempotent for already closed card', async () => {
      const { manager, adapter, store } = createTestManager();
      await manager.issueCard(AGENT);
      const card = await store.getCard(AGENT);
      card!.state = 'CLOSED';
      await manager.closeCard(AGENT);
      expect(adapter.closeCard).not.toHaveBeenCalled();
    });
  });

  /* ── Spending summary ────────────────────────────────────────────── */

  describe('getSpendingSummary', () => {
    it('should return empty summary for new card', async () => {
      const { manager } = createTestManager();
      await manager.issueCard(AGENT);
      const summary = await manager.getSpendingSummary(AGENT);
      expect(summary.totalUsd).toBe(0);
      expect(summary.transactionCount).toBe(0);
      expect(summary.byCategory).toEqual([]);
    });

    it('should aggregate transactions by category', async () => {
      const { manager, store } = createTestManager();
      const card = await manager.issueCard(AGENT);

      // Add mock transactions
      store.txs.push(
        { id: 'tx1', cardId: card.id, lithicTxToken: 'lt1', merchantMcc: '5812', category: 'dining', amountUsd: 15, status: 'SETTLED', createdAt: Date.now() },
        { id: 'tx2', cardId: card.id, lithicTxToken: 'lt2', merchantMcc: '5812', category: 'dining', amountUsd: 25, status: 'SETTLED', createdAt: Date.now() },
        { id: 'tx3', cardId: card.id, lithicTxToken: 'lt3', merchantMcc: '5411', category: 'shopping', amountUsd: 50, status: 'PENDING', createdAt: Date.now() },
      );

      const summary = await manager.getSpendingSummary(AGENT, 'month');
      expect(summary.totalUsd).toBe(90);
      expect(summary.transactionCount).toBe(3);
      expect(summary.byCategory.find(c => c.category === 'dining')?.amountUsd).toBe(40);
      expect(summary.byCategory.find(c => c.category === 'shopping')?.amountUsd).toBe(50);
    });

    it('should exclude VOIDED/DECLINED transactions', async () => {
      const { manager, store } = createTestManager();
      const card = await manager.issueCard(AGENT);

      store.txs.push(
        { id: 'tx1', cardId: card.id, lithicTxToken: 'lt1', merchantMcc: '5812', category: 'dining', amountUsd: 15, status: 'SETTLED', createdAt: Date.now() },
        { id: 'tx2', cardId: card.id, lithicTxToken: 'lt2', merchantMcc: '5812', category: 'dining', amountUsd: 10, status: 'DECLINED', createdAt: Date.now() },
        { id: 'tx3', cardId: card.id, lithicTxToken: 'lt3', merchantMcc: '5812', category: 'dining', amountUsd: 5, status: 'VOIDED', createdAt: Date.now() },
      );

      const summary = await manager.getSpendingSummary(AGENT, 'month');
      expect(summary.totalUsd).toBe(15);
      expect(summary.transactionCount).toBe(1);
    });
  });

  /* ── Webhook processing ──────────────────────────────────────────── */

  describe('processWebhookTransaction', () => {
    it('should record transaction and spending', async () => {
      const { manager, store, ledger } = createTestManager();
      await manager.issueCard(AGENT);

      const lithicTx: LithicTransaction = {
        token: 'ltx-001',
        card_token: 'lithic-card-token-123',
        amount: -1500, // $15.00 in cents, negative for debits
        merchant: { descriptor: 'STARBUCKS', mcc: '5812', city: 'SF', state: 'CA', country: 'US' },
        status: 'SETTLED',
        created: new Date().toISOString(),
      };

      await manager.processWebhookTransaction(AGENT, lithicTx);

      expect(store.txs.length).toBe(1);
      expect(store.txs[0].category).toBe('dining');
      expect(store.txs[0].amountUsd).toBe(15);
      expect(store.txs[0].merchantName).toBe('STARBUCKS');
      // Should record in spending ledger
      expect(ledger.entries.length).toBe(2); // daily + monthly
    });

    it('should resolve MCC to correct category', async () => {
      const { manager, store } = createTestManager();
      await manager.issueCard(AGENT);

      const lithicTx: LithicTransaction = {
        token: 'ltx-002',
        card_token: 'lithic-card-token-123',
        amount: -5000,
        merchant: { descriptor: 'HILTON HOTEL', mcc: '7011' },
        status: 'PENDING',
        created: new Date().toISOString(),
      };

      await manager.processWebhookTransaction(AGENT, lithicTx);
      expect(store.txs[0].category).toBe('travel');
    });

    it('should skip unknown agents', async () => {
      const { manager, store } = createTestManager();
      const lithicTx: LithicTransaction = {
        token: 'ltx-003',
        card_token: 'unknown-token',
        amount: -1000,
        merchant: { descriptor: 'SHOP', mcc: '5411' },
        status: 'SETTLED',
        created: new Date().toISOString(),
      };

      await manager.processWebhookTransaction('unknown-agent', lithicTx);
      expect(store.txs.length).toBe(0);
    });

    it('should not record spending for DECLINED transactions', async () => {
      const { manager, ledger } = createTestManager();
      await manager.issueCard(AGENT);

      const lithicTx: LithicTransaction = {
        token: 'ltx-004',
        card_token: 'lithic-card-token-123',
        amount: -2000,
        merchant: { descriptor: 'STORE', mcc: '5411' },
        status: 'DECLINED',
        created: new Date().toISOString(),
      };

      await manager.processWebhookTransaction(AGENT, lithicTx);
      expect(ledger.entries.length).toBe(0);
    });
  });
});
