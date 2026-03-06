/**
 * @fileoverview Agent-callable tool for checking wallet balances.
 * @module wunderland/wallet/tools/CheckBalanceTool
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos/core/tools/ITool';
import type { AgentWalletManager } from '../AgentWalletManager.js';
import type { ChainId, TokenSymbol } from '../types.js';

interface CheckBalanceInput {
  /** Chain to check. Defaults to 'solana'. */
  chain?: ChainId;
  /** Token symbol. If omitted, returns native token balance. */
  token?: TokenSymbol;
}

interface BalanceOutput {
  chain: ChainId;
  address: string;
  token: string;
  balanceRaw: string;
  balanceFormatted: string;
}

/** Well-known SPL / ERC-20 mint addresses for balance lookups. */
const TOKEN_MINTS: Record<string, Record<string, string>> = {
  solana: {
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  },
  ethereum: {
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  },
  base: {
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    USDT: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
  },
  polygon: {
    USDC: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
  },
};

const DECIMALS: Record<string, number> = {
  SOL: 9,
  ETH: 18,
  USDC: 6,
  USDT: 6,
};

function formatBalance(raw: bigint, decimals: number): string {
  const str = raw.toString().padStart(decimals + 1, '0');
  const intPart = str.slice(0, str.length - decimals) || '0';
  const fracPart = str.slice(str.length - decimals);
  // Trim trailing zeros but keep at least 2 decimal places
  const trimmed = fracPart.replace(/0+$/, '').padEnd(2, '0');
  return `${intPart}.${trimmed}`;
}

export function createCheckBalanceTool(walletManager: AgentWalletManager): ITool<CheckBalanceInput, BalanceOutput> {
  return {
    id: 'wallet-check-balance-v1',
    name: 'check_wallet_balance',
    displayName: 'Check Wallet Balance',
    description:
      'Check the balance of the agent\'s personal wallet on a given blockchain. '
      + 'Returns the balance in both raw units and human-readable format. '
      + 'Supports SOL (Solana), ETH (Ethereum/Base), USDC, and USDT.',
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
        token: {
          type: 'string',
          enum: ['SOL', 'ETH', 'USDC', 'USDT'],
          description: 'Token to check. Omit for native token (SOL/ETH).',
        },
      },
    },

    async execute(args: CheckBalanceInput, context: ToolExecutionContext): Promise<ToolExecutionResult<BalanceOutput>> {
      try {
        const chain: ChainId = args.chain || 'solana';
        const agentId = context.gmiId;

        const wallet = await walletManager.getWallet(agentId, chain);
        if (!wallet) {
          return {
            success: false,
            error: `No ${chain} wallet found. Create one first with the wallet setup.`,
          };
        }

        let balanceRaw: bigint;
        let tokenLabel: string;

        const nativeToken = chain === 'solana' ? 'SOL' : 'ETH';

        if (!args.token || args.token === nativeToken) {
          // Native token balance
          balanceRaw = await walletManager.getBalance(agentId, chain);
          tokenLabel = nativeToken;
        } else {
          // Token balance
          const mint = TOKEN_MINTS[chain]?.[args.token];
          if (!mint) {
            return {
              success: false,
              error: `Token ${args.token} is not supported on ${chain}.`,
            };
          }
          balanceRaw = await walletManager.getTokenBalance(agentId, chain, mint);
          tokenLabel = args.token;
        }

        const decimals = DECIMALS[tokenLabel] || 18;
        const formatted = formatBalance(balanceRaw, decimals);

        return {
          success: true,
          output: {
            chain,
            address: wallet.address,
            token: tokenLabel,
            balanceRaw: balanceRaw.toString(),
            balanceFormatted: `${formatted} ${tokenLabel}`,
          },
        };
      } catch (err: any) {
        return { success: false, error: err.message || String(err) };
      }
    },
  };
}
