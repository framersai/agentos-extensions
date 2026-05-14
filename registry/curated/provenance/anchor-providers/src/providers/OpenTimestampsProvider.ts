// @ts-nocheck
/**
 * @file OpenTimestampsProvider.ts
 * @description Bitcoin-anchored timestamping via the OpenTimestamps protocol.
 *
 * Submits a SHA-256 digest to one or more OpenTimestamps calendar servers
 * via HTTP `POST /digest` and stores the calendars' binary attestations
 * as base64. Each attestation eventually commits to a Bitcoin block via
 * the calendar's own Merkle aggregation (typically 1–2 hours after
 * submission); the verify path here is a non-Bitcoin "weak" verification
 * that confirms a stored attestation was produced by a reachable calendar
 * for the supplied hash.
 *
 * For full Bitcoin-anchor verification, parse the stored base64 with the
 * `javascript-opentimestamps` library and call its `verify()` against a
 * Bitcoin node or block explorer.
 *
 * Proof level: `publicly-timestamped`
 * Required dependencies: none (uses global `fetch`).
 *
 * @module @framers/agentos-ext-anchor-providers
 */

import { createHash } from 'node:crypto';
import type { AnchorProvider, AnchorRecord, AnchorProviderResult, ProofLevel } from '@framers/agentos';
import type { BaseProviderConfig } from '../types.js';
import { resolveBaseConfig } from '../types.js';
import { hashCanonicalAnchor } from '../utils/serialization.js';

export interface OpenTimestampsProviderConfig extends BaseProviderConfig {
  /** OTS calendar server URLs. Default: public OpenTimestamps calendars. */
  calendarUrls?: string[];
  /**
   * Whether `publish()` requires every calendar in `calendarUrls` to succeed.
   * Default `false`: any single calendar response is enough to consider the
   * publish successful. Set `true` for higher independence guarantees.
   */
  requireAllCalendars?: boolean;
}

const DEFAULT_CALENDAR_URLS = [
  'https://a.pool.opentimestamps.org',
  'https://b.pool.opentimestamps.org',
  'https://a.pool.eternitywall.com',
];

interface CalendarAttestation {
  /** Calendar that produced this attestation. */
  calendarUrl: string;
  /** Base64 of the raw response bytes (the OTS commitment from that calendar). */
  attestationBase64: string;
  /** SHA-256 of the attestation bytes — convenience for tamper detection. */
  attestationHash: string;
}

/** Shape of an OpenTimestamps externalRef payload (JSON inside `externalRef`). */
interface OtsExternalRef {
  digestSha256: string;
  attestations: CalendarAttestation[];
  submittedAt: string;
}

/**
 * Convert a hex string into a Buffer of raw bytes. Used to send the SHA-256
 * digest binary in the calendar POST body.
 */
function hexToBuffer(hex: string): Buffer {
  return Buffer.from(hex, 'hex');
}

/**
 * Race a promise against an AbortController-based timeout. Returns the
 * promise's value or throws on timeout / underlying rejection.
 */
