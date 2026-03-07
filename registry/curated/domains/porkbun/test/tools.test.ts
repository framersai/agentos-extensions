import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PorkbunConfigureDnsTool } from '../src/tools/configureDns';
import { PorkbunListDomainsTool } from '../src/tools/listDomains';
import { PorkbunRegisterDomainTool } from '../src/tools/registerDomain';
import { PorkbunSearchDomainTool } from '../src/tools/searchDomain';
import { PorkbunTransferDomainTool } from '../src/tools/transferDomain';

// ---------------------------------------------------------------------------
// PorkbunConfigureDnsTool
// ---------------------------------------------------------------------------

describe('PorkbunConfigureDnsTool', () => {
  let service: any;
  let tool: PorkbunConfigureDnsTool;

  beforeEach(() => {
    service = {
      listDnsRecords: vi.fn(),
      createDnsRecord: vi.fn(),
      deleteDnsRecord: vi.fn(),
      editDnsRecord: vi.fn(),
    };
    tool = new PorkbunConfigureDnsTool(service);
  });

  it('should have correct metadata', () => {
    expect(tool.id).toBe('porkbunConfigureDns');
    expect(tool.name).toBe('porkbunConfigureDns');
    expect(tool.displayName).toBe('Configure DNS Records');
    expect(tool.inputSchema.type).toBe('object');
    expect(tool.inputSchema.required).toContain('domain');
    expect(tool.category).toBe('domain');
  });

  it('should list DNS records by default', async () => {
    service.listDnsRecords.mockResolvedValue([
      { id: '1', type: 'A', name: 'www', content: '1.2.3.4', ttl: '300' },
      { id: '2', type: 'MX', name: '', content: 'mx.example.com', ttl: '600', prio: '10' },
    ]);

    const result = await tool.execute({ domain: 'example.com' });

    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
    expect(service.listDnsRecords).toHaveBeenCalledWith('example.com');
  });

  it('should add a DNS record', async () => {
    service.createDnsRecord.mockResolvedValue({ id: '123' });

    const result = await tool.execute({
      domain: 'example.com',
      action: 'add',
      type: 'A',
      name: 'www',
      content: '1.2.3.4',
      ttl: '300',
    });

    expect(result.success).toBe(true);
    expect(service.createDnsRecord).toHaveBeenCalledWith('example.com', {
      name: 'www',
      type: 'A',
      content: '1.2.3.4',
      ttl: '300',
      prio: undefined,
    });
  });

  it('should fail add without type', async () => {
    const result = await tool.execute({
      domain: 'example.com',
      action: 'add',
      content: '1.2.3.4',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Record type is required');
  });

  it('should fail add without content', async () => {
    const result = await tool.execute({
      domain: 'example.com',
      action: 'add',
      type: 'A',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Record content is required');
  });

  it('should remove a DNS record', async () => {
    service.deleteDnsRecord.mockResolvedValue(undefined);

    const result = await tool.execute({
      domain: 'example.com',
      action: 'remove',
      recordId: '123',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ deleted: true });
    expect(service.deleteDnsRecord).toHaveBeenCalledWith('example.com', '123');
  });

  it('should fail remove without recordId', async () => {
    const result = await tool.execute({
      domain: 'example.com',
      action: 'remove',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Record ID is required');
  });

  it('should update a DNS record', async () => {
    service.editDnsRecord.mockResolvedValue(undefined);
    service.listDnsRecords.mockResolvedValue([
      { id: '123', type: 'A', content: '5.6.7.8' },
    ]);

    const result = await tool.execute({
      domain: 'example.com',
      action: 'update',
      recordId: '123',
      content: '5.6.7.8',
    });

    expect(result.success).toBe(true);
    expect(service.editDnsRecord).toHaveBeenCalledWith('example.com', '123', expect.objectContaining({
      content: '5.6.7.8',
    }));
  });

  it('should fail update without recordId', async () => {
    const result = await tool.execute({
      domain: 'example.com',
      action: 'update',
      content: '5.6.7.8',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Record ID is required');
  });

  it('should handle errors gracefully', async () => {
    service.listDnsRecords.mockRejectedValue(new Error('Domain not found'));

    const result = await tool.execute({ domain: 'nonexistent.com' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Domain not found');
  });
});

// ---------------------------------------------------------------------------
// PorkbunListDomainsTool
// ---------------------------------------------------------------------------

describe('PorkbunListDomainsTool', () => {
  let service: any;
  let tool: PorkbunListDomainsTool;

  beforeEach(() => {
    service = {
      listDomains: vi.fn(),
    };
    tool = new PorkbunListDomainsTool(service);
  });

  it('should have correct metadata', () => {
    expect(tool.id).toBe('porkbunListDomains');
    expect(tool.name).toBe('porkbunListDomains');
    expect(tool.inputSchema.type).toBe('object');
    expect(tool.inputSchema.required).toEqual([]);
    expect(tool.hasSideEffects).toBe(false);
  });

  it('should list all domains', async () => {
    service.listDomains.mockResolvedValue([
      { domain: 'example.com', status: 'ACTIVE', autoRenew: true },
      { domain: 'test.dev', status: 'ACTIVE', autoRenew: false },
    ]);

    const result = await tool.execute({} as Record<string, never>);

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2);
    expect(service.listDomains).toHaveBeenCalled();
  });

  it('should return empty array when no domains', async () => {
    service.listDomains.mockResolvedValue([]);

    const result = await tool.execute({} as Record<string, never>);

    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  it('should handle errors gracefully', async () => {
    service.listDomains.mockRejectedValue(new Error('Unauthorized'));

    const result = await tool.execute({} as Record<string, never>);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unauthorized');
  });
});

// ---------------------------------------------------------------------------
// PorkbunRegisterDomainTool
// ---------------------------------------------------------------------------

describe('PorkbunRegisterDomainTool', () => {
  let service: any;
  let tool: PorkbunRegisterDomainTool;

  beforeEach(() => {
    service = {
      registerDomain: vi.fn(),
    };
    tool = new PorkbunRegisterDomainTool(service);
  });

  it('should have correct metadata', () => {
    expect(tool.id).toBe('porkbunRegisterDomain');
    expect(tool.name).toBe('porkbunRegisterDomain');
    expect(tool.inputSchema.type).toBe('object');
    expect(tool.inputSchema.required).toContain('domain');
    expect(tool.hasSideEffects).toBe(true);
  });

  it('should register a domain successfully', async () => {
    service.registerDomain.mockResolvedValue({
      domain: 'newsite.dev',
      status: 'SUCCESS',
    });

    const result = await tool.execute({ domain: 'newsite.dev' });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('domain', 'newsite.dev');
    expect(service.registerDomain).toHaveBeenCalledWith(
      expect.objectContaining({ domain: 'newsite.dev' }),
    );
  });

  it('should pass all contact fields', async () => {
    service.registerDomain.mockResolvedValue({ domain: 'site.com', status: 'SUCCESS' });

    await tool.execute({
      domain: 'site.com',
      years: 2,
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

    expect(service.registerDomain).toHaveBeenCalledWith(
      expect.objectContaining({
        years: 2,
        firstName: 'John',
        lastName: 'Doe',
        country: 'US',
      }),
    );
  });

  it('should handle errors gracefully', async () => {
    service.registerDomain.mockRejectedValue(new Error('Insufficient funds'));

    const result = await tool.execute({ domain: 'expensive.io' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Insufficient funds');
  });
});

// ---------------------------------------------------------------------------
// PorkbunSearchDomainTool
// ---------------------------------------------------------------------------

describe('PorkbunSearchDomainTool', () => {
  let service: any;
  let tool: PorkbunSearchDomainTool;

  beforeEach(() => {
    service = {
      checkAvailability: vi.fn(),
    };
    tool = new PorkbunSearchDomainTool(service);
  });

  it('should have correct metadata', () => {
    expect(tool.id).toBe('porkbunSearchDomain');
    expect(tool.name).toBe('porkbunSearchDomain');
    expect(tool.inputSchema.type).toBe('object');
    expect(tool.inputSchema.required).toContain('domain');
    expect(tool.hasSideEffects).toBe(false);
  });

  it('should check domain availability', async () => {
    service.checkAvailability.mockResolvedValue({
      domain: 'example.dev',
      available: true,
      pricing: { registration: '9.73', renewal: '9.73' },
    });

    const result = await tool.execute({ domain: 'example.dev' });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('available', true);
    expect(result.data).toHaveProperty('domain', 'example.dev');
    expect(service.checkAvailability).toHaveBeenCalledWith('example.dev');
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
    service.checkAvailability.mockRejectedValue(new Error('API error'));

    const result = await tool.execute({ domain: 'test.xyz' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('API error');
  });
});

// ---------------------------------------------------------------------------
// PorkbunTransferDomainTool
// ---------------------------------------------------------------------------

describe('PorkbunTransferDomainTool', () => {
  let service: any;
  let tool: PorkbunTransferDomainTool;

  beforeEach(() => {
    service = {
      transferDomain: vi.fn(),
    };
    tool = new PorkbunTransferDomainTool(service);
  });

  it('should have correct metadata', () => {
    expect(tool.id).toBe('porkbunTransferDomain');
    expect(tool.name).toBe('porkbunTransferDomain');
    expect(tool.inputSchema.type).toBe('object');
    expect(tool.inputSchema.required).toContain('domain');
    expect(tool.inputSchema.required).toContain('authCode');
    expect(tool.hasSideEffects).toBe(true);
  });

  it('should initiate a domain transfer', async () => {
    service.transferDomain.mockResolvedValue({
      domain: 'example.com',
      status: 'SUCCESS',
    });

    const result = await tool.execute({
      domain: 'example.com',
      authCode: 'EPP-CODE-123',
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('domain', 'example.com');
    expect(service.transferDomain).toHaveBeenCalledWith('example.com', 'EPP-CODE-123');
  });

  it('should handle errors gracefully', async () => {
    service.transferDomain.mockRejectedValue(new Error('Domain is locked'));

    const result = await tool.execute({
      domain: 'locked.com',
      authCode: 'invalid',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Domain is locked');
  });
});
