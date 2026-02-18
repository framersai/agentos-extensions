/**
 * Manage chat tool for Telegram Bot extension
 */

import { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import { TelegramBotService } from '../services/telegramBot';

/**
 * Tool for basic chat management operations (scaffold).
 *
 * Note: Telegram Bot API has many admin operations; this tool currently
 * supports a minimal subset used by the extension pack.
 */
export class ManageChatTool implements ITool {
  public readonly id = 'telegramManageChat';
  public readonly name = 'telegramManageChat';
  public readonly displayName = 'Manage Telegram Chat';
  public readonly description =
    'Get chat info or pin a message in a chat (requires appropriate bot permissions).';

  public readonly inputSchema = {
    type: 'object',
    required: ['action', 'chatId'],
    properties: {
      action: {
        type: 'string',
        enum: ['getInfo', 'pinMessage'],
        description: 'Chat management action',
      },
      chatId: {
        type: ['string', 'number'],
        description: 'Chat ID, username (@username), or channel (@channelname)',
      },
      messageId: {
        type: 'number',
        description: 'Message ID (required for pinMessage)',
      },
      disableNotification: {
        type: 'boolean',
        description: 'Silent pin (pinMessage only)',
        default: false,
      },
    },
  };

  public readonly outputSchema = {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      data: { type: 'object' },
      error: { type: 'string' },
    },
  };

  public readonly requiredCapabilities = ['capability:network:telegram'];
  public readonly category = 'communications';
  public readonly version = '1.0.0';
  public readonly hasSideEffects = true;

  constructor(private botService: TelegramBotService) {}

  async execute(args: any, _context: ToolExecutionContext): Promise<ToolExecutionResult> {
    try {
      const action = String(args.action || '').trim();
      if (action === 'getInfo') {
        const result = await this.botService.getChatInfo(args.chatId);
        return { success: result.success, output: { success: result.success, data: result }, error: result.error };
      }

      if (action === 'pinMessage') {
        if (typeof args.messageId !== 'number') {
          return { success: false, error: 'messageId must be a number for pinMessage' };
        }
        const result = await this.botService.pinMessage(args.chatId, args.messageId, Boolean(args.disableNotification));
        return { success: result.success, output: { success: result.success, data: result }, error: result.error };
      }

      return { success: false, error: `Unsupported action: ${action}` };
    } catch (error: any) {
      return { success: false, error: `Failed to manage chat: ${error.message}` };
    }
  }

  validateArgs(args: any): { isValid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!args.action) errors.push('action is required');
    if (!args.chatId) errors.push('chatId is required');
    if (args.action === 'pinMessage' && typeof args.messageId !== 'number') {
      errors.push('messageId (number) is required for pinMessage');
    }
    return { isValid: errors.length === 0, errors: errors.length ? errors : undefined };
  }
}

