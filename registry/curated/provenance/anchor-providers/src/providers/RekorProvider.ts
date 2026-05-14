// @ts-nocheck
/**
 * @file RekorProvider.ts
 * @description Sigstore Rekor transparency log anchor provider.
 * Publishes anchor Merkle roots as hashedrekord entries to Rekor.
 *
 * Proof level: `publicly-auditable`
 * Required peer dependency: `sigstore`
 *
 * @module @framers/agentos-ext-anchor-providers
 */

import type { AnchorProvider, AnchorRecord, AnchorProviderResult, ProofLevel } from '@framers/agentos';
import type { BaseProviderConfig } from '../types.js';
import { resolveBaseConfig } from '../types.js';

export interface RekorProviderConfig extends BaseProviderConfig {
  /** Rekor server URL. Default: 'https://rekor.sigstore.dev'. */
  serverUrl?: string;
}

const DEFAULT_SERVER_URL = 'https://rekor.sigstore.dev';

export class RekorProvider implements AnchorProvider {
  readonly id = 'rekor';
  readonly name = 'Sigstore Rekor Transparency Log';
  readonly proofLevel: ProofLevel = 'publicly-auditable';

  private readonly config: Required<RekorProviderConfig>;
  private readonly baseConfig: Required<BaseProviderConfig>;

  constructor(config: RekorProviderConfig = {}) {
    this.config = {
      serverUrl: config.serverUrl ?? DEFAULT_SERVER_URL,
      timeoutMs: config.timeoutMs ?? 30_000,
      retries: config.retries ?? 3,
      retryDelayMs: config.retryDelayMs ?? 1_000,
    };
    this.baseConfig = resolveBaseConfig(config);
  }

  async publish(_anchor: AnchorRecord): Promise<AnchorProviderResult> {
    // Stubbed pending SDK integration. The wiring needs:
    //   1. A signing function that produces an Ed25519 signature over the
    //      hashed-artifact bytes (NOT over `_anchor.signature` — Rekor
    //      verifies sig over the supplied hash, and AgentKeyManager signs
    //      over the UTF-8 merkleRoot string, so the two are incompatible
    //      without re-signing).
    //   2. A PEM-encoded public key for `signature.publicKey.content`.
    //   3. POST to `${serverUrl}/api/v1/log/entries` with a hashedrekord
    //      entry (apiVersion 0.0.1).
    //   4. Parse `logIndex` + entry UUID, return
    //      `rekor:${logIndex}:${entryUUID}` as externalRef.
    // The `verify()` path needs the inverse: GET the entry by UUID and
    // check the inclusion proof against the published tree size.
    return {
      providerId: this.id,
      success: false,
      error:
        'RekorProvider not implemented. Pending: PEM public key + Ed25519 signer that signs the artifact bytes (not the merkleRoot string). See provider source for the implementation outline.',
      metadata: { notImplemented: true, serverUrl: this.config.serverUrl },
    };
  }

  async verify(anchor: AnchorRecord): Promise<boolean> {
    // Pending implementation. The verify path is the inverse of publish:
    //   GET `${serverUrl}/api/v1/log/entries/${entryUUID}` (extracted from
    //   `anchor.externalRef`), validate the entry's inclusion proof against
    //   the transparency log's current signed tree head. Sigstore's
    //   `RekorClient.getEntry` plus its proof verifier covers both steps.
    if (!anchor.externalRef) return false;
    return false;
  }

  async dispose(): Promise<void> {
    // No persistent resources in current implementation
  }
}
