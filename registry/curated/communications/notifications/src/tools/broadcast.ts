import type { NotificationService } from '../NotificationService.js';

export class NotifyBroadcastTool {
  readonly id = 'notifyBroadcast';
  readonly name = 'notifyBroadcast';
  readonly displayName = 'Broadcast Notification';
  readonly description = 'Broadcast a notification to all registered channels or a specified subset.';
  readonly category = 'communications';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      message: { type: 'string', description: 'Notification body text.' },
      subject: { type: 'string', description: 'Optional subject or title for the notification.' },
      channels: { type: 'array', items: { type: 'string' }, description: 'Subset of channel ids to target. If omitted, all registered channels are used.' },
      metadata: { type: 'object', description: 'Arbitrary metadata forwarded to every channel.' },
    },
    required: ['message'],
  };

  constructor(private service: NotificationService) {}

  async execute(args: Record<string, unknown>): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const results = await this.service.broadcast({
        message: args.message as string,
        subject: args.subject as string | undefined,
        channels: args.channels as string[] | undefined,
        metadata: args.metadata as Record<string, unknown> | undefined,
      });
      return { success: true, data: results };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
