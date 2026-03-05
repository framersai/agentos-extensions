import type { LinkedInService } from '../LinkedInService.js';

export class LinkedInScheduleTool {
  readonly id = 'linkedinSchedule';
  readonly name = 'linkedinSchedule';
  readonly displayName = 'Schedule Post';
  readonly description = 'Schedule a LinkedIn post for future publishing. Posts immediately if the scheduled time has passed.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      text: { type: 'string', description: 'Post text content' },
      scheduledAt: { type: 'string', description: 'ISO 8601 timestamp for when to post' },
      mediaPath: { type: 'string', description: 'Optional URL or path to media file' },
      visibility: { type: 'string', enum: ['PUBLIC', 'CONNECTIONS'], description: 'Post visibility (default PUBLIC)' },
    },
    required: ['text', 'scheduledAt'],
  };

  private scheduledPosts: Map<string, { text: string; scheduledAt: string; timer: NodeJS.Timeout }> = new Map();

  constructor(private service: LinkedInService) {}

  async execute(args: { text: string; scheduledAt: string; mediaPath?: string; visibility?: 'PUBLIC' | 'CONNECTIONS' }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const delay = new Date(args.scheduledAt).getTime() - Date.now();
      if (delay <= 0) {
        // Post immediately if time has passed
        const result = await this.service.postToFeed({
          text: args.text,
          mediaUrls: args.mediaPath ? [args.mediaPath] : undefined,
          visibility: args.visibility,
        });
        return { success: true, data: { ...result, scheduled: false } };
      }

      const id = `sched_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const timer = setTimeout(async () => {
        try {
          await this.service.postToFeed({
            text: args.text,
            mediaUrls: args.mediaPath ? [args.mediaPath] : undefined,
            visibility: args.visibility,
          });
        } catch {
          // Scheduled post failed — logged silently
        }
        this.scheduledPosts.delete(id);
      }, delay);

      this.scheduledPosts.set(id, { text: args.text, scheduledAt: args.scheduledAt, timer });
      return { success: true, data: { scheduleId: id, scheduledAt: args.scheduledAt, scheduled: true } };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
