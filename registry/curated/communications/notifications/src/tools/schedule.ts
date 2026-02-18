import type { NotificationService } from '../NotificationService.js';

export class NotifyScheduleTool {
  readonly id = 'notifySchedule';
  readonly name = 'notifySchedule';
  readonly displayName = 'Schedule Notification';
  readonly description = 'Schedule, cancel, or list pending notifications. Use action "schedule" to create, "cancel" to remove, or "list" to view all pending.';
  readonly category = 'communications';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['schedule', 'cancel', 'list'],
        description: 'Action to perform: "schedule" to create, "cancel" to remove, or "list" to view pending notifications.',
      },
      channel: { type: 'string', description: 'Target channel id (used with "schedule" action).' },
      message: { type: 'string', description: 'Notification body text (required for "schedule" action).' },
      subject: { type: 'string', description: 'Optional subject or title (used with "schedule" action).' },
      sendAt: { type: 'string', description: 'ISO 8601 timestamp for when to send (required for "schedule" action).' },
      scheduleId: { type: 'string', description: 'Schedule id to cancel (required for "cancel" action).' },
    },
    required: ['action'],
  };

  constructor(private service: NotificationService) {}

  async execute(args: Record<string, unknown>): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const action = args.action as string;

      switch (action) {
        case 'schedule': {
          if (!args.message) {
            return { success: false, error: 'message is required for "schedule" action' };
          }
          if (!args.sendAt) {
            return { success: false, error: 'sendAt is required for "schedule" action' };
          }
          const notification = this.service.schedule({
            channel: args.channel as string | undefined,
            message: args.message as string,
            subject: args.subject as string | undefined,
            sendAt: args.sendAt as string,
            metadata: args.metadata as Record<string, unknown> | undefined,
          });
          return { success: true, data: notification };
        }

        case 'cancel': {
          if (!args.scheduleId) {
            return { success: false, error: 'scheduleId is required for "cancel" action' };
          }
          const cancelled = this.service.cancelScheduled(args.scheduleId as string);
          return {
            success: true,
            data: { scheduleId: args.scheduleId, cancelled },
          };
        }

        case 'list': {
          const pending = this.service.getScheduled();
          return { success: true, data: { count: pending.length, notifications: pending } };
        }

        default:
          return { success: false, error: `Unknown action "${action}". Use "schedule", "cancel", or "list".` };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
