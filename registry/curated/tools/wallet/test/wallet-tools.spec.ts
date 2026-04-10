// @ts-nocheck
/**
 * @fileoverview Unit tests for wallet tools (CheckBalance, SendCrypto, WalletHistory).
 *
 * Tests cover: tool metadata, successful execution, error handling,
 * missing wallet handling, and spending policy violation surfacing.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createCheckBalanceTool } from '../src/tools/CheckBalanceTool.js';
import { createSendCryptoTool } from '../src/tools/SendCryptoTool.js';
import { createWalletHistoryTool } from '../src/tools/WalletHistoryTool.js';
import { AgentWalletManager, SpendingPolicyViolation } from '../src/AgentWalletManager.js';
import { SpendingPolicyEnforcer } from '../src/SpendingPolicyEnforcer.js';
import type { IChainWalletAdapter, ChainId, WalletTxStatus } from '../src/types.js';
import { DEFAULT_SPENDING_POLICY } from '../src/types.js';

/* ------------------------------------------------------------------ */
/*  Test helpers                                                       */
/* ------------------------------------------------------------------ */

const CTX = {
  gmiId: 'test-agent',
  personaId: 'persona-1',
  userContext: { userId: 'user-1' } as any,
};

function createMockAdapter(): IChainWalletAdapter {
  return {
    chain: 'solana',
    generateKeypair: vi.fn(async () => ({
      publicKey: 'SolPubKey123',
      secretKey: new Uint8Array(64).fill(1),
    })),
    getBalance: vi.fn(async () => 2_500_000_000n), // 2.5 SOL
    getTokenBalance: vi.fn(async () => 100_000_000n), // 100 USDC
    signTransfer: vi.fn(async () => new Uint8Array([1])),
    signTokenTransfer: vi.fn(async () => new Uint8Array([2])),
    broadcast: vi.fn(async () => 'tx-hash-001'),
    getTransactionStatus: vi.fn(async () => 'confirmed' as WalletTxStatus),
  };
}

function createTestManager() {
  const adapter = createMockAdapter();
  const wallets = new Map<string, any>();
  const txs = new Map<string, any[]>();
  const ledger: any[] = [];

  const store = {
    async getWallet(agentId: string, chain: string) { return wallets.get(`${agentId}:${chain}`) || null; },
    async getAllWallets(agentId: string) { return [...wallets.values()].filter((w: any) => w.agentId === agentId); },
    async saveWallet(record: any) { wallets.set(`${record.agentId}:${record.chain}`, record); },
    async insertTransaction(record: any) { const l = txs.get(record.walletId) || []; l.push(record); txs.set(record.walletId, l); },
    async updateTransactionStatus(id: string, status: string, txHash?: string) {
      for (const [, l] of txs) { const t = l.find((x: any) => x.id === id); if (t) { t.status = status; if (txHash) t.txHash = txHash; } }
    },
    async getTransactions(walletId: string, limit = 20) { return (txs.get(walletId) || []).slice(-limit).reverse(); },
  };

  const ledgerStore = {
    async sumByPeriod(agentId: string, periodKey: string) { return ledger.filter(e => e.agentId === agentId && e.periodKey === periodKey).reduce((s, e) => s + e.amountUsd, 0); },
    async sumByCategoryAndPeriod(agentId: string, category: string, periodKey: string) { return ledger.filter(e => e.agentId === agentId && e.category === category && e.periodKey === periodKey).reduce((s, e) => s + e.amountUsd, 0); },
    async insert(entry: any) { ledger.push(entry); },
  };

  const policyEnforcer = new SpendingPolicyEnforcer(DEFAULT_SPENDING_POLICY, ledgerStore);
  const adapters = new Map<ChainId, IChainWalletAdapter>([['solana', adapter]]);

  const manager = new AgentWalletManager({
    masterSecret: 'test-secret-for-tools-32bytes!',
    walletConfig: { enabled: true, chains: ['solana'], custodyMode: 'encrypted-hot', allowedTokens: ['SOL', 'USDC'], spendingPolicy: DEFAULT_SPENDING_POLICY },
    store,
    policyEnforcer,
    adapters,
  });

  return { manager, adapter, wallets, txs };
}

/* ------------------------------------------------------------------ */
/*  CheckBalanceTool                                                   */
/* ------------------------------------------------------------------ */

describe('CheckBalanceTool', () => {
  let manager: AgentWalletManager;

  beforeEach(async () => {
    const setup = createTestManager();
    manager = setup.manager;
    await manager.createWallet(CTX.gmiId, 'solana');
  });

  it('should have correct metadata', () => {
    const tool = createCheckBalanceTool(manager);
    expect(tool.id).toBe('wallet-check-balance-v1');
    expect(tool.name).toBe('check_wallet_balance');
    expect(tool.hasSideEffects).toBe(false);
  });

  it('should return formatted SOL balance', async () => {
    const tool = createCheckBalanceTool(manager);
    const result = await tool.execute({ chain: 'solana' }, CTX);

    expect(result.success).toBe(true);
    expect(result.output?.token).toBe('SOL');
    expect(result.output?.balanceFormatted).toContain('2.5');
    expect(result.output?.address).toBeTruthy();
  });

  it('should default to solana chain', async () => {
    const tool = createCheckBalanceTool(manager);
    const result = await tool.execute({}, CTX);

    expect(result.success).toBe(true);
    expect(result.output?.chain).toBe('solana');
  });

  it('should return error for non-existent wallet', async () => {
    const tool = createCheckBalanceTool(manager);
    const result = await tool.execute({ chain: 'ethereum' }, CTX);

    expect(result.success).toBe(false);
    expect(result.error).toContain('No ethereum wallet found');
  });
});

