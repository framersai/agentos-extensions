/**
 * @fileoverview ITool for getting trending pins and topics on Pinterest.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { PinterestService } from '../PinterestService';

export class PinterestTrendingTool implements ITool {
  public readonly id = 'pinterestTrending';
  public readonly name = 'pinterestTrending';
  public readonly displayName = 'Get Trending';
  public readonly description = 'Get trending pins and topics on Pinterest by region.';
  public readonly category = 'social';
  public readonly version = '0.1.0';
  public readonly hasSideEffects = false;

  public readonly inputSchema = {
    type: 'object' as const,
    required: [] as const,
    properties: {
      region: { type: 'string', description: 'Region code, e.g. "US", "GB", "DE" (default: "US")' },
      maxResults: { type: 'number', description: 'Max results to return (default: 20, max: 50)' },
    },
  };

  constructor(private readonly service: PinterestService) {}

  async execute(
    args: { region?: string; maxResults?: number },
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    try {
      const trends = await this.service.getTrending(args.region, args.maxResults);
      return { success: true, data: { trends, count: trends.length, region: args.region ?? 'US' } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
