/**
 * @fileoverview Unit tests for card tools (IssueCard, CardStatus, FreezeCard,
 * UnfreezeCard, CardSpendingSummary, PayWithCard).
 *
 * Tests cover: tool metadata, successful execution, error handling,
 * and spending policy enforcement.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createIssueCardTool } from '../src/tools/IssueCardTool.js';
import { createCardStatusTool } from '../src/tools/CardStatusTool.js';
import { createFreezeCardTool } from '../src/tools/FreezeCardTool.js';
import { createUnfreezeCardTool } from '../src/tools/UnfreezeCardTool.js';
import { createCardSpendingSummaryTool } from '../src/tools/CardSpendingSummaryTool.js';
import { createPayWithCardTool } from '../src/tools/PayWithCardTool.js';
import { CardManager } from '../src/cards/CardManager.js';
import { MccCategoryMap } from '../src/cards/MccCategoryMap.js';
import { SpendingPolicyEnforcer } from '../src/SpendingPolicyEnforcer.js';
import { DEFAULT_SPENDING_POLICY } from '../src/types.js';
import type { ICardAdapter, ICardStore, AgentCardRecord, CardTransactionRecord, CardConfig, CardState, CardTxStatus } from '../src/cards/types.js';

/* ------------------------------------------------------------------ */
/*  Test helpers                                                       */
/* ------------------------------------------------------------------ */

const CTX = {
  gmiId: 'card-tool-test-agent',
  personaId: 'persona-1',
  userContext: { userId: 'user-1' } as any,
};

