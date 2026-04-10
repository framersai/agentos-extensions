// @ts-nocheck
/**
 * @fileoverview Unit tests for AgentWalletManager.
 *
 * Tests cover: wallet creation, duplicate prevention, encrypted key storage,
 * balance caching, spending with policy enforcement, policy violation errors,
 * and transaction recording.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentWalletManager, SpendingPolicyViolation, ApprovalRequiredError } from '../src/AgentWalletManager.js';
import { SpendingPolicyEnforcer } from '../src/SpendingPolicyEnforcer.js';
import type { IChainWalletAdapter, ChainId, WalletConfig, WalletTxStatus, AgentWalletRecord } from '../src/types.js';
import { DEFAULT_SPENDING_POLICY } from '../src/types.js';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

function createMockAdapter(chain: ChainId = 'solana'): IChainWalletAdapter {
  return {
    chain,
    generateKeypair: vi.fn(async () => ({
      publicKey: `${chain}-pub-${Math.random().toString(36).slice(2, 8)}`,
      secretKey: new Uint8Array(64).fill(1),
    })),
    getBalance: vi.fn(async () => 1_000_000_000n), // 1 SOL / 1 ETH
    getTokenBalance: vi.fn(async () => 50_000_000n), // 50 USDC
    signTransfer: vi.fn(async () => new Uint8Array([1, 2, 3])),
    signTokenTransfer: vi.fn(async () => new Uint8Array([4, 5, 6])),
    broadcast: vi.fn(async () => 'tx-hash-abc123'),
    getTransactionStatus: vi.fn(async () => 'confirmed' as WalletTxStatus),
  };
}

function createMemoryStore() {
  const wallets = new Map<string, AgentWalletRecord>();
  const txs = new Map<string, any[]>();
  return {
    wallets,
    txs,
    async getWallet(agentId: string, chain: ChainId) {
      return wallets.get(`${agentId}:${chain}`) || null;
    },
    async getAllWallets(agentId: string) {
      return [...wallets.values()].filter(w => w.agentId === agentId);
    },
    async saveWallet(record: AgentWalletRecord) {
      wallets.set(`${record.agentId}:${record.chain}`, record);
    },
    async insertTransaction(record: any) {
      const list = txs.get(record.walletId) || [];
      list.push(record);
      txs.set(record.walletId, list);
    },
    async updateTransactionStatus(id: string, status: string, txHash?: string) {
      for (const [, list] of txs) {
        const tx = list.find((t: any) => t.id === id);
        if (tx) { tx.status = status; if (txHash) tx.txHash = txHash; }
      }
    },
    async getTransactions(walletId: string, limit = 20) {
      return (txs.get(walletId) || []).slice(-limit).reverse();
    },
  };
}

function createMemoryLedger() {
  const entries: any[] = [];
  return {
    entries,
    async sumByPeriod(agentId: string, periodKey: string) {
      return entries.filter(e => e.agentId === agentId && e.periodKey === periodKey)
        .reduce((sum, e) => sum + e.amountUsd, 0);
    },
    async sumByCategoryAndPeriod(agentId: string, category: string, periodKey: string) {
      return entries.filter(e => e.agentId === agentId && e.category === category && e.periodKey === periodKey)
        .reduce((sum, e) => sum + e.amountUsd, 0);
    },
    async insert(entry: any) { entries.push(entry); },
  };
}

const AGENT = 'agent-wallet-test';
const SECRET = 'test-master-secret-32bytes!!!!!';

function createManager(overrides?: { policy?: Partial<typeof DEFAULT_SPENDING_POLICY> }) {
  const adapter = createMockAdapter();
  const store = createMemoryStore();
  const ledger = createMemoryLedger();
  const policyConfig = { ...DEFAULT_SPENDING_POLICY, ...overrides?.policy };
  const policyEnforcer = new SpendingPolicyEnforcer(policyConfig, ledger);

  const config: WalletConfig = {
    enabled: true,
    chains: ['solana'],
    custodyMode: 'encrypted-hot',
    allowedTokens: ['SOL', 'USDC'],
    spendingPolicy: policyConfig,
  };

  const adapters = new Map<ChainId, IChainWalletAdapter>([['solana', adapter]]);

  const manager = new AgentWalletManager({
    masterSecret: SECRET,
    walletConfig: config,
    store,
    policyEnforcer,
    adapters,
  });

  return { manager, adapter, store, ledger, policyEnforcer };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('AgentWalletManager', () => {

  /* ── Wallet creation ───────────────────────────────────────────── */

  describe('createWallet', () => {
    it('should create a wallet with encrypted key', async () => {
      const { manager, store, adapter } = createManager();

      const wallet = await manager.createWallet(AGENT, 'solana');

      expect(wallet.agentId).toBe(AGENT);
      expect(wallet.chain).toBe('solana');
      expect(wallet.address).toBeTruthy();
      expect(wallet.encryptedKey).toBeTruthy();
      expect(wallet.keyDerivationSalt).toBeTruthy();
      expect(adapter.generateKeypair).toHaveBeenCalledOnce();
      expect(store.wallets.size).toBe(1);
    });

    it('should reject duplicate wallet for same agent+chain', async () => {
      const { manager } = createManager();

      await manager.createWallet(AGENT, 'solana');
      await expect(manager.createWallet(AGENT, 'solana')).rejects.toThrow('already has a solana wallet');
    });

    it('should store different wallets for different chains', async () => {
      const evmAdapter = createMockAdapter('ethereum');
      const solAdapter = createMockAdapter('solana');
      const store = createMemoryStore();
      const ledger = createMemoryLedger();
      const enforcer = new SpendingPolicyEnforcer(DEFAULT_SPENDING_POLICY, ledger);

      const manager = new AgentWalletManager({
        masterSecret: SECRET,
        walletConfig: { enabled: true, chains: ['solana', 'ethereum'], custodyMode: 'encrypted-hot', allowedTokens: ['SOL', 'ETH'], spendingPolicy: DEFAULT_SPENDING_POLICY },
        store,
        policyEnforcer: enforcer,
        adapters: new Map([['solana', solAdapter], ['ethereum', evmAdapter]]),
      });

      const sol = await manager.createWallet(AGENT, 'solana');
      const eth = await manager.createWallet(AGENT, 'ethereum');

      expect(sol.chain).toBe('solana');
      expect(eth.chain).toBe('ethereum');
      expect(sol.address).not.toBe(eth.address);
      expect(store.wallets.size).toBe(2);
    });
  });

  /* ── Balance queries ───────────────────────────────────────────── */

  describe('getBalance', () => {
    it('should return balance from adapter', async () => {
      const { manager } = createManager();
      await manager.createWallet(AGENT, 'solana');

      const balance = await manager.getBalance(AGENT, 'solana');
      expect(balance).toBe(1_000_000_000n);
    });

    it('should cache balance for 30s', async () => {
      const { manager, adapter } = createManager();
      await manager.createWallet(AGENT, 'solana');

      await manager.getBalance(AGENT, 'solana');
      await manager.getBalance(AGENT, 'solana');
      await manager.getBalance(AGENT, 'solana');

      expect(adapter.getBalance).toHaveBeenCalledOnce();
    });

    it('should throw for non-existent wallet', async () => {
      const { manager } = createManager();
      await expect(manager.getBalance(AGENT, 'solana')).rejects.toThrow('No solana wallet found');
    });
  });

  /* ── Spending with policy ──────────────────────────────────────── */

  describe('sendNative', () => {
    it('should send and record transaction', async () => {
      const { manager, store, adapter } = createManager();
      await manager.createWallet(AGENT, 'solana');

      const tx = await manager.sendNative(AGENT, 'solana', 'dest-addr', 500_000_000n, 5, 'transfers', 'test send');

      expect(tx.status).toBe('confirmed');
      expect(tx.txHash).toBe('tx-hash-abc123');
      expect(tx.toAddress).toBe('dest-addr');
      expect(adapter.signTransfer).toHaveBeenCalledOnce();
      expect(adapter.broadcast).toHaveBeenCalledOnce();
    });

    it('should block spend exceeding per-transaction limit', async () => {
      const { manager } = createManager({ policy: { perTransactionLimitUsd: 5 } });
      await manager.createWallet(AGENT, 'solana');

      await expect(
        manager.sendNative(AGENT, 'solana', 'dest', 1_000_000_000n, 10, 'transfers'),
      ).rejects.toThrow(SpendingPolicyViolation);
    });

    it('should throw ApprovalRequiredError for high-value transactions', async () => {
      const { manager } = createManager({ policy: { requireApprovalAboveUsd: 5 } });
      await manager.createWallet(AGENT, 'solana');

      await expect(
        manager.sendNative(AGENT, 'solana', 'dest', 500_000_000n, 10, 'transfers'),
      ).rejects.toThrow(ApprovalRequiredError);
    });

    it('should mark transaction as failed on broadcast error', async () => {
      const { manager, adapter, store } = createManager();
      await manager.createWallet(AGENT, 'solana');

      (adapter.broadcast as any).mockRejectedValueOnce(new Error('network timeout'));

      await expect(
        manager.sendNative(AGENT, 'solana', 'dest', 500_000_000n, 5, 'transfers'),
      ).rejects.toThrow('network timeout');

      // Transaction should be recorded as failed
      const wallet = await store.getWallet(AGENT, 'solana');
      const txs = await store.getTransactions(wallet!.id);
      expect(txs[0].status).toBe('failed');
    });

    it('should record spend in ledger after successful send', async () => {
      const { manager, ledger } = createManager();
      await manager.createWallet(AGENT, 'solana');

      await manager.sendNative(AGENT, 'solana', 'dest', 500_000_000n, 8, 'api_costs');

      expect(ledger.entries.length).toBe(2); // daily + monthly
      expect(ledger.entries[0].amountUsd).toBe(8);
      expect(ledger.entries[0].category).toBe('api_costs');
    });
  });

  /* ── Transaction history ───────────────────────────────────────── */

  describe('getTransactionHistory', () => {
    it('should return empty list for new wallet', async () => {
      const { manager } = createManager();
      await manager.createWallet(AGENT, 'solana');

      const history = await manager.getTransactionHistory(AGENT, 'solana');
      expect(history).toEqual([]);
    });

    it('should return transactions after sends', async () => {
      const { manager } = createManager();
      await manager.createWallet(AGENT, 'solana');

      await manager.sendNative(AGENT, 'solana', 'dest1', 100n, 1, 'transfers');
      await manager.sendNative(AGENT, 'solana', 'dest2', 200n, 2, 'transfers');

      const history = await manager.getTransactionHistory(AGENT, 'solana');
      expect(history.length).toBe(2);
    });
  });

  /* ── Error classes ─────────────────────────────────────────────── */

  describe('error types', () => {
    it('SpendingPolicyViolation should have correct name', () => {
      const err = new SpendingPolicyViolation('test reason');
      expect(err.name).toBe('SpendingPolicyViolation');
      expect(err.message).toBe('test reason');
    });

    it('ApprovalRequiredError should expose amount and category', () => {
      const err = new ApprovalRequiredError(25, 'shopping');
      expect(err.name).toBe('ApprovalRequiredError');
      expect(err.amountUsd).toBe(25);
      expect(err.category).toBe('shopping');
      expect(err.message).toContain('$25.00');
      expect(err.message).toContain('shopping');
    });
  });
});
