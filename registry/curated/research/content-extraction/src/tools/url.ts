import type { ContentExtractionService } from '../ContentExtractionService.js';

export class ExtractUrlTool {
  readonly id = 'extractUrl';
  readonly name = 'extractUrl';
  readonly displayName = 'Extract URL Content';
  readonly description = 'Extract clean text, markdown, or HTML content from any URL using readability-style parsing.';
  readonly category = 'research';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      url: { type: 'string', description: 'URL to extract content from' },
      format: {
        type: 'string',
        enum: ['text', 'markdown', 'html'],
        description: 'Output format (default: text)',
      },
    },
    required: ['url'],
  };

  constructor(private service: ContentExtractionService) {}

  async execute(args: {
    url: string;
    format?: 'text' | 'markdown' | 'html';
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const result = await this.service.extractUrl(args.url, args.format ?? 'text');
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
