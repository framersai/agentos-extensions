import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NamecheapService, type NamecheapConfig } from '../src/NamecheapService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockResponse(body: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Headers(),
    redirected: false,
    type: 'basic' as ResponseType,
    url: '',
    clone: () => mockResponse(body, status),
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    json: () => Promise.resolve(JSON.parse(body)),
    text: () => Promise.resolve(body),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response;
}

/** Wrap XML in a standard Namecheap OK ApiResponse envelope. */
function xmlOk(commandResponse: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<ApiResponse Status="OK" xmlns="http://api.namecheap.com/xml.response">
  <RequestedCommand>namecheap.test</RequestedCommand>
  <CommandResponse Type="namecheap.test">
    ${commandResponse}
  </CommandResponse>
</ApiResponse>`;
}

/** Wrap XML in a standard Namecheap ERROR envelope. */
function xmlError(number: string, message: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<ApiResponse Status="ERROR" xmlns="http://api.namecheap.com/xml.response">
  <Errors>
    <Error Number="${number}">${message}</Error>
  </Errors>
</ApiResponse>`;
}

const DEFAULT_CONFIG: NamecheapConfig = {
  apiUser: 'testuser',
  apiKey: 'test-api-key',
  clientIp: '127.0.0.1',
  useSandbox: true,
};

