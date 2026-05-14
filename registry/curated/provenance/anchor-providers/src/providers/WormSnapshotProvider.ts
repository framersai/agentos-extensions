// @ts-nocheck
/**
 * @file WormSnapshotProvider.ts
 * @description S3 Object Lock / WORM storage anchor provider.
 *
 * `publish()` writes the canonical anchor JSON to an S3 bucket with
 * Object Lock retention so the object cannot be overwritten or deleted
 * before the configured retention date. `verify()` issues a HeadObject
 * and confirms the active retention window is still in the future.
 *
 * Proof level: `externally-archived`
 * Required peer dependency: `@aws-sdk/client-s3` (loaded via dynamic
 * import at runtime so projects that don't use this provider don't pay
 * the bundle cost).
 *
 * @module @framers/agentos-ext-anchor-providers
 */

import { createHash } from 'node:crypto';
import type { AnchorProvider, AnchorRecord, AnchorProviderResult, ProofLevel } from '@framers/agentos';
import type { BaseProviderConfig } from '../types.js';
import { resolveBaseConfig } from '../types.js';
import { canonicalizeAnchor } from '../utils/serialization.js';

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
  /** Optional explicit credentials (otherwise the AWS SDK chain is used). */
  credentials?: { accessKeyId: string; secretAccessKey: string; sessionToken?: string };
  /** Custom endpoint URL (S3-compatible stores: MinIO, etc.). */
  endpoint?: string;
}

export class WormSnapshotProvider implements AnchorProvider {
  readonly id = 'worm-snapshot';
  readonly name = 'WORM Snapshot (S3 Object Lock)';
  readonly proofLevel: ProofLevel = 'externally-archived';

  private readonly config: Required<Omit<WormSnapshotProviderConfig, 'credentials' | 'endpoint'>> & {
    credentials?: WormSnapshotProviderConfig['credentials'];
    endpoint?: string;
  };
  private readonly baseConfig: Required<BaseProviderConfig>;

  /** Cached S3Client instance — reused across publish/verify calls. */
  private cachedClient: any = null;

  constructor(config: WormSnapshotProviderConfig) {
    this.config = {
      bucket: config.bucket,
      region: config.region,
      keyPrefix: config.keyPrefix ?? 'provenance/anchors/',
      retentionDays: config.retentionDays ?? 365,
      retentionMode: config.retentionMode ?? 'GOVERNANCE',
      timeoutMs: config.timeoutMs ?? 30_000,
      retries: config.retries ?? 3,
      retryDelayMs: config.retryDelayMs ?? 1_000,
      credentials: config.credentials,
      endpoint: config.endpoint,
    };
    this.baseConfig = resolveBaseConfig(config);
  }

  async publish(anchor: AnchorRecord): Promise<AnchorProviderResult> {
    let sdk: any;
    try {
      sdk = await this.loadSdk();
    } catch (e) {
      return {
        providerId: this.id,
        success: false,
        error: e instanceof Error ? e.message : String(e),
        metadata: { sdkMissing: true },
      };
    }

    const canonical = canonicalizeAnchor(anchor);
    const body = Buffer.from(canonical, 'utf-8');
    const objectHash = createHash('sha256').update(body).digest('hex');
    const key = `${this.config.keyPrefix}${anchor.id}.json`;
    const retainUntil = new Date(Date.now() + this.config.retentionDays * 24 * 60 * 60 * 1000);

    try {
      const client = await this.getClient(sdk);
      const command = new sdk.PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: 'application/json',
        ContentMD5: createHash('md5').update(body).digest('base64'),
        // Object Lock retention — once written, the object cannot be
        // deleted or overwritten before `retainUntil`. GOVERNANCE mode
        // permits override by privileged IAM principals; COMPLIANCE
        // mode is absolute (even the root account cannot remove).
        ObjectLockMode: this.config.retentionMode,
        ObjectLockRetainUntilDate: retainUntil,
        // Metadata is captured separately for fast HEAD lookups during
        // verify; the canonical anchor body is the authoritative copy.
        Metadata: {
          'anchor-id': anchor.id,
          'merkle-root': anchor.merkleRoot,
          'sequence-from': String(anchor.sequenceFrom),
          'sequence-to': String(anchor.sequenceTo),
          'sha256': objectHash,
        },
      });
      await client.send(command);

