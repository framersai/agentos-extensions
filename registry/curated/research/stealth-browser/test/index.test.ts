/**
 * @fileoverview Unit tests for stealth-browser extension.
 * Tests tool names, schemas, and service configuration without launching a browser.
 */

import { describe, it, expect, vi } from 'vitest';

// Mock puppeteer-extra before importing the service
vi.mock('puppeteer-extra', () => ({
  default: {
    use: vi.fn(),
    launch: vi.fn().mockResolvedValue({
      newPage: vi.fn().mockResolvedValue({
        setViewport: vi.fn(),
        setUserAgent: vi.fn(),
        setExtraHTTPHeaders: vi.fn(),
        evaluateOnNewDocument: vi.fn(),
        goto: vi.fn().mockResolvedValue({ status: vi.fn().mockReturnValue(200) }),
        title: vi.fn().mockResolvedValue('Test Page'),
        url: vi.fn().mockReturnValue('https://example.com'),
        content: vi.fn().mockResolvedValue('<html><body>Test</body></html>'),
        evaluate: vi.fn().mockResolvedValue('Test content'),
        $: vi.fn().mockResolvedValue(null),
        $$: vi.fn().mockResolvedValue([]),
        $$eval: vi.fn().mockResolvedValue([]),
        waitForSelector: vi.fn().mockResolvedValue(null),
        screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-png')),
        close: vi.fn(),
        on: vi.fn(),
      }),
      close: vi.fn(),
    }),
  },
}));

vi.mock('puppeteer-extra-plugin-stealth', () => ({
  default: vi.fn().mockReturnValue({ name: 'stealth' }),
}));

describe('StealthBrowserService', () => {
  it('can be imported without errors', async () => {
    const mod = await import('../src/StealthBrowserService.js');
    expect(mod.StealthBrowserService).toBeDefined();
  });

  it('initializes with default config', async () => {
    const { StealthBrowserService } = await import('../src/StealthBrowserService.js');
    const service = new StealthBrowserService({});
    await service.initialize();
    // Should not throw
    expect(service).toBeDefined();
  });

  it('navigate returns a NavigationResult shape', async () => {
    const { StealthBrowserService } = await import('../src/StealthBrowserService.js');
    const service = new StealthBrowserService({});
    await service.initialize();
    const result = await service.navigate('https://example.com');
    expect(result).toHaveProperty('url');
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('title');
    expect(result).toHaveProperty('loadTime');
    expect(typeof result.status).toBe('number');
  });
});

describe('Tool definitions', () => {
  it('createExtensionPack returns 6 tool descriptors', async () => {
    const { createExtensionPack } = await import('../src/index.js');
    const pack = createExtensionPack({
      options: {},
      getSecret: () => undefined,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any,
    });

    expect(pack.name).toBe('@framers/agentos-ext-stealth-browser');
    expect(pack.descriptors).toHaveLength(6);

    const toolNames = pack.descriptors
      .filter((d: any) => d.kind === 'tool')
      .map((d: any) => d.payload.name);

    expect(toolNames).toContain('stealth_navigate');
    expect(toolNames).toContain('stealth_scrape');
    expect(toolNames).toContain('stealth_click');
    expect(toolNames).toContain('stealth_type');
    expect(toolNames).toContain('stealth_screenshot');
    expect(toolNames).toContain('stealth_snapshot');
  });

  it('each tool has required ITool properties', async () => {
    const { createExtensionPack } = await import('../src/index.js');
    const pack = createExtensionPack({
      options: {},
      getSecret: () => undefined,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any,
    });

    for (const descriptor of pack.descriptors) {
      if ((descriptor as any).kind !== 'tool') continue;
      const tool = (descriptor as any).payload;
      expect(tool).toHaveProperty('name');
      expect(tool).toHaveProperty('description');
      expect(tool).toHaveProperty('inputSchema');
      expect(tool).toHaveProperty('execute');
      expect(typeof tool.name).toBe('string');
      expect(typeof tool.description).toBe('string');
      expect(typeof tool.execute).toBe('function');
    }
  });
});
