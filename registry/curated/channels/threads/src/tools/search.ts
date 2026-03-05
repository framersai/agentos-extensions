import type { ThreadsService } from '../ThreadsService.js';

export class ThreadsSearchTool {
  readonly id = 'threadsSearch';
  readonly name = 'threadsSearch';
  readonly displayName = 'Search User Threads';
  readonly description = "Browse a user's recent Threads posts. Note: Threads API doesn't support full-text search — this returns the user's recent threads.";
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'Optional filter keyword (client-side filtering on returned posts)' },
      limit: { type: 'number', description: 'Max posts to return (default 25, max 100)' },
    },
    required: [],
  };

  constructor(private service: ThreadsService) {}

  async execute(args: { query?: string; limit?: number }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      let threads = await this.service.getUserThreads(undefined, args.limit ?? 25);

      // Client-side filtering if query provided (Threads API has no search endpoint)
      if (args.query) {
        const q = args.query.toLowerCase();
        threads = threads.filter((t) => t.text?.toLowerCase().includes(q));
      }

      return { success: true, data: threads };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
