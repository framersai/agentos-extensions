/**
 * @fileoverview Agent-callable tool for unfreezing (resuming) a card.
 * @module wallet/tools/UnfreezeCardTool
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos/core/tools/ITool';
import type { CardManager } from '../cards/CardManager.js';

interface UnfreezeCardInput {}

interface UnfreezeCardOutput {
  state: string;
  message: string;
}

export function createUnfreezeCardTool(cardManager: CardManager): ITool<UnfreezeCardInput, UnfreezeCardOutput> {
  return {
    id: 'wallet-unfreeze-card-v1',
    name: 'unfreeze_card',
    displayName: 'Unfreeze Card',
    description:
      'Unfreeze the agent\'s virtual card, resuming normal transaction processing. '
      + 'The card must be in a PAUSED state.',
    category: 'wallet',
    version: '1.0.0',
    hasSideEffects: true,
    requiredCapabilities: ['capability:wallet', 'capability:wallet_card'],

    inputSchema: {
      type: 'object',
      properties: {},
    },

    async execute(_args: UnfreezeCardInput, context: ToolExecutionContext): Promise<ToolExecutionResult<UnfreezeCardOutput>> {
      try {
        const agentId = context.gmiId;
        await cardManager.unfreezeCard(agentId);

        return {
          success: true,
          output: {
            state: 'OPEN',
            message: 'Card has been unfrozen. Transactions are now accepted.',
          },
        };
      } catch (err: any) {
        return { success: false, error: err.message || String(err) };
      }
    },
  };
}