      const externalRef = `s3://${this.config.bucket}/${key}`;
      return {
        providerId: this.id,
        success: true,
        externalRef,
        publishedAt: new Date().toISOString(),
        metadata: {
          bucket: this.config.bucket,
          region: this.config.region,
          key,
          objectSha256: objectHash,
          retentionMode: this.config.retentionMode,
          retainUntil: retainUntil.toISOString(),
        },
      };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        providerId: this.id,
        success: false,
        error: `S3 PutObject failed: ${message}`,
        metadata: {
          bucket: this.config.bucket,
          region: this.config.region,
          key,
        },
      };
    }
  }

  /**
   * Verify the stored object still exists in the bucket and that its
   * Object Lock retention window has not expired. Does NOT re-hash the
   * stored body (that would require GetObject + a network read of the
   * whole anchor); checks the metadata `sha256` against the recomputed
   * canonical anchor hash for a constant-time integrity signal.
   */
  async verify(anchor: AnchorRecord): Promise<boolean> {
    if (!anchor.externalRef?.startsWith('s3://')) return false;
    let sdk: any;
    try {
      sdk = await this.loadSdk();
    } catch {
      return false;
    }

    // Parse s3://bucket/key into pieces.
    const ref = anchor.externalRef.slice('s3://'.length);
    const slash = ref.indexOf('/');
    if (slash <= 0) return false;
    const bucket = ref.slice(0, slash);
    const key = ref.slice(slash + 1);

    try {
      const client = await this.getClient(sdk);
      const head = await client.send(
        new sdk.HeadObjectCommand({ Bucket: bucket, Key: key }),
      );

      // Confirm retention is still active. Both GOVERNANCE and COMPLIANCE
      // expose ObjectLockRetainUntilDate.
      const retainUntil = head.ObjectLockRetainUntilDate as Date | undefined;
      if (!retainUntil) return false;
      if (retainUntil.getTime() <= Date.now()) return false;

      // Confirm the recorded SHA-256 matches what the current anchor
      // would canonicalise to. If the source anchor has been mutated
      // since storage, this fails — which is the correct behaviour.
      const recordedHash = head.Metadata?.['sha256'];
      const recomputed = createHash('sha256')
        .update(canonicalizeAnchor(anchor), 'utf-8')
        .digest('hex');
      return typeof recordedHash === 'string' && recordedHash === recomputed;
    } catch {
      return false;
    }
  }

  async dispose(): Promise<void> {
    if (this.cachedClient && typeof this.cachedClient.destroy === 'function') {
      try {
        this.cachedClient.destroy();
      } catch {
        // Best-effort cleanup.
      }
    }
    this.cachedClient = null;
  }

  /** Dynamic-import the AWS SDK so the package isn't a hard dep. */
  private async loadSdk(): Promise<any> {
    const moduleName = '@aws-sdk/client-s3';
    try {
      return await import(moduleName);
    } catch {
      throw new Error(
        'WormSnapshotProvider requires @aws-sdk/client-s3 at runtime. ' +
          'Install it in your project to enable S3 Object Lock anchoring.',
      );
    }
  }

  /** Build/cache an S3Client with this provider's config. */
  private async getClient(sdk: any): Promise<any> {
    if (this.cachedClient) return this.cachedClient;
    const clientConfig: Record<string, unknown> = {
      region: this.config.region,
      // Plumb the retry config through the SDK's native retry middleware.
      // maxAttempts is total attempts (initial + retries), so retries=3
      // becomes maxAttempts=4. Per-attempt timeout comes from this.config.timeoutMs.
      maxAttempts: this.config.retries + 1,
      requestHandler: { requestTimeout: this.config.timeoutMs },
    };
    if (this.config.credentials) clientConfig.credentials = this.config.credentials;
    if (this.config.endpoint) {
      clientConfig.endpoint = this.config.endpoint;
      // Custom endpoints (MinIO, LocalStack) usually require path-style URLs.
      clientConfig.forcePathStyle = true;
    }
    this.cachedClient = new sdk.S3Client(clientConfig);
    return this.cachedClient;
  }
}
