import type { BrowserService } from '../BrowserService.js';

export class WaitTool {
  readonly id = 'browserWait';
  readonly name = 'browserWait';
  readonly displayName = 'Wait for Condition';
  readonly description = 'Wait for a CSS selector to appear/disappear, or wait for a specified duration.';
  readonly category = 'browser';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      selector: { type: 'string', description: 'CSS selector to wait for (omit for time-based wait)' },
      timeout: { type: 'number', description: 'Maximum wait time in milliseconds', default: 30000 },
      state: {
        type: 'string',
        enum: ['visible', 'hidden', 'attached', 'detached'],
        description: 'Element state to wait for',
        default: 'visible',
      },
    },
  };

  constructor(private browser: BrowserService) {}

  async execute(args: { selector?: string; timeout?: number; state?: 'visible' | 'hidden' | 'attached' | 'detached' }): Promise<{ success: boolean; error?: string }> {
    try {
      await this.browser.wait(args);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
