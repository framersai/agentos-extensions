import type { BrowserService } from '../BrowserService.js';

export class NavigateTool {
  readonly id = 'browserNavigate';
  readonly name = 'browserNavigate';
  readonly displayName = 'Navigate to URL';
  readonly description = 'Navigate the browser to a URL and return the page title, status code, and load time.';
  readonly category = 'browser';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      url: { type: 'string', description: 'The URL to navigate to' },
      waitUntil: {
        type: 'string',
        enum: ['domcontentloaded', 'load', 'networkidle'],
        description: 'When to consider navigation complete',
        default: 'domcontentloaded',
      },
    },
    required: ['url'],
  };

  readonly outputSchema = {
    type: 'object' as const,
    properties: {
      url: { type: 'string' },
      title: { type: 'string' },
      status: { type: 'number' },
      loadTimeMs: { type: 'number' },
    },
  };

  constructor(private browser: BrowserService) {}

  async execute(args: { url: string }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const result = await this.browser.navigate(args.url);
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
