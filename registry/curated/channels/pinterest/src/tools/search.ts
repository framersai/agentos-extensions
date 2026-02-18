/**
 * @fileoverview ITool for searching pins and boards on Pinterest.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { PinterestService } from '../PinterestService';

export class PinterestSearchTool implements ITool {
  public readonly id = 'pinterestSearch';
  public readonly name = 'pinterestSearch';
  public readonly displayName = 'Search Pinterest';
  public readonly description = 'Search for pins or boards on Pinterest by keyword.';
  public readonly category = 'social';
  public readonly version = '0.1.0';
  public readonly hasSideEffects = false;

  public readonly inputSchema = {
    type: 'object' as const,
    required: ['query'] as const,
    properties: {
      query: { type: 'string', description: 'Search query' },
      type: {
        type: 'string',
        enum: ['pins', 'boards'],
        description: 'Search type: pins or boards (default: pins)',
      },
      maxResults: { type: 'number', description: 'Max results to return (default: 10, max: 100)' },
    },
  };

  constructor(private readonly service: PinterestService) {}

  async execute(
    args: { query: string; type?: 'pins' | 'boards'; maxResults?: number },
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    try {
      const searchType = args.type ?? 'pins';
      const options = { query: args.query, maxResults: args.maxResults };

      if (searchType === 'boards') {
        const boards = await this.service.searchBoards(options);
        return { success: true, data: { type: 'boards', results: boards, count: boards.length } };
      }

      const pins = await this.service.searchPins(options);
      return { success: true, data: { type: 'pins', results: pins, count: pins.length } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
