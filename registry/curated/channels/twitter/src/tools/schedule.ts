import type { TwitterService } from '../TwitterService.js';

export class TwitterScheduleTool {
  readonly id = 'twitterSchedule';
  readonly name = 'twitterSchedule';
  readonly displayName = 'Schedule Tweet';
  readonly description = 'Schedule a tweet for future posting. Stores the tweet and posts it at the specified time.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      text: { type: 'string', description: 'Tweet text' },
      scheduledAt: { type: 'string', description: 'ISO 8601 timestamp for when to post' },
      mediaPath: { type: 'string', description: 'Optional media file path' },
    },
    required: ['text', 'scheduledAt'],
  };

  private scheduledTweets: Map<string, { text: string; scheduledAt: string; timer: NodeJS.Timeout }> = new Map();

  constructor(private service: TwitterService) {}

  async execute(args: { text: string; scheduledAt: string; mediaPath?: string }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const delay = new Date(args.scheduledAt).getTime() - Date.now();
      if (delay <= 0) {
        // Post immediately if time has passed
        const result = await this.service.postTweet({ text: args.text });
        return { success: true, data: { ...result, scheduled: false } };
      }

      const id = `sched_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const timer = setTimeout(async () => {
        try {
          const mediaIds: string[] = [];
          if (args.mediaPath) {
            const mid = await this.service.uploadMedia(args.mediaPath);
            mediaIds.push(mid);
          }
          await this.service.postTweet({
            text: args.text,
            mediaIds: mediaIds.length ? mediaIds : undefined,
          });
        } catch {
          // Scheduled tweet failed — logged silently
        }
        this.scheduledTweets.delete(id);
      }, delay);

      this.scheduledTweets.set(id, { text: args.text, scheduledAt: args.scheduledAt, timer });
      return { success: true, data: { scheduleId: id, scheduledAt: args.scheduledAt, scheduled: true } };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
