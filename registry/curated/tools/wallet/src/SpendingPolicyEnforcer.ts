/**
 * @fileoverview Pre-transaction guardrail that enforces spending limits,
 * category budgets, address whitelists/blacklists, and approval thresholds.
 *
 * All amounts are in USD. The enforcer tracks running totals via a
 * simple ledger interface — callers provide the persistence layer.
 *
 * @module wunderland/wallet/SpendingPolicyEnforcer
 */

import type {
  SpendCategory,
  SpendCheckResult,
  SpendingLedgerEntry,
  SpendingPolicyConfig,
} from './types.js';

/** Minimal interface for querying the spending ledger (DB-agnostic). */
export interface ISpendingLedgerStore {
  /** Sum all spending for the agent in the given period key (e.g. '2026-03-05'). */
  sumByPeriod(agentId: string, periodKey: string): Promise<number>;
  /** Sum spending for a specific category in the given period key. */
  sumByCategoryAndPeriod(agentId: string, category: SpendCategory, periodKey: string): Promise<number>;
  /** Record a new ledger entry after a successful spend. */
  insert(entry: SpendingLedgerEntry): Promise<void>;
}

export class SpendingPolicyEnforcer {
  constructor(
    private readonly policy: SpendingPolicyConfig,
    private readonly ledger: ISpendingLedgerStore,
  ) {}

  /**
   * Check whether a proposed spend is allowed under the current policy.
   */
  async canSpend(
    agentId: string,
    amountUsd: number,
    category: SpendCategory,
    recipientAddress?: string,
  ): Promise<SpendCheckResult> {
    // 1. Blocked category check
    if (this.policy.blockedCategories.includes(category)) {
      return { allowed: false, reason: `Category "${category}" is blocked by spending policy.` };
    }

    // 2. Address blacklist check
    if (recipientAddress && this.policy.blockedAddresses?.includes(recipientAddress)) {
      return { allowed: false, reason: `Recipient address is blocked.` };
    }

    // 3. Address whitelist check (if whitelist is set, only whitelisted addresses are allowed)
    if (
      recipientAddress
      && this.policy.allowedAddresses
      && this.policy.allowedAddresses.length > 0
      && !this.policy.allowedAddresses.includes(recipientAddress)
    ) {
      return { allowed: false, reason: `Recipient address is not in the allowed list.` };
    }

    // 4. Per-transaction limit
    if (amountUsd > this.policy.perTransactionLimitUsd) {
      return {
        allowed: false,
        reason: `Amount $${amountUsd.toFixed(2)} exceeds per-transaction limit of $${this.policy.perTransactionLimitUsd.toFixed(2)}.`,
      };
    }

    const today = getDailyKey();
    const month = getMonthlyKey();

    // 5. Daily global limit
    const dailySpent = await this.ledger.sumByPeriod(agentId, today);
    const remainingDailyUsd = this.policy.dailyLimitUsd - dailySpent;
    if (amountUsd > remainingDailyUsd) {
      return {
        allowed: false,
        reason: `Daily limit reached. Spent $${dailySpent.toFixed(2)} of $${this.policy.dailyLimitUsd.toFixed(2)} today.`,
        remainingDailyUsd: Math.max(0, remainingDailyUsd),
      };
    }

    // 6. Monthly global limit
    const monthlySpent = await this.ledger.sumByPeriod(agentId, month);
    const remainingMonthlyUsd = this.policy.monthlyLimitUsd - monthlySpent;
    if (amountUsd > remainingMonthlyUsd) {
      return {
        allowed: false,
        reason: `Monthly limit reached. Spent $${monthlySpent.toFixed(2)} of $${this.policy.monthlyLimitUsd.toFixed(2)} this month.`,
        remainingMonthlyUsd: Math.max(0, remainingMonthlyUsd),
      };
    }

    // 7. Per-category budget check
    const catBudget = this.policy.categoryBudgets.find((b) => b.category === category);
    if (catBudget) {
      const catDailySpent = await this.ledger.sumByCategoryAndPeriod(agentId, category, today);
      if (amountUsd > catBudget.dailyLimitUsd - catDailySpent) {
        return {
          allowed: false,
          reason: `Daily "${category}" budget exceeded. Spent $${catDailySpent.toFixed(2)} of $${catBudget.dailyLimitUsd.toFixed(2)}.`,
        };
      }
      const catMonthlySpent = await this.ledger.sumByCategoryAndPeriod(agentId, category, month);
      if (amountUsd > catBudget.monthlyLimitUsd - catMonthlySpent) {
        return {
          allowed: false,
          reason: `Monthly "${category}" budget exceeded. Spent $${catMonthlySpent.toFixed(2)} of $${catBudget.monthlyLimitUsd.toFixed(2)}.`,
        };
      }
    }

    // 8. Human approval threshold
    const requiresApproval = amountUsd > this.policy.requireApprovalAboveUsd;

    return {
      allowed: true,
      requiresApproval,
      remainingDailyUsd: remainingDailyUsd - amountUsd,
      remainingMonthlyUsd: remainingMonthlyUsd - amountUsd,
    };
  }

  /**
   * Record a completed spend in the ledger (call after successful tx).
   */
  async recordSpend(
    agentId: string,
    amountUsd: number,
    category: SpendCategory,
  ): Promise<void> {
    const now = Date.now();
    const dailyKey = getDailyKey();
    const monthlyKey = getMonthlyKey();

    // Record both daily and monthly entries
    await this.ledger.insert({
      id: `spend-${agentId}-${now}`,
      agentId,
      category,
      amountUsd,
      periodKey: dailyKey,
      createdAt: now,
    });
    await this.ledger.insert({
      id: `spend-${agentId}-${now}-m`,
      agentId,
      category,
      amountUsd,
      periodKey: monthlyKey,
      createdAt: now,
    });
  }
}

// ---------------------------------------------------------------------------
// Date key helpers
// ---------------------------------------------------------------------------

function getDailyKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function getMonthlyKey(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}
