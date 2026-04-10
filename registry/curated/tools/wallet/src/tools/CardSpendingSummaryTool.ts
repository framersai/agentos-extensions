// @ts-nocheck
/**
 * @fileoverview Agent-callable tool for card spending breakdown.
 * @module wallet/tools/CardSpendingSummaryTool
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos/core/tools/ITool';
import type { CardManager } from '../cards/CardManager.js';
import type { SpendingSummary } from '../cards/types.js';

interface SpendingSummaryInput {
  /** Time period: 'day' or 'month'. Defaults to 'month'. */
  period?: 'day' | 'month';
}

export function createCardSpendingSummaryTool(cardManager: CardManager): ITool<SpendingSummaryInput, SpendingSummary> {
  return {
    id: 'wallet-card-spending-summary-v1',
    name: 'card_spending_summary',
    displayName: 'Card Spending Summary',
    description:
      'Get a spending breakdown for the agent\'s virtual card, grouped by category '
      + '(dining, shopping, subscriptions, etc.). Shows daily or monthly totals.',
    category: 'wallet',
    version: '1.0.0',
    hasSideEffects: false,
    requiredCapabilities: ['capability:wallet', 'capability:wallet_card'],

    inputSchema: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: ['day', 'month'],
          description: 'Time period for the summary. Defaults to "month".',
        },
      },
    },

    async execute(args: SpendingSummaryInput, context: ToolExecutionContext): Promise<ToolExecutionResult<SpendingSummary>> {
      try {
        const agentId = context.gmiId;
        const period = args.period || 'month';
        const summary = await cardManager.getSpendingSummary(agentId, period);

        return { success: true, output: summary };
      } catch (err: any) {
        return { success: false, error: err.message || String(err) };
      }
    },
  };
}
