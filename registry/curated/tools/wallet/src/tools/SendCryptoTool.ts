/**
 * @fileoverview Agent-callable tool for sending crypto with spending policy enforcement.
 * @module wunderland/wallet/tools/SendCryptoTool
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos/core/tools/ITool';
import type { AgentWalletManager } from '../AgentWalletManager.js';
import type { ChainId, SpendCategory, TokenSymbol } from '../types.js';

interface SendCryptoInput {
  /** Destination address. */
  to: string;
  /** Amount in human-readable units (e.g. "0.5" SOL, "10" USDC). */
  amount: string;
  /** Chain to send on. Defaults to 'solana'. */
  chain?: ChainId;
  /** Token to send. Defaults to native (SOL/ETH). */
  token?: TokenSymbol;
  /** Spending category for budget tracking. Defaults to 'transfers'. */
  category?: SpendCategory;
  /** Optional description for the transaction log. */
  description?: string;
}

interface SendCryptoOutput {
  txHash: string;
  chain: ChainId;
  fromAddress: string;
  toAddress: string;
  amount: string;
  token: string;
  status: string;
}

const DECIMALS: Record<string, number> = {
  SOL: 9,
  ETH: 18,
  USDC: 6,
  USDT: 6,
};

const DEFAULT_REFERENCE_USD_PRICES: Record<TokenSymbol, number> = {
  SOL: 1,
  ETH: 1,
  USDC: 1,
  USDT: 1,
};

function getReferenceUsdPrice(token: TokenSymbol): number {
  const envKey = `WALLET_PRICE_${token}_USD`;
  const override = Number.parseFloat(process.env[envKey] || '');
  if (Number.isFinite(override) && override > 0) {
    return override;
  }
  return DEFAULT_REFERENCE_USD_PRICES[token] ?? 1;
}

function parseAmountToRaw(amount: string, decimals: number): bigint {
  const parts = amount.split('.');
  const intPart = parts[0] || '0';
  const fracPart = (parts[1] || '').padEnd(decimals, '0').slice(0, decimals);
  return BigInt(intPart) * 10n ** BigInt(decimals) + BigInt(fracPart);
}

export function createSendCryptoTool(walletManager: AgentWalletManager): ITool<SendCryptoInput, SendCryptoOutput> {
  return {
    id: 'wallet-send-crypto-v1',
    name: 'send_crypto',
    displayName: 'Send Crypto',
    description:
      'Send cryptocurrency from the agent\'s personal wallet to a destination address. '
      + 'Enforces spending limits, category budgets, and address whitelists configured by the user. '
      + 'Transactions above the approval threshold require explicit human confirmation. '
      + 'Supports SOL, ETH (on Ethereum/Base), USDC, and USDT.',
    category: 'wallet',
    version: '1.0.0',
    hasSideEffects: true,
    requiredCapabilities: ['capability:wallet', 'capability:wallet_send'],

    inputSchema: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Destination wallet address.',
        },
        amount: {
          type: 'string',
          description: 'Amount to send in human-readable units (e.g. "0.5" for 0.5 SOL).',
        },
        chain: {
          type: 'string',
          enum: ['solana', 'ethereum', 'base', 'polygon'],
          description: 'Blockchain to use. Defaults to solana.',
        },
        token: {
          type: 'string',
          enum: ['SOL', 'ETH', 'USDC', 'USDT'],
          description: 'Token to send. Defaults to native token (SOL/ETH).',
        },
        category: {
          type: 'string',
          enum: [
            'api_costs', 'web_services', 'shopping', 'subscriptions',
            'transfers', 'defi', 'dining', 'travel', 'entertainment',
            'utilities', 'other',
          ],
          description: 'Spending category for budget tracking. Defaults to "transfers".',
        },
        description: {
          type: 'string',
          description: 'Optional note for the transaction log.',
        },
      },
      required: ['to', 'amount'],
    },

    async execute(args: SendCryptoInput, context: ToolExecutionContext): Promise<ToolExecutionResult<SendCryptoOutput>> {
      try {
        const chain: ChainId = args.chain || 'solana';
        const nativeToken: TokenSymbol = chain === 'solana' ? 'SOL' : 'ETH';
        const token: TokenSymbol = args.token || nativeToken;
        const category: SpendCategory = args.category || 'transfers';
        const agentId = context.gmiId;
        const decimals = DECIMALS[token] || 18;

        // Validate amount
        const amountNum = parseFloat(args.amount);
        if (isNaN(amountNum) || amountNum <= 0) {
          return { success: false, error: `Invalid amount: "${args.amount}". Must be a positive number.` };
        }

        const amountRaw = parseAmountToRaw(args.amount, decimals);

        // Use configurable reference prices until a live oracle/provider is wired.
        const estimatedUsd = amountNum * getReferenceUsdPrice(token);

        // Only native sends are implemented in Phase 1
        if (token !== nativeToken) {
          return {
            success: false,
            error: `Token transfers (${token}) are not yet supported. Only native ${nativeToken} sends are available in this version.`,
          };
        }

        const txRecord = await walletManager.sendNative(
          agentId,
          chain,
          args.to,
          amountRaw,
          estimatedUsd,
          category,
          args.description,
        );

        return {
          success: true,
          output: {
            txHash: txRecord.txHash || '',
            chain,
            fromAddress: txRecord.fromAddress || '',
            toAddress: args.to,
            amount: args.amount,
            token,
            status: txRecord.status,
          },
        };
      } catch (err: any) {
        // Surface spending policy violations cleanly
        if (err.name === 'SpendingPolicyViolation' || err.name === 'ApprovalRequiredError') {
          return {
            success: false,
            error: err.message,
            details: {
              policyViolation: true,
              requiresApproval: err.name === 'ApprovalRequiredError',
            },
          };
        }
        return { success: false, error: err.message || String(err) };
      }
    },
  };
}
