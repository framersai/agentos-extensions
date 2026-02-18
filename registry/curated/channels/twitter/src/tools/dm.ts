import type { TwitterService } from '../TwitterService.js';

export class TwitterDmTool {
  readonly id = 'twitterDm';
  readonly name = 'twitterDm';
  readonly displayName = 'Direct Messages';
  readonly description = 'Send or list direct messages on Twitter.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      action: { type: 'string', enum: ['send', 'list'], description: 'Action to perform' },
      recipientId: { type: 'string', description: 'User ID to send DM to (required for send)' },
      text: { type: 'string', description: 'Message text (required for send)' },
      maxResults: { type: 'number', description: 'Max DM events to return (for list)', default: 20 },
    },
    required: ['action'],
  };

  constructor(private service: TwitterService) {}

  async execute(args: { action: 'send' | 'list'; recipientId?: string; text?: string; maxResults?: number }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      if (args.action === 'send') {
        if (!args.recipientId || !args.text) {
          return { success: false, error: 'recipientId and text are required for send action' };
        }
        const result = await this.service.sendDm(args.recipientId, args.text);
        return { success: true, data: result };
      } else {
        const events = await this.service.getDmEvents(args.maxResults);
        return { success: true, data: events };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
