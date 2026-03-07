import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoDaddyService, type GoDaddyConfig } from '../src/GoDaddyService';

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
    text: () => Promise.resolve(typeof data === 'string' ? data : JSON.stringify(data)),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response;
}

const DEFAULT_CONFIG: GoDaddyConfig = {
  apiKey: 'gd_test_key',
  apiSecret: 'gd_test_secret',
  baseUrl: 'https://api.godaddy.com/v1',
};

let mockFetch: ReturnType<typeof vi.fn>;
let service: GoDaddyService;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GoDaddyService', () => {
  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    service = new GoDaddyService(DEFAULT_CONFIG);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Constructor ──────────────────────────────────────────────────────────

  it('should use default baseUrl when none is provided', () => {
    const svc = new GoDaddyService({ apiKey: 'a', apiSecret: 'b' });
    expect((svc as any).config.baseUrl).toBe('https://api.godaddy.com/v1');
  });

  it('should use sandbox URL when provided', () => {
    const svc = new GoDaddyService({ apiKey: 'a', apiSecret: 'b', baseUrl: 'https://api.ote-godaddy.com/v1' });
    expect((svc as any).config.baseUrl).toBe('https://api.ote-godaddy.com/v1');
  });

  // ── initialize() ────────────────────────────────────────────────────────

  it('should initialize successfully when API returns 200', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse([]));

    await service.initialize();

    expect(service.isRunning).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.godaddy.com/v1/domains?limit=1');
    expect(init.headers['Authorization']).toBe('sso-key gd_test_key:gd_test_secret');
  });

  it('should throw on failed auth during initialize', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse('Unauthorized', 401));

    await expect(service.initialize()).rejects.toThrow('GoDaddy auth failed: 401');
    expect(service.isRunning).toBe(false);
  });

  // ── shutdown() ──────────────────────────────────────────────────────────

  it('should set isRunning to false on shutdown', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse([]));
    await service.initialize();

    await service.shutdown();
    expect(service.isRunning).toBe(false);
  });

  // ── checkAvailability() ─────────────────────────────────────────────────

  it('should return domain availability with pricing', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        available: true,
        domain: 'example.dev',
        definitive: true,
        price: 1199,
        currency: 'USD',
        period: 1,
      }),
    );

    const result = await service.checkAvailability('example.dev');

    expect(result.available).toBe(true);
    expect(result.domain).toBe('example.dev');
    expect(result.definitive).toBe(true);
    expect(result.price).toBe(1199);
    expect(result.currency).toBe('USD');
    expect(result.period).toBe(1);
  });

  it('should return available=false for taken domains', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ available: false, domain: 'google.com', definitive: true, price: 0, currency: 'USD', period: 1 }),
    );

    const result = await service.checkAvailability('google.com');
    expect(result.available).toBe(false);
  });

  // ── purchaseDomain() ───────────────────────────────────────────────────

  it('should purchase a domain successfully', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ orderId: 99999, itemCount: 1, total: 1199, currency: 'USD' }),
    );

    const result = await service.purchaseDomain({
      domain: 'newsite.dev',
      period: 2,
      privacy: true,
      contactRegistrant: {
        nameFirst: 'John',
        nameLast: 'Doe',
        email: 'john@example.com',
        phone: '+1.5551234567',
      },
    });

    expect(result.orderId).toBe(99999);
    expect(result.total).toBe(1199);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.godaddy.com/v1/domains/purchase');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.domain).toBe('newsite.dev');
    expect(body.period).toBe(2);
    expect(body.privacy).toBe(true);
    expect(body.consent).toBeDefined();
    expect(body.consent.agreementKeys).toContain('DNRA');
  });

  it('should default period=1, renewAuto=true, privacy=false', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ orderId: 1, itemCount: 1, total: 0, currency: 'USD' }),
    );

    await service.purchaseDomain({
      domain: 'x.com',
      contactRegistrant: { nameFirst: 'A', nameLast: 'B', email: 'a@b.c', phone: '0' },
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.period).toBe(1);
    expect(body.renewAuto).toBe(true);
    expect(body.privacy).toBe(false);
  });

  // ── listDomains() ──────────────────────────────────────────────────────

  it('should list domains from account', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse([
        { domain: 'example.com', domainId: 1, status: 'ACTIVE', expires: '2025-01-01', createdAt: '2024-01-01', renewable: true, renewAuto: true, locked: false, nameServers: ['ns1.example.com'] },
        { domain: 'example.net', domainId: 2, status: 'ACTIVE', expires: '2025-06-01', createdAt: '2024-02-01', renewable: true, renewAuto: false, locked: true, nameServers: null },
      ]),
    );

    const domains = await service.listDomains();

    expect(domains).toHaveLength(2);
    expect(domains[0].domain).toBe('example.com');
    expect(domains[0].autoRenew).toBe(true);
    expect(domains[1].locked).toBe(true);
    expect(domains[1].autoRenew).toBe(false);
  });

  it('should support marker-based pagination', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse([]));

    await service.listDomains(50, 'example.com');

    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('limit=50');
    expect(url).toContain('marker=example.com');
  });

  // ── getDomainDetail() ──────────────────────────────────────────────────

  it('should get domain details', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        domain: 'example.com',
        domainId: 1,
        status: 'ACTIVE',
        expires: '2025-01-01',
        createdAt: '2024-01-01',
        modifiedAt: '2024-06-01',
        renewable: true,
        renewAuto: true,
        locked: false,
        nameServers: ['ns1.example.com', 'ns2.example.com'],
        contactRegistrant: { nameFirst: 'John', nameLast: 'Doe', email: 'j@e.com', phone: '0' },
      }),
    );

    const detail = await service.getDomainDetail('example.com');

    expect(detail.domain).toBe('example.com');
    expect(detail.nameServers).toEqual(['ns1.example.com', 'ns2.example.com']);
    expect(detail.contactRegistrant?.nameFirst).toBe('John');
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('/domains/example.com');
  });

  // ── getDnsRecords() ────────────────────────────────────────────────────

  it('should get all DNS records', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse([
        { type: 'A', name: '@', data: '1.2.3.4', ttl: 3600 },
        { type: 'MX', name: '@', data: 'mx.example.com', ttl: 3600, priority: 10 },
      ]),
    );

    const records = await service.getDnsRecords('example.com');

    expect(records).toHaveLength(2);
    expect(records[0].type).toBe('A');
    expect(records[0].data).toBe('1.2.3.4');
    expect(records[1].priority).toBe(10);
  });

  // ── getDnsRecordsByType() ──────────────────────────────────────────────

  it('should get DNS records filtered by type', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse([{ type: 'A', name: '@', data: '1.2.3.4', ttl: 3600 }]),
    );

    const records = await service.getDnsRecordsByType('example.com', 'A');

    expect(records).toHaveLength(1);
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('/domains/example.com/records/A');
  });

  // ── replaceDnsRecords() ────────────────────────────────────────────────

  it('should replace DNS records successfully', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}, 200));

    await service.replaceDnsRecords('example.com', 'A', '@', [
      { data: '5.6.7.8', ttl: 600 },
    ]);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/domains/example.com/records/A/%40');
    expect(init.method).toBe('PUT');
    const body = JSON.parse(init.body);
    expect(body[0].data).toBe('5.6.7.8');
    expect(body[0].ttl).toBe(600);
  });

  it('should throw on replaceDnsRecords failure', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse('Forbidden', 403));

    await expect(
      service.replaceDnsRecords('example.com', 'A', '@', [{ data: '1.2.3.4', ttl: 3600 }]),
    ).rejects.toThrow('GoDaddy API 403');
  });

  // ── addDnsRecords() ────────────────────────────────────────────────────

  it('should add DNS records via PATCH', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}, 200));

    await service.addDnsRecords('example.com', [
      { type: 'CNAME', name: 'www', data: 'example.com', ttl: 3600 },
    ]);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/domains/example.com/records');
    expect(init.method).toBe('PATCH');
  });

  it('should throw on addDnsRecords failure', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse('Bad Request', 400));

    await expect(
      service.addDnsRecords('example.com', [{ type: 'A', name: '@', data: 'invalid', ttl: 3600 }]),
    ).rejects.toThrow('GoDaddy API 400');
  });

  // ── deleteDnsRecords() ─────────────────────────────────────────────────

  it('should delete DNS records', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}, 204));

    await service.deleteDnsRecords('example.com', 'A', '@');

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/domains/example.com/records/A/%40');
    expect(init.method).toBe('DELETE');
  });

  it('should throw on deleteDnsRecords failure', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse('Not Found', 404));

    await expect(
      service.deleteDnsRecords('example.com', 'A', 'nonexistent'),
    ).rejects.toThrow('GoDaddy API 404');
  });

  // ── Auth header ────────────────────────────────────────────────────────

  it('should include sso-key Authorization header in all requests', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ available: true, domain: 'test.com', definitive: true, price: 0, currency: 'USD', period: 1 }),
    );

    await service.checkAvailability('test.com');

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers['Authorization']).toBe('sso-key gd_test_key:gd_test_secret');
    expect(headers['Content-Type']).toBe('application/json');
  });

  // ── Error handling ─────────────────────────────────────────────────────

  it('should throw on non-ok JSON response', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ code: 'UNABLE_TO_FIND', message: 'Domain not found' }, 404));

    await expect(service.getDomainDetail('nonexistent.com')).rejects.toThrow(
      'GoDaddy API 404',
    );
  });

  it('should handle empty arrays from API', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse([]));

    const domains = await service.listDomains();
    expect(domains).toEqual([]);
  });
});
