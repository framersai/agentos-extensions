// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createExtensionPack } from '../src/index.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function okResponse(data: any = {}) {
  return { ok: true, status: 200, text: async () => JSON.stringify(data), json: async () => ({ success: true, result: data }) } as Response;
}

describe('createExtensionPack (Cloudflare Registrar)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue(okResponse({ status: 'active' }));
  });

  it('should return a valid ExtensionPack', () => {
    const pack = createExtensionPack({ secrets: { 'cloudflare.apiToken': 'tok', 'cloudflare.accountId': 'acc' } });
    expect(pack.name).toBe('@framers/agentos-ext-domain-cloudflare-registrar');
    expect(pack.version).toBe('0.1.0');
    expect(pack.descriptors).toHaveLength(4);
  });

  it('should register correct tool IDs', () => {
    const pack = createExtensionPack({ secrets: { 'cloudflare.apiToken': 'tok', 'cloudflare.accountId': 'acc' } });
    const ids = pack.descriptors.map((d) => d.id);
    expect(ids).toContain('cfRegListDomains');
    expect(ids).toContain('cfRegGetDomainInfo');
    expect(ids).toContain('cfRegConfigureDns');
    expect(ids).toContain('cfRegTransferDomain');
  });

  it('onActivate should throw without credentials', async () => {
    const pack = createExtensionPack({ secrets: {} });
    await expect(pack.onActivate!()).rejects.toThrow();
  });

  it('onActivate should succeed with valid credentials', async () => {
    const pack = createExtensionPack({ secrets: { 'cloudflare.apiToken': 'tok', 'cloudflare.accountId': 'acc' } });
    await expect(pack.onActivate!()).resolves.toBeUndefined();
  });

  it('onDeactivate should complete', async () => {
    const pack = createExtensionPack({ secrets: { 'cloudflare.apiToken': 'tok', 'cloudflare.accountId': 'acc' } });
    await pack.onActivate!();
    await expect(pack.onDeactivate!()).resolves.toBeUndefined();
  });
});
