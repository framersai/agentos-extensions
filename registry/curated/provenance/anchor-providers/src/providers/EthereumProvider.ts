// @ts-nocheck
/**
 * @file EthereumProvider.ts
 * @description Ethereum on-chain anchor provider.
 *
 * `publish()` writes the SHA-256 of the canonical anchor as calldata on
 * an Ethereum transaction so the anchor becomes inseparable from a
 * specific block (and via the block, a specific point in time). Two
 * modes:
 *
 *   1. **Self-transfer with calldata** (default when `contractAddress`
 *      is unset): the signer sends 0 wei to itself with the anchor hash
 *      packed into the `data` field. Cheap, no contract needed.
 *   2. **Contract anchor** (when `contractAddress` is set): an ABI call
 *      to `anchor(bytes32 merkleRoot)` so on-chain consumers can filter
 *      / index anchor events.
 *
 * `verify()` fetches the transaction's receipt, recovers the calldata,
 * and confirms it matches the recomputed canonical anchor hash.
 *
 * Proof level: `publicly-timestamped`
 * Required peer dependency: `ethers` (loaded via dynamic import).
 *
 * @module @framers/agentos-ext-anchor-providers
 */

import type { AnchorProvider, AnchorRecord, AnchorProviderResult, ProofLevel } from '@framers/agentos';
import type { BaseProviderConfig } from '../types.js';
import { resolveBaseConfig } from '../types.js';
import { hashCanonicalAnchor } from '../utils/serialization.js';

export interface EthereumProviderConfig extends BaseProviderConfig {
  /** JSON-RPC endpoint URL. */
  rpcUrl: string;
  /** Contract address for anchor storage. Omit for raw-calldata mode. */
  contractAddress?: string;
  /** Private key hex (0x-prefixed) for signing transactions. */
  signerPrivateKey?: string;
  /** Chain ID. Default: 1 (mainnet). */
  chainId?: number;
  /** Gas limit override. Default: auto-estimate. */
  gasLimit?: number;
  /** Number of confirmations to wait for. Default: 1. */
  confirmations?: number;
}

/**
 * Minimal ABI fragment for an `anchor(bytes32)` contract. Callers can
 * deploy any contract with this method signature (e.g. logging the
 * merkleRoot to an event) and point `contractAddress` at it.
 */
const ANCHOR_CONTRACT_ABI = ['function anchor(bytes32 merkleRoot)'];

export class EthereumProvider implements AnchorProvider {
  readonly id = 'ethereum';
  readonly name = 'Ethereum On-Chain Anchor';
  readonly proofLevel: ProofLevel = 'publicly-timestamped';

  private readonly config: Required<Omit<EthereumProviderConfig, 'contractAddress' | 'signerPrivateKey' | 'gasLimit'>> & {
    contractAddress?: string;
    signerPrivateKey?: string;
    gasLimit?: number;
  };
  private readonly baseConfig: Required<BaseProviderConfig>;

  /** Cached ethers Provider — reused across calls. */
  private cachedProvider: any = null;
  /** Cached ethers Wallet — only present when signing is configured. */
  private cachedWallet: any = null;

  constructor(config: EthereumProviderConfig) {
    this.config = {
      rpcUrl: config.rpcUrl,
      chainId: config.chainId ?? 1,
      confirmations: config.confirmations ?? 1,
      timeoutMs: config.timeoutMs ?? 30_000,
      retries: config.retries ?? 3,
      retryDelayMs: config.retryDelayMs ?? 1_000,
      contractAddress: config.contractAddress,
      signerPrivateKey: config.signerPrivateKey,
      gasLimit: config.gasLimit,
    };
    this.baseConfig = resolveBaseConfig(config);
  }

