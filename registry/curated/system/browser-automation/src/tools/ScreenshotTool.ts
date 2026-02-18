import type { BrowserService } from '../BrowserService.js';

export class ScreenshotTool {
  readonly id = 'browserScreenshot';
  readonly name = 'browserScreenshot';
  readonly displayName = 'Take Screenshot';
  readonly description = 'Capture a screenshot of the current page or a specific element. Returns base64-encoded PNG.';
  readonly category = 'browser';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      selector: { type: 'string', description: 'CSS selector to screenshot a specific element (omit for full page)' },
      fullPage: { type: 'boolean', description: 'Capture the full scrollable page', default: false },
    },
  };

  constructor(private browser: BrowserService) {}

  async execute(args: { selector?: string; fullPage?: boolean }): Promise<{ success: boolean; data?: { base64: string; mimeType: string }; error?: string }> {
    try {
      const buffer = await this.browser.screenshot(args);
      return {
        success: true,
        data: { base64: buffer.toString('base64'), mimeType: 'image/png' },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