/* ------------------------------------------------------------------ */
/*  SendCryptoTool                                                     */
/* ------------------------------------------------------------------ */

describe('SendCryptoTool', () => {
  let manager: AgentWalletManager;

  beforeEach(async () => {
    const setup = createTestManager();
    manager = setup.manager;
    await manager.createWallet(CTX.gmiId, 'solana');
  });

  afterEach(() => {
    delete process.env.WALLET_PRICE_SOL_USD;
  });

  it('should have correct metadata', () => {
    const tool = createSendCryptoTool(manager);
    expect(tool.id).toBe('wallet-send-crypto-v1');
    expect(tool.name).toBe('send_crypto');
    expect(tool.hasSideEffects).toBe(true);
  });

  it('should send native SOL successfully', async () => {
    const tool = createSendCryptoTool(manager);
    const result = await tool.execute({
      to: 'dest-address',
      amount: '0.5',
      chain: 'solana',
    }, CTX);

    expect(result.success).toBe(true);
    expect(result.output?.txHash).toBe('tx-hash-001');
    expect(result.output?.status).toBe('confirmed');
  });

  it('should return error for invalid amount', async () => {
    const tool = createSendCryptoTool(manager);
    const result = await tool.execute({
      to: 'dest',
      amount: 'not-a-number',
    }, CTX);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid amount');
  });

  it('should return error for negative amount', async () => {
    const tool = createSendCryptoTool(manager);
    const result = await tool.execute({
      to: 'dest',
      amount: '-5',
    }, CTX);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid amount');
  });

  it('should surface spending policy violations cleanly', async () => {
    const tool = createSendCryptoTool(manager);
    // per-tx limit is $20, send $25
    const result = await tool.execute({
      to: 'dest',
      amount: '25',
      chain: 'solana',
    }, CTX);

    expect(result.success).toBe(false);
    expect(result.details?.policyViolation).toBe(true);
  });

  it('should return error for unsupported token transfers', async () => {
    const tool = createSendCryptoTool(manager);
    const result = await tool.execute({
      to: 'dest',
      amount: '10',
      token: 'USDC',
    }, CTX);

    expect(result.success).toBe(false);
    expect(result.error).toContain('not yet supported');
  });

  it('should honor configurable reference USD prices for policy checks', async () => {
    process.env.WALLET_PRICE_SOL_USD = '100';
    const tool = createSendCryptoTool(manager);
    const result = await tool.execute({
      to: 'dest',
      amount: '0.5',
      chain: 'solana',
    }, CTX);

    expect(result.success).toBe(false);
    expect(result.details?.policyViolation).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  WalletHistoryTool                                                  */
/* ------------------------------------------------------------------ */

describe('WalletHistoryTool', () => {
  let manager: AgentWalletManager;

  beforeEach(async () => {
    const setup = createTestManager();
    manager = setup.manager;
    await manager.createWallet(CTX.gmiId, 'solana');
  });

  it('should have correct metadata', () => {
    const tool = createWalletHistoryTool(manager);
    expect(tool.id).toBe('wallet-transaction-history-v1');
    expect(tool.name).toBe('wallet_transaction_history');
    expect(tool.hasSideEffects).toBe(false);
  });

  it('should return empty history for new wallet', async () => {
    const tool = createWalletHistoryTool(manager);
    const result = await tool.execute({}, CTX);

    expect(result.success).toBe(true);
    expect(result.output?.transactions).toEqual([]);
    expect(result.output?.totalCount).toBe(0);
  });

  it('should return transactions after sends', async () => {
    await manager.sendNative(CTX.gmiId, 'solana', 'dest1', 100n, 1, 'transfers');
    await manager.sendNative(CTX.gmiId, 'solana', 'dest2', 200n, 2, 'shopping');

    const tool = createWalletHistoryTool(manager);
    const result = await tool.execute({ chain: 'solana', limit: 10 }, CTX);

    expect(result.success).toBe(true);
    expect(result.output?.totalCount).toBe(2);
    expect(result.output?.transactions[0].to).toBe('dest2');
    expect(result.output?.transactions[1].to).toBe('dest1');
  });

  it('should return error for non-existent wallet', async () => {
    const tool = createWalletHistoryTool(manager);
    const result = await tool.execute({ chain: 'ethereum' }, CTX);

    expect(result.success).toBe(false);
    expect(result.error).toContain('No ethereum wallet found');
  });
});
