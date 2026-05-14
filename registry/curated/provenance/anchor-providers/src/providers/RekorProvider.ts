// @ts-nocheck
/**
 * @file RekorProvider.ts
 * @description Sigstore Rekor transparency-log anchor provider.
 *
 * Submits a `hashedrekord` entry to Rekor so each anchor is recorded
 * in a public append-only log keyed by SHA-256 of the canonical
 * anchor. Rekor cryptographically verifies the supplied signature
 * against the supplied hash before accepting the entry, so the caller
 * must provide an Ed25519 `signArtifact` function that signs over the
 * raw hash bytes (Rekor's verification target) — **not** the
 * AgentKeyManager's sign-over-merkleRoot-string output, which is the
 * wrong byte sequence for Rekor's verifier.
 *
 * Proof level: `publicly-auditable`
 * Required dependencies: none for `publish` (uses global `fetch`).
 *
 * @module @framers/agentos-ext-anchor-providers
 */

import type { AnchorProvider, AnchorRecord, AnchorProviderResult, ProofLevel } from '@framers/agentos';
import type { BaseProviderConfig } from '../types.js';
import { resolveBaseConfig } from '../types.js';
import { fetchWithRetry } from '../utils/http-client.js';
import { hashCanonicalAnchor } from '../utils/serialization.js';

export interface RekorProviderConfig extends BaseProviderConfig {
  /** Rekor server URL. Default: 'https://rekor.sigstore.dev'. */
  serverUrl?: string;
  /**
   * PEM-encoded Ed25519 public key matching the signer. Required for
   * `publish()` because Rekor's hashedrekord verifier needs the
   * public key to validate `signArtifact`'s signature against the
   * artifact hash.
   */
  publicKeyPem?: string;
  /**
   * Sign the artifact's raw bytes (NOT the hex string) using the same
   * Ed25519 keypair whose public key is in `publicKeyPem`. Required
   * for `publish()`. Receives the canonical-anchor SHA-256 bytes and
   * must return an Ed25519 signature.
   */
  signArtifact?: (bytes: Uint8Array) => Promise<Uint8Array> | Uint8Array;
}

const DEFAULT_SERVER_URL = 'https://rekor.sigstore.dev';

/**
 * Encode the Rekor server URL into the externalRef so verify() reaches the
 * same server that recorded the entry, even if config.serverUrl has been
 * changed since publish. The serverUrl is base64-encoded so a `:` character
 * in the URL doesn't collide with the externalRef field separator.
 */
function encodeExternalRef(serverUrl: string, logIndex: number, uuid: string): string {
  const encodedServer = Buffer.from(serverUrl, 'utf-8').toString('base64url');
  return `rekor:${encodedServer}:${logIndex}:${uuid}`;
}

/** Decode an externalRef back to { serverUrl, uuid }. Tolerates the old
 *  two-field `rekor:${logIndex}:${uuid}` shape by falling back to
 *  `fallbackServerUrl` (typically `this.config.serverUrl`).
 */
function decodeExternalRef(
  externalRef: string,
  fallbackServerUrl: string,
): { serverUrl: string; uuid: string } | null {
  if (!externalRef.startsWith('rekor:')) return null;
  const parts = externalRef.split(':');
  // New format: rekor:<base64url(serverUrl)>:<logIndex>:<uuid>  (>= 4 parts)
  if (parts.length >= 4) {
    try {
      const serverUrl = Buffer.from(parts[1] ?? '', 'base64url').toString('utf-8');
      const uuid = parts.slice(3).join(':');
      if (serverUrl && uuid) return { serverUrl, uuid };
    } catch {
      // Falls through to legacy format check.
    }
  }
  // Legacy format: rekor:<logIndex>:<uuid> (exactly 3 parts)
  if (parts.length === 3) {
    return { serverUrl: fallbackServerUrl, uuid: parts[2] ?? '' };
  }
  return null;
}

export class RekorProvider implements AnchorProvider {
  readonly id = 'rekor';
  readonly name = 'Sigstore Rekor Transparency Log';
  readonly proofLevel: ProofLevel = 'publicly-auditable';

  private readonly config: Required<Omit<RekorProviderConfig, 'publicKeyPem' | 'signArtifact'>> & {
    publicKeyPem?: string;
    signArtifact?: RekorProviderConfig['signArtifact'];
  };
  private readonly baseConfig: Required<BaseProviderConfig>;

  constructor(config: RekorProviderConfig = {}) {
    this.config = {
      serverUrl: config.serverUrl ?? DEFAULT_SERVER_URL,
      timeoutMs: config.timeoutMs ?? 30_000,
      retries: config.retries ?? 3,
      retryDelayMs: config.retryDelayMs ?? 1_000,
      publicKeyPem: config.publicKeyPem,
      signArtifact: config.signArtifact,
    };
    this.baseConfig = resolveBaseConfig(config);
  }

