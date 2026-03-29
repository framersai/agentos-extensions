/**
 * @fileoverview Telegram SDK wrapper using grammY.
 * Handles bot lifecycle, message sending, and rate limiting.
 */

import { Bot, type Api, type Context } from 'grammy';

export interface TelegramChannelConfig {
  botToken: string;
  webhookUrl?: string;
  pollingTimeout?: number;
  defaultParseMode?: 'Markdown' | 'MarkdownV2' | 'HTML';
  rateLimit?: { maxRequests: number; windowMs: number };
  /**
   * When true, the service only sends messages — no polling or webhook.
   * Useful for CLI / tool contexts where another process may already be
   * polling the same bot token.
   */
  sendOnly?: boolean;
}

function normalizeTelegramThreadId(
  threadId: unknown,
  opts?: { allowGeneralTopic?: boolean },
): number | undefined {
  const n = typeof threadId === 'number' ? Math.trunc(threadId) : Number(String(threadId ?? ''));
  if (!Number.isFinite(n) || n <= 0) return undefined;
  if (opts?.allowGeneralTopic !== true && n === 1) return undefined;
  return n;
}

interface RateState {
  count: number;
  resetAt: number;
}

export class TelegramService {
  private bot: Bot | null = null;
  private running = false;
  private messageHandlers: Array<(ctx: Context) => void> = [];
  private rateMap = new Map<string, RateState>();
  private readonly config: Required<
    Pick<TelegramChannelConfig, 'defaultParseMode' | 'rateLimit'>
  > & TelegramChannelConfig;

  constructor(config: TelegramChannelConfig) {
    this.config = {
      ...config,
      defaultParseMode: config.defaultParseMode ?? 'HTML',
      rateLimit: config.rateLimit ?? { maxRequests: 30, windowMs: 1000 },
    };
  }

