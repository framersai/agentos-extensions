/**
 * Telegram Bot Service
 * Manages the Telegram bot connection and provides API methods
 */

import TelegramBot from 'node-telegram-bot-api';

/**
 * Configuration for the Telegram bot service
 */
export interface TelegramConfig {
  botToken: string;
  webhookUrl?: string;
  pollingInterval?: number;
  defaultParseMode: 'Markdown' | 'HTML';
  enableTypingAction: boolean;
  rateLimit: {
    maxRequests: number;
    windowMs: number;
  };
  /** Send-only mode — skip token validation on init. Avoids ETIMEDOUT hangs. */
  sendOnly?: boolean;
}

/**
 * Message sending options
 */
export interface SendMessageOptions {
  chatId: string | number;
  text: string;
  parseMode?: 'Markdown' | 'HTML';
  replyToMessageId?: number;
  disableNotification?: boolean;
  replyMarkup?: any;
}

/**
 * Service for interacting with Telegram Bot API
 * 
 * @class TelegramBotService
 */
export class TelegramBotService {
  private bot: TelegramBot | null = null;
  private config: TelegramConfig;
  private rateLimitState: Map<string, { count: number; resetTime: number }>;
  private messageQueue: Array<() => Promise<any>> = [];
  private isProcessingQueue = false;
  
  /**
   * Creates an instance of TelegramBotService
   * @param {TelegramConfig} config - Service configuration
   */
  constructor(config: TelegramConfig) {
    this.config = config;
    this.rateLimitState = new Map();
  }
  
