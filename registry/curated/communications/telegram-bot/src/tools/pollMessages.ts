/**
 * Poll messages tool for Telegram Bot extension
 */

import { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import { TelegramBotService } from '../services/telegramBot';

/**
 * Tool for fetching recent messages from a chat.
 *
 * Note: Telegram Bot API does not provide message history directly; the
 * underlying service returns a hint when unavailable.
 */
export class PollMessagesTool implements ITool {
  public readonly id = 'telegramPollMessages';
  public readonly name = 'telegramPollMessages';
  public readonly displayName = 'Poll Telegram Messages';
  public readonly description = 'Fetch recent messages from a Telegram chat (requires caching/webhooks).';

  public readonly inputSchema = {
    type: 'object',
    required: ['chatId'],
    properties: {
      chatId: {
        type: ['string', 'number'],
        description: 'Chat ID, username (@username), or channel (@channelname)',
      },
      limit: {
        type: 'number',
        description: 'Max number of messages to retrieve',
        default: 10,
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
  public readonly hasSideEffects = false;

  constructor(private botService: TelegramBotService) {}

  async execute(args: any, _context: ToolExecutionContext): Promise<ToolExecutionResult> {
    try {
      const limit = typeof args.limit === 'number' && Number.isFinite(args.limit) ? args.limit : 10;
      const result = await this.botService.getRecentMessages(args.chatId, limit);
      return { success: (result as any).success === true, output: { success: (result as any).success, data: result }, error: (result as any).error };
    } catch (error: any) {
      return { success: false, error: `Failed to poll messages: ${error.message}` };
    }
  }

  validateArgs(args: any): { isValid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!args.chatId) errors.push('chatId is required');
    if (args.limit !== undefined && typeof args.limit !== 'number') errors.push('limit must be a number');
    return { isValid: errors.length === 0, errors: errors.length ? errors : undefined };
  }
}

