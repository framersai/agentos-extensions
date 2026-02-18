import type { ContentExtractionService } from '../ContentExtractionService.js';

export class ExtractStructuredTool {
  readonly id = 'extractStructured';
  readonly name = 'extractStructured';
  readonly displayName = 'Extract Structured Data';
  readonly description = 'Extract structured data (tables, lists, links, metadata) from a web page.';
  readonly category = 'research';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      url: { type: 'string', description: 'URL to extract structured data from' },
      selectors: {
        type: 'object',
        description: 'Optional CSS-style selectors to target specific elements',
        properties: {
          tables: { type: 'string', description: 'Selector for tables' },
          lists: { type: 'string', description: 'Selector for lists' },
          links: { type: 'string', description: 'Selector for links' },
        },
      },
    },
    required: ['url'],
  };

  constructor(private service: ContentExtractionService) {}

  async execute(args: {
    url: string;
    selectors?: Record<string, string>;
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const result = await this.service.extractStructured(args.url, args.selectors);
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
