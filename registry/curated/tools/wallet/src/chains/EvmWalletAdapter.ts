/**
 * @fileoverview EVM chain adapter for the Agent Personal Wallet.
 *
 * Supports Ethereum, Base, and Polygon via ethers.js v6 (dynamic import).
 *
 * @module wunderland/wallet/chains/EvmWalletAdapter
 */

import type { ChainId, IChainWalletAdapter, WalletTxStatus } from '../types.js';

// Lazily resolved ethers module (dynamic import — not a hard dependency)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _ethers: any = null;

async function getEthers(): Promise<any> {
  if (!_ethers) {
    try {
      _ethers = await import('ethers' as string);
    } catch {
      throw new Error(
        'Missing dependency: ethers is required for EVM wallet support. '
        + 'Install it with: npm install ethers',
      );
    }
  }
  return _ethers;
}

/** Default RPC endpoints per chain. */
const DEFAULT_RPC: Record<string, string> = {
  ethereum: 'https://eth.llamarpc.com',
  base: 'https://mainnet.base.org',
  polygon: 'https://polygon-rpc.com',
};

/** Well-known ERC-20 addresses per chain. */
export const KNOWN_TOKENS: Record<string, Record<string, string>> = {
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

/** Minimal ERC-20 ABI for balance + transfer. */
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
];

export interface EvmWalletAdapterOptions {
  chain: ChainId;
  rpcUrl?: string;
}

export class EvmWalletAdapter implements IChainWalletAdapter {
  readonly chain: ChainId;
  private rpcUrl: string;

  constructor(opts: EvmWalletAdapterOptions) {
    this.chain = opts.chain;
    this.rpcUrl = opts.rpcUrl || DEFAULT_RPC[opts.chain] || DEFAULT_RPC.ethereum;
  }

  async generateKeypair(): Promise<{ publicKey: string; secretKey: Uint8Array }> {
    const { Wallet } = await getEthers();
    const wallet = Wallet.createRandom();
    // ethers v6 returns hex private key — convert to Uint8Array
    const privKeyHex = wallet.privateKey.slice(2); // remove 0x
    const secretKey = hexToBytes(privKeyHex);
    return {
      publicKey: wallet.address,
      secretKey,
    };
  }

  async getBalance(address: string): Promise<bigint> {
    const { JsonRpcProvider } = await getEthers();
    const provider = new JsonRpcProvider(this.rpcUrl);
    return await provider.getBalance(address);
  }

  async getTokenBalance(address: string, tokenAddress: string): Promise<bigint> {
    const { JsonRpcProvider, Contract } = await getEthers();
    const provider = new JsonRpcProvider(this.rpcUrl);
    const contract = new Contract(tokenAddress, ERC20_ABI, provider);
    const balance: bigint = await contract.balanceOf(address);
    return balance;
  }

  async signTransfer(
    secretKey: Uint8Array,
    to: string,
    amountRaw: bigint,
  ): Promise<Uint8Array> {
    const { JsonRpcProvider, Wallet } = await getEthers();
    const provider = new JsonRpcProvider(this.rpcUrl);
    const wallet = new Wallet(bytesToHex(secretKey), provider);

    const tx = await wallet.populateTransaction({
      to,
      value: amountRaw,
    });

    const signed = await wallet.signTransaction(tx);
    return hexToBytes(signed.slice(2));
  }

  async signTokenTransfer(
    secretKey: Uint8Array,
    to: string,
    tokenAddress: string,
    amountRaw: bigint,
  ): Promise<Uint8Array> {
    const { JsonRpcProvider, Wallet, Contract } = await getEthers();
    const provider = new JsonRpcProvider(this.rpcUrl);
    const wallet = new Wallet(bytesToHex(secretKey), provider);
    const contract = new Contract(tokenAddress, ERC20_ABI, wallet);

    const tx = await contract.transfer.populateTransaction(to, amountRaw);
    const populated = await wallet.populateTransaction(tx);
    const signed = await wallet.signTransaction(populated);
    return hexToBytes(signed.slice(2));
  }

  async broadcast(signedTx: Uint8Array): Promise<string> {
    const { JsonRpcProvider } = await getEthers();
    const provider = new JsonRpcProvider(this.rpcUrl);
    const txResponse = await provider.broadcastTransaction('0x' + bytesToHex(signedTx));
    await txResponse.wait(1);
    return txResponse.hash;
  }

  async getTransactionStatus(txHash: string): Promise<WalletTxStatus> {
    const { JsonRpcProvider } = await getEthers();
    const provider = new JsonRpcProvider(this.rpcUrl);
    const receipt = await provider.getTransactionReceipt(txHash);

    if (!receipt) return 'pending';
    if (receipt.status === 1) return 'confirmed';
    return 'failed';
  }
}

// ---------------------------------------------------------------------------
// Hex <-> bytes helpers
// ---------------------------------------------------------------------------

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
