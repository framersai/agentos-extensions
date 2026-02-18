import type { BrowserService } from '../BrowserService.js';

export class ClickTool {
  readonly id = 'browserClick';
  readonly name = 'browserClick';
  readonly displayName = 'Click Element';
  readonly description = 'Click an element on the page by CSS selector, text content, or ARIA role.';
  readonly category = 'browser';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      selector: { type: 'string', description: 'CSS selector of the element to click' },
      text: { type: 'string', description: 'Text content of the element to click' },
      role: { type: 'string', description: 'ARIA role of the element (e.g., "button", "link")' },
    },
  };

  constructor(private browser: BrowserService) {}

  async execute(args: { selector?: string; text?: string; role?: string }): Promise<{ success: boolean; error?: string }> {
    try {
      const clicked = await this.browser.click(args);
      return { success: clicked };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
