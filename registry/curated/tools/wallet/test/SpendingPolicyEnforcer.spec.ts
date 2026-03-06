/**
 * @fileoverview Unit tests for SpendingPolicyEnforcer.
 *
 * Tests cover: per-tx limits, daily/monthly caps, category budgets,
 * blocked categories, address whitelists/blacklists, approval thresholds,
 * and spend recording.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SpendingPolicyEnforcer, type ISpendingLedgerStore } from '../src/SpendingPolicyEnforcer.js';
import type { SpendingPolicyConfig } from '../src/types.js';

/* ------------------------------------------------------------------ */
/*  In-memory ledger for tests                                         */
/* ------------------------------------------------------------------ */

function createTestLedger(): ISpendingLedgerStore & { entries: any[] } {
  const entries: any[] = [];
  return {
    entries,
    async sumByPeriod(agentId: string, periodKey: string) {
      return entries
        .filter(e => e.agentId === agentId && e.periodKey === periodKey)
        .reduce((sum, e) => sum + e.amountUsd, 0);
    },
    async sumByCategoryAndPeriod(agentId: string, category: string, periodKey: string) {
      return entries
        .filter(e => e.agentId === agentId && e.category === category && e.periodKey === periodKey)
        .reduce((sum, e) => sum + e.amountUsd, 0);
    },
    async insert(entry: any) {
      entries.push(entry);
    },
  };
}

