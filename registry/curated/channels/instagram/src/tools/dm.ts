import type { InstagramService } from '../InstagramService.js';

export class InstagramDmTool {
  readonly id = 'instagramDm';
  readonly name = 'instagramDm';
  readonly displayName = 'Direct Messages';
  readonly description = 'Send direct messages on Instagram. Note: DM API requires approved Instagram Messaging permissions.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      action: { type: 'string', enum: ['send'], description: 'DM action' },
      recipientId: { type: 'string', description: 'Instagram user ID to message' },
      text: { type: 'string', description: 'Message text' },
    },
    required: ['action', 'recipientId', 'text'],
  };

  constructor(private _service: InstagramService) {}

  async execute(args: { action: string; recipientId: string; text: string }): Promise<{ success: boolean; data?: any; error?: string }> {
    // Instagram DM API is restricted — requires approved Messenger Platform access
    return {
      success: false,
      error: 'Instagram DM API requires approved Messenger Platform permissions. Use browser automation for DM functionality.',
    };
  }
}
