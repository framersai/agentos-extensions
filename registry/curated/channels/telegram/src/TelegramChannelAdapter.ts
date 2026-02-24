/**
 * @fileoverview IChannelAdapter implementation for Telegram via grammY.
 */

import type {
  IChannelAdapter,
  ChannelPlatform,
  ChannelCapability,
  ChannelAuthConfig,
  ChannelConnectionInfo,
  ChannelSendResult,
  MessageContent,
  ChannelEventHandler,
  ChannelEventType,
  ChannelEvent,
  ChannelMessage,
  RemoteUser,
  ConversationType,
} from '@framers/agentos';
import { TelegramService } from './TelegramService';
import type { Context } from 'grammy';

function parseTelegramConversationId(conversationId: string): { chatId: string; messageThreadId?: number } {
  const raw = String(conversationId ?? '').trim();
  if (!raw) return { chatId: '' };
  const idx = raw.lastIndexOf('#');
  if (idx <= 0) return { chatId: raw };
  const chatId = raw.slice(0, idx).trim();
  const threadRaw = raw.slice(idx + 1).trim();
  const threadId = Number(threadRaw);
  if (!chatId || !Number.isFinite(threadId)) return { chatId: raw };
  const normalized = Math.trunc(threadId);
  // Telegram forum "General" topic (id=1) is best addressed by omitting message_thread_id.
  if (normalized <= 1) return { chatId };
  return { chatId, messageThreadId: normalized };
}

export class TelegramChannelAdapter implements IChannelAdapter {
  readonly platform: ChannelPlatform = 'telegram';
  readonly displayName = 'Telegram';
  readonly capabilities: readonly ChannelCapability[] = [
    'text',
    'rich_text',
    'images',
    'video',
    'audio',
    'documents',
    'stickers',
    'reactions',
    'inline_keyboard',
    'buttons',
    'typing_indicator',
    'group_chat',
    'editing',
    'deletion',
    'mentions',
  ] as const;

  private handlers = new Map<ChannelEventHandler, ChannelEventType[] | undefined>();
  private ctxHandler: ((ctx: Context) => void) | null = null;

  constructor(private readonly service: TelegramService) {}

  async initialize(auth: ChannelAuthConfig): Promise<void> {
    // Service is initialized by the extension pack lifecycle, but
    // if called directly (e.g., standalone usage), we wire up here.
    this.ctxHandler = (ctx: Context) => this.handleInboundMessage(ctx);
    this.service.onMessage(this.ctxHandler);
  }

  async shutdown(): Promise<void> {
    if (this.ctxHandler) {
      this.service.offMessage(this.ctxHandler);
      this.ctxHandler = null;
    }
    this.handlers.clear();
  }

  getConnectionInfo(): ChannelConnectionInfo {
    return {
      status: this.service.isRunning ? 'connected' : 'disconnected',
    };
  }

  async sendMessage(conversationId: string, content: MessageContent): Promise<ChannelSendResult> {
    const { chatId, messageThreadId } = parseTelegramConversationId(conversationId);
    const textBlock = content.blocks.find((b) => b.type === 'text');
    const imageBlock = content.blocks.find((b) => b.type === 'image');
    const documentBlock = content.blocks.find((b) => b.type === 'document');

    let messageId: number;

    if (imageBlock && imageBlock.type === 'image') {
      const opts: Parameters<TelegramService['sendPhoto']>[2] = {
        caption: imageBlock.caption ?? textBlock?.text,
        ...(messageThreadId ? { messageThreadId } : {}),
      };
      const result = await this.service.sendPhoto(chatId, imageBlock.url, opts);
      messageId = result.message_id;
    } else if (documentBlock && documentBlock.type === 'document') {
      const opts: Parameters<TelegramService['sendDocument']>[2] = {
        caption: textBlock?.text,
        filename: documentBlock.filename,
        ...(messageThreadId ? { messageThreadId } : {}),
      };
      const result = await this.service.sendDocument(chatId, documentBlock.url, opts);
      messageId = result.message_id;
    } else {
      const text = textBlock?.text ?? '';
      const result = await this.service.sendMessage(chatId, text, {
        replyToMessageId: content.replyToMessageId
          ? Number(content.replyToMessageId)
          : undefined,
        ...(messageThreadId ? { messageThreadId } : {}),
      });
      messageId = result.message_id;
    }

    return { messageId: String(messageId), timestamp: new Date().toISOString() };
  }

  async sendTypingIndicator(conversationId: string, _isTyping: boolean): Promise<void> {
    if (_isTyping) {
      const { chatId, messageThreadId } = parseTelegramConversationId(conversationId);
      if (messageThreadId) {
        await this.service.sendChatAction(chatId, 'typing', messageThreadId);
      } else {
        await this.service.sendChatAction(chatId, 'typing');
      }
    }
    // Telegram doesn't have a "stop typing" API — it auto-clears.
  }

  on(handler: ChannelEventHandler, eventTypes?: ChannelEventType[]): () => void {
    this.handlers.set(handler, eventTypes);
    return () => {
      this.handlers.delete(handler);
    };
  }

