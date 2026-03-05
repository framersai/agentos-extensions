import type { GoogleBusinessService } from '../GoogleBusinessService.js';

export class GbpAnalyticsTool {
  readonly id = 'gbpAnalytics';
  readonly name = 'gbpAnalytics';
  readonly displayName = 'Get Insights';
  readonly description = 'Get analytics insights for a Google Business Profile location (views, searches, actions, etc.).';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      locationName: { type: 'string', description: 'Location resource name (e.g. "locations/123")' },
      metrics: {
        type: 'array',
        items: { type: 'string' },
        description: 'Metrics to retrieve (e.g. "QUERIES_DIRECT", "QUERIES_INDIRECT", "VIEWS_MAPS", "VIEWS_SEARCH", "ACTIONS_WEBSITE", "ACTIONS_PHONE", "ACTIONS_DRIVING_DIRECTIONS")',
      },
    },
    required: ['locationName', 'metrics'],
  };

  constructor(private service: GoogleBusinessService) {}

  async execute(args: { locationName: string; metrics: string[] }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const result = await this.service.getInsights(args.locationName, args.metrics);
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
