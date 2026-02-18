import type { NotificationService } from '../NotificationService.js';

export class NotifySendTool {
  readonly id = 'notifySend';
  readonly name = 'notifySend';
  readonly displayName = 'Send Notification';
  readonly description = 'Send a notification via a specific channel or the highest-priority available channel.';
  readonly category = 'communications';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      channel: { type: 'string', description: 'Target channel id. If omitted, the highest-priority channel is used.' },
      message: { type: 'string', description: 'Notification body text.' },
      subject: { type: 'string', description: 'Optional subject or title for the notification.' },
      metadata: { type: 'object', description: 'Arbitrary metadata forwarded to the channel.' },
    },
    required: ['message'],
  };

  constructor(private service: NotificationService) {}

  async execute(args: Record<string, unknown>): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const result = await this.service.send({
        channel: args.channel as string | undefined,
        message: args.message as string,
        subject: args.subject as string | undefined,
        metadata: args.metadata as Record<string, unknown> | undefined,
      });
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
