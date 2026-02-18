import type { BrowserService } from '../BrowserService.js';

export class EvaluateTool {
  readonly id = 'browserEvaluate';
  readonly name = 'browserEvaluate';
  readonly displayName = 'Evaluate JavaScript';
  readonly description = 'Execute arbitrary JavaScript code in the browser page context and return the result.';
  readonly category = 'browser';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      script: { type: 'string', description: 'JavaScript code to evaluate in the page context' },
    },
    required: ['script'],
  };

  constructor(private browser: BrowserService) {}

  async execute(args: { script: string }): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const result = await this.browser.evaluate(args.script);
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
