// @ts-nocheck
/**
 * @file OpenTimestampsProvider.ts
 * @description Bitcoin-anchored timestamping via the OpenTimestamps protocol.
 * Creates OTS timestamps for anchor Merkle roots and submits to calendar servers.
 *
 * Proof level: `publicly-timestamped`
 * Required peer dependency: `opentimestamps`
 *
 * @module @framers/agentos-ext-anchor-providers
 */

import type { AnchorProvider, AnchorRecord, AnchorProviderResult, ProofLevel } from '@framers/agentos';
import type { BaseProviderConfig } from '../types.js';
import { resolveBaseConfig } from '../types.js';

export interface OpenTimestampsProviderConfig extends BaseProviderConfig {
  /** OTS calendar server URLs. Default: public OpenTimestamps calendars. */
  calendarUrls?: string[];
}

const DEFAULT_CALENDAR_URLS = [
  'https://a.pool.opentimestamps.org',
  'https://b.pool.opentimestamps.org',
  'https://a.pool.eternitywall.com',
];

export class OpenTimestampsProvider implements AnchorProvider {
  readonly id = 'opentimestamps';
  readonly name = 'OpenTimestamps (Bitcoin)';
  readonly proofLevel: ProofLevel = 'publicly-timestamped';

  private readonly config: Required<OpenTimestampsProviderConfig>;
  private readonly baseConfig: Required<BaseProviderConfig>;

  constructor(config: OpenTimestampsProviderConfig = {}) {
    this.config = {
      calendarUrls: config.calendarUrls ?? DEFAULT_CALENDAR_URLS,
      timeoutMs: config.timeoutMs ?? 30_000,
      retries: config.retries ?? 3,
      retryDelayMs: config.retryDelayMs ?? 1_000,
    };
    this.baseConfig = resolveBaseConfig(config);
  }

  async publish(_anchor: AnchorRecord): Promise<AnchorProviderResult> {
    // Stubbed pending OpenTimestamps protocol wiring. Required steps:
    //   1. Compute SHA-256 of canonical anchor: hashCanonicalAnchor(anchor)
    //   2. Build a `DetachedTimestampFile` from the hash bytes via the
    //      `opentimestamps` npm package.
    //   3. Submit to each calendar in parallel
    //      (`OpenTimestamps.stamp(detached, { calendars: this.config.calendarUrls })`).
    //   4. Serialize the resulting OTS proof to base64 and return as
    //      `externalRef: 'ots:${base64Proof}'`.
    // OTS proofs are initially "pending" — they confirm after Bitcoin
    // includes the calendar commitment (~1-2 h). A separate verify pass
    // upgrades pending to confirmed without re-submission.
    return {
      providerId: this.id,
      success: false,
      error:
        'OpenTimestampsProvider not implemented. Pending: `opentimestamps` npm package + DetachedTimestampFile + calendar submit. See provider source for the implementation outline.',
      metadata: { notImplemented: true, calendarUrls: this.config.calendarUrls },
    };
  }

  async verify(anchor: AnchorRecord): Promise<boolean> {
    // Pending implementation. The verify path deserialises the OTS proof
    // from `anchor.externalRef`, calls `OpenTimestamps.verify(detached)`,
    // and returns true once a Bitcoin block has committed the calendar
    // attestation.
    if (!anchor.externalRef) return false;
    return false;
  }

  async dispose(): Promise<void> {
    // No persistent resources in current implementation
  }
}
