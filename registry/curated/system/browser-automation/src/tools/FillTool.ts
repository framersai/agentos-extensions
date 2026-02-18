import type { BrowserService } from '../BrowserService.js';

export class FillTool {
  readonly id = 'browserFill';
  readonly name = 'browserFill';
  readonly displayName = 'Fill Input';
  readonly description = 'Fill a form input field with the specified value. Clears existing content first.';
  readonly category = 'browser';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      selector: { type: 'string', description: 'CSS selector of the input element' },
      value: { type: 'string', description: 'Value to fill into the input' },
    },
    required: ['selector', 'value'],
  };

  constructor(private browser: BrowserService) {}

  async execute(args: { selector: string; value: string }): Promise<{ success: boolean; error?: string }> {
    try {
      await this.browser.fill(args.selector, args.value);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
