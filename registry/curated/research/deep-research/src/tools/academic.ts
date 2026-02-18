import type { ResearchService } from '../ResearchService.js';

export class ResearchAcademicTool {
  readonly id = 'researchAcademic';
  readonly name = 'researchAcademic';
  readonly displayName = 'Academic Paper Search';
  readonly description = 'Search academic papers on arXiv, Google Scholar, and Semantic Scholar.';
  readonly category = 'research';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'Academic search query (keywords, paper title, author name)' },
      source: {
        type: 'string',
        enum: ['arxiv', 'scholar', 'semantic'],
        description: 'Academic source to search (default: arxiv)',
      },
      maxResults: { type: 'number', description: 'Maximum number of papers to return (default 10)' },
    },
    required: ['query'],
  };

  constructor(private service: ResearchService) {}

  async execute(args: {
    query: string;
    source?: 'arxiv' | 'scholar' | 'semantic';
    maxResults?: number;
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const results = await this.service.searchAcademic(args.query, {
        source: args.source,
        maxResults: args.maxResults,
      });
      return { success: true, data: results };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
