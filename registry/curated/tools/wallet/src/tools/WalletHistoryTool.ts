/**
 * @fileoverview Agent-callable tool for viewing wallet transaction history.
 * @module wunderland/wallet/tools/WalletHistoryTool
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos/core/tools/ITool';
import type { AgentWalletManager } from '../AgentWalletManager.js';
import type { ChainId, WalletTransactionRecord } from '../types.js';

interface WalletHistoryInput {
  /** Chain to query. Defaults to 'solana'. */
  chain?: ChainId;
  /** Max number of transactions to return. Defaults to 10. */
  limit?: number;
}

interface TransactionSummary {
  id: string;
  txHash?: string;
  direction: string;
  to?: string;
  from?: string;
  amount: string;
  token: string;
  category?: string;
  status: string;
  date: string;
  description?: string;
}

interface WalletHistoryOutput {
  chain: ChainId;
  address: string;
  transactions: TransactionSummary[];
  totalCount: number;
}

export function createWalletHistoryTool(walletManager: AgentWalletManager): ITool<WalletHistoryInput, WalletHistoryOutput> {
  return {
    id: 'wallet-transaction-history-v1',
    name: 'wallet_transaction_history',
    displayName: 'Wallet Transaction History',
    description:
      'View recent transaction history for the agent\'s personal wallet. '
      + 'Shows inbound and outbound transfers with amounts, status, and categories.',
    category: 'wallet',
    version: '1.0.0',
    hasSideEffects: false,
    requiredCapabilities: ['capability:wallet'],

    inputSchema: {
      type: 'object',
      properties: {
        chain: {
          type: 'string',
          enum: ['solana', 'ethereum', 'base', 'polygon'],
          description: 'Blockchain to query. Defaults to solana.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 50,
          description: 'Max number of transactions to return. Defaults to 10.',
        },
      },
    },

    async execute(args: WalletHistoryInput, context: ToolExecutionContext): Promise<ToolExecutionResult<WalletHistoryOutput>> {
      try {
        const chain: ChainId = args.chain || 'solana';
        const limit = args.limit || 10;
        const agentId = context.gmiId;

        const wallet = await walletManager.getWallet(agentId, chain);
        if (!wallet) {
          return {
            success: false,
            error: `No ${chain} wallet found for this agent.`,
          };
        }

        const records = await walletManager.getTransactionHistory(agentId, chain, limit);

        const transactions: TransactionSummary[] = records.map((tx: WalletTransactionRecord) => ({
          id: tx.id,
          txHash: tx.txHash,
          direction: tx.direction,
          to: tx.toAddress,
          from: tx.fromAddress,
          amount: tx.amountUsd != null ? `$${tx.amountUsd.toFixed(2)}` : tx.amountRaw,
          token: tx.token,
          category: tx.category,
          status: tx.status,
          date: new Date(tx.createdAt).toISOString(),
          description: tx.description,
        }));

        return {
          success: true,
          output: {
            chain,
            address: wallet.address,
            transactions,
            totalCount: transactions.length,
          },
        };
      } catch (err: any) {
        return { success: false, error: err.message || String(err) };
      }
    },
  };
}