const AGENT = 'test-agent-1';

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('SpendingPolicyEnforcer', () => {
  let policy: SpendingPolicyConfig;
  let ledger: ReturnType<typeof createTestLedger>;
  let enforcer: SpendingPolicyEnforcer;

  beforeEach(() => {
    policy = {
      dailyLimitUsd: 50,
      perTransactionLimitUsd: 20,
      monthlyLimitUsd: 500,
      categoryBudgets: [
        { category: 'api_costs', dailyLimitUsd: 10, monthlyLimitUsd: 100 },
      ],
      requireApprovalAboveUsd: 15,
      blockedCategories: ['defi'],
      allowedAddresses: ['0xAllowed1', '0xAllowed2'],
      blockedAddresses: ['0xBlocked1'],
    };
    ledger = createTestLedger();
    enforcer = new SpendingPolicyEnforcer(policy, ledger);
  });

  /* ── Per-transaction limit ─────────────────────────────────────── */

  describe('per-transaction limit', () => {
    it('should allow transactions within per-tx limit', async () => {
      const result = await enforcer.canSpend(AGENT, 15, 'transfers');
      expect(result.allowed).toBe(true);
    });

    it('should block transactions exceeding per-tx limit', async () => {
      const result = await enforcer.canSpend(AGENT, 25, 'transfers');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('per-transaction limit');
    });

    it('should block transaction exactly at limit + epsilon', async () => {
      const result = await enforcer.canSpend(AGENT, 20.01, 'transfers');
      expect(result.allowed).toBe(false);
    });
  });

  /* ── Daily limit ───────────────────────────────────────────────── */

  describe('daily limit', () => {
    it('should allow first transaction within daily limit', async () => {
      const result = await enforcer.canSpend(AGENT, 10, 'transfers');
      expect(result.allowed).toBe(true);
      expect(result.remainingDailyUsd).toBe(40);
    });

    it('should block when daily limit would be exceeded', async () => {
      // Pre-seed ledger with $45 of spending today
      const today = new Date().toISOString().slice(0, 10);
      ledger.entries.push({ agentId: AGENT, category: 'transfers', amountUsd: 45, periodKey: today });

      const result = await enforcer.canSpend(AGENT, 10, 'transfers');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Daily limit');
    });

    it('should allow up to remaining daily budget', async () => {
      const today = new Date().toISOString().slice(0, 10);
      ledger.entries.push({ agentId: AGENT, category: 'transfers', amountUsd: 40, periodKey: today });

      const result = await enforcer.canSpend(AGENT, 10, 'transfers');
      expect(result.allowed).toBe(true);
      expect(result.remainingDailyUsd).toBe(0);
    });
  });

  /* ── Monthly limit ─────────────────────────────────────────────── */

  describe('monthly limit', () => {
    it('should block when monthly limit would be exceeded', async () => {
      const month = new Date().toISOString().slice(0, 7);
      ledger.entries.push({ agentId: AGENT, category: 'transfers', amountUsd: 495, periodKey: month });

      const result = await enforcer.canSpend(AGENT, 10, 'transfers');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Monthly limit');
    });
  });

  /* ── Category budgets ──────────────────────────────────────────── */

  describe('category budgets', () => {
    it('should enforce daily category budget', async () => {
      const today = new Date().toISOString().slice(0, 10);
      ledger.entries.push({ agentId: AGENT, category: 'api_costs', amountUsd: 8, periodKey: today });

      const result = await enforcer.canSpend(AGENT, 5, 'api_costs');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('"api_costs" budget');
    });

    it('should enforce monthly category budget', async () => {
      const month = new Date().toISOString().slice(0, 7);
      ledger.entries.push({ agentId: AGENT, category: 'api_costs', amountUsd: 98, periodKey: month });

      const result = await enforcer.canSpend(AGENT, 5, 'api_costs');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('"api_costs" budget');
    });

    it('should allow categories without specific budgets', async () => {
      const result = await enforcer.canSpend(AGENT, 15, 'shopping');
      expect(result.allowed).toBe(true);
    });
  });

  /* ── Blocked categories ────────────────────────────────────────── */

  describe('blocked categories', () => {
    it('should block spend in blocked category', async () => {
      const result = await enforcer.canSpend(AGENT, 1, 'defi');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('blocked');
    });

    it('should allow spend in non-blocked category', async () => {
      const result = await enforcer.canSpend(AGENT, 5, 'transfers');
      expect(result.allowed).toBe(true);
    });
  });

  /* ── Address whitelist/blacklist ────────────────────────────────── */

  describe('address restrictions', () => {
    it('should block blacklisted address', async () => {
      const result = await enforcer.canSpend(AGENT, 5, 'transfers', '0xBlocked1');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('blocked');
    });

    it('should allow whitelisted address', async () => {
      const result = await enforcer.canSpend(AGENT, 5, 'transfers', '0xAllowed1');
      expect(result.allowed).toBe(true);
    });

    it('should block address not in whitelist', async () => {
      const result = await enforcer.canSpend(AGENT, 5, 'transfers', '0xRandom');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not in the allowed list');
    });

    it('should allow any address when no whitelist is configured', async () => {
      policy.allowedAddresses = undefined;
      enforcer = new SpendingPolicyEnforcer(policy, ledger);

      const result = await enforcer.canSpend(AGENT, 5, 'transfers', '0xAnything');
      expect(result.allowed).toBe(true);
    });
  });

  /* ── Approval threshold ────────────────────────────────────────── */

  describe('approval threshold', () => {
    it('should flag requiresApproval for amounts above threshold', async () => {
      const result = await enforcer.canSpend(AGENT, 18, 'transfers', '0xAllowed1');
      expect(result.allowed).toBe(true);
      expect(result.requiresApproval).toBe(true);
    });

    it('should not flag requiresApproval for amounts at or below threshold', async () => {
      const result = await enforcer.canSpend(AGENT, 15, 'transfers', '0xAllowed1');
      expect(result.allowed).toBe(true);
      expect(result.requiresApproval).toBe(false);
    });
  });

  /* ── Spend recording ───────────────────────────────────────────── */

  describe('recordSpend', () => {
    it('should insert daily and monthly entries into the ledger', async () => {
      await enforcer.recordSpend(AGENT, 10, 'api_costs');

      // Should produce 2 entries: one daily, one monthly
      expect(ledger.entries.length).toBe(2);
      expect(ledger.entries[0].periodKey).toMatch(/^\d{4}-\d{2}-\d{2}$/); // YYYY-MM-DD
      expect(ledger.entries[1].periodKey).toMatch(/^\d{4}-\d{2}$/);       // YYYY-MM
      expect(ledger.entries[0].amountUsd).toBe(10);
      expect(ledger.entries[0].category).toBe('api_costs');
    });

    it('should accumulate across multiple spends', async () => {
      await enforcer.recordSpend(AGENT, 5, 'transfers');
      await enforcer.recordSpend(AGENT, 8, 'transfers');

      const today = new Date().toISOString().slice(0, 10);
      const sum = await ledger.sumByPeriod(AGENT, today);
      expect(sum).toBe(13);
    });
  });

  /* ── Check order priority ──────────────────────────────────────── */

  describe('check order', () => {
    it('should block on category before checking limits', async () => {
      const result = await enforcer.canSpend(AGENT, 1, 'defi', '0xAllowed1');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('blocked');
    });

    it('should block on blacklist before checking limits', async () => {
      const result = await enforcer.canSpend(AGENT, 1, 'transfers', '0xBlocked1');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('blocked');
    });
  });
});
