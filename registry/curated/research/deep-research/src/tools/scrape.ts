import type { ResearchService } from '../ResearchService.js';

export class ResearchScrapeTool {
  readonly id = 'researchScrape';
  readonly name = 'researchScrape';
  readonly displayName = 'Content Scraper';
  readonly description = 'Platform-specific content extraction from YouTube, Wikipedia, blogs, and generic web pages.';
  readonly category = 'research';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      url: { type: 'string', description: 'URL to scrape content from' },
      type: {
        type: 'string',
        enum: ['youtube', 'wikipedia', 'blog', 'generic'],
        description: 'Content type for platform-specific extraction (default: generic)',
      },
    },
    required: ['url'],
  };

  constructor(private service: ResearchService) {}

  async execute(args: {
    url: string;
    type?: 'youtube' | 'wikipedia' | 'blog' | 'generic';
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const result = await this.service.scrapeContent(args.url, args.type ?? 'generic');
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
