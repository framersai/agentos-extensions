/**
 * @fileoverview ITool for Pinterest pin and board analytics.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { PinterestService } from '../PinterestService';

export class PinterestAnalyticsTool implements ITool {
  public readonly id = 'pinterestAnalytics';
  public readonly name = 'pinterestAnalytics';
  public readonly displayName = 'Pin Analytics';
  public readonly description = 'Get performance metrics for a Pinterest pin or board (impressions, saves, clicks, closeups).';
  public readonly category = 'social';
  public readonly version = '0.1.0';
  public readonly hasSideEffects = false;

  public readonly inputSchema = {
    type: 'object' as const,
    required: ['id', 'type', 'startDate', 'endDate'] as const,
    properties: {
      id: { type: 'string', description: 'Pin ID or Board ID' },
      type: {
        type: 'string',
        enum: ['pin', 'board'],
        description: 'Whether to fetch analytics for a pin or board',
      },
      startDate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
      endDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
    },
  };

  constructor(private readonly service: PinterestService) {}

  async execute(
    args: { id: string; type: 'pin' | 'board'; startDate: string; endDate: string },
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    try {
      let analytics;
      if (args.type === 'board') {
        analytics = await this.service.getBoardAnalytics(args.id, args.startDate, args.endDate);
      } else {
        analytics = await this.service.getPinAnalytics(args.id, args.startDate, args.endDate);
      }

      return { success: true, data: analytics };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
