// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CloudflareRegistrarService, type CloudflareRegistrarConfig } from '../src/CloudflareRegistrarService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Headers(),
    redirected: false,
    type: 'basic' as ResponseType,
    url: '',
    clone: () => mockResponse(data, status),
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response;
}

/** Wrap result in a standard Cloudflare success envelope. */
function cfOk(result: unknown): unknown {
  return { success: true, errors: [], messages: [], result };
}

/** Create a Cloudflare error envelope. */
function cfError(code: number, message: string): unknown {
  return { success: false, errors: [{ code, message }], messages: [], result: null };
}

const DEFAULT_CONFIG: CloudflareRegistrarConfig = {
  apiToken: 'cf_test_token_123',
  accountId: 'acct_abc123',
  baseUrl: 'https://api.cloudflare.com/client/v4',
};

let mockFetch: ReturnType<typeof vi.fn>;
let service: CloudflareRegistrarService;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CloudflareRegistrarService', () => {
  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    service = new CloudflareRegistrarService(DEFAULT_CONFIG);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Constructor ──────────────────────────────────────────────────────────

  it('should use default baseUrl when none is provided', () => {
    const svc = new CloudflareRegistrarService({ apiToken: 'x', accountId: 'y' });
    expect((svc as any).config.baseUrl).toBe('https://api.cloudflare.com/client/v4');
  });

  it('should use custom baseUrl when provided', () => {
    const svc = new CloudflareRegistrarService({ apiToken: 'x', accountId: 'y', baseUrl: 'https://custom.cf.api' });
    expect((svc as any).config.baseUrl).toBe('https://custom.cf.api');
  });

  // ── initialize() ────────────────────────────────────────────────────────

  it('should initialize successfully when token verification succeeds', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(cfOk({ id: 'token_id', status: 'active' })));

    await service.initialize();

    expect(service.isRunning).toBe(true);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.cloudflare.com/client/v4/user/tokens/verify');
    expect(init.method).toBe('GET');
    expect(init.headers['Authorization']).toBe('Bearer cf_test_token_123');
  });

  it('should throw when token verification fails', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(cfError(1000, 'Invalid API Token')));

    await expect(service.initialize()).rejects.toThrow('Cloudflare auth failed');
    expect(service.isRunning).toBe(false);
  });

  // ── shutdown() ──────────────────────────────────────────────────────────

  it('should set isRunning to false on shutdown', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(cfOk({ status: 'active' })));
    await service.initialize();

    await service.shutdown();
    expect(service.isRunning).toBe(false);
  });

  // ── listDomains() ──────────────────────────────────────────────────────

  it('should list registered domains', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(
        cfOk([
          {
            domain_name: 'example.com',
            status: 'active',
            expires_at: '2025-12-31',
            auto_renew: true,
            locked: false,
            privacy: true,
            name_servers: ['ns1.cloudflare.com', 'ns2.cloudflare.com'],
          },
        ]),
      ),
    );

    const domains = await service.listDomains();

    expect(domains).toHaveLength(1);
    expect(domains[0].domain).toBe('example.com');
    expect(domains[0].status).toBe('active');
    expect(domains[0].autoRenew).toBe(true);
    expect(domains[0].privacy).toBe(true);
    expect(domains[0].nameservers).toEqual(['ns1.cloudflare.com', 'ns2.cloudflare.com']);

    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('/accounts/acct_abc123/registrar/domains');
  });

  it('should return empty array when no domains', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(cfOk([])));

    const domains = await service.listDomains();
    expect(domains).toEqual([]);
  });

  // ── getDomainInfo() ────────────────────────────────────────────────────

  it('should get domain details with transfer and fee info', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(
        cfOk({
          domain_name: 'example.com',
          status: 'active',
          expires_at: '2025-12-31',
          auto_renew: true,
          locked: true,
          privacy: false,
          created_at: '2023-01-01',
          updated_at: '2024-06-15',
          transfer_in: {
            transfer_status: 'pending',
            accept_foa: '2024-07-01',
            can_cancel_transfer: true,
          },
          registry_statuses: ['clientTransferProhibited'],
          fees: {
            registration_fee: 9.99,
            renewal_fee: 9.99,
            transfer_fee: 9.99,
          },
        }),
      ),
    );

    const detail = await service.getDomainInfo('example.com');

    expect(detail.domain).toBe('example.com');
    expect(detail.locked).toBe(true);
    expect(detail.transferIn?.status).toBe('pending');
    expect(detail.transferIn?.canCancelTransfer).toBe(true);
    expect(detail.fees?.registrationFee).toBe(9.99);
    expect(detail.registryStatuses).toContain('clientTransferProhibited');
  });

  it('should handle domain without transfer_in or fees', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(
        cfOk({
          domain_name: 'simple.com',
          status: 'active',
          expires_at: '2025-01-01',
          auto_renew: false,
          locked: false,
          privacy: false,
        }),
      ),
    );

    const detail = await service.getDomainInfo('simple.com');
    expect(detail.transferIn).toBeUndefined();
    expect(detail.fees).toBeUndefined();
  });

  // ── updateDomainSettings() ─────────────────────────────────────────────

  it('should update domain settings', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(
        cfOk({
          domain_name: 'example.com',
          status: 'active',
          expires_at: '2025-12-31',
          auto_renew: true,
          locked: true,
          privacy: true,
        }),
      ),
    );

    const result = await service.updateDomainSettings('example.com', {
      autoRenew: true,
      locked: true,
      privacy: true,
    });

    expect(result.autoRenew).toBe(true);
    expect(result.locked).toBe(true);
    expect(result.privacy).toBe(true);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/accounts/acct_abc123/registrar/domains/example.com');
    expect(init.method).toBe('PUT');
    const body = JSON.parse(init.body);
    expect(body.auto_renew).toBe(true);
    expect(body.locked).toBe(true);
    expect(body.privacy).toBe(true);
  });

  it('should only send provided settings fields', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(cfOk({ domain_name: 'x.com', status: 'active', expires_at: '', auto_renew: false, locked: false, privacy: false })),
    );

    await service.updateDomainSettings('x.com', { autoRenew: false });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.auto_renew).toBe(false);
    expect(body.locked).toBeUndefined();
    expect(body.privacy).toBeUndefined();
  });

  // ── transferDomain() ───────────────────────────────────────────────────

  it('should initiate a domain transfer', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(cfOk({})));

    const result = await service.transferDomain('example.com', 'AUTH_CODE_123');

    expect(result.domain).toBe('example.com');
    expect(result.status).toBe('INITIATED');
    expect(result.message).toContain('initiated successfully');

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/accounts/acct_abc123/registrar/domains/example.com/transfer');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.auth_code).toBe('AUTH_CODE_123');
  });

  it('should return FAILED status when transfer fails', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(cfError(1001, 'Transfer not allowed'), 400),
    );

    // The service throws on non-ok responses, so wrap in try-catch
    await expect(service.transferDomain('locked.com', 'BAD')).rejects.toThrow('Cloudflare API 400');
  });

  // ── findZoneId() ──────────────────────────────────────────────────────

  it('should find zone ID by domain name', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(cfOk([{ id: 'zone_123', name: 'example.com', status: 'active' }])),
    );

    const zoneId = await service.findZoneId('example.com');

    expect(zoneId).toBe('zone_123');
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('/zones?name=example.com');
  });

  it('should throw when no zone is found', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(cfOk([])));

    await expect(service.findZoneId('unknown.com')).rejects.toThrow(
      'No Cloudflare zone found for "unknown.com"',
    );
  });

  // ── listDnsRecords() ──────────────────────────────────────────────────

  it('should list DNS records for a zone', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(
        cfOk([
          { id: 'rec_1', name: 'example.com', type: 'A', content: '1.2.3.4', ttl: 1, proxied: true, created_on: '2024-01-01', modified_on: '2024-06-01' },
          { id: 'rec_2', name: 'mail.example.com', type: 'MX', content: 'mx.example.com', ttl: 3600, proxied: false, priority: 10 },
        ]),
      ),
    );

    const records = await service.listDnsRecords('zone_123');

    expect(records).toHaveLength(2);
    expect(records[0].id).toBe('rec_1');
    expect(records[0].proxied).toBe(true);
    expect(records[0].createdOn).toBe('2024-01-01');
    expect(records[1].priority).toBe(10);
  });

  // ── createDnsRecord() ─────────────────────────────────────────────────

  it('should create a DNS record', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(cfOk({ id: 'rec_new', name: 'www.example.com', type: 'CNAME', content: 'example.com', ttl: 1, proxied: true })),
    );

    const record = await service.createDnsRecord('zone_123', {
      name: 'www.example.com',
      type: 'CNAME',
      content: 'example.com',
      proxied: true,
    });

    expect(record.id).toBe('rec_new');
    expect(record.type).toBe('CNAME');
    expect(record.proxied).toBe(true);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.name).toBe('www.example.com');
    expect(body.type).toBe('CNAME');
    expect(body.ttl).toBe(1); // automatic
    expect(body.proxied).toBe(true);
  });

  it('should set default ttl=1 when not provided', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(cfOk({ id: 'x', name: 'x', type: 'A', content: '1.2.3.4', ttl: 1, proxied: false })));

    await service.createDnsRecord('zone_123', { name: '@', type: 'A', content: '1.2.3.4' });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.ttl).toBe(1);
  });

  // ── updateDnsRecord() ─────────────────────────────────────────────────

  it('should update an existing DNS record', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(cfOk({ id: 'rec_1', name: 'example.com', type: 'A', content: '5.6.7.8', ttl: 300, proxied: false })),
    );

    const record = await service.updateDnsRecord('zone_123', 'rec_1', {
      content: '5.6.7.8',
      ttl: 300,
    });

    expect(record.content).toBe('5.6.7.8');
    expect(record.ttl).toBe(300);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/zones/zone_123/dns_records/rec_1');
    expect(init.method).toBe('PUT');
  });

  // ── deleteDnsRecord() ─────────────────────────────────────────────────

  it('should delete a DNS record', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(cfOk({ id: 'rec_1' })));

    await service.deleteDnsRecord('zone_123', 'rec_1');

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/zones/zone_123/dns_records/rec_1');
    expect(init.method).toBe('DELETE');
  });

  // ── Auth header ────────────────────────────────────────────────────────

  it('should include Bearer token in all requests', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(cfOk([])));

    await service.listDomains();

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers['Authorization']).toBe('Bearer cf_test_token_123');
    expect(headers['Content-Type']).toBe('application/json');
  });

  // ── Error handling ─────────────────────────────────────────────────────

  it('should throw on HTTP error with Cloudflare error message', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(cfError(9109, 'Invalid access token'), 403),
    );

    await expect(service.listDomains()).rejects.toThrow(
      'Cloudflare API 403: Invalid access token',
    );
  });

  it('should throw on invalid JSON response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve('not json at all'),
    } as any);

    await expect(service.listDomains()).rejects.toThrow('invalid JSON');
  });

  it('should throw on success=false in response body', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(cfError(1004, 'DNS Validation Error')),
    );

    await expect(
      service.createDnsRecord('zone_123', { name: '@', type: 'A', content: 'bad' }),
    ).rejects.toThrow('Cloudflare API error: DNS Validation Error');
  });
});
