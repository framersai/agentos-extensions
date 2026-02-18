import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserService } from '../src/BrowserService';

// ---------------------------------------------------------------------------
// Mock Playwright
// ---------------------------------------------------------------------------

const mockPage = {
  goto: vi.fn().mockResolvedValue({ status: () => 200 }),
  title: vi.fn().mockResolvedValue('Mock Title'),
  url: vi.fn().mockReturnValue('https://example.com'),
  setDefaultTimeout: vi.fn(),
  on: vi.fn(),
  click: vi.fn().mockResolvedValue(undefined),
  fill: vi.fn().mockResolvedValue(undefined),
  locator: vi.fn().mockReturnValue({
    innerHTML: vi.fn().mockResolvedValue('<p>hello</p>'),
    innerText: vi.fn().mockResolvedValue('hello'),
    getAttribute: vi.fn().mockResolvedValue('attr-value'),
    screenshot: vi.fn().mockResolvedValue(Buffer.from('png-data')),
    scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
  }),
  screenshot: vi.fn().mockResolvedValue(Buffer.from('full-page-png')),
  waitForSelector: vi.fn().mockResolvedValue(undefined),
  waitForTimeout: vi.fn().mockResolvedValue(undefined),
  evaluate: vi.fn().mockResolvedValue([]),
  mouse: { wheel: vi.fn().mockResolvedValue(undefined) },
  getByRole: vi.fn().mockReturnValue({ click: vi.fn().mockResolvedValue(undefined) }),
  getByText: vi.fn().mockReturnValue({ first: vi.fn().mockReturnValue({ click: vi.fn().mockResolvedValue(undefined) }) }),
};

const mockContext = {
  newPage: vi.fn().mockResolvedValue(mockPage),
  close: vi.fn().mockResolvedValue(undefined),
  storageState: vi.fn().mockResolvedValue({ cookies: [], origins: [] }),
  addCookies: vi.fn().mockResolvedValue(undefined),
  pages: vi.fn().mockReturnValue([]),
};

const mockBrowser = {
  newContext: vi.fn().mockResolvedValue(mockContext),
  close: vi.fn().mockResolvedValue(undefined),
};

vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue(mockBrowser),
    launchPersistentContext: vi.fn().mockResolvedValue({
      ...mockContext,
      pages: vi.fn().mockReturnValue([mockPage]),
    }),
  },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BrowserService', () => {
  let service: BrowserService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BrowserService({ headless: true, timeout: 5000 });
  });

  afterEach(async () => {
    await service.shutdown();
  });

  // ── Constructor / default config ──

  describe('constructor', () => {
    it('should accept default config when none provided', () => {
      const svc = new BrowserService();
      expect(svc.isRunning).toBe(false);
    });

    it('should merge provided config with defaults', () => {
      const svc = new BrowserService({ timeout: 10000 });
      // Service created but not yet initialized
      expect(svc.isRunning).toBe(false);
    });
  });

  // ── Lifecycle ──

  describe('initialize / shutdown', () => {
    it('should launch browser and create a page on initialize', async () => {
      await service.initialize();
      expect(service.isRunning).toBe(true);
      expect(service.getPage()).not.toBeNull();
    });

    it('should be idempotent — calling initialize twice should not relaunch', async () => {
      await service.initialize();
      await service.initialize(); // second call
      const { chromium } = await import('playwright');
      expect(chromium.launch).toHaveBeenCalledTimes(1);
    });

    it('should tear down browser on shutdown', async () => {
      await service.initialize();
      await service.shutdown();
      expect(service.isRunning).toBe(false);
      expect(service.getPage()).toBeNull();
    });

    it('should support persistent context when userDataDir is given', async () => {
      const svc = new BrowserService({ userDataDir: '/tmp/test-profile' });
      await svc.initialize();
      const { chromium } = await import('playwright');
      expect(chromium.launchPersistentContext).toHaveBeenCalledWith(
        '/tmp/test-profile',
        expect.objectContaining({ headless: true }),
      );
      await svc.shutdown();
    });
  });

  // ── Singleton pattern (isRunning) ──

  describe('isRunning', () => {
    it('should be false before initialization', () => {
      expect(service.isRunning).toBe(false);
    });

    it('should be true after initialization', async () => {
      await service.initialize();
      expect(service.isRunning).toBe(true);
    });

    it('should be false after shutdown', async () => {
      await service.initialize();
      await service.shutdown();
      expect(service.isRunning).toBe(false);
    });
  });

  // ── getPage / getContext ──

  describe('getPage', () => {
    it('should return null before initialization', () => {
      expect(service.getPage()).toBeNull();
    });

    it('should return a Page object after initialization', async () => {
      await service.initialize();
      expect(service.getPage()).toBe(mockPage);
    });
  });

  // ── Navigation ──

  describe('navigate', () => {
    it('should navigate to url and return result', async () => {
      await service.initialize();
      const result = await service.navigate('https://example.com');
      expect(mockPage.goto).toHaveBeenCalledWith('https://example.com', { waitUntil: 'domcontentloaded' });
      expect(result).toMatchObject({
        url: 'https://example.com',
        title: 'Mock Title',
        status: 200,
      });
      expect(typeof result.loadTimeMs).toBe('number');
    });
  });

  // ── Click ──

  describe('click', () => {
    it('should click by selector', async () => {
      await service.initialize();
      const ok = await service.click({ selector: '#btn' });
      expect(ok).toBe(true);
      expect(mockPage.click).toHaveBeenCalledWith('#btn');
    });

    it('should click by text', async () => {
      await service.initialize();
      const ok = await service.click({ text: 'Submit' });
      expect(ok).toBe(true);
    });

    it('should return false when no selector/text/role given', async () => {
      await service.initialize();
      const ok = await service.click({});
      expect(ok).toBe(false);
    });
  });

  // ── Fill ──

  describe('fill', () => {
    it('should fill input with value', async () => {
      await service.initialize();
      await service.fill('#email', 'test@example.com');
      expect(mockPage.fill).toHaveBeenCalledWith('#email', 'test@example.com');
    });
  });

  // ── Extract ──

  describe('extract', () => {
    it('should extract innerText by default', async () => {
      await service.initialize();
      const text = await service.extract('.content');
      expect(mockPage.locator).toHaveBeenCalledWith('.content');
      expect(text).toBe('hello');
    });

    it('should extract innerHTML when mode is html', async () => {
      await service.initialize();
      const html = await service.extract('.content', 'html');
      expect(html).toBe('<p>hello</p>');
    });

    it('should extract attribute when mode is attribute', async () => {
      await service.initialize();
      const attr = await service.extract('.content', 'attribute', 'href');
      expect(attr).toBe('attr-value');
    });
  });

  // ── Screenshot ──

  describe('screenshot', () => {
    it('should take a full page screenshot', async () => {
      await service.initialize();
      const buf = await service.screenshot({ fullPage: true });
      expect(mockPage.screenshot).toHaveBeenCalledWith({ fullPage: true });
      expect(buf).toBeInstanceOf(Buffer);
    });

    it('should take element screenshot when selector is given', async () => {
      await service.initialize();
      const buf = await service.screenshot({ selector: '#hero' });
      expect(mockPage.locator).toHaveBeenCalledWith('#hero');
      expect(buf).toBeInstanceOf(Buffer);
    });
  });

  // ── Wait ──

  describe('wait', () => {
    it('should wait for selector visibility', async () => {
      await service.initialize();
      await service.wait({ selector: '.loaded', timeout: 3000 });
      expect(mockPage.waitForSelector).toHaveBeenCalledWith('.loaded', {
        timeout: 3000,
        state: 'visible',
      });
    });

    it('should wait for a fixed timeout when no selector given', async () => {
      await service.initialize();
      await service.wait({ timeout: 2000 });
      expect(mockPage.waitForTimeout).toHaveBeenCalledWith(2000);
    });
  });

  // ── Scroll ──

  describe('scroll', () => {
    it('should scroll down by default pixels', async () => {
      await service.initialize();
      await service.scroll({});
      expect(mockPage.mouse.wheel).toHaveBeenCalledWith(0, 500);
    });

    it('should scroll up when direction is up', async () => {
      await service.initialize();
      await service.scroll({ direction: 'up', pixels: 300 });
      expect(mockPage.mouse.wheel).toHaveBeenCalledWith(0, -300);
    });

    it('should scroll element into view when selector given', async () => {
      await service.initialize();
      await service.scroll({ selector: '#footer' });
      expect(mockPage.locator).toHaveBeenCalledWith('#footer');
    });
  });

  // ── Evaluate ──

  describe('evaluate', () => {
    it('should evaluate JS expression on the page', async () => {
      mockPage.evaluate.mockResolvedValueOnce(42);
      await service.initialize();
      const result = await service.evaluate('1 + 1');
      expect(mockPage.evaluate).toHaveBeenCalledWith('1 + 1');
      expect(result).toBe(42);
    });
  });

  // ── Session management ──

  describe('saveSession / restoreSession', () => {
    it('should save storage state from context', async () => {
      await service.initialize();
      const state = await service.saveSession();
      expect(mockContext.storageState).toHaveBeenCalled();
      expect(state).toEqual({ cookies: [], origins: [] });
    });

    it('should throw when saving session before initialization', async () => {
      await expect(service.saveSession()).rejects.toThrow('Browser not initialized');
    });

    it('should restore cookies and localStorage', async () => {
      await service.initialize();
      await service.restoreSession({
        cookies: [
          { name: 'token', value: 'abc', domain: '.example.com', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' },
        ],
        origins: [
          { origin: 'https://example.com', localStorage: [{ name: 'key', value: 'val' }] },
        ],
      });
      expect(mockContext.addCookies).toHaveBeenCalled();
    });
  });

  // ── setProxy ──

  describe('setProxy', () => {
    it('should restart browser with new proxy config', async () => {
      await service.initialize();
      await service.setProxy('http://proxy:8080');
      // After restart, service should be running again
      expect(service.isRunning).toBe(true);
    });
  });
});
