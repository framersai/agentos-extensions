// @ts-nocheck
/**
 * @fileoverview Agent-callable tool for issuing a virtual card.
 * @module wallet/tools/IssueCardTool
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos/core/tools/ITool';
import type { CardManager } from '../cards/CardManager.js';

interface IssueCardInput {
  /** Optional label for the card. */
  memo?: string;
  /** Monthly spending limit in USD. Uses default if omitted. */
  spendLimitUsd?: number;
}

interface IssueCardOutput {
  cardId: string;
  last4: string;
  state: string;
  spendLimitUsd: number;
  network: string;
}

export function createIssueCardTool(cardManager: CardManager): ITool<IssueCardInput, IssueCardOutput> {
  return {
    id: 'wallet-issue-card-v1',
    name: 'issue_virtual_card',
    displayName: 'Issue Virtual Card',
    description:
      'Issue a new virtual debit card for the agent. The card can be used for online purchases, '
      + 'subscriptions, and API payments. Spending limits and category restrictions from the wallet '
      + 'spending policy are automatically enforced at the card network level.',
    category: 'wallet',
    version: '1.0.0',
    hasSideEffects: true,
    requiredCapabilities: ['capability:wallet', 'capability:wallet_card'],

    inputSchema: {
      type: 'object',
      properties: {
        memo: {
          type: 'string',
          description: 'Optional label for the card (e.g. "API subscriptions").',
        },
        spendLimitUsd: {
          type: 'number',
          description: 'Monthly spending limit in USD. Uses the default from config if omitted.',
        },
      },
    },

    async execute(args: IssueCardInput, context: ToolExecutionContext): Promise<ToolExecutionResult<IssueCardOutput>> {
      try {
        const agentId = context.gmiId;
        const card = await cardManager.issueCard(agentId, {
          memo: args.memo,
          spendLimitUsd: args.spendLimitUsd,
        });

        return {
          success: true,
          output: {
            cardId: card.id,
            last4: card.last4,
            state: card.state,
            spendLimitUsd: card.spendLimitUsd,
            network: card.network,
          },
        };
      } catch (err: any) {
        return { success: false, error: err.message || String(err) };
      }
    },
  };
}
