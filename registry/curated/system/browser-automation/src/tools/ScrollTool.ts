import type { BrowserService } from '../BrowserService.js';

export class ScrollTool {
  readonly id = 'browserScroll';
  readonly name = 'browserScroll';
  readonly displayName = 'Scroll Page';
  readonly description = 'Scroll the page up/down by a pixel amount, or scroll a specific element into view.';
  readonly category = 'browser';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      direction: { type: 'string', enum: ['up', 'down'], description: 'Scroll direction', default: 'down' },
      selector: { type: 'string', description: 'CSS selector of element to scroll into view (overrides direction/pixels)' },
      pixels: { type: 'number', description: 'Number of pixels to scroll', default: 500 },
    },
  };

  constructor(private browser: BrowserService) {}

  async execute(args: { direction?: 'up' | 'down'; selector?: string; pixels?: number }): Promise<{ success: boolean; error?: string }> {
    try {
      await this.browser.scroll(args);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