  async publish(anchor: AnchorRecord): Promise<AnchorProviderResult> {
    if (!this.config.publicKeyPem || !this.config.signArtifact) {
      return {
        providerId: this.id,
        success: false,
        error:
          'RekorProvider.publish requires both publicKeyPem (PEM-encoded Ed25519 public key) and signArtifact (function signing the raw hash bytes).',
        metadata: { serverUrl: this.config.serverUrl },
      };
    }

    const digestHex = await hashCanonicalAnchor(anchor);
    const digestBytes = Buffer.from(digestHex, 'hex');

    let signatureBytes: Uint8Array;
    try {
      const raw = await this.config.signArtifact(new Uint8Array(digestBytes));
      signatureBytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
    } catch (e: unknown) {
      return {
        providerId: this.id,
        success: false,
        error: `RekorProvider signArtifact failed: ${e instanceof Error ? e.message : String(e)}`,
        metadata: { serverUrl: this.config.serverUrl },
      };
    }

    // hashedrekord v0.0.1 entry. The signature MUST be valid for
    // (publicKey, digestBytes) under Ed25519; Rekor refuses entries
    // whose signature does not verify against the supplied hash.
    const entry = {
      apiVersion: '0.0.1',
      kind: 'hashedrekord',
      spec: {
        data: {
          hash: {
            algorithm: 'sha256',
            value: digestHex,
          },
        },
        signature: {
          content: Buffer.from(signatureBytes).toString('base64'),
          publicKey: {
            content: Buffer.from(this.config.publicKeyPem, 'utf-8').toString('base64'),
          },
        },
      },
    };

    let response: Response;
    try {
      response = await fetchWithRetry(
        `${this.config.serverUrl.replace(/\/$/, '')}/api/v1/log/entries`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(entry),
        },
        {
          timeoutMs: this.config.timeoutMs,
          retries: this.config.retries,
          retryDelayMs: this.config.retryDelayMs,
        },
      );
    } catch (e: unknown) {
      return {
        providerId: this.id,
        success: false,
        error: `Rekor submit failed: ${e instanceof Error ? e.message : String(e)}`,
        metadata: { serverUrl: this.config.serverUrl },
      };
    }

    if (!response.ok) {
      let body = '';
      try {
        body = (await response.text()).slice(0, 500);
      } catch {
        // ignore
      }
      return {
        providerId: this.id,
        success: false,
        error: `Rekor rejected entry: HTTP ${response.status} ${response.statusText}${body ? ` — ${body}` : ''}`,
        metadata: { serverUrl: this.config.serverUrl, status: response.status },
      };
    }

    let entryMap: Record<string, any>;
    try {
      entryMap = (await response.json()) as Record<string, any>;
    } catch (e: unknown) {
      return {
        providerId: this.id,
        success: false,
        error: `Rekor returned unparseable JSON: ${e instanceof Error ? e.message : String(e)}`,
        metadata: { serverUrl: this.config.serverUrl },
      };
    }

    // Rekor responses are keyed by entry UUID with the entry as the
    // value. There's exactly one key in a single-submit response.
    const uuid = Object.keys(entryMap)[0];
    const entryData = uuid ? entryMap[uuid] : undefined;
    if (!uuid || !entryData) {
      return {
        providerId: this.id,
        success: false,
        error: 'Rekor returned a response without an entry UUID',
        metadata: { serverUrl: this.config.serverUrl },
      };
    }

    const logIndex = entryData.logIndex;
    return {
      providerId: this.id,
      success: true,
      externalRef: encodeExternalRef(this.config.serverUrl, logIndex, uuid),
      publishedAt: new Date().toISOString(),
      metadata: {
        serverUrl: this.config.serverUrl,
        logIndex,
        uuid,
        integratedTime: entryData.integratedTime,
        hasInclusionProof: Boolean(entryData.verification?.inclusionProof),
      },
    };
  }

  /**
   * Confirm the anchor's Rekor entry exists and its body hash matches a
   * fresh canonical anchor digest. Does NOT cryptographically verify
   * the inclusion proof against the signed tree head — that needs the
   * sigstore SDK; for compliance workflows wire up
   * `sigstore.verify(bundle)` after this method returns true.
   */
  async verify(anchor: AnchorRecord): Promise<boolean> {
    if (!anchor.externalRef) return false;
    const decoded = decodeExternalRef(anchor.externalRef, this.config.serverUrl);
    if (!decoded) return false;

    try {
      const response = await fetchWithRetry(
        `${decoded.serverUrl.replace(/\/$/, '')}/api/v1/log/entries/${decoded.uuid}`,
        undefined,
        {
          timeoutMs: this.config.timeoutMs,
          retries: this.config.retries,
          retryDelayMs: this.config.retryDelayMs,
        },
      );
      if (!response.ok) return false;
      const entryMap = (await response.json()) as Record<string, any>;
      const entry = entryMap[decoded.uuid];
      if (!entry?.body) return false;

      // Body is base64-encoded JSON of the hashedrekord spec.
      const bodyJson = Buffer.from(entry.body, 'base64').toString('utf-8');
      const body = JSON.parse(bodyJson) as { spec?: { data?: { hash?: { value?: string } } } };
      const storedHash = body.spec?.data?.hash?.value;
      if (typeof storedHash !== 'string') return false;

      const recomputed = await hashCanonicalAnchor(anchor);
      // Compare hashes; canonical equality of the SHA-256 hex is the
      // integrity signal for the recorded artifact.
      return constantTimeEqual(storedHash.toLowerCase(), recomputed.toLowerCase());
    } catch {
      return false;
    }
  }

  async dispose(): Promise<void> {
    // No persistent resources.
  }
}

/**
 * Constant-time string equality (over hex digests) to avoid leaking
 * digest prefixes via timing differences when called in a tight loop.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
