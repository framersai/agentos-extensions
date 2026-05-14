// @ts-nocheck
/**
 * @file WormSnapshotProvider.ts
 * @description S3 Object Lock / WORM storage anchor provider.
 * Publishes anchor records to an S3 bucket with Object Lock governance/compliance retention.
 *
 * Proof level: `externally-archived`
 * Required peer dependency: `@aws-sdk/client-s3`
 *
 * @module @framers/agentos-ext-anchor-providers
 */

import type { AnchorProvider, AnchorRecord, AnchorProviderResult, ProofLevel } from '@framers/agentos';
import type { BaseProviderConfig } from '../types.js';
import { resolveBaseConfig } from '../types.js';

export interface WormSnapshotProviderConfig extends BaseProviderConfig {
  /** S3 bucket name (must have Object Lock enabled). */
  bucket: string;
  /** S3 region. */
  region: string;
  /** Key prefix for anchor objects. Default: 'provenance/anchors/'. */
  keyPrefix?: string;
  /** Retention period in days. Default: 365. */
  retentionDays?: number;
  /** Retention mode: 'GOVERNANCE' or 'COMPLIANCE'. Default: 'GOVERNANCE'. */
  retentionMode?: 'GOVERNANCE' | 'COMPLIANCE';
}

export class WormSnapshotProvider implements AnchorProvider {
  readonly id = 'worm-snapshot';
  readonly name = 'WORM Snapshot (S3 Object Lock)';
  readonly proofLevel: ProofLevel = 'externally-archived';

  private readonly config: WormSnapshotProviderConfig;
  private readonly baseConfig: Required<BaseProviderConfig>;

  constructor(config: WormSnapshotProviderConfig) {
    this.config = {
      keyPrefix: 'provenance/anchors/',
      retentionDays: 365,
      retentionMode: 'GOVERNANCE',
      ...config,
    };
    this.baseConfig = resolveBaseConfig(config);
  }

  async publish(_anchor: AnchorRecord): Promise<AnchorProviderResult> {
    // Stubbed pending @aws-sdk/client-s3 wiring + bucket with Object Lock
    // enabled. Required steps:
    //   1. `new S3Client({ region: this.config.region })`
    //   2. `canonicalizeAnchor(anchor)` -> JSON body.
    //   3. `PutObjectCommand` with:
    //        Bucket: this.config.bucket
    //        Key:    `${this.config.keyPrefix}${anchor.id}.json`
    //        Body:   canonical JSON
    //        ContentType: 'application/json'
    //        ObjectLockMode: this.config.retentionMode
    //        ObjectLockRetainUntilDate: now + retentionDays
    //   4. Return `externalRef: 's3://${bucket}/${key}'`.
    // Verify path: `HeadObjectCommand` to confirm the object still exists
    // and `Retention.RetainUntilDate` has not passed.
    return {
      providerId: this.id,
      success: false,
      error:
        'WormSnapshotProvider not implemented. Pending: `@aws-sdk/client-s3` + S3 bucket with Object Lock enabled + IAM role. See provider source for the implementation outline.',
      metadata: {
        notImplemented: true,
        bucket: this.config.bucket,
        region: this.config.region,
        retentionMode: this.config.retentionMode,
        retentionDays: this.config.retentionDays,
      },
    };
  }

  async verify(anchor: AnchorRecord): Promise<boolean> {
    // Pending implementation. `HeadObjectCommand` against the S3 key
    // encoded in `anchor.externalRef`, then confirm the active
    // `Retention.RetainUntilDate` is still in the future.
    if (!anchor.externalRef) return false;
    return false;
  }
}