  async initialize(): Promise<void> {
    if (this.running) return;

    this.bot = new Bot(this.config.botToken);

    // Handle runtime errors gracefully (especially 409 Conflict during polling).
    this.bot.catch((err: any) => {
      const msg = err?.message ?? err?.description ?? String(err);
      if (msg.includes('409') || msg.includes('Conflict')) {
        // 409 is transient — Telegram thinks another session exists. grammY auto-reconnects.
        console.warn('[Telegram] 409 Conflict (transient) — bot will auto-reconnect.');
      } else {
        console.error('[Telegram] Bot error:', msg);
      }
    });

    // Wire up inbound message handler
    this.bot.on('message', (ctx) => {
      for (const handler of this.messageHandlers) {
        handler(ctx);
      }
    });

    if (this.config.sendOnly) {
      // Send-only mode: validate token, skip polling/webhook.
      // This avoids 409 Conflict errors when another process is already polling
      // the same bot token (e.g., Rabbithole, another wunderland instance).
      try {
        await this.bot.api.getMe();
      } catch (err: any) {
        throw new Error(`Telegram bot token validation failed: ${err?.message ?? err}`);
      }
      this.running = true;
    } else if (this.config.webhookUrl) {
      await this.bot.api.setWebhook(this.config.webhookUrl);
      this.running = true;
    } else {
      // Delete any stale webhook before starting long-poll.
      // Prevents "409 Conflict: terminated by other getUpdates request" when
      // a previous process didn't shut down cleanly or a webhook was set.
      try {
        await this.bot.api.deleteWebhook({ drop_pending_updates: true });
      } catch { /* ignore — may fail if no webhook was set */ }

      // Start polling with a readiness promise so callers know when the bot is live.
      const startPolling = () => new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Telegram bot polling start timeout after 15s'));
        }, 15_000);
        this.bot!.start({
          drop_pending_updates: true,
          onStart: () => {
            clearTimeout(timeout);
            this.running = true;
            resolve();
          },
        });
      });

      try {
        await startPolling();
      } catch (err: any) {
        // Retry once on 409 — the previous session may still be closing.
        if (err?.message?.includes('409') || err?.message?.includes('Conflict')) {
          await new Promise((r) => setTimeout(r, 5000));
          try {
            await this.bot!.api.deleteWebhook({ drop_pending_updates: true });
          } catch { /* ignore */ }
          await startPolling();
        } else {
          throw err;
        }
      }
    }

    // NOTE: Do NOT call setMyCommands here — the agent may be using a
    // third-party bot token purely to send messages.  Overwriting the
    // bot's command menu is a destructive side-effect the user didn't ask for.
  }

  async shutdown(): Promise<void> {
    if (!this.running || !this.bot) return;
    await this.bot.stop();
    this.running = false;
    this.bot = null;
  }

  get api(): Api {
    if (!this.bot) throw new Error('TelegramService not initialized');
    return this.bot.api;
  }

  get isRunning(): boolean {
    return this.running;
  }

  onMessage(handler: (ctx: Context) => void): void {
    this.messageHandlers.push(handler);
  }

  offMessage(handler: (ctx: Context) => void): void {
    const idx = this.messageHandlers.indexOf(handler);
    if (idx >= 0) this.messageHandlers.splice(idx, 1);
  }

  async sendMessage(
    chatId: string | number,
    text: string,
    options?: {
      parseMode?: string;
      replyToMessageId?: number;
      replyMarkup?: unknown;
      disableNotification?: boolean;
      messageThreadId?: number;
    },
  ): Promise<{ message_id: number; chat: { id: number }; date: number; text?: string }> {
    await this.checkRateLimit(String(chatId));
    const messageThreadId = normalizeTelegramThreadId(options?.messageThreadId);
    return this.api.sendMessage(chatId, text, {
      parse_mode: (options?.parseMode ?? this.config.defaultParseMode) as any,
      reply_to_message_id: options?.replyToMessageId,
      reply_markup: options?.replyMarkup as any,
      disable_notification: options?.disableNotification,
      ...(messageThreadId ? { message_thread_id: messageThreadId } : {}),
    }) as any;
  }

  async sendPhoto(
    chatId: string | number,
    photo: string,
    options?: { caption?: string; parseMode?: string; messageThreadId?: number },
  ): Promise<{ message_id: number }> {
    await this.checkRateLimit(String(chatId));
    const messageThreadId = normalizeTelegramThreadId(options?.messageThreadId);
    return this.api.sendPhoto(chatId, photo, {
      caption: options?.caption,
      parse_mode: (options?.parseMode ?? this.config.defaultParseMode) as any,
      ...(messageThreadId ? { message_thread_id: messageThreadId } : {}),
    }) as any;
  }

  async sendDocument(
    chatId: string | number,
    document: string,
    options?: { caption?: string; filename?: string; messageThreadId?: number },
  ): Promise<{ message_id: number }> {
    await this.checkRateLimit(String(chatId));
    const messageThreadId = normalizeTelegramThreadId(options?.messageThreadId);
    return this.api.sendDocument(chatId, document, {
      caption: options?.caption,
      ...(messageThreadId ? { message_thread_id: messageThreadId } : {}),
    }) as any;
  }

  async sendChatAction(chatId: string | number, action: string, messageThreadId?: number): Promise<void> {
    const threadId = normalizeTelegramThreadId(messageThreadId, { allowGeneralTopic: true });
    if (threadId) {
      await this.api.sendChatAction(chatId, action as any, { message_thread_id: threadId } as any);
      return;
    }
    await this.api.sendChatAction(chatId, action as any);
  }

  async getBotInfo(): Promise<{ id: number; first_name: string; username?: string }> {
    const me = await this.api.getMe();
    return { id: me.id, first_name: me.first_name, username: me.username };
  }

  private async checkRateLimit(key: string): Promise<void> {
    const now = Date.now();
    const state = this.rateMap.get(key);
    if (!state || now >= state.resetAt) {
      this.rateMap.set(key, { count: 1, resetAt: now + this.config.rateLimit.windowMs });
      return;
    }
    if (state.count >= this.config.rateLimit.maxRequests) {
      const waitMs = state.resetAt - now;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      this.rateMap.set(key, { count: 1, resetAt: Date.now() + this.config.rateLimit.windowMs });
      return;
    }
    state.count++;
  }
}
