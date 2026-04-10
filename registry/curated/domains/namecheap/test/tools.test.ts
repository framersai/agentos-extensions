// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NamecheapConfigureDnsTool } from '../src/tools/configureDns';
import { NamecheapGetDnsRecordsTool } from '../src/tools/getDnsRecords';
import { NamecheapListDomainsTool } from '../src/tools/listDomains';
import { NamecheapRegisterDomainTool } from '../src/tools/registerDomain';
import { NamecheapSearchDomainTool } from '../src/tools/searchDomain';

// ---------------------------------------------------------------------------
// Mock the static splitDomain method used by ConfigureDns and GetDnsRecords
// ---------------------------------------------------------------------------

vi.mock('../src/NamecheapService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/NamecheapService')>();
  return {
    ...actual,
    NamecheapService: class MockNamecheapService {
      static splitDomain(domain: string) {
        const parts = domain.split('.');
        const tld = parts.pop()!;
        const sld = parts.join('.');
        return { sld, tld };
      }
    },
  };
});

// ---------------------------------------------------------------------------
// NamecheapConfigureDnsTool
// ---------------------------------------------------------------------------

describe('NamecheapConfigureDnsTool', () => {
  let service: any;
  let tool: NamecheapConfigureDnsTool;

  beforeEach(() => {
    service = {
      setDnsHosts: vi.fn(),
    };
    tool = new NamecheapConfigureDnsTool(service);
  });

  it('should have correct metadata', () => {
    expect(tool.id).toBe('namecheapConfigureDns');
    expect(tool.name).toBe('namecheapConfigureDns');
    expect(tool.displayName).toBe('Configure DNS Records');
    expect(tool.inputSchema.type).toBe('object');
    expect(tool.inputSchema.required).toContain('domain');
    expect(tool.inputSchema.required).toContain('records');
    expect(tool.category).toBe('domain');
  });

  it('should set DNS records successfully', async () => {
    service.setDnsHosts.mockResolvedValue({ success: true });

    const result = await tool.execute({
      domain: 'example.com',
      records: [
        { hostName: '@', recordType: 'A', address: '1.2.3.4' },
        { hostName: 'www', recordType: 'CNAME', address: 'example.com' },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ domain: 'example.com', recordsSet: 2 });
    expect(service.setDnsHosts).toHaveBeenCalledWith('example', 'com', expect.any(Array));
  });

  it('should fail when records array is empty', async () => {
    const result = await tool.execute({
      domain: 'example.com',
      records: [],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('No DNS records provided');
  });

  it('should report failure when API returns success=false', async () => {
    service.setDnsHosts.mockResolvedValue({ success: false });

    const result = await tool.execute({
      domain: 'example.com',
      records: [{ hostName: '@', recordType: 'A', address: '1.2.3.4' }],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Namecheap API reported failure');
  });

  it('should handle errors gracefully', async () => {
    service.setDnsHosts.mockRejectedValue(new Error('Network error'));

    const result = await tool.execute({
      domain: 'example.com',
      records: [{ hostName: '@', recordType: 'A', address: '1.2.3.4' }],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Network error');
  });
});

// ---------------------------------------------------------------------------
// NamecheapGetDnsRecordsTool
// ---------------------------------------------------------------------------

describe('NamecheapGetDnsRecordsTool', () => {
  let service: any;
  let tool: NamecheapGetDnsRecordsTool;

  beforeEach(() => {
    service = {
      getDnsHosts: vi.fn(),
    };
    tool = new NamecheapGetDnsRecordsTool(service);
  });

  it('should have correct metadata', () => {
    expect(tool.id).toBe('namecheapGetDnsRecords');
    expect(tool.name).toBe('namecheapGetDnsRecords');
    expect(tool.inputSchema.type).toBe('object');
    expect(tool.inputSchema.required).toContain('domain');
    expect(tool.hasSideEffects).toBe(false);
  });

  it('should retrieve DNS records', async () => {
    service.getDnsHosts.mockResolvedValue([
      { hostName: '@', type: 'A', address: '1.2.3.4', ttl: '1800', isActive: true },
      { hostName: 'www', type: 'CNAME', address: 'example.com', ttl: '1800', isActive: true },
    ]);

    const result = await tool.execute({ domain: 'example.com' });

    expect(result.success).toBe(true);
    expect(result.data?.domain).toBe('example.com');
    expect(result.data?.records).toHaveLength(2);
    expect(service.getDnsHosts).toHaveBeenCalledWith('example', 'com');
  });

  it('should handle errors gracefully', async () => {
    service.getDnsHosts.mockRejectedValue(new Error('Domain not found'));

    const result = await tool.execute({ domain: 'nonexistent.com' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Domain not found');
  });
});

// ---------------------------------------------------------------------------
// NamecheapListDomainsTool
// ---------------------------------------------------------------------------

describe('NamecheapListDomainsTool', () => {
  let service: any;
  let tool: NamecheapListDomainsTool;

  beforeEach(() => {
    service = {
      listDomains: vi.fn(),
    };
    tool = new NamecheapListDomainsTool(service);
  });

  it('should have correct metadata', () => {
    expect(tool.id).toBe('namecheapListDomains');
    expect(tool.name).toBe('namecheapListDomains');
    expect(tool.inputSchema.type).toBe('object');
    expect(tool.inputSchema.required).toEqual([]);
    expect(tool.hasSideEffects).toBe(false);
  });

  it('should list domains with pagination', async () => {
    service.listDomains.mockResolvedValue({
      domains: [
        { name: 'example.com', created: '2024-01-01', expires: '2025-01-01' },
      ],
      totalItems: 1,
      paging: { currentPage: 1, pageSize: 20 },
    });

    const result = await tool.execute({});

    expect(result.success).toBe(true);
    expect(result.data?.domains).toHaveLength(1);
    expect(result.data?.totalItems).toBe(1);
    expect(result.data?.currentPage).toBe(1);
    expect(result.data?.pageSize).toBe(20);
    expect(service.listDomains).toHaveBeenCalledWith(20, 1);
  });

  it('should pass custom pageSize and page', async () => {
    service.listDomains.mockResolvedValue({
      domains: [],
      totalItems: 0,
      paging: { currentPage: 3, pageSize: 50 },
    });

    await tool.execute({ pageSize: 50, page: 3 });

    expect(service.listDomains).toHaveBeenCalledWith(50, 3);
  });

  it('should handle errors gracefully', async () => {
    service.listDomains.mockRejectedValue(new Error('API error'));

    const result = await tool.execute({});

    expect(result.success).toBe(false);
    expect(result.error).toContain('API error');
  });
});

// ---------------------------------------------------------------------------
// NamecheapRegisterDomainTool
// ---------------------------------------------------------------------------

describe('NamecheapRegisterDomainTool', () => {
  let service: any;
  let tool: NamecheapRegisterDomainTool;

  beforeEach(() => {
    service = {
      registerDomain: vi.fn(),
    };
    tool = new NamecheapRegisterDomainTool(service);
  });

  it('should have correct metadata', () => {
    expect(tool.id).toBe('namecheapRegisterDomain');
    expect(tool.name).toBe('namecheapRegisterDomain');
    expect(tool.inputSchema.type).toBe('object');
    expect(tool.inputSchema.required).toContain('domainName');
    expect(tool.inputSchema.required).toContain('registrant');
    expect(tool.hasSideEffects).toBe(true);
  });

  it('should register a domain successfully', async () => {
    service.registerDomain.mockResolvedValue({
      domain: 'newsite.com',
      registered: true,
      orderId: '12345',
      transactionId: '67890',
    });

    const registrant = {
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

    const result = await tool.execute({
      domainName: 'newsite.com',
      registrant,
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('domain', 'newsite.com');
    expect(service.registerDomain).toHaveBeenCalledWith(
      expect.objectContaining({
        domainName: 'newsite.com',
        registrant,
      }),
    );
  });

  it('should pass optional fields including WhoisGuard and nameservers', async () => {
    service.registerDomain.mockResolvedValue({ domain: 'test.com', registered: true });

    const registrant = {
      firstName: 'Jane',
      lastName: 'Smith',
      address1: '456 Oak Ave',
      city: 'LA',
      stateProvince: 'CA',
      postalCode: '90001',
      country: 'US',
      phone: '+1.5559876543',
      emailAddress: 'jane@example.com',
    };

    await tool.execute({
      domainName: 'test.com',
      years: 3,
      registrant,
      addFreeWhoisguard: true,
      wgEnabled: true,
      nameservers: 'ns1.custom.com,ns2.custom.com',
    });

    expect(service.registerDomain).toHaveBeenCalledWith(
      expect.objectContaining({
        years: 3,
        addFreeWhoisguard: true,
        wgEnabled: true,
        nameservers: 'ns1.custom.com,ns2.custom.com',
      }),
    );
  });

  it('should handle errors gracefully', async () => {
    service.registerDomain.mockRejectedValue(new Error('Insufficient funds'));

    const result = await tool.execute({
      domainName: 'expensive.io',
      registrant: {
        firstName: 'J',
        lastName: 'D',
        address1: '1 St',
        city: 'C',
        stateProvince: 'S',
        postalCode: '0',
        country: 'US',
        phone: '+1.0',
        emailAddress: 'j@d.com',
      },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Insufficient funds');
  });
});

// ---------------------------------------------------------------------------
// NamecheapSearchDomainTool
// ---------------------------------------------------------------------------

describe('NamecheapSearchDomainTool', () => {
  let service: any;
  let tool: NamecheapSearchDomainTool;

  beforeEach(() => {
    service = {
      checkAvailability: vi.fn(),
    };
    tool = new NamecheapSearchDomainTool(service);
  });

  it('should have correct metadata', () => {
    expect(tool.id).toBe('namecheapSearchDomain');
    expect(tool.name).toBe('namecheapSearchDomain');
    expect(tool.inputSchema.type).toBe('object');
    expect(tool.inputSchema.required).toContain('domains');
    expect(tool.hasSideEffects).toBe(false);
  });

  it('should check availability for multiple domains', async () => {
    service.checkAvailability.mockResolvedValue([
      { domain: 'example.com', available: false },
      { domain: 'example.net', available: true, price: '10.98' },
    ]);

    const result = await tool.execute({ domains: 'example.com,example.net' });

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2);
    expect(service.checkAvailability).toHaveBeenCalledWith('example.com,example.net');
  });

  it('should check a single domain', async () => {
    service.checkAvailability.mockResolvedValue([
      { domain: 'unique.dev', available: true },
    ]);

    const result = await tool.execute({ domains: 'unique.dev' });

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
  });

  it('should handle errors gracefully', async () => {
    service.checkAvailability.mockRejectedValue(new Error('API rate limit'));

    const result = await tool.execute({ domains: 'test.com' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('API rate limit');
  });
});
