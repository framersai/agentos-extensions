import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NavigateTool } from '../src/tools/NavigateTool';
import type { BrowserService, NavigationResult } from '../src/BrowserService';

// ---------------------------------------------------------------------------
// Mock BrowserService
// ---------------------------------------------------------------------------

function createMockBrowserService(overrides: Partial<BrowserService> = {}): BrowserService {
  return {
    navigate: vi.fn().mockResolvedValue({
      url: 'https://example.com',
      title: 'Example',
      status: 200,
      loadTimeMs: 123,
    } satisfies NavigationResult),
    click: vi.fn(),
    fill: vi.fn(),
    scroll: vi.fn(),
    extract: vi.fn(),
    screenshot: vi.fn(),
    wait: vi.fn(),
    snapshot: vi.fn(),
    evaluate: vi.fn(),
    saveSession: vi.fn(),
    restoreSession: vi.fn(),
    initialize: vi.fn(),
    shutdown: vi.fn(),
    getPage: vi.fn().mockReturnValue(null),
    isRunning: false,
    captureFeedback: vi.fn(),
    setProxy: vi.fn(),
    ...overrides,
  } as unknown as BrowserService;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NavigateTool', () => {
  let tool: NavigateTool;
  let mockService: BrowserService;

  beforeEach(() => {
    mockService = createMockBrowserService();
    tool = new NavigateTool(mockService);
    vi.clearAllMocks();
  });

  // ── Metadata ──

  describe('metadata', () => {
    it('should have correct id', () => {
      expect(tool.id).toBe('browserNavigate');
    });

    it('should have correct name', () => {
      expect(tool.name).toBe('browserNavigate');
    });

    it('should have a displayName', () => {
      expect(tool.displayName).toBe('Navigate to URL');
    });

    it('should have a non-empty description', () => {
      expect(tool.description).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(10);
    });

    it('should be in browser category', () => {
      expect(tool.category).toBe('browser');
    });

    it('should have version 0.1.0', () => {
      expect(tool.version).toBe('0.1.0');
    });

    it('should report side effects', () => {
      expect(tool.hasSideEffects).toBe(true);
    });
  });

  // ── Input Schema ──

  describe('inputSchema', () => {
    it('should define type as object', () => {
      expect(tool.inputSchema.type).toBe('object');
    });

    it('should require url property', () => {
      expect(tool.inputSchema.required).toContain('url');
    });

    it('should define url as string', () => {
      expect(tool.inputSchema.properties.url.type).toBe('string');
    });

    it('should define waitUntil with enum values', () => {
      const waitUntil = tool.inputSchema.properties.waitUntil;
      expect(waitUntil.type).toBe('string');
      expect(waitUntil.enum).toEqual(['domcontentloaded', 'load', 'networkidle']);
    });
  });

  // ── Output Schema ──

  describe('outputSchema', () => {
    it('should define output as object', () => {
      expect(tool.outputSchema.type).toBe('object');
    });

    it('should include url, title, status, loadTimeMs fields', () => {
      const props = tool.outputSchema.properties;
      expect(props.url).toBeDefined();
      expect(props.title).toBeDefined();
      expect(props.status).toBeDefined();
      expect(props.loadTimeMs).toBeDefined();
    });
  });

  // ── Execute — success ──

  describe('execute – success', () => {
    it('should call browser.navigate with provided url', async () => {
      const result = await tool.execute({ url: 'https://example.com' });
      expect(mockService.navigate).toHaveBeenCalledWith('https://example.com');
      expect(result.success).toBe(true);
    });

    it('should return navigation data on success', async () => {
      const result = await tool.execute({ url: 'https://example.com' });
      expect(result.data).toMatchObject({
        url: 'https://example.com',
        title: 'Example',
        status: 200,
        loadTimeMs: 123,
      });
    });

    it('should not have error on success', async () => {
      const result = await tool.execute({ url: 'https://example.com' });
      expect(result.error).toBeUndefined();
    });
  });

  // ── Execute — error ──

  describe('execute – error', () => {
    it('should return success false on navigation error', async () => {
      (mockService.navigate as any).mockRejectedValueOnce(new Error('net::ERR_NAME_NOT_RESOLVED'));
      const result = await tool.execute({ url: 'https://nonexistent.invalid' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('net::ERR_NAME_NOT_RESOLVED');
    });

    it('should return success false on timeout', async () => {
      (mockService.navigate as any).mockRejectedValueOnce(new Error('Navigation timeout'));
      const result = await tool.execute({ url: 'https://slow-site.example.com' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });
  });
});