  async editMessage(conversationId: string, messageId: string, content: MessageContent): Promise<void> {
    const textBlock = content.blocks.find((b) => b.type === 'text');
    if (textBlock && textBlock.type === 'text') {
      const { chatId } = parseTelegramConversationId(conversationId);
      await this.service.api.editMessageText(chatId, Number(messageId), textBlock.text);
    }
  }

  async deleteMessage(conversationId: string, messageId: string): Promise<void> {
    const { chatId } = parseTelegramConversationId(conversationId);
    await this.service.api.deleteMessage(chatId, Number(messageId));
  }

  async addReaction(conversationId: string, messageId: string, emoji: string): Promise<void> {
    const { chatId } = parseTelegramConversationId(conversationId);
    await this.service.api.setMessageReaction(chatId, Number(messageId), [
      { type: 'emoji', emoji } as any,
    ]);
  }

  async getConversationInfo(conversationId: string): Promise<{
    name?: string;
    memberCount?: number;
    isGroup: boolean;
    metadata?: Record<string, unknown>;
  }> {
    const { chatId } = parseTelegramConversationId(conversationId);
    const chat = await this.service.api.getChat(chatId) as any;
    const isGroup = ['group', 'supergroup'].includes(chat.type);
    return {
      name: chat.title ?? chat.first_name,
      memberCount: isGroup ? await this.service.api.getChatMemberCount(chatId) : undefined,
      isGroup,
      metadata: { type: chat.type, username: chat.username },
    };
  }

  // ── Private ──

  /** Commands that trigger an explicit invocation (fresh session + tool-calling). */
  private static readonly EXPLICIT_COMMANDS = new Set(['ask', 'summarize', 'deepdive', 'paper']);

  private handleInboundMessage(ctx: Context): void {
    const msg = ctx.message;
    if (!msg) return;

    const sender: RemoteUser = {
      id: String(msg.from?.id ?? 'unknown'),
      displayName: [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || undefined,
      username: msg.from?.username,
    };

    // grammY's message typings can be narrower than Telegram's full chat-type
    // union; treat it as a string to support channel posts consistently.
    const chatType = msg.chat.type as unknown as string;
    const conversationType: ConversationType =
      chatType === 'private' ? 'direct' :
      chatType === 'channel' ? 'channel' : 'group';

    const conversationId = (() => {
      const threadId = (msg as any).message_thread_id;
      // Omit General topic id=1 — treat it as the base chat conversation.
      return typeof threadId === 'number' && threadId > 1
        ? `${String(msg.chat.id)}#${Math.trunc(threadId)}`
        : String(msg.chat.id);
    })();

    let text = msg.text ?? '';
    let explicitInvocation = false;

    // Parse Telegram bot commands: /ask what's the weather?
    // The (?:@botname)? part handles group mentions like /ask@RabbitHoleBot
    const commandMatch = text.match(/^\/(\w+)(?:@\w+)?\s*([\s\S]*)/);
    if (commandMatch) {
      const cmd = commandMatch[1].toLowerCase();
      const arg = commandMatch[2].trim();

      if (cmd === 'help' || cmd === 'start') {
        this.replyHelp(ctx);
        return;
      }

      if (TelegramChannelAdapter.EXPLICIT_COMMANDS.has(cmd)) {
        if (!arg) {
          ctx.reply(`Usage: /${cmd} <your question or input>`).catch(() => {});
          return;
        }
        text = cmd === 'ask' ? arg
             : cmd === 'summarize' ? `Summarize this link:\n${arg}`
             : cmd === 'deepdive' ? `Deep dive:\n${arg}`
             : `Summarize this arXiv paper for an AI/LLM practitioner:\n${arg}`;
        explicitInvocation = true;
      }
    }

    const channelMessage: ChannelMessage = {
      messageId: String(msg.message_id),
      platform: 'telegram',
      conversationId,
      conversationType,
      sender,
      content: [{ type: 'text', text }],
      text,
      timestamp: new Date(msg.date * 1000).toISOString(),
      replyToMessageId: msg.reply_to_message
        ? String(msg.reply_to_message.message_id)
        : undefined,
      // Wrap with metadata when explicit invocation (same pattern as Discord adapter).
      rawEvent: explicitInvocation
        ? { ctx, explicitInvocation: true, explain: false }
        : ctx,
    };

    const event: ChannelEvent<ChannelMessage> = {
      type: 'message',
      platform: 'telegram',
      conversationId: channelMessage.conversationId,
      timestamp: channelMessage.timestamp,
      data: channelMessage,
    };

    this.emit(event);
  }

  private replyHelp(ctx: Context): void {
    const lines = [
      '<b>Rabbit Hole AI — Help</b>',
      '',
      '<b>AI Commands</b>',
      '/ask <i>question</i> — ask the AI',
      '/deepdive <i>question</i> — deeper answer',
      '/summarize <i>url</i> — summarize a link',
      '/paper <i>arxiv-id</i> — summarize an arXiv paper',
      '',
      'You can also send any message without a command and the bot will respond.',
    ];
    ctx.reply(lines.join('\n'), { parse_mode: 'HTML' }).catch(() => {});
  }

  private emit(event: ChannelEvent): void {
    for (const [handler, filter] of this.handlers) {
      if (!filter || filter.includes(event.type)) {
        Promise.resolve(handler(event)).catch((err) => {
          console.error('[TelegramChannelAdapter] Handler error:', err);
        });
      }
    }
  }
}
