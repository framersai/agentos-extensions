// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PorkbunService, type PorkbunConfig } from '../src/PorkbunService';

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

const DEFAULT_CONFIG: PorkbunConfig = {
  apiKey: 'pk_test_123',
  secretApiKey: 'sk_test_456',
  baseUrl: 'https://api.porkbun.com/api/json/v3',
};

let mockFetch: ReturnType<typeof vi.fn>;
let service: PorkbunService;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PorkbunService', () => {
  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    service = new PorkbunService(DEFAULT_CONFIG);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Constructor ──────────────────────────────────────────────────────────

  it('should use default baseUrl when none is provided', () => {
    const svc = new PorkbunService({ apiKey: 'a', secretApiKey: 'b' });
    // Accessing private field via any to verify default
    expect((svc as any).config.baseUrl).toBe('https://api.porkbun.com/api/json/v3');
  });

  it('should use custom baseUrl when provided', () => {
    const svc = new PorkbunService({ apiKey: 'a', secretApiKey: 'b', baseUrl: 'https://custom.api.dev' });
    expect((svc as any).config.baseUrl).toBe('https://custom.api.dev');
  });

  // ── initialize() ────────────────────────────────────────────────────────

  it('should initialize successfully on ping SUCCESS', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ status: 'SUCCESS', yourIp: '1.2.3.4' }));

    await service.initialize();

    expect(service.isRunning).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.porkbun.com/api/json/v3/ping');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.apikey).toBe('pk_test_123');
    expect(body.secretapikey).toBe('sk_test_456');
  });

  it('should throw on ping failure', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ status: 'ERROR', message: 'Invalid API key' }),
    );

    await expect(service.initialize()).rejects.toThrow('Porkbun auth failed');
    expect(service.isRunning).toBe(false);
  });

  // ── shutdown() ──────────────────────────────────────────────────────────

  it('should set isRunning to false on shutdown', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ status: 'SUCCESS' }));
    await service.initialize();
    expect(service.isRunning).toBe(true);

    await service.shutdown();
    expect(service.isRunning).toBe(false);
  });

  // ── checkAvailability() ─────────────────────────────────────────────────

  it('should return available=true when domain is available', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ status: 'SUCCESS', avail: true }),
    );
    // pricing call
    mockFetch.mockResolvedValueOnce(
      mockResponse({ status: 'SUCCESS', pricing: { registration: '9.73', renewal: '9.73', transfer: '9.73' } }),
    );

    const result = await service.checkAvailability('example.dev');

    expect(result.domain).toBe('example.dev');
    expect(result.available).toBe(true);
    expect(result.pricing?.registration).toBe('9.73');
  });

  it('should return available=false when domain is taken', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ status: 'SUCCESS', avail: false }),
    );
    // pricing may fail for unavailable domains — mock failure
    mockFetch.mockResolvedValueOnce(
      mockResponse({ status: 'ERROR', message: 'No pricing' }),
    );

    const result = await service.checkAvailability('google.com');

    expect(result.domain).toBe('google.com');
    expect(result.available).toBe(false);
    expect(result.pricing).toBeUndefined();
  });

  it('should handle string "true" for avail field', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ status: 'SUCCESS', avail: 'true' }),
    );
    mockFetch.mockResolvedValueOnce(
      mockResponse({ status: 'ERROR', message: 'nope' }),
    );

    const result = await service.checkAvailability('test.io');
    expect(result.available).toBe(true);
  });

  // ── getPricing() ────────────────────────────────────────────────────────

  it('should return pricing for a domain', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ status: 'SUCCESS', pricing: { registration: '10.00', renewal: '10.00', transfer: '10.00', couponed: '8.00' } }),
    );

    const pricing = await service.getPricing('example.com');

    expect(pricing.registration).toBe('10.00');
    expect(pricing.renewal).toBe('10.00');
    expect(pricing.transfer).toBe('10.00');
    expect(pricing.couponed).toBe('8.00');
  });

  // ── registerDomain() ───────────────────────────────────────────────────

  it('should register a domain successfully', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ status: 'SUCCESS', message: 'Domain registered' }),
    );

    const result = await service.registerDomain({ domain: 'newsite.dev', years: 2 });

    expect(result.domain).toBe('newsite.dev');
    expect(result.status).toBe('SUCCESS');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.domain).toBe('newsite.dev');
    expect(body.years).toBe(2);
  });

  it('should default to 1 year when years not specified', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ status: 'SUCCESS' }),
    );

    await service.registerDomain({ domain: 'newsite.dev' });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.years).toBe(1);
  });

  it('should include optional contact fields', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ status: 'SUCCESS' }),
    );

    await service.registerDomain({
      domain: 'newsite.dev',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      phone: '+1.5551234567',
      city: 'New York',
      state: 'NY',
      zip: '10001',
      country: 'US',
      organization: 'Acme',
      address: '123 Main St',
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.firstName).toBe('John');
    expect(body.stateProvince).toBe('NY');
    expect(body.addressLine1).toBe('123 Main St');
    expect(body.organization).toBe('Acme');
  });

  // ── listDomains() ──────────────────────────────────────────────────────

  it('should list all domains', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        status: 'SUCCESS',
        domains: [
          {
            domain: 'foo.dev',
            status: 'ACTIVE',
            tld: 'dev',
            createDate: '2024-01-01',
            expireDate: '2025-01-01',
            securityLock: '1',
            whoisPrivacy: true,
            autoRenew: '1',
            notLocal: '0',
          },
        ],
      }),
    );

    const domains = await service.listDomains();

    expect(domains).toHaveLength(1);
    expect(domains[0].domain).toBe('foo.dev');
    expect(domains[0].securityLock).toBe(true);
    expect(domains[0].whoisPrivacy).toBe(true);
    expect(domains[0].autoRenew).toBe(true);
    expect(domains[0].notLocal).toBe(false);
  });

  it('should return empty array when no domains', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ status: 'SUCCESS' }),
    );

    const domains = await service.listDomains();
    expect(domains).toEqual([]);
  });

  // ── createDnsRecord() ──────────────────────────────────────────────────

  it('should create a DNS record and return its id', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ status: 'SUCCESS', id: '12345' }),
    );

    const result = await service.createDnsRecord('example.com', {
      type: 'A',
      content: '1.2.3.4',
      name: 'www',
    });

    expect(result.id).toBe('12345');
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/dns/create/example.com');
  });

  // ── editDnsRecord() ────────────────────────────────────────────────────

  it('should edit an existing DNS record', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ status: 'SUCCESS' }),
    );

    await service.editDnsRecord('example.com', '12345', {
      content: '5.6.7.8',
      ttl: '600',
    });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/dns/edit/example.com/12345');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.content).toBe('5.6.7.8');
    expect(body.ttl).toBe('600');
  });

  // ── deleteDnsRecord() ──────────────────────────────────────────────────

  it('should delete a DNS record', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ status: 'SUCCESS' }),
    );

    await service.deleteDnsRecord('example.com', '12345');

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/dns/delete/example.com/12345');
  });

  // ── listDnsRecords() ──────────────────────────────────────────────────

  it('should list DNS records for a domain', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        status: 'SUCCESS',
        records: [
          { id: '1', name: 'www', type: 'A', content: '1.2.3.4', ttl: '300', prio: null, notes: null },
          { id: '2', name: 'mail', type: 'MX', content: 'mx.example.com', ttl: '600', prio: '10', notes: 'Primary MX' },
        ],
      }),
    );

    const records = await service.listDnsRecords('example.com');

    expect(records).toHaveLength(2);
    expect(records[0].id).toBe('1');
    expect(records[0].type).toBe('A');
    expect(records[1].prio).toBe('10');
    expect(records[1].notes).toBe('Primary MX');
  });

  // ── getDnsRecordsByNameType() ──────────────────────────────────────────

  it('should retrieve DNS records by name and type', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        status: 'SUCCESS',
        records: [
          { id: '3', name: 'www', type: 'A', content: '1.2.3.4', ttl: '300' },
        ],
      }),
    );

    const records = await service.getDnsRecordsByNameType('example.com', 'A', 'www');

    expect(records).toHaveLength(1);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/dns/retrieveByNameType/example.com/A/www');
  });

  it('should use empty subdomain when not specified', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ status: 'SUCCESS', records: [] }),
    );

    await service.getDnsRecordsByNameType('example.com', 'CNAME');

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/dns/retrieveByNameType/example.com/CNAME/');
  });

  // ── transferDomain() ───────────────────────────────────────────────────

  it('should initiate a domain transfer', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ status: 'SUCCESS', message: 'Transfer initiated' }),
    );

    const result = await service.transferDomain('example.com', 'AUTH123');

    expect(result.domain).toBe('example.com');
    expect(result.status).toBe('SUCCESS');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.domain).toBe('example.com');
    expect(body.authCode).toBe('AUTH123');
  });

  // ── Error handling ─────────────────────────────────────────────────────

  it('should throw on HTTP error with message from response', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ status: 'ERROR', message: 'Unauthorized' }, 401),
    );

    await expect(service.checkAvailability('test.com')).rejects.toThrow(
      'Porkbun API 401: Unauthorized',
    );
  });

  it('should throw on invalid JSON response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve('not json'),
    } as any);

    await expect(service.checkAvailability('test.com')).rejects.toThrow(
      'invalid JSON',
    );
  });

  it('should throw on API-level ERROR status', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ status: 'ERROR', message: 'Domain not found' }),
    );

    await expect(service.listDnsRecords('nonexistent.com')).rejects.toThrow(
      'Porkbun API error: Domain not found',
    );
  });

  // ── Auth payload ──────────────────────────────────────────────────────

  it('should include apikey and secretapikey in every POST body', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ status: 'SUCCESS', domains: [] }),
    );

    await service.listDomains();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.apikey).toBe('pk_test_123');
    expect(body.secretapikey).toBe('sk_test_456');
  });

  it('should always use POST method', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ status: 'SUCCESS', domains: [] }),
    );

    await service.listDomains();

    expect(mockFetch.mock.calls[0][1].method).toBe('POST');
  });
});
