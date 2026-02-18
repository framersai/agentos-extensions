import type { ContentExtractionService } from '../ContentExtractionService.js';

export class ExtractWikipediaTool {
  readonly id = 'extractWikipedia';
  readonly name = 'extractWikipedia';
  readonly displayName = 'Extract Wikipedia Article';
  readonly description = 'Extract Wikipedia article content, summary, and metadata by title. Supports multiple languages.';
  readonly category = 'research';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      title: { type: 'string', description: 'Wikipedia article title (e.g., "Artificial intelligence")' },
      language: { type: 'string', description: 'Wikipedia language code (default: "en")' },
    },
    required: ['title'],
  };

  constructor(private service: ContentExtractionService) {}

  async execute(args: {
    title: string;
    language?: string;
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const result = await this.service.extractWikipedia(args.title, args.language ?? 'en');
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
