import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoDaddyConfigureDnsTool } from '../src/tools/configureDns';
import { GoDaddyGetDomainInfoTool } from '../src/tools/getDomainInfo';
import { GoDaddyListDomainsTool } from '../src/tools/listDomains';
import { GoDaddyRegisterDomainTool } from '../src/tools/registerDomain';
import { GoDaddySearchDomainTool } from '../src/tools/searchDomain';

// ---------------------------------------------------------------------------
// GoDaddyConfigureDnsTool
// ---------------------------------------------------------------------------

describe('GoDaddyConfigureDnsTool', () => {
  let service: any;
  let tool: GoDaddyConfigureDnsTool;

  beforeEach(() => {
    service = {
      getDnsRecords: vi.fn(),
      getDnsRecordsByType: vi.fn(),
      addDnsRecords: vi.fn(),
      deleteDnsRecords: vi.fn(),
      replaceDnsRecords: vi.fn(),
    };
    tool = new GoDaddyConfigureDnsTool(service);
  });

  it('should have correct metadata', () => {
    expect(tool.id).toBe('godaddyConfigureDns');
    expect(tool.name).toBe('godaddyConfigureDns');
    expect(tool.displayName).toBe('Configure DNS Records');
    expect(tool.inputSchema.type).toBe('object');
    expect(tool.inputSchema.required).toContain('domain');
    expect(tool.inputSchema.required).toContain('action');
    expect(tool.category).toBe('domain');
  });

  it('should list all DNS records', async () => {
    service.getDnsRecords.mockResolvedValue([
      { type: 'A', name: '@', data: '1.2.3.4', ttl: 3600 },
      { type: 'CNAME', name: 'www', data: 'example.com', ttl: 3600 },
    ]);

    const result = await tool.execute({
      domain: 'example.com',
      action: 'list',
    });

    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
    expect(service.getDnsRecords).toHaveBeenCalledWith('example.com');
  });

  it('should list DNS records filtered by type', async () => {
    service.getDnsRecordsByType.mockResolvedValue([
      { type: 'A', name: '@', data: '1.2.3.4', ttl: 3600 },
    ]);

    const result = await tool.execute({
      domain: 'example.com',
      action: 'list',
      type: 'A',
    });

    expect(result.success).toBe(true);
    expect(service.getDnsRecordsByType).toHaveBeenCalledWith('example.com', 'A');
  });

  it('should add DNS records', async () => {
    service.addDnsRecords.mockResolvedValue(undefined);

    const result = await tool.execute({
      domain: 'example.com',
      action: 'add',
      records: [
        { type: 'A', name: 'api', data: '5.6.7.8' },
      ],
    });

    expect(result.success).toBe(true);
    expect((result.data as any)?.message).toContain('Added 1 DNS record');
    expect(service.addDnsRecords).toHaveBeenCalledWith('example.com', [
      expect.objectContaining({ type: 'A', name: 'api', data: '5.6.7.8', ttl: 3600 }),
    ]);
  });

  it('should use parent type and name as defaults for add records', async () => {
    service.addDnsRecords.mockResolvedValue(undefined);

    await tool.execute({
      domain: 'example.com',
      action: 'add',
      type: 'CNAME',
      name: 'www',
      records: [{ data: 'example.com' }],
    });

    expect(service.addDnsRecords).toHaveBeenCalledWith('example.com', [
      expect.objectContaining({ type: 'CNAME', name: 'www', data: 'example.com' }),
    ]);
  });

  it('should fail add without records', async () => {
    const result = await tool.execute({
      domain: 'example.com',
      action: 'add',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('No records provided');
  });

  it('should remove DNS records', async () => {
    service.deleteDnsRecords.mockResolvedValue(undefined);

    const result = await tool.execute({
      domain: 'example.com',
      action: 'remove',
      type: 'A',
      name: 'old',
    });

    expect(result.success).toBe(true);
    expect((result.data as any)?.message).toContain('Deleted A records');
    expect(service.deleteDnsRecords).toHaveBeenCalledWith('example.com', 'A', 'old');
  });

  it('should fail remove without type', async () => {
    const result = await tool.execute({
      domain: 'example.com',
      action: 'remove',
      name: 'old',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Record type is required');
  });

  it('should fail remove without name', async () => {
    const result = await tool.execute({
      domain: 'example.com',
      action: 'remove',
      type: 'A',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Record name is required');
  });

  it('should update DNS records', async () => {
    service.replaceDnsRecords.mockResolvedValue(undefined);

    const result = await tool.execute({
      domain: 'example.com',
      action: 'update',
      type: 'A',
      name: '@',
      records: [{ data: '10.0.0.1' }],
    });

    expect(result.success).toBe(true);
    expect((result.data as any)?.message).toContain('Replaced A records');
    expect(service.replaceDnsRecords).toHaveBeenCalledWith('example.com', 'A', '@', [
      expect.objectContaining({ data: '10.0.0.1', ttl: 3600 }),
    ]);
  });

  it('should fail update without type', async () => {
    const result = await tool.execute({
      domain: 'example.com',
      action: 'update',
      name: '@',
      records: [{ data: '1.2.3.4' }],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Record type is required');
  });

  it('should fail update without name', async () => {
    const result = await tool.execute({
      domain: 'example.com',
      action: 'update',
      type: 'A',
      records: [{ data: '1.2.3.4' }],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Record name is required');
  });

  it('should fail update without records', async () => {
    const result = await tool.execute({
      domain: 'example.com',
      action: 'update',
      type: 'A',
      name: '@',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('No records provided');
  });

  it('should handle errors gracefully', async () => {
    service.getDnsRecords.mockRejectedValue(new Error('Forbidden'));

    const result = await tool.execute({
      domain: 'example.com',
      action: 'list',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Forbidden');
  });
});

// ---------------------------------------------------------------------------
// GoDaddyGetDomainInfoTool
// ---------------------------------------------------------------------------

describe('GoDaddyGetDomainInfoTool', () => {
  let service: any;
  let tool: GoDaddyGetDomainInfoTool;

  beforeEach(() => {
    service = {
      getDomainDetail: vi.fn(),
    };
    tool = new GoDaddyGetDomainInfoTool(service);
  });

  it('should have correct metadata', () => {
    expect(tool.id).toBe('godaddyGetDomainInfo');
    expect(tool.name).toBe('godaddyGetDomainInfo');
    expect(tool.inputSchema.type).toBe('object');
    expect(tool.inputSchema.required).toContain('domain');
    expect(tool.hasSideEffects).toBe(false);
  });

  it('should get domain info successfully', async () => {
    service.getDomainDetail.mockResolvedValue({
      domain: 'example.com',
      status: 'ACTIVE',
      expirationDate: '2025-12-31',
      nameServers: ['ns1.godaddy.com', 'ns2.godaddy.com'],
      locked: true,
      autoRenew: true,
    });

    const result = await tool.execute({ domain: 'example.com' });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('domain', 'example.com');
    expect(result.data).toHaveProperty('locked', true);
    expect(service.getDomainDetail).toHaveBeenCalledWith('example.com');
  });

  it('should handle errors gracefully', async () => {
    service.getDomainDetail.mockRejectedValue(new Error('Domain not found'));

    const result = await tool.execute({ domain: 'nonexistent.com' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Domain not found');
  });
});

// ---------------------------------------------------------------------------
// GoDaddyListDomainsTool
// ---------------------------------------------------------------------------

describe('GoDaddyListDomainsTool', () => {
  let service: any;
  let tool: GoDaddyListDomainsTool;

  beforeEach(() => {
    service = {
      listDomains: vi.fn(),
    };
    tool = new GoDaddyListDomainsTool(service);
  });

  it('should have correct metadata', () => {
    expect(tool.id).toBe('godaddyListDomains');
    expect(tool.name).toBe('godaddyListDomains');
    expect(tool.inputSchema.type).toBe('object');
    expect(tool.inputSchema.required).toEqual([]);
    expect(tool.hasSideEffects).toBe(false);
  });

  it('should list domains with default limit', async () => {
    service.listDomains.mockResolvedValue([
      { domain: 'example.com', status: 'ACTIVE' },
      { domain: 'test.org', status: 'ACTIVE' },
    ]);

    const result = await tool.execute({});

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2);
    expect(service.listDomains).toHaveBeenCalledWith(100, undefined);
  });

  it('should pass custom limit and marker', async () => {
    service.listDomains.mockResolvedValue([]);

    await tool.execute({ limit: 50, marker: 'example.com' });

    expect(service.listDomains).toHaveBeenCalledWith(50, 'example.com');
  });

  it('should handle errors gracefully', async () => {
    service.listDomains.mockRejectedValue(new Error('Unauthorized'));

    const result = await tool.execute({});

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unauthorized');
  });
});

// ---------------------------------------------------------------------------
// GoDaddyRegisterDomainTool
// ---------------------------------------------------------------------------

describe('GoDaddyRegisterDomainTool', () => {
  let service: any;
  let tool: GoDaddyRegisterDomainTool;

  beforeEach(() => {
    service = {
      purchaseDomain: vi.fn(),
    };
    tool = new GoDaddyRegisterDomainTool(service);
  });

  it('should have correct metadata', () => {
    expect(tool.id).toBe('godaddyRegisterDomain');
    expect(tool.name).toBe('godaddyRegisterDomain');
    expect(tool.inputSchema.type).toBe('object');
    expect(tool.inputSchema.required).toContain('domain');
    expect(tool.inputSchema.required).toContain('contactRegistrant');
    expect(tool.hasSideEffects).toBe(true);
  });

  it('should register a domain successfully', async () => {
    service.purchaseDomain.mockResolvedValue({
      orderId: 'ord-123',
      itemCount: 1,
      total: 1199,
      currency: 'USD',
    });

    const contactRegistrant = {
      nameFirst: 'John',
      nameLast: 'Doe',
      email: 'john@example.com',
      phone: '+1.5551234567',
      addressMailing: {
        address1: '123 Main St',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'US',
      },
    };

    const result = await tool.execute({
      domain: 'newsite.com',
      contactRegistrant,
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('orderId', 'ord-123');
    expect(service.purchaseDomain).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: 'newsite.com',
        contactRegistrant,
      }),
    );
  });

  it('should pass optional fields', async () => {
    service.purchaseDomain.mockResolvedValue({ orderId: 'ord-1' });

    const contactRegistrant = {
      nameFirst: 'Jane',
      nameLast: 'Smith',
      email: 'jane@test.com',
      phone: '+1.555000',
    };

    await tool.execute({
      domain: 'test.com',
      period: 3,
      autoRenew: false,
      privacy: true,
      contactRegistrant,
      nameServers: ['ns1.custom.com', 'ns2.custom.com'],
    });

    expect(service.purchaseDomain).toHaveBeenCalledWith(
      expect.objectContaining({
        period: 3,
        autoRenew: false,
        privacy: true,
        nameServers: ['ns1.custom.com', 'ns2.custom.com'],
      }),
    );
  });

  it('should handle errors gracefully', async () => {
    service.purchaseDomain.mockRejectedValue(new Error('Insufficient funds'));

    const result = await tool.execute({
      domain: 'expensive.io',
      contactRegistrant: {
        nameFirst: 'J',
        nameLast: 'D',
        email: 'j@d.com',
        phone: '+1.0',
      },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Insufficient funds');
  });
});

// ---------------------------------------------------------------------------
// GoDaddySearchDomainTool
// ---------------------------------------------------------------------------

describe('GoDaddySearchDomainTool', () => {
  let service: any;
  let tool: GoDaddySearchDomainTool;

  beforeEach(() => {
    service = {
      checkAvailability: vi.fn(),
    };
    tool = new GoDaddySearchDomainTool(service);
  });

  it('should have correct metadata', () => {
    expect(tool.id).toBe('godaddySearchDomain');
    expect(tool.name).toBe('godaddySearchDomain');
    expect(tool.inputSchema.type).toBe('object');
    expect(tool.inputSchema.required).toContain('domain');
    expect(tool.hasSideEffects).toBe(false);
  });

  it('should check domain availability', async () => {
    service.checkAvailability.mockResolvedValue({
      domain: 'newsite.com',
      available: true,
      price: 1199,
      currency: 'USD',
      period: 1,
    });

    const result = await tool.execute({ domain: 'newsite.com' });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('available', true);
    expect(result.data).toHaveProperty('domain', 'newsite.com');
    expect(service.checkAvailability).toHaveBeenCalledWith('newsite.com');
  });

  it('should return unavailable for taken domains', async () => {
    service.checkAvailability.mockResolvedValue({
      domain: 'google.com',
      available: false,
    });

    const result = await tool.execute({ domain: 'google.com' });

    expect(result.success).toBe(true);
    expect(result.data?.available).toBe(false);
  });

  it('should handle errors gracefully', async () => {
    service.checkAvailability.mockRejectedValue(new Error('Rate limit exceeded'));

    const result = await tool.execute({ domain: 'test.xyz' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Rate limit exceeded');
  });
});
