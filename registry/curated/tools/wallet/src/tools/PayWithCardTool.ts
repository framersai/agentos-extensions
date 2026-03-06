/**
 * @fileoverview Agent-callable tool for retrieving card details for online payments.
 *
 * Returns sensitive card details (PAN, CVV, expiry) so the agent can fill
 * online checkout forms. Enforces spending policy before revealing details.
 *
 * @module wallet/tools/PayWithCardTool
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos/core/tools/ITool';
import type { CardManager } from '../cards/CardManager.js';
import type { SpendCategory } from '../types.js';

interface PayWithCardInput {
  /** Estimated transaction amount in USD. Used for spending policy pre-check. */
  estimatedAmountUsd?: number;
  /** Spending category for budget tracking. Defaults to 'shopping'. */
  category?: SpendCategory;
  /** Description of what the payment is for. */
  description?: string;
}

interface PayWithCardOutput {
  last4: string;
  pan: string;
  cvv: string;
  expMonth: string;
  expYear: string;
}

export function createPayWithCardTool(cardManager: CardManager): ITool<PayWithCardInput, PayWithCardOutput> {
  return {
    id: 'wallet-pay-with-card-v1',
    name: 'pay_with_card',
    displayName: 'Pay With Card',
    description:
      'Retrieve the agent\'s virtual card details (card number, CVV, expiry) to make an online payment. '
      + 'If an estimated amount is provided, spending policy is checked before revealing card details. '
      + 'Use this when filling checkout forms on websites or paying for API services.',
    category: 'wallet',
    version: '1.0.0',
    hasSideEffects: true,
    requiredCapabilities: ['capability:wallet', 'capability:wallet_card', 'capability:wallet_card_pay'],

    inputSchema: {
      type: 'object',
      properties: {
        estimatedAmountUsd: {
          type: 'number',
          description: 'Estimated transaction amount in USD for spending policy pre-check.',
        },
        category: {
          type: 'string',
          enum: [
            'api_costs', 'web_services', 'shopping', 'subscriptions',
            'transfers', 'defi', 'dining', 'travel', 'entertainment',
            'utilities', 'other',
          ],
          description: 'Spending category for budget tracking. Defaults to "shopping".',
        },
        description: {
          type: 'string',
          description: 'What the payment is for (logged for audit trail).',
        },
      },
    },

    async execute(args: PayWithCardInput, context: ToolExecutionContext): Promise<ToolExecutionResult<PayWithCardOutput>> {
      try {
        const agentId = context.gmiId;
        const category: SpendCategory = args.category || 'shopping';

        const details = await cardManager.getCardDetails(
          agentId,
          args.estimatedAmountUsd,
          category,
        );

        if (!details.pan) {
          return {
            success: false,
            error: 'Card details not available. The card provider may not support PAN retrieval in this environment.',
          };
        }

        return {
          success: true,
          output: {
            last4: details.last4,
            pan: details.pan,
            cvv: details.cvv,
            expMonth: details.expMonth,
            expYear: details.expYear,
          },
        };
      } catch (err: any) {
        if (err.name === 'CardSpendingBlockedError') {
          return {
            success: false,
            error: err.message,
            details: { policyViolation: true },
          };
        }
        return { success: false, error: err.message || String(err) };
      }
    },
  };
}
