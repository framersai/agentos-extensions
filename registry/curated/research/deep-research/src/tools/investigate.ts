import type { ResearchService } from '../ResearchService.js';

export class ResearchInvestigateTool {
  readonly id = 'researchInvestigate';
  readonly name = 'researchInvestigate';
  readonly displayName = 'Multi-Source Investigation';
  readonly description = 'Conduct a multi-source investigation with claim verification and cross-referencing across web, academic, social, and news sources.';
  readonly category = 'research';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'The research query or topic to investigate' },
      sources: {
        type: 'array',
        items: { type: 'string', enum: ['web', 'academic', 'social', 'news'] },
        description: 'Sources to search across (default: web, academic, news)',
      },
      maxResults: { type: 'number', description: 'Maximum results per source (default 10)' },
    },
    required: ['query'],
  };

  constructor(private service: ResearchService) {}

  async execute(args: {
    query: string;
    sources?: string[];
    maxResults?: number;
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const result = await this.service.investigate(
        args.query,
        args.sources ?? ['web', 'academic', 'news'],
        args.maxResults ?? 10,
      );
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
