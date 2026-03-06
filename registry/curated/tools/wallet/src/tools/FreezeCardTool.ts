/**
 * @fileoverview Agent-callable tool for freezing (pausing) a card.
 * @module wallet/tools/FreezeCardTool
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos/core/tools/ITool';
import type { CardManager } from '../cards/CardManager.js';

interface FreezeCardInput {}

interface FreezeCardOutput {
  state: string;
  message: string;
}

export function createFreezeCardTool(cardManager: CardManager): ITool<FreezeCardInput, FreezeCardOutput> {
  return {
    id: 'wallet-freeze-card-v1',
    name: 'freeze_card',
    displayName: 'Freeze Card',
    description:
      'Temporarily freeze the agent\'s virtual card. All transactions will be declined until '
      + 'the card is unfrozen. Useful when suspicious activity is detected or to pause spending.',
    category: 'wallet',
    version: '1.0.0',
    hasSideEffects: true,
    requiredCapabilities: ['capability:wallet', 'capability:wallet_card'],

    inputSchema: {
      type: 'object',
      properties: {},
    },

    async execute(_args: FreezeCardInput, context: ToolExecutionContext): Promise<ToolExecutionResult<FreezeCardOutput>> {
      try {
        const agentId = context.gmiId;
        await cardManager.freezeCard(agentId);

        return {
          success: true,
          output: {
            state: 'PAUSED',
            message: 'Card has been frozen. All transactions will be declined until unfrozen.',
          },
        };
      } catch (err: any) {
        return { success: false, error: err.message || String(err) };
      }
    },
  };
}