let mockFetch: ReturnType<typeof vi.fn>;
let service: NamecheapService;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NamecheapService', () => {
  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    service = new NamecheapService(DEFAULT_CONFIG);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Constructor ──────────────────────────────────────────────────────────

  it('should use sandbox URL when useSandbox is true', () => {
    expect((service as any).config.baseUrl).toBe('https://api.sandbox.namecheap.com/xml.response');
  });

  it('should use production URL when useSandbox is false', () => {
    const svc = new NamecheapService({ ...DEFAULT_CONFIG, useSandbox: false });
    expect((svc as any).config.baseUrl).toBe('https://api.namecheap.com/xml.response');
  });

  it('should use custom baseUrl when provided', () => {
    const svc = new NamecheapService({ ...DEFAULT_CONFIG, baseUrl: 'https://custom.api' });
    expect((svc as any).config.baseUrl).toBe('https://custom.api');
  });

  it('should default userName to apiUser', () => {
    expect((service as any).config.userName).toBe('testuser');
  });

  // ── initialize() ────────────────────────────────────────────────────────

  it('should initialize successfully when listDomains succeeds', async () => {
    const xml = xmlOk(`
      <DomainGetListResult>
      </DomainGetListResult>
      <Paging><TotalItems>0</TotalItems><CurrentPage>1</CurrentPage><PageSize>1</PageSize></Paging>
    `);
    mockFetch.mockResolvedValueOnce(mockResponse(xml));

    await service.initialize();

    expect(service.isRunning).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('Command=namecheap.domains.getList');
    expect(url).toContain('PageSize=1');
  });

  it('should throw on initialize when API returns error', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(xmlError('2030280', 'API Key is invalid'), 200),
    );

    await expect(service.initialize()).rejects.toThrow('Namecheap API error');
    expect(service.isRunning).toBe(false);
  });

  // ── shutdown() ──────────────────────────────────────────────────────────

  it('should set isRunning to false on shutdown', async () => {
    const xml = xmlOk('<Paging><TotalItems>0</TotalItems><CurrentPage>1</CurrentPage><PageSize>1</PageSize></Paging>');
    mockFetch.mockResolvedValueOnce(mockResponse(xml));
    await service.initialize();

    await service.shutdown();
    expect(service.isRunning).toBe(false);
  });

  // ── checkAvailability() ─────────────────────────────────────────────────

  it('should parse available domains correctly', async () => {
    const xml = xmlOk(`
      <DomainCheckResult Domain="example.com" Available="true" IsPremiumName="false" />
      <DomainCheckResult Domain="example.net" Available="false" IsPremiumName="false" />
    `);
    mockFetch.mockResolvedValueOnce(mockResponse(xml));

    const results = await service.checkAvailability('example.com,example.net');

    expect(results).toHaveLength(2);
    expect(results[0].domain).toBe('example.com');
    expect(results[0].available).toBe(true);
    expect(results[0].isPremiumName).toBe(false);
    expect(results[1].domain).toBe('example.net');
    expect(results[1].available).toBe(false);
  });

  it('should detect premium domains', async () => {
    const xml = xmlOk(
      '<DomainCheckResult Domain="premium.io" Available="true" IsPremiumName="true" PremiumRegistrationPrice="999.00" />',
    );
    mockFetch.mockResolvedValueOnce(mockResponse(xml));

    const results = await service.checkAvailability('premium.io');

    expect(results[0].isPremiumName).toBe(true);
    expect(results[0].premiumRegistrationPrice).toBe('999.00');
  });

  // ── registerDomain() ───────────────────────────────────────────────────

  it('should register a domain and return result', async () => {
    const xml = xmlOk(
      '<DomainCreateResult Domain="newsite.com" Registered="true" ChargedAmount="10.87" DomainID="12345" OrderID="67890" TransactionID="111" WhoisguardEnable="true" NonRealTimeDomain="false" />',
    );
    mockFetch.mockResolvedValueOnce(mockResponse(xml));

    const contact = {
      firstName: 'John',
      lastName: 'Doe',
      address1: '123 Main St',
      city: 'New York',
      stateProvince: 'NY',
      postalCode: '10001',
      country: 'US',
      phone: '+1.5551234567',
      emailAddress: 'john@example.com',
    };

    const result = await service.registerDomain({
      domainName: 'newsite.com',
      years: 1,
      registrant: contact,
    });

    expect(result.domain).toBe('newsite.com');
    expect(result.registered).toBe(true);
    expect(result.chargedAmount).toBe('10.87');
    expect(result.domainId).toBe('12345');
    expect(result.whoisguardEnabled).toBe(true);

    // Verify contact fields are sent
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('RegistrantFirstName=John');
    expect(url).toContain('TechFirstName=John'); // defaults to registrant
    expect(url).toContain('AdminFirstName=John');
    expect(url).toContain('AuxBillingFirstName=John');
  });

  it('should default WhoisGuard to yes', async () => {
    const xml = xmlOk('<DomainCreateResult Domain="x.com" Registered="true" ChargedAmount="0" DomainID="" OrderID="" TransactionID="" WhoisguardEnable="true" NonRealTimeDomain="false" />');
    mockFetch.mockResolvedValueOnce(mockResponse(xml));

    const contact = { firstName: 'A', lastName: 'B', address1: 'X', city: 'Y', stateProvince: 'Z', postalCode: '0', country: 'US', phone: '0', emailAddress: 'a@b.c' };
    await service.registerDomain({ domainName: 'x.com', registrant: contact });

    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('AddFreeWhoisguard=yes');
    expect(url).toContain('WGEnabled=yes');
  });

  // ── listDomains() ──────────────────────────────────────────────────────

  it('should list domains with paging info', async () => {
    const xml = xmlOk(`
      <DomainGetListResult>
        <Domain ID="123" Name="example.com" User="testuser" Created="2024-01-01" Expires="2025-01-01" IsExpired="false" IsLocked="true" AutoRenew="true" WhoisGuard="ENABLED" Nameservers="dns1.p01.nsone.net,dns2.p01.nsone.net" />
      </DomainGetListResult>
      <Paging><TotalItems>1</TotalItems><CurrentPage>1</CurrentPage><PageSize>20</PageSize></Paging>
    `);
    mockFetch.mockResolvedValueOnce(mockResponse(xml));

    const result = await service.listDomains();

    expect(result.domains).toHaveLength(1);
    expect(result.domains[0].id).toBe('123');
    expect(result.domains[0].name).toBe('example.com');
    expect(result.domains[0].isLocked).toBe(true);
    expect(result.domains[0].autoRenew).toBe(true);
    expect(result.totalItems).toBe(1);
    expect(result.paging.currentPage).toBe(1);
  });

  it('should pass pageSize and page parameters', async () => {
    const xml = xmlOk('<Paging><TotalItems>0</TotalItems><CurrentPage>2</CurrentPage><PageSize>5</PageSize></Paging>');
    mockFetch.mockResolvedValueOnce(mockResponse(xml));

    await service.listDomains(5, 2);

    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('PageSize=5');
    expect(url).toContain('Page=2');
  });

  // ── getDnsHosts() ──────────────────────────────────────────────────────

  it('should return DNS host records', async () => {
    const xml = xmlOk(`
      <DomainDNSGetHostsResult Domain="example.com" IsUsingOurDNS="true">
        <host HostId="1" Name="@" Type="A" Address="1.2.3.4" MXPref="10" TTL="1800" IsActive="true" IsDDNSEnabled="false" />
        <host HostId="2" Name="www" Type="CNAME" Address="example.com." MXPref="10" TTL="1800" IsActive="true" IsDDNSEnabled="false" />
      </DomainDNSGetHostsResult>
    `);
    mockFetch.mockResolvedValueOnce(mockResponse(xml));

    const records = await service.getDnsHosts('example', 'com');

    expect(records).toHaveLength(2);
    expect(records[0].hostId).toBe('1');
    expect(records[0].name).toBe('@');
    expect(records[0].type).toBe('A');
    expect(records[0].address).toBe('1.2.3.4');
    expect(records[0].isActive).toBe(true);
    expect(records[1].name).toBe('www');
    expect(records[1].type).toBe('CNAME');
  });

  // ── setDnsHosts() ──────────────────────────────────────────────────────

  it('should set DNS hosts successfully', async () => {
    const xml = xmlOk('<DomainDNSSetHostsResult Domain="example.com" IsSuccess="true" />');
    mockFetch.mockResolvedValueOnce(mockResponse(xml));

    const result = await service.setDnsHosts('example', 'com', [
      { hostName: '@', recordType: 'A', address: '1.2.3.4' },
      { hostName: 'www', recordType: 'CNAME', address: 'example.com.', ttl: '300' },
    ]);

    expect(result.success).toBe(true);
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('SLD=example');
    expect(url).toContain('TLD=com');
    expect(url).toContain('HostName1=%40');
    expect(url).toContain('RecordType1=A');
    expect(url).toContain('Address1=1.2.3.4');
    expect(url).toContain('HostName2=www');
    expect(url).toContain('TTL2=300');
  });

  it('should return success=false when setHosts fails', async () => {
    const xml = xmlOk('<DomainDNSSetHostsResult Domain="example.com" IsSuccess="false" />');
    mockFetch.mockResolvedValueOnce(mockResponse(xml));

    const result = await service.setDnsHosts('example', 'com', []);
    expect(result.success).toBe(false);
  });

  // ── splitDomain() ─────────────────────────────────────────────────────

  it('should split simple domain', () => {
    const { sld, tld } = NamecheapService.splitDomain('example.com');
    expect(sld).toBe('example');
    expect(tld).toBe('com');
  });

  it('should split multi-part TLD', () => {
    const { sld, tld } = NamecheapService.splitDomain('example.co.uk');
    expect(sld).toBe('example');
    expect(tld).toBe('co.uk');
  });

  it('should throw on invalid domain', () => {
    expect(() => NamecheapService.splitDomain('localhost')).toThrow('Invalid domain');
  });

  // ── Error handling ─────────────────────────────────────────────────────

  it('should throw on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse('Internal Server Error', 500));

    await expect(service.checkAvailability('test.com')).rejects.toThrow(
      'Namecheap API HTTP 500',
    );
  });

  it('should throw on API error response with error number', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(xmlError('2030280', 'API Key is invalid or API access has not been enabled')),
    );

    await expect(service.checkAvailability('test.com')).rejects.toThrow(
      '[2030280] API Key is invalid',
    );
  });

  // ── Query params ──────────────────────────────────────────────────────

  it('should include auth params in every request', async () => {
    const xml = xmlOk('<DomainCheckResult Domain="test.com" Available="true" IsPremiumName="false" />');
    mockFetch.mockResolvedValueOnce(mockResponse(xml));

    await service.checkAvailability('test.com');

    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('ApiUser=testuser');
    expect(url).toContain('ApiKey=test-api-key');
    expect(url).toContain('UserName=testuser');
    expect(url).toContain('ClientIp=127.0.0.1');
  });

  it('should always use GET method', async () => {
    const xml = xmlOk('<DomainCheckResult Domain="test.com" Available="true" IsPremiumName="false" />');
    mockFetch.mockResolvedValueOnce(mockResponse(xml));

    await service.checkAvailability('test.com');

    expect(mockFetch.mock.calls[0][1].method).toBe('GET');
  });
});
