// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CfRegConfigureDnsTool } from '../src/tools/configureDns';
import { CfRegGetDomainInfoTool } from '../src/tools/getDomainInfo';
import { CfRegListDomainsTool } from '../src/tools/listDomains';
import { CfRegTransferDomainTool } from '../src/tools/transferDomain';

// ---------------------------------------------------------------------------
// CfRegConfigureDnsTool
// ---------------------------------------------------------------------------

describe('CfRegConfigureDnsTool', () => {
  let service: any;
  let tool: CfRegConfigureDnsTool;

  beforeEach(() => {
    service = {
      findZoneId: vi.fn(),
      listDnsRecords: vi.fn(),
      createDnsRecord: vi.fn(),
      deleteDnsRecord: vi.fn(),
      updateDnsRecord: vi.fn(),
    };
    tool = new CfRegConfigureDnsTool(service);
  });

  it('should have correct metadata', () => {
    expect(tool.id).toBe('cfRegConfigureDns');
    expect(tool.name).toBe('cfRegConfigureDns');
    expect(tool.displayName).toBe('Configure DNS Records');
    expect(tool.inputSchema.type).toBe('object');
    expect(tool.inputSchema.required).toContain('domain');
    expect(tool.category).toBe('domain');
  });

  it('should list DNS records by default', async () => {
    service.findZoneId.mockResolvedValue('zone-abc123');
    service.listDnsRecords.mockResolvedValue([
      { id: 'rec-1', type: 'A', name: 'example.com', content: '1.2.3.4', proxied: false },
      { id: 'rec-2', type: 'CNAME', name: 'www.example.com', content: 'example.com', proxied: true },
    ]);

    const result = await tool.execute({ domain: 'example.com' });

    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
    expect(service.findZoneId).toHaveBeenCalledWith('example.com');
    expect(service.listDnsRecords).toHaveBeenCalledWith('zone-abc123');
  });

  it('should add a DNS record', async () => {
    service.findZoneId.mockResolvedValue('zone-abc123');
    service.createDnsRecord.mockResolvedValue({
      id: 'rec-new',
      type: 'A',
      name: 'api.example.com',
      content: '5.6.7.8',
    });

    const result = await tool.execute({
      domain: 'example.com',
      action: 'add',
      type: 'A',
      name: 'api.example.com',
      content: '5.6.7.8',
      ttl: 300,
      proxied: false,
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('id', 'rec-new');
    expect(service.createDnsRecord).toHaveBeenCalledWith('zone-abc123', {
      name: 'api.example.com',
      type: 'A',
      content: '5.6.7.8',
      ttl: 300,
      priority: undefined,
      proxied: false,
      comment: undefined,
    });
  });

  it('should fail add without type', async () => {
    service.findZoneId.mockResolvedValue('zone-abc123');

    const result = await tool.execute({
      domain: 'example.com',
      action: 'add',
      name: 'api.example.com',
      content: '5.6.7.8',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Record type is required');
  });

  it('should fail add without content', async () => {
    service.findZoneId.mockResolvedValue('zone-abc123');

    const result = await tool.execute({
      domain: 'example.com',
      action: 'add',
      type: 'A',
      name: 'api.example.com',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Record content is required');
  });

  it('should fail add without name', async () => {
    service.findZoneId.mockResolvedValue('zone-abc123');

    const result = await tool.execute({
      domain: 'example.com',
      action: 'add',
      type: 'A',
      content: '1.2.3.4',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Record name is required');
  });

  it('should remove a DNS record', async () => {
    service.findZoneId.mockResolvedValue('zone-abc123');
    service.deleteDnsRecord.mockResolvedValue(undefined);

    const result = await tool.execute({
      domain: 'example.com',
      action: 'remove',
      recordId: 'rec-1',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ deleted: true });
    expect(service.deleteDnsRecord).toHaveBeenCalledWith('zone-abc123', 'rec-1');
  });

  it('should fail remove without recordId', async () => {
    service.findZoneId.mockResolvedValue('zone-abc123');

    const result = await tool.execute({
      domain: 'example.com',
      action: 'remove',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Record ID is required');
  });

  it('should update a DNS record', async () => {
    service.findZoneId.mockResolvedValue('zone-abc123');
    service.updateDnsRecord.mockResolvedValue({
      id: 'rec-1',
      type: 'A',
      content: '10.0.0.1',
      proxied: true,
    });

    const result = await tool.execute({
      domain: 'example.com',
      action: 'update',
      recordId: 'rec-1',
      type: 'A',
      content: '10.0.0.1',
      proxied: true,
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('content', '10.0.0.1');
    expect(service.updateDnsRecord).toHaveBeenCalledWith('zone-abc123', 'rec-1', expect.objectContaining({
      type: 'A',
      content: '10.0.0.1',
      proxied: true,
    }));
  });

  it('should fail update without recordId', async () => {
    service.findZoneId.mockResolvedValue('zone-abc123');

    const result = await tool.execute({
      domain: 'example.com',
      action: 'update',
      content: '10.0.0.1',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Record ID is required');
  });

  it('should handle errors gracefully', async () => {
    service.findZoneId.mockRejectedValue(new Error('Zone not found'));

    const result = await tool.execute({ domain: 'nonexistent.com' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Zone not found');
  });
});

// ---------------------------------------------------------------------------
// CfRegGetDomainInfoTool
// ---------------------------------------------------------------------------

describe('CfRegGetDomainInfoTool', () => {
  let service: any;
  let tool: CfRegGetDomainInfoTool;

  beforeEach(() => {
    service = {
      getDomainInfo: vi.fn(),
      updateDomainSettings: vi.fn(),
    };
    tool = new CfRegGetDomainInfoTool(service);
  });

  it('should have correct metadata', () => {
    expect(tool.id).toBe('cfRegGetDomainInfo');
    expect(tool.name).toBe('cfRegGetDomainInfo');
    expect(tool.displayName).toBe('Get Domain Info');
    expect(tool.inputSchema.type).toBe('object');
    expect(tool.inputSchema.required).toContain('domain');
    expect(tool.hasSideEffects).toBe(true);
  });

  it('should get domain info', async () => {
    service.getDomainInfo.mockResolvedValue({
      domain: 'example.com',
      status: 'active',
      expiresAt: '2026-01-01',
      autoRenew: true,
      locked: true,
      privacy: true,
    });

    const result = await tool.execute({ domain: 'example.com' });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('domain', 'example.com');
    expect(result.data).toHaveProperty('autoRenew', true);
    expect(service.getDomainInfo).toHaveBeenCalledWith('example.com');
    expect(service.updateDomainSettings).not.toHaveBeenCalled();
  });

  it('should update domain settings when update is provided', async () => {
    service.updateDomainSettings.mockResolvedValue({
      domain: 'example.com',
      autoRenew: false,
      locked: false,
    });

    const result = await tool.execute({
      domain: 'example.com',
      update: { autoRenew: false, locked: false },
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('autoRenew', false);
    expect(service.updateDomainSettings).toHaveBeenCalledWith('example.com', {
      autoRenew: false,
      locked: false,
    });
    expect(service.getDomainInfo).not.toHaveBeenCalled();
  });

  it('should not update when update object is empty', async () => {
    service.getDomainInfo.mockResolvedValue({ domain: 'example.com' });

    const result = await tool.execute({
      domain: 'example.com',
      update: {},
    });

    expect(result.success).toBe(true);
    expect(service.getDomainInfo).toHaveBeenCalled();
    expect(service.updateDomainSettings).not.toHaveBeenCalled();
  });

  it('should handle errors gracefully', async () => {
    service.getDomainInfo.mockRejectedValue(new Error('Not found'));

    const result = await tool.execute({ domain: 'nonexistent.com' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Not found');
  });
});

// ---------------------------------------------------------------------------
// CfRegListDomainsTool
// ---------------------------------------------------------------------------

describe('CfRegListDomainsTool', () => {
  let service: any;
  let tool: CfRegListDomainsTool;

  beforeEach(() => {
    service = {
      listDomains: vi.fn(),
    };
    tool = new CfRegListDomainsTool(service);
  });

  it('should have correct metadata', () => {
    expect(tool.id).toBe('cfRegListDomains');
    expect(tool.name).toBe('cfRegListDomains');
    expect(tool.displayName).toBe('List Cloudflare Domains');
    expect(tool.inputSchema.type).toBe('object');
    expect(tool.inputSchema.required).toEqual([]);
    expect(tool.hasSideEffects).toBe(false);
  });

  it('should list all domains', async () => {
    service.listDomains.mockResolvedValue([
      { domain: 'example.com', status: 'active', autoRenew: true },
      { domain: 'test.dev', status: 'active', autoRenew: false },
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
// CfRegTransferDomainTool
// ---------------------------------------------------------------------------

describe('CfRegTransferDomainTool', () => {
  let service: any;
  let tool: CfRegTransferDomainTool;

  beforeEach(() => {
    service = {
      transferDomain: vi.fn(),
    };
    tool = new CfRegTransferDomainTool(service);
  });

  it('should have correct metadata', () => {
    expect(tool.id).toBe('cfRegTransferDomain');
    expect(tool.name).toBe('cfRegTransferDomain');
    expect(tool.displayName).toBe('Transfer Domain to Cloudflare');
    expect(tool.inputSchema.type).toBe('object');
    expect(tool.inputSchema.required).toContain('domain');
    expect(tool.inputSchema.required).toContain('authCode');
    expect(tool.hasSideEffects).toBe(true);
  });

  it('should initiate a domain transfer', async () => {
    service.transferDomain.mockResolvedValue({
      domain: 'example.com',
      status: 'pending',
      transferId: 'xfer-123',
    });

    const result = await tool.execute({
      domain: 'example.com',
      authCode: 'EPP-CODE-ABC',
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('domain', 'example.com');
    expect(result.data).toHaveProperty('status', 'pending');
    expect(service.transferDomain).toHaveBeenCalledWith('example.com', 'EPP-CODE-ABC');
  });

  it('should handle errors gracefully', async () => {
    service.transferDomain.mockRejectedValue(new Error('Domain is locked at current registrar'));

    const result = await tool.execute({
      domain: 'locked.com',
      authCode: 'invalid',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Domain is locked at current registrar');
  });

  it('should handle invalid auth code', async () => {
    service.transferDomain.mockRejectedValue(new Error('Invalid authorization code'));

    const result = await tool.execute({
      domain: 'example.com',
      authCode: 'wrong-code',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid authorization code');
  });
});
