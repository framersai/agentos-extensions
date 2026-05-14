// @ts-nocheck
/**
 * @file providers.spec.ts
 * @description Tests for all anchor provider implementations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WormSnapshotProvider } from '../src/providers/WormSnapshotProvider.js';
import { RekorProvider } from '../src/providers/RekorProvider.js';
import { OpenTimestampsProvider } from '../src/providers/OpenTimestampsProvider.js';
import { EthereumProvider } from '../src/providers/EthereumProvider.js';
import { SolanaProvider } from '../src/providers/SolanaProvider.js';
import type { AnchorRecord } from '@framers/agentos';

function createMockAnchor(overrides?: Partial<AnchorRecord>): AnchorRecord {
  return {
    id: 'anchor-001',
    merkleRoot: 'abc123def456',
    sequenceFrom: 1,
    sequenceTo: 10,
    eventCount: 10,
    timestamp: '2025-01-15T00:00:00.000Z',
    signature: 'mock-signature-base64',
    ...overrides,
  };
}

// =============================================================================
// WormSnapshotProvider
// =============================================================================

describe('WormSnapshotProvider', () => {
  it('should have correct id, name, and proofLevel', () => {
    const provider = new WormSnapshotProvider({ bucket: 'test', region: 'us-east-1' });
    expect(provider.id).toBe('worm-snapshot');
    expect(provider.name).toBe('WORM Snapshot (S3 Object Lock)');
    expect(provider.proofLevel).toBe('externally-archived');
  });

  it('publish() returns failure without crashing when the SDK or credentials are unavailable', async () => {
    // The test environment may or may not have @aws-sdk/client-s3
    // installed and AWS credentials configured. Either way publish()
    // must return a structured failure (never throw) so the caller's
    // fallback chain keeps working.
    const provider = new WormSnapshotProvider({ bucket: 'test', region: 'us-east-1' });
    const result = await provider.publish(createMockAnchor());
    expect(result.providerId).toBe('worm-snapshot');
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });

  it('verify() returns false for non-s3 externalRef', async () => {
    const provider = new WormSnapshotProvider({ bucket: 'test', region: 'us-east-1' });
    const valid = await provider.verify(createMockAnchor({ externalRef: 'not-s3-ref' }));
    expect(valid).toBe(false);
  });
});

// =============================================================================
// RekorProvider
// =============================================================================

describe('RekorProvider', () => {
  it('should have correct id, name, and proofLevel', () => {
    const provider = new RekorProvider();
    expect(provider.id).toBe('rekor');
    expect(provider.name).toBe('Sigstore Rekor Transparency Log');
    expect(provider.proofLevel).toBe('publicly-auditable');
  });

  it('should use default server URL when none provided', () => {
    const provider = new RekorProvider();
    expect(provider).toBeDefined();
  });

  it('publish() returns failure when signer config is incomplete', async () => {
    const provider = new RekorProvider();
    const result = await provider.publish(createMockAnchor());
    expect(result.providerId).toBe('rekor');
    expect(result.success).toBe(false);
    expect(result.error).toContain('publicKeyPem');
  });

  it('publish() submits a hashedrekord entry and returns rekor:logIndex:uuid', async () => {
    const fetchSpy = vi.fn(async (input: any) => {
      // First call: POST to /api/v1/log/entries
      const url = String(input);
      if (url.endsWith('/api/v1/log/entries')) {
        return new Response(
          JSON.stringify({
            'abc123uuid': {
              logIndex: 42,
              integratedTime: 1234567890,
              verification: { inclusionProof: { logIndex: 42 } },
              body: Buffer.from(
                JSON.stringify({
                  apiVersion: '0.0.1',
                  kind: 'hashedrekord',
                  spec: { data: { hash: { algorithm: 'sha256', value: 'deadbeef' } } },
                }),
              ).toString('base64'),
            },
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        );
      }
      throw new Error(`unexpected url: ${url}`);
    });
    vi.stubGlobal('fetch', fetchSpy);

    const provider = new RekorProvider({
      publicKeyPem: '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAEXAMPLE\n-----END PUBLIC KEY-----\n',
      signArtifact: async () => new Uint8Array(64), // mock sig
    });
    const result = await provider.publish(createMockAnchor());
    expect(result.success).toBe(true);
    expect(result.externalRef).toBe('rekor:42:abc123uuid');
    expect(result.metadata?.logIndex).toBe(42);
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('publish() surfaces Rekor 400 rejections as structured failures', async () => {
    const fetchSpy = vi.fn(async () =>
      new Response('signature verification failed', { status: 400, statusText: 'Bad Request' }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const provider = new RekorProvider({
      publicKeyPem: '-----BEGIN PUBLIC KEY-----\nEX\n-----END PUBLIC KEY-----\n',
      signArtifact: async () => new Uint8Array(64),
    });
    const result = await provider.publish(createMockAnchor());
    expect(result.success).toBe(false);
    expect(result.error).toContain('HTTP 400');
    expect(result.metadata?.status).toBe(400);
  });

  it('should return false from stub verify() without externalRef', async () => {
    const provider = new RekorProvider();
    const valid = await provider.verify(createMockAnchor());
    expect(valid).toBe(false);
  });
});

// =============================================================================
// OpenTimestampsProvider
// =============================================================================

describe('OpenTimestampsProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct id, name, and proofLevel', () => {
    const provider = new OpenTimestampsProvider();
    expect(provider.id).toBe('opentimestamps');
    expect(provider.name).toBe('OpenTimestamps (Bitcoin)');
    expect(provider.proofLevel).toBe('publicly-timestamped');
  });

  it('should accept custom calendar URLs', () => {
    const provider = new OpenTimestampsProvider({
      calendarUrls: ['https://custom.calendar.org'],
    });
    expect(provider).toBeDefined();
  });

  it('publish() returns success when at least one calendar responds', async () => {
    const provider = new OpenTimestampsProvider({
      calendarUrls: ['https://cal-a.test', 'https://cal-b.test'],
      timeoutMs: 100,
    });
    // First calendar returns a canned attestation, second one fails.
    const fetchSpy = vi.fn(async (input: any) => {
      const url = String(input);
      if (url.startsWith('https://cal-a.test')) {
        return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });
      }
      throw new Error('unreachable');
    });
    vi.stubGlobal('fetch', fetchSpy);

    const result = await provider.publish(createMockAnchor());
    expect(result.providerId).toBe('opentimestamps');
    expect(result.success).toBe(true);
    expect(result.externalRef).toMatch(/^ots:/);
    expect(result.metadata?.succeeded).toBe(1);
    expect(result.metadata?.total).toBe(2);
    expect(result.metadata?.pendingBitcoinAttestation).toBe(true);
  });

  it('publish() returns failure when every calendar fails', async () => {
    const provider = new OpenTimestampsProvider({
      calendarUrls: ['https://cal-a.test', 'https://cal-b.test'],
      timeoutMs: 100,
    });
    const fetchSpy = vi.fn(async () => {
      throw new Error('network error');
    });
    vi.stubGlobal('fetch', fetchSpy);

    const result = await provider.publish(createMockAnchor());
    expect(result.success).toBe(false);
    expect(result.error).toContain('0/2 succeeded');
    expect(result.metadata?.errors).toHaveLength(2);
  });

  it('publish() with requireAllCalendars fails on partial success', async () => {
    const provider = new OpenTimestampsProvider({
      calendarUrls: ['https://cal-a.test', 'https://cal-b.test'],
      requireAllCalendars: true,
      timeoutMs: 100,
    });
    const fetchSpy = vi.fn(async (input: any) => {
      if (String(input).startsWith('https://cal-a.test')) {
        return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      }
      throw new Error('cal-b unreachable');
    });
    vi.stubGlobal('fetch', fetchSpy);

    const result = await provider.publish(createMockAnchor());
    expect(result.success).toBe(false);
    expect(result.error).toContain('1/2 succeeded');
  });
});

// =============================================================================
// EthereumProvider
// =============================================================================

describe('EthereumProvider', () => {
  it('should have correct id, name, and proofLevel', () => {
    const provider = new EthereumProvider({ rpcUrl: 'https://eth.example.com' });
    expect(provider.id).toBe('ethereum');
    expect(provider.name).toBe('Ethereum On-Chain Anchor');
    expect(provider.proofLevel).toBe('publicly-timestamped');
  });

  it('publish() returns structured failure when signerPrivateKey is missing', async () => {
    const provider = new EthereumProvider({ rpcUrl: 'https://eth.example.com' });
    const result = await provider.publish(createMockAnchor());
    expect(result.providerId).toBe('ethereum');
    expect(result.success).toBe(false);
    expect(result.error).toContain('signerPrivateKey');
  });

  it('should accept chain ID and contract address', () => {
    const provider = new EthereumProvider({
      rpcUrl: 'https://eth.example.com',
      chainId: 11155111,
      contractAddress: '0x1234567890abcdef',
    });
    expect(provider).toBeDefined();
  });
});

// =============================================================================
// SolanaProvider
// =============================================================================

describe('SolanaProvider', () => {
  it('should have correct id, name, and proofLevel', () => {
    const provider = new SolanaProvider({ rpcUrl: 'https://solana.test', programId: '11111111111111111111111111111111' });
    expect(provider.id).toBe('solana');
    expect(provider.name).toBe('Solana On-Chain Anchor (Wunderland)');
    expect(provider.proofLevel).toBe('publicly-timestamped');
  });

  it('should return failure from publish() when signer config is missing', async () => {
    const provider = new SolanaProvider({ rpcUrl: 'https://solana.test', programId: '11111111111111111111111111111111' });
    const result = await provider.publish(createMockAnchor());
    expect(result.providerId).toBe('solana');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing signer configuration');
  });
});