function createMockAdapter(): ICardAdapter {
  return {
    createCard: vi.fn(async (params) => ({
      token: 'lt-card-token',
      last_four: '9999',
      type: params.type,
      state: params.state || 'OPEN',
      spend_limit: params.spend_limit,
      spend_limit_duration: params.spend_limit_duration,
      pan: '4111111111119999',
      cvv: '456',
      exp_month: '06',
      exp_year: '2029',
      funding: { token: 'fund-1', type: 'DEPOSITORY_CHECKING' },
    })),
    getCard: vi.fn(async () => ({
      token: 'lt-card-token',
      last_four: '9999',
      type: 'VIRTUAL' as const,
      state: 'OPEN' as const,
      spend_limit: 50000,
      spend_limit_duration: 'MONTHLY' as const,
      pan: '4111111111119999',
      cvv: '456',
      exp_month: '06',
      exp_year: '2029',
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

function createMockStore(): ICardStore {
  const cards = new Map<string, AgentCardRecord>();
  const txs: CardTransactionRecord[] = [];
  return {
    async getCard(agentId: string) { return [...cards.values()].find(c => c.agentId === agentId) || null; },
    async saveCard(record: AgentCardRecord) { cards.set(record.id, record); },
    async updateCardState(agentId: string, state: CardState) {
      for (const card of cards.values()) { if (card.agentId === agentId) card.state = state; }
    },
    async insertTransaction(record: CardTransactionRecord) { txs.push(record); },
    async updateTransactionStatus(id: string, status: CardTxStatus) { const tx = txs.find(t => t.id === id); if (tx) tx.status = status; },
    async getTransactions(cardId: string, limit = 20) { return txs.filter(t => t.cardId === cardId).slice(-limit).reverse(); },
    async getTransactionsByPeriod(cardId: string, since: number) { return txs.filter(t => t.cardId === cardId && t.createdAt >= since); },
  };
}

const CARD_CONFIG: CardConfig = { enabled: true, provider: 'lithic', defaultSpendLimitUsd: 500, allowPhysical: false };

function createTestCardManager() {
  const ledger: any[] = [];
  const ledgerStore = {
    async sumByPeriod(agentId: string, periodKey: string) { return ledger.filter(e => e.agentId === agentId && e.periodKey === periodKey).reduce((s, e) => s + e.amountUsd, 0); },
    async sumByCategoryAndPeriod(agentId: string, category: string, periodKey: string) { return ledger.filter(e => e.agentId === agentId && e.category === category && e.periodKey === periodKey).reduce((s, e) => s + e.amountUsd, 0); },
    async insert(entry: any) { ledger.push(entry); },
  };

  return new CardManager({
    adapter: createMockAdapter(),
    store: createMockStore(),
    policyEnforcer: new SpendingPolicyEnforcer(DEFAULT_SPENDING_POLICY, ledgerStore),
    mccMap: new MccCategoryMap(),
    config: CARD_CONFIG,
  });
}

/* ------------------------------------------------------------------ */
/*  IssueCardTool                                                      */
/* ------------------------------------------------------------------ */

describe('IssueCardTool', () => {
  it('should have correct metadata', () => {
    const tool = createIssueCardTool(createTestCardManager());
    expect(tool.id).toBe('wallet-issue-card-v1');
    expect(tool.name).toBe('issue_virtual_card');
    expect(tool.hasSideEffects).toBe(true);
  });

  it('should issue card successfully', async () => {
    const tool = createIssueCardTool(createTestCardManager());
    const result = await tool.execute({}, CTX);
    expect(result.success).toBe(true);
    expect(result.output?.last4).toBe('9999');
    expect(result.output?.state).toBe('OPEN');
  });

  it('should return error for duplicate card', async () => {
    const mgr = createTestCardManager();
    const tool = createIssueCardTool(mgr);
    await tool.execute({}, CTX);
    const result = await tool.execute({}, CTX);
    expect(result.success).toBe(false);
    expect(result.error).toContain('already has a card');
  });
});

/* ------------------------------------------------------------------ */
/*  CardStatusTool                                                     */
/* ------------------------------------------------------------------ */

describe('CardStatusTool', () => {
  it('should have correct metadata', () => {
    const tool = createCardStatusTool(createTestCardManager());
    expect(tool.id).toBe('wallet-card-status-v1');
    expect(tool.name).toBe('card_status');
    expect(tool.hasSideEffects).toBe(false);
  });

  it('should return error when no card exists', async () => {
    const tool = createCardStatusTool(createTestCardManager());
    const result = await tool.execute({}, CTX);
    expect(result.success).toBe(false);
    expect(result.error).toContain('No card found');
  });

  it('should return card status after issuance', async () => {
    const mgr = createTestCardManager();
    await mgr.issueCard(CTX.gmiId);
    const tool = createCardStatusTool(mgr);
    const result = await tool.execute({}, CTX);
    expect(result.success).toBe(true);
    expect(result.output?.last4).toBe('9999');
    expect(result.output?.state).toBe('OPEN');
  });
});

/* ------------------------------------------------------------------ */
/*  FreezeCardTool                                                     */
/* ------------------------------------------------------------------ */

describe('FreezeCardTool', () => {
  it('should have correct metadata', () => {
    const tool = createFreezeCardTool(createTestCardManager());
    expect(tool.id).toBe('wallet-freeze-card-v1');
    expect(tool.name).toBe('freeze_card');
    expect(tool.hasSideEffects).toBe(true);
  });

  it('should freeze card successfully', async () => {
    const mgr = createTestCardManager();
    await mgr.issueCard(CTX.gmiId);
    const tool = createFreezeCardTool(mgr);
    const result = await tool.execute({}, CTX);
    expect(result.success).toBe(true);
    expect(result.output?.state).toBe('PAUSED');
  });

  it('should return error when no card exists', async () => {
    const tool = createFreezeCardTool(createTestCardManager());
    const result = await tool.execute({}, CTX);
    expect(result.success).toBe(false);
    expect(result.error).toContain('No card found');
  });
});

/* ------------------------------------------------------------------ */
/*  UnfreezeCardTool                                                   */
/* ------------------------------------------------------------------ */

describe('UnfreezeCardTool', () => {
  it('should have correct metadata', () => {
    const tool = createUnfreezeCardTool(createTestCardManager());
    expect(tool.id).toBe('wallet-unfreeze-card-v1');
    expect(tool.name).toBe('unfreeze_card');
    expect(tool.hasSideEffects).toBe(true);
  });

  it('should unfreeze card successfully', async () => {
    const mgr = createTestCardManager();
    await mgr.issueCard(CTX.gmiId);
    await mgr.freezeCard(CTX.gmiId);
    const tool = createUnfreezeCardTool(mgr);
    const result = await tool.execute({}, CTX);
    expect(result.success).toBe(true);
    expect(result.output?.state).toBe('OPEN');
  });
});

/* ------------------------------------------------------------------ */
/*  CardSpendingSummaryTool                                            */
/* ------------------------------------------------------------------ */

describe('CardSpendingSummaryTool', () => {
  it('should have correct metadata', () => {
    const tool = createCardSpendingSummaryTool(createTestCardManager());
    expect(tool.id).toBe('wallet-card-spending-summary-v1');
    expect(tool.name).toBe('card_spending_summary');
    expect(tool.hasSideEffects).toBe(false);
  });

  it('should return empty summary for new card', async () => {
    const mgr = createTestCardManager();
    await mgr.issueCard(CTX.gmiId);
    const tool = createCardSpendingSummaryTool(mgr);
    const result = await tool.execute({}, CTX);
    expect(result.success).toBe(true);
    expect(result.output?.totalUsd).toBe(0);
  });

  it('should return error when no card exists', async () => {
    const tool = createCardSpendingSummaryTool(createTestCardManager());
    const result = await tool.execute({}, CTX);
    expect(result.success).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  PayWithCardTool                                                    */
/* ------------------------------------------------------------------ */

describe('PayWithCardTool', () => {
  it('should have correct metadata', () => {
    const tool = createPayWithCardTool(createTestCardManager());
    expect(tool.id).toBe('wallet-pay-with-card-v1');
    expect(tool.name).toBe('pay_with_card');
    expect(tool.hasSideEffects).toBe(true);
  });

  it('should return card details for payment', async () => {
    const mgr = createTestCardManager();
    await mgr.issueCard(CTX.gmiId);
    const tool = createPayWithCardTool(mgr);
    const result = await tool.execute({}, CTX);
    expect(result.success).toBe(true);
    expect(result.output?.pan).toBe('4111111111119999');
    expect(result.output?.cvv).toBe('456');
    expect(result.output?.expMonth).toBe('06');
    expect(result.output?.expYear).toBe('2029');
  });

  it('should block when spending policy denies', async () => {
    const mgr = createTestCardManager();
    await mgr.issueCard(CTX.gmiId);
    const tool = createPayWithCardTool(mgr);
    // perTransactionLimitUsd = 20 in DEFAULT_SPENDING_POLICY
    const result = await tool.execute({ estimatedAmountUsd: 25, category: 'shopping' }, CTX);
    expect(result.success).toBe(false);
    expect(result.details?.policyViolation).toBe(true);
  });

  it('should return error when no card exists', async () => {
    const tool = createPayWithCardTool(createTestCardManager());
    const result = await tool.execute({}, CTX);
    expect(result.success).toBe(false);
    expect(result.error).toContain('No card found');
  });
});