  /**
   * Initializes the bot connection.
   *
   * By default the bot is created in **send-only** mode (no polling, no
   * webhook).  This avoids taking over another process that may already be
   * polling the same bot token — which would cause Telegram to kick the
   * existing poller and potentially trigger unwanted side-effects such as
   * the other process re-registering its own command menu.
   *
   * Polling / webhooks are only started when explicitly configured.
   */
  async initialize(): Promise<void> {
    if (this.bot) {
      return; // Already initialized
    }

    // Send-only mode: no polling, no webhook unless explicitly configured.
    // This avoids 409 Conflict errors when another process (Rabbithole,
    // another wunderland instance) is already polling the same bot token.
    const options: TelegramBot.ConstructorOptions = {
      polling: false,
      webHook: false,
    };

    this.bot = new TelegramBot(this.config.botToken, options);

    // Only register error handlers — no polling_error handler since polling
    // is always disabled.  The polling_error event should never fire, but
    // node-telegram-bot-api has edge cases where it does; registering a
    // handler for it previously produced confusing "409 Conflict" logs.
    this.bot.on('error', (error: any) => {
      console.error('[Telegram] Bot error:', error?.message ?? error);
    });

    if (this.config.sendOnly) {
      // In send-only mode skip token validation entirely — the first
      // actual API call (sendMessage etc.) will fail clearly if the
      // token is bad.  This avoids ETIMEDOUT hangs during CLI startup.
      return;
    }

    // Validate token with getMe() — catches bad tokens early.
    // Use a timeout to avoid hanging on ETIMEDOUT.
    try {
      const me = await Promise.race([
        this.bot.getMe(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('getMe() timed out after 10s')), 10_000),
        ),
      ]);
      console.log(`[Telegram] Bot authenticated as @${me.username} (${me.first_name})`);
    } catch (err: any) {
      const statusCode = err?.response?.statusCode ?? err?.response?.status;
      const msg = statusCode === 404
        ? 'Bot token not found (404). The token may be revoked or invalid.'
        : statusCode === 401
          ? 'Unauthorized (401). The bot token is incorrect.'
          : `Failed to authenticate: ${err?.message ?? err}`;
      // Clean up the bot instance on failure
      try { this.bot.removeAllListeners(); } catch { /* ignore */ }
      this.bot = null;
      throw new Error(`[Telegram] ${msg} Check your TELEGRAM_BOT_TOKEN.`);
    }

    if (this.config.webhookUrl) {
      await this.bot.setWebHook(this.config.webhookUrl);
    }
  }
  
  /**
   * Checks and enforces rate limiting
   * 
   * @private
   * @param {string} key - Rate limit key (usually chatId)
   * @returns {Promise<boolean>} True if within limits
   */
  private async checkRateLimit(key: string = 'global'): Promise<boolean> {
    const now = Date.now();
    const state = this.rateLimitState.get(key);
    
    if (!state || now > state.resetTime) {
      this.rateLimitState.set(key, {
        count: 1,
        resetTime: now + this.config.rateLimit.windowMs
      });
      return true;
    }
    
    if (state.count >= this.config.rateLimit.maxRequests) {
      // Wait until reset time
      const waitTime = state.resetTime - now;
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return this.checkRateLimit(key);
      }
    }
    
    state.count++;
    return true;
  }
  
  /**
   * Queues an API call with rate limiting
   * 
   * @private
   * @param {Function} fn - Function to execute
   * @returns {Promise<T>} Result of the function
   */
  private async queueApiCall<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.messageQueue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      
      this.processQueue();
    });
  }
  
  /**
   * Processes the message queue
   * 
   * @private
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.messageQueue.length === 0) {
      return;
    }
    
    this.isProcessingQueue = true;
    
    while (this.messageQueue.length > 0) {
      await this.checkRateLimit();
      const task = this.messageQueue.shift();
      if (task) {
        await task();
      }
    }
    
    this.isProcessingQueue = false;
  }
  
  /**
   * Sends a text message
   * 
   * @param {SendMessageOptions} options - Message options
   * @returns {Promise<TelegramBot.Message>} Sent message
   */
  async sendMessage(options: SendMessageOptions): Promise<TelegramBot.Message> {
    if (!this.bot) {
      throw new Error('Bot not initialized. Call initialize() first.');
    }
    
    return this.queueApiCall(async () => {
      if (this.config.enableTypingAction) {
        await this.bot!.sendChatAction(options.chatId, 'typing');
      }
      
      return this.bot!.sendMessage(options.chatId, options.text, {
        parse_mode: options.parseMode || this.config.defaultParseMode,
        reply_to_message_id: options.replyToMessageId,
        disable_notification: options.disableNotification,
        reply_markup: options.replyMarkup
      });
    });
  }
  
  /**
   * Sends a photo
   * 
   * @param {string | number} chatId - Chat ID
   * @param {string | Buffer} photo - Photo URL or buffer
   * @param {Object} options - Additional options
   * @returns {Promise<TelegramBot.Message>} Sent message
   */
  async sendPhoto(
    chatId: string | number,
    photo: string | Buffer,
    options: {
      caption?: string;
      parseMode?: 'Markdown' | 'HTML';
      replyToMessageId?: number;
    } = {}
  ): Promise<TelegramBot.Message> {
    if (!this.bot) {
      throw new Error('Bot not initialized. Call initialize() first.');
    }
    
    return this.queueApiCall(async () => {
      if (this.config.enableTypingAction) {
        await this.bot!.sendChatAction(chatId, 'upload_photo');
      }
      
      return this.bot!.sendPhoto(chatId, photo, {
        caption: options.caption,
        parse_mode: options.parseMode || this.config.defaultParseMode,
        reply_to_message_id: options.replyToMessageId
      });
    });
  }
  
  /**
   * Sends a document
   * 
   * @param {string | number} chatId - Chat ID
   * @param {string | Buffer} document - Document URL or buffer
   * @param {Object} options - Additional options
   * @returns {Promise<TelegramBot.Message>} Sent message
   */
  async sendDocument(
    chatId: string | number,
    document: string | Buffer,
    options: {
      caption?: string;
      parseMode?: 'Markdown' | 'HTML';
      replyToMessageId?: number;
      filename?: string;
    } = {}
  ): Promise<TelegramBot.Message> {
    if (!this.bot) {
      throw new Error('Bot not initialized. Call initialize() first.');
    }
    
    return this.queueApiCall(async () => {
      if (this.config.enableTypingAction) {
        await this.bot!.sendChatAction(chatId, 'upload_document');
      }
      
      const sendOptions: any = {
        caption: options.caption,
        parse_mode: options.parseMode || this.config.defaultParseMode,
        reply_to_message_id: options.replyToMessageId
      };
      
      if (options.filename && Buffer.isBuffer(document)) {
        return this.bot!.sendDocument(chatId, document, sendOptions, {
          filename: options.filename,
          contentType: 'application/octet-stream'
        });
      }
      
      return this.bot!.sendDocument(chatId, document, sendOptions);
    });
  }
  
  /**
   * Gets chat information
   * 
   * @param {string | number} chatId - Chat ID
   * @returns {Promise<TelegramBot.Chat>} Chat information
   */
  async getChatInfo(chatId: string | number): Promise<TelegramBot.Chat> {
    if (!this.bot) {
      throw new Error('Bot not initialized. Call initialize() first.');
    }
    
    return this.bot.getChat(chatId);
  }
  
  /**
   * Gets chat member count
   * 
   * @param {string | number} chatId - Chat ID
   * @returns {Promise<number>} Member count
   */
  async getChatMemberCount(chatId: string | number): Promise<number> {
    if (!this.bot) {
      throw new Error('Bot not initialized. Call initialize() first.');
    }
    
    return this.bot.getChatMemberCount(chatId);
  }
  
  /**
   * Pins a message in a chat
   * 
   * @param {string | number} chatId - Chat ID
   * @param {number} messageId - Message ID to pin
   * @param {boolean} disableNotification - Disable notification
   * @returns {Promise<boolean>} Success status
   */
  async pinMessage(
    chatId: string | number,
    messageId: number,
    disableNotification = false
  ): Promise<boolean> {
    if (!this.bot) {
      throw new Error('Bot not initialized. Call initialize() first.');
    }
    
    return this.bot.pinChatMessage(chatId, messageId, { disable_notification: disableNotification });
  }
  
  /**
   * Answers a callback query
   * 
   * @param {string} callbackQueryId - Callback query ID
   * @param {Object} options - Answer options
   * @returns {Promise<boolean>} Success status
   */
  async answerCallbackQuery(
    callbackQueryId: string,
    options: {
      text?: string;
      showAlert?: boolean;
      url?: string;
      cacheTime?: number;
    } = {}
  ): Promise<boolean> {
    if (!this.bot) {
      throw new Error('Bot not initialized. Call initialize() first.');
    }
    
    return this.bot.answerCallbackQuery(callbackQueryId, options);
  }
  
  /**
   * Registers a message handler
   * 
   * @param {RegExp | string} pattern - Message pattern to match
   * @param {Function} handler - Handler function
   */
  onMessage(pattern: RegExp | string, handler: (msg: TelegramBot.Message) => void): void {
    if (!this.bot) {
      throw new Error('Bot not initialized. Call initialize() first.');
    }
    
    this.bot.onText(pattern instanceof RegExp ? pattern : new RegExp(pattern), handler);
  }
  
  /**
   * Registers a callback query handler
   * 
   * @param {Function} handler - Handler function
   */
  onCallbackQuery(handler: (query: TelegramBot.CallbackQuery) => void): void {
    if (!this.bot) {
      throw new Error('Bot not initialized. Call initialize() first.');
    }
    
    this.bot.on('callback_query', handler);
  }
  
  /**
   * Gets the bot instance for advanced operations
   * 
   * @returns {TelegramBot | null} The bot instance
   */
  getBotInstance(): TelegramBot | null {
    return this.bot;
  }
  
  /**
   * Shuts down the bot connection
   */
  async shutdown(): Promise<void> {
    if (this.bot) {
      if (this.config.webhookUrl) {
        await this.bot.deleteWebHook();
      }
      // stopPolling is safe to call even if polling was never started
      try { this.bot.stopPolling(); } catch { /* ignore */ }
      this.bot = null;
    }
  }
}
