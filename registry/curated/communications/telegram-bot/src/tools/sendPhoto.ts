/**
 * Send photo tool for Telegram Bot extension
 */

import { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import { TelegramBotService } from '../services/telegramBot';

/**
 * Tool for sending photos via Telegram Bot API
 */
export class SendPhotoTool implements ITool {
  public readonly id = 'telegramSendPhoto';
  public readonly name = 'telegramSendPhoto';
  public readonly displayName = 'Send Telegram Photo';
  public readonly description = 'Send a photo to a Telegram chat or user with an optional caption.';

  public readonly inputSchema = {
    type: 'object',
    required: ['chatId', 'photo'],
    properties: {
      chatId: {
        type: ['string', 'number'],
        description: 'Chat ID, username (@username), or channel (@channelname)',
      },
      photo: {
        type: 'string',
        description: 'Photo URL, file path, or base64 string (service determines handling)',
      },
      caption: {
        type: 'string',
        description: 'Optional caption text',
      },
      parseMode: {
        type: 'string',
        enum: ['Markdown', 'HTML', 'MarkdownV2'],
        description: 'Caption formatting mode',
      },
      disableNotification: {
        type: 'boolean',
        description: 'Send silently',
        default: false,
      },
    },
  };

  public readonly outputSchema = {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      messageId: { type: 'number' },
      chatId: { type: ['string', 'number'] },
      date: { type: 'number' },
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
      const result = await this.botService.sendPhoto({
        chatId: args.chatId,
        photo: args.photo,
        caption: args.caption,
        parseMode: args.parseMode,
        disableNotification: args.disableNotification,
      });

      return { success: result.success, output: result, error: result.error };
    } catch (error: any) {
      return { success: false, error: `Failed to send photo: ${error.message}` };
    }
  }

  validateArgs(args: any): { isValid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!args.chatId) errors.push('chatId is required');
    if (!args.photo) errors.push('photo is required');
    if (args.caption && typeof args.caption !== 'string') errors.push('caption must be a string');
    if (args.parseMode && !['Markdown', 'HTML', 'MarkdownV2'].includes(args.parseMode)) {
      errors.push('parseMode must be Markdown, HTML, or MarkdownV2');
    }
    return { isValid: errors.length === 0, errors: errors.length ? errors : undefined };
  }
}