async function fetchWithTimeout(input: RequestInfo | URL, ms: number, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(input, { ...(init ?? {}), signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export class OpenTimestampsProvider implements AnchorProvider {
  readonly id = 'opentimestamps';
  readonly name = 'OpenTimestamps (Bitcoin)';
  readonly proofLevel: ProofLevel = 'publicly-timestamped';

  private readonly config: Required<OpenTimestampsProviderConfig>;
  private readonly baseConfig: Required<BaseProviderConfig>;

  constructor(config: OpenTimestampsProviderConfig = {}) {
    this.config = {
      calendarUrls: config.calendarUrls ?? DEFAULT_CALENDAR_URLS,
      requireAllCalendars: config.requireAllCalendars ?? false,
      timeoutMs: config.timeoutMs ?? 30_000,
      retries: config.retries ?? 3,
      retryDelayMs: config.retryDelayMs ?? 1_000,
    };
    this.baseConfig = resolveBaseConfig(config);
  }

  async publish(anchor: AnchorRecord): Promise<AnchorProviderResult> {
    const digestHex = await hashCanonicalAnchor(anchor);
    const digestBuf = hexToBuffer(digestHex);

    const attestations: CalendarAttestation[] = [];
    const errors: Array<{ calendar: string; message: string }> = [];

    for (const calendarUrl of this.config.calendarUrls) {
      const submitUrl = `${calendarUrl.replace(/\/$/, '')}/digest`;
      try {
        const response = await fetchWithTimeout(submitUrl, this.config.timeoutMs, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: digestBuf,
        });
        if (!response.ok) {
          errors.push({
            calendar: calendarUrl,
            message: `HTTP ${response.status} ${response.statusText}`,
          });
          continue;
        }
        const bytes = Buffer.from(await response.arrayBuffer());
        attestations.push({
          calendarUrl,
          attestationBase64: bytes.toString('base64'),
          attestationHash: createHash('sha256').update(bytes).digest('hex'),
        });
      } catch (e: unknown) {
        errors.push({
          calendar: calendarUrl,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const total = this.config.calendarUrls.length;
    const succeeded = attestations.length;
    const meetsThreshold = this.config.requireAllCalendars
      ? succeeded === total
      : succeeded > 0;

    if (!meetsThreshold) {
      return {
        providerId: this.id,
        success: false,
        error: `OpenTimestamps calendar submission failed (${succeeded}/${total} succeeded${
          errors.length ? `; first error: ${errors[0]?.message}` : ''
        })`,
        metadata: {
          digestHex,
          attemptedCalendars: this.config.calendarUrls,
          errors,
        },
      };
    }

    const externalPayload: OtsExternalRef = {
      digestSha256: digestHex,
      attestations,
      submittedAt: new Date().toISOString(),
    };

    return {
      providerId: this.id,
      success: true,
      // externalRef carries the entire OTS payload. Use the `ots:` prefix
      // so it is unambiguously distinguishable from other provider refs
      // (e.g. `eth:`, `s3://`, `solana:`) when stored on AnchorRecord.
      externalRef: `ots:${Buffer.from(JSON.stringify(externalPayload), 'utf-8').toString('base64')}`,
      publishedAt: externalPayload.submittedAt,
      metadata: {
        digestSha256: digestHex,
        calendarsContacted: attestations.map((a) => a.calendarUrl),
        calendarsFailed: errors.map((e) => e.calendar),
        pendingBitcoinAttestation: true,
        succeeded,
        total,
      },
    };
  }

  /**
   * Weak verification: re-derive the canonical anchor digest, decode the
   * stored OTS payload, and confirm at least one stored attestation hash
   * matches what the corresponding calendar serves today. This is NOT a
   * full Bitcoin-block verification — for that, parse the base64 with
   * `javascript-opentimestamps` and run its `verify()` against Bitcoin.
   */
  async verify(anchor: AnchorRecord): Promise<boolean> {
    if (!anchor.externalRef?.startsWith('ots:')) return false;
    let payload: OtsExternalRef;
    try {
      const json = Buffer.from(anchor.externalRef.slice('ots:'.length), 'base64').toString('utf-8');
      payload = JSON.parse(json) as OtsExternalRef;
    } catch {
      return false;
    }

    const digestHex = await hashCanonicalAnchor(anchor);
    if (payload.digestSha256 !== digestHex) return false;

    // Re-submit to the first reachable calendar; if it returns the same
    // attestation bytes the original submission still aligns with the
    // calendar's commitment. This is "weak" because a calendar could
    // re-serve a tampered timestamp; for strong proof use the OTS library.
    const digestBuf = hexToBuffer(digestHex);
    for (const attestation of payload.attestations) {
      try {
        const response = await fetchWithTimeout(
          `${attestation.calendarUrl.replace(/\/$/, '')}/digest`,
          this.config.timeoutMs,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: digestBuf,
          },
        );
        if (!response.ok) continue;
        const bytes = Buffer.from(await response.arrayBuffer());
        const reHash = createHash('sha256').update(bytes).digest('hex');
        if (reHash === attestation.attestationHash) return true;
      } catch {
        // Try the next calendar.
      }
    }
    return false;
  }

  async dispose(): Promise<void> {
    // No persistent resources.
  }
}
