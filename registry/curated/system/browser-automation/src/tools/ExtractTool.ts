import type { BrowserService } from '../BrowserService.js';

export class ExtractTool {
  readonly id = 'browserExtract';
  readonly name = 'browserExtract';
  readonly displayName = 'Extract Content';
  readonly description = 'Extract text, HTML, or an attribute value from a DOM element matching the given selector.';
  readonly category = 'browser';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      selector: { type: 'string', description: 'CSS selector of the element to extract from' },
      mode: {
        type: 'string',
        enum: ['text', 'html', 'attribute'],
        description: 'Extraction mode: "text" for visible text, "html" for innerHTML, "attribute" for a specific attribute',
        default: 'text',
      },
      attribute: { type: 'string', description: 'Attribute name to extract (only used when mode is "attribute")' },
    },
    required: ['selector'],
  };

  constructor(private browser: BrowserService) {}

  async execute(args: { selector: string; mode?: 'text' | 'html' | 'attribute'; attribute?: string }): Promise<{ success: boolean; data?: string; error?: string }> {
    try {
      const content = await this.browser.extract(args.selector, args.mode ?? 'text', args.attribute);
      return { success: true, data: content };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