  async publish(anchor: AnchorRecord): Promise<AnchorProviderResult> {
    if (!this.config.signerPrivateKey) {
      return {
        providerId: this.id,
        success: false,
        error: 'EthereumProvider.publish requires signerPrivateKey to send transactions.',
        metadata: { chainId: this.config.chainId },
      };
    }

    let ethers: any;
    try {
      ethers = await this.loadEthers();
    } catch (e) {
      return {
        providerId: this.id,
        success: false,
        error: e instanceof Error ? e.message : String(e),
        metadata: { sdkMissing: true },
      };
    }

    const digestHex = await hashCanonicalAnchor(anchor);
    const dataHex = `0x${digestHex}`;

    try {
      const wallet = await this.getWallet(ethers);
      let txResponse: any;

      if (this.config.contractAddress) {
        // Contract-call mode: invoke anchor(bytes32) so on-chain
        // listeners can index anchor commits by event.
        const contract = new ethers.Contract(this.config.contractAddress, ANCHOR_CONTRACT_ABI, wallet);
        const overrides: Record<string, unknown> = {};
        if (this.config.gasLimit !== undefined) overrides.gasLimit = this.config.gasLimit;
        txResponse = await contract.anchor(dataHex, overrides);
      } else {
        // Raw-calldata mode: self-transfer with the digest packed into
        // the data field. No contract required; the proof is just the
        // existence of a tx with this calldata in a finalised block.
        const tx: Record<string, unknown> = {
          to: await wallet.getAddress(),
          value: 0n,
          data: dataHex,
        };
        if (this.config.gasLimit !== undefined) tx.gasLimit = this.config.gasLimit;
        txResponse = await wallet.sendTransaction(tx);
      }

      const receipt = await txResponse.wait(this.config.confirmations);
      if (!receipt) {
        return {
          providerId: this.id,
          success: false,
          error: 'Transaction sent but receipt was null',
          metadata: { txHash: txResponse.hash, chainId: this.config.chainId },
        };
      }

      return {
        providerId: this.id,
        success: true,
        externalRef: `eth:${this.config.chainId}:${receipt.hash ?? txResponse.hash}`,
        publishedAt: new Date().toISOString(),
        metadata: {
          chainId: this.config.chainId,
          txHash: receipt.hash ?? txResponse.hash,
          blockNumber: receipt.blockNumber,
          blockHash: receipt.blockHash,
          gasUsed: receipt.gasUsed?.toString(),
          contractAddress: this.config.contractAddress,
          mode: this.config.contractAddress ? 'contract' : 'calldata',
        },
      };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        providerId: this.id,
        success: false,
        error: `Ethereum transaction failed: ${message}`,
        metadata: { chainId: this.config.chainId },
      };
    }
  }

  /**
   * Confirm the anchor's `eth:` externalRef points at a finalised tx
   * whose calldata (or contract input) matches the recomputed canonical
   * anchor digest. Does not re-execute the contract — just compares the
   * stored calldata against the expected hash.
   */
  async verify(anchor: AnchorRecord): Promise<boolean> {
    if (!anchor.externalRef?.startsWith('eth:')) return false;
    let ethers: any;
    try {
      ethers = await this.loadEthers();
    } catch {
      return false;
    }

    // Parse eth:${chainId}:${txHash}
    const parts = anchor.externalRef.split(':');
    if (parts.length < 3) return false;
    const txHash = parts.slice(2).join(':'); // tolerate 0x... that already has colons (defensive)

    try {
      const provider = this.getProvider(ethers);
      const tx = await provider.getTransaction(txHash);
      if (!tx) return false;
      const receipt = await provider.getTransactionReceipt(txHash);
      if (!receipt || receipt.status === 0) return false;

      const expectedHex = `0x${await hashCanonicalAnchor(anchor)}`;

      if (this.config.contractAddress) {
        // For contract calls, the calldata is the ABI-encoded anchor()
        // function call. Decode and compare the bytes32 arg.
        const iface = new ethers.Interface(ANCHOR_CONTRACT_ABI);
        try {
          const parsed = iface.parseTransaction({ data: tx.data, value: tx.value });
          if (!parsed || parsed.name !== 'anchor') return false;
          const argHex = (parsed.args[0] as string).toLowerCase();
          return argHex === expectedHex;
        } catch {
          return false;
        }
      }

      // Raw-calldata mode: tx.data is the digest hex directly.
      return tx.data?.toLowerCase() === expectedHex;
    } catch {
      return false;
    }
  }

  async dispose(): Promise<void> {
    if (this.cachedProvider && typeof this.cachedProvider.destroy === 'function') {
      try {
        this.cachedProvider.destroy();
      } catch {
        // Best-effort cleanup.
      }
    }
    this.cachedProvider = null;
    this.cachedWallet = null;
  }

  private async loadEthers(): Promise<any> {
    const moduleName = 'ethers';
    try {
      const mod = await import(moduleName);
      // ethers v6 exports a namespace under default; v5 exports flat.
      // We use namespace-style access (`ethers.Wallet`, `ethers.Contract`)
      // which works for v6 root export.
      return (mod as any).ethers ?? mod;
    } catch {
      throw new Error(
        'EthereumProvider requires ethers (v6) at runtime. ' +
          'Install it in your project to enable Ethereum anchoring.',
      );
    }
  }

  private getProvider(ethers: any): any {
    if (this.cachedProvider) return this.cachedProvider;
    this.cachedProvider = new ethers.JsonRpcProvider(this.config.rpcUrl, this.config.chainId);
    return this.cachedProvider;
  }

  private async getWallet(ethers: any): Promise<any> {
    if (this.cachedWallet) return this.cachedWallet;
    if (!this.config.signerPrivateKey) {
      throw new Error('signerPrivateKey is required to obtain a wallet for publishing.');
    }
    const provider = this.getProvider(ethers);
    this.cachedWallet = new ethers.Wallet(this.config.signerPrivateKey, provider);
    return this.cachedWallet;
  }
}
