import type { ResearchService } from '../ResearchService.js';

export class ResearchAggregateTool {
  readonly id = 'researchAggregate';
  readonly name = 'researchAggregate';
  readonly displayName = 'Aggregate Search';
  readonly description = 'Unified search across multiple engines (Serper, Brave, SerpAPI) with merged results.';
  readonly category = 'research';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'Search query' },
      engines: {
        type: 'array',
        items: { type: 'string', enum: ['serper', 'brave', 'serpapi'] },
        description: 'Search engines to query (default: serper)',
      },
      maxResults: { type: 'number', description: 'Maximum results per engine (default 10)' },
    },
    required: ['query'],
  };

  constructor(private service: ResearchService) {}

  async execute(args: {
    query: string;
    engines?: string[];
    maxResults?: number;
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const results = await this.service.aggregateSearch(
        args.query,
        args.engines ?? ['serper'],
        args.maxResults ?? 10,
      );
      return { success: true, data: results };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
