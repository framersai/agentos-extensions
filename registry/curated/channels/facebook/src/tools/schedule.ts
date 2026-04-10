// @ts-nocheck
import type { FacebookService } from '../FacebookService.js';

export class FacebookScheduleTool {
  readonly id = 'facebookSchedule';
  readonly name = 'facebookSchedule';
  readonly displayName = 'Schedule Post';
  readonly description = 'Schedule a Facebook page post for future publishing using the Graph API scheduled_publish_time parameter.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      text: { type: 'string', description: 'Post text content' },
      scheduledTime: { type: 'string', description: 'ISO 8601 timestamp for when to publish' },
      pageId: { type: 'string', description: 'Page ID to post to (falls back to configured default)' },
      mediaPath: { type: 'string', description: 'Optional URL of photo to attach' },
    },
    required: ['text', 'scheduledTime'],
  };

  constructor(private service: FacebookService) {}

  async execute(args: {
    text: string;
    scheduledTime: string;
    pageId?: string;
    mediaPath?: string;
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const scheduledUnix = Math.floor(new Date(args.scheduledTime).getTime() / 1000);
      const now = Math.floor(Date.now() / 1000);

      if (scheduledUnix <= now) {
        // Post immediately if the scheduled time has already passed
        const result = await this.service.postToPage(args.pageId ?? '', {
          message: args.text,
          photoUrl: args.mediaPath,
        });
        return { success: true, data: { ...result, scheduled: false } };
      }

      // Use Graph API native scheduling (page posts only)
      const result = await this.service.postToPage(args.pageId ?? '', {
        message: args.text,
        photoUrl: args.mediaPath,
        published: false,
        scheduledTime: scheduledUnix,
      });

      return {
        success: true,
        data: {
          ...result,
          scheduled: true,
          scheduledTime: args.scheduledTime,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
