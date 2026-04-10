// @ts-nocheck
/**
 * @fileoverview Agent-callable tool for checking card status.
 * @module wallet/tools/CardStatusTool
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos/core/tools/ITool';
import type { CardManager } from '../cards/CardManager.js';

interface CardStatusInput {}

interface CardStatusOutput {
  cardId: string;
  last4: string;
  state: string;
  cardType: string;
  spendLimitUsd: number;
  spendLimitDuration: string;
  network: string;
  memo?: string;
}

export function createCardStatusTool(cardManager: CardManager): ITool<CardStatusInput, CardStatusOutput> {
  return {
    id: 'wallet-card-status-v1',
    name: 'card_status',
    displayName: 'Card Status',
    description:
      'Get the current status of the agent\'s virtual card, including state (OPEN/PAUSED/CLOSED), '
      + 'spending limit, and card type.',
    category: 'wallet',
    version: '1.0.0',
    hasSideEffects: false,
    requiredCapabilities: ['capability:wallet', 'capability:wallet_card'],

    inputSchema: {
      type: 'object',
      properties: {},
    },

    async execute(_args: CardStatusInput, context: ToolExecutionContext): Promise<ToolExecutionResult<CardStatusOutput>> {
      try {
        const agentId = context.gmiId;
        const card = await cardManager.getCard(agentId);

        if (!card) {
          return { success: false, error: 'No card found. Issue one first with issue_virtual_card.' };
        }

        return {
          success: true,
          output: {
            cardId: card.id,
            last4: card.last4,
            state: card.state,
            cardType: card.cardType,
            spendLimitUsd: card.spendLimitUsd,
            spendLimitDuration: card.spendLimitDuration,
            network: card.network,
            memo: card.memo,
          },
        };
      } catch (err: any) {
        return { success: false, error: err.message || String(err) };
      }
    },
  };
}
