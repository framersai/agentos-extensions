/**
 * @fileoverview Google Chat Channel Extension for AgentOS (scaffold).
 *
 * Provides a placeholder adapter surface for Google Chat. Full implementation
 * will be added in a follow-up.
 *
 * @module @framers/agentos-ext-channel-google-chat
 */

import type {
  ChannelAuthConfig,
  ChannelCapability,
  ChannelConnectionInfo,
  ChannelEventHandler,
  ChannelEventType,
  ChannelSendResult,
  ExtensionContext,
  ExtensionPack,
  IChannelAdapter,
  ITool,
  MessageContent,
  ToolExecutionContext,
  ToolExecutionResult,
} from '@framers/agentos';

export interface GoogleChatChannelOptions {
  serviceAccountJson?: string;
  priority?: number;
}

function resolveServiceAccount(options: GoogleChatChannelOptions, secrets?: Record<string, string>): string {
  if (options.serviceAccountJson) return options.serviceAccountJson;
  if (secrets?.['googlechat.serviceAccount']) return secrets['googlechat.serviceAccount'];

  // Support both secretIdToEnvVar(GOOGLECHAT_SERVICE_ACCOUNT) and docs env name.
  if (process.env['GOOGLECHAT_SERVICE_ACCOUNT']) return process.env['GOOGLECHAT_SERVICE_ACCOUNT']!;
  if (process.env['GOOGLE_CHAT_SERVICE_ACCOUNT']) return process.env['GOOGLE_CHAT_SERVICE_ACCOUNT']!;

  throw new Error(
    'Google Chat service account JSON not found. Provide via options.serviceAccountJson, secrets["googlechat.serviceAccount"], GOOGLECHAT_SERVICE_ACCOUNT, or GOOGLE_CHAT_SERVICE_ACCOUNT.',
  );
}

class GoogleChatService {
  private running = false;
  constructor(public readonly serviceAccountJson: string) {}

  async initialize(): Promise<void> {
    this.running = true;
  }

  async shutdown(): Promise<void> {
    this.running = false;
  }

  get isRunning(): boolean {
    return this.running;
  }

  async sendText(_conversationId: string, _text: string): Promise<{ messageId: string }> {
    if (!this.running) throw new Error('GoogleChatService not initialized');
    // Scaffold: no-op send (implementation pending)
    return { messageId: `stub-google-chat-${Date.now()}` };
  }
}

class GoogleChatChannelAdapter implements IChannelAdapter {
  readonly platform = 'google-chat' as const;
  readonly displayName = 'Google Chat';
  readonly capabilities: readonly ChannelCapability[] = ['text', 'rich_text', 'threads', 'group_chat'] as const;

  private handlers = new Map<ChannelEventHandler, ChannelEventType[] | undefined>();

  constructor(private readonly service: GoogleChatService) {}

  async initialize(_auth: ChannelAuthConfig): Promise<void> {
    if (!this.service.isRunning) await this.service.initialize();
  }

  async shutdown(): Promise<void> {
    this.handlers.clear();
  }

  getConnectionInfo(): ChannelConnectionInfo {
    return { status: this.service.isRunning ? 'connected' : 'disconnected' };
  }

  async sendMessage(conversationId: string, content: MessageContent): Promise<ChannelSendResult> {
    const textBlock = content.blocks.find((b) => b.type === 'text');
    const text = textBlock && textBlock.type === 'text' ? textBlock.text : '';
    const result = await this.service.sendText(conversationId, text);
    return { messageId: result.messageId, timestamp: new Date().toISOString() };
  }

  async sendTypingIndicator(_conversationId: string, _isTyping: boolean): Promise<void> {
    // Scaffold: no-op
  }

  on(handler: ChannelEventHandler, eventTypes?: ChannelEventType[]): () => void {
    this.handlers.set(handler, eventTypes);
    return () => this.handlers.delete(handler);
  }
}

class GoogleChatSendMessageTool implements ITool {
  public readonly id = 'googleChatChannelSendMessage';
  public readonly name = 'googleChatChannelSendMessage';
  public readonly displayName = 'Send Google Chat Message';
  public readonly description = 'Send a text message via the Google Chat channel adapter (scaffold).';
  public readonly category = 'communication';
  public readonly version = '0.1.0';
  public readonly hasSideEffects = true;

  public readonly inputSchema = {
    type: 'object' as const,
    required: ['conversationId', 'text'] as const,
    properties: {
      conversationId: { type: 'string', description: 'Target space or thread identifier' },
      text: { type: 'string', description: 'Message text' },
    },
  };

  public readonly outputSchema = {
    type: 'object' as const,
    properties: {
      messageId: { type: 'string', description: 'Sent message ID' },
      conversationId: { type: 'string', description: 'Target conversation ID' },
    },
  };

  constructor(private readonly service: GoogleChatService) {}

  async execute(
    args: { conversationId: string; text: string },
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    try {
      const result = await this.service.sendText(args.conversationId, args.text);
      return { success: true, output: { messageId: result.messageId, conversationId: args.conversationId } };
    } catch (error: any) {
      return { success: false, error: error?.message || String(error) };
    }
  }

  validateArgs(args: Record<string, any>): { isValid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!args.conversationId) errors.push('conversationId is required');
    if (!args.text) errors.push('text is required');
    return { isValid: errors.length === 0, errors };
  }
}

export function createExtensionPack(context: ExtensionContext): ExtensionPack {
  const options = (context.options ?? {}) as GoogleChatChannelOptions & { secrets?: Record<string, string> };
  const serviceAccountJson = resolveServiceAccount(options, options.secrets);

  const service = new GoogleChatService(serviceAccountJson);
  const adapter = new GoogleChatChannelAdapter(service);
  const sendMessageTool = new GoogleChatSendMessageTool(service);
  const priority = options.priority ?? 50;

  return {
    name: '@framers/agentos-ext-channel-google-chat',
    version: '0.1.0',
    descriptors: [
      { id: 'googleChatChannelSendMessage', kind: 'tool', priority, payload: sendMessageTool },
      { id: 'googleChatChannel', kind: 'messaging-channel', priority, payload: adapter },
    ],
    onActivate: async () => {
      await service.initialize();
      await adapter.initialize({ platform: 'google-chat', credential: serviceAccountJson });
      context.logger?.info('[GoogleChatChannel] Extension activated (scaffold)');
    },
    onDeactivate: async () => {
      await adapter.shutdown();
      await service.shutdown();
      context.logger?.info('[GoogleChatChannel] Extension deactivated');
    },
  };
}

export default createExtensionPack;

