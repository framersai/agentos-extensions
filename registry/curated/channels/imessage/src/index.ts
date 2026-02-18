/**
 * @fileoverview iMessage Channel Extension for AgentOS (scaffold).
 *
 * Provides a placeholder adapter surface for a BlueBubbles-based iMessage bridge.
 * Full implementation will be added in a follow-up.
 *
 * @module @framers/agentos-ext-channel-imessage
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

export interface IMessageChannelOptions {
  serverUrl?: string;
  password?: string;
  priority?: number;
}

function resolveServerUrl(options: IMessageChannelOptions, secrets?: Record<string, string>): string {
  if (options.serverUrl) return options.serverUrl;
  if (secrets?.['imessage.serverUrl']) return secrets['imessage.serverUrl'];

  // Support both secretIdToEnvVar(IMESSAGE_SERVER_URL) and the legacy docs env name.
  if (process.env['IMESSAGE_SERVER_URL']) return process.env['IMESSAGE_SERVER_URL']!;
  if (process.env['BLUEBUBBLES_SERVER_URL']) return process.env['BLUEBUBBLES_SERVER_URL']!;

  throw new Error(
    'iMessage server URL not found. Provide via options.serverUrl, secrets["imessage.serverUrl"], IMESSAGE_SERVER_URL, or BLUEBUBBLES_SERVER_URL.',
  );
}

function resolvePassword(options: IMessageChannelOptions, secrets?: Record<string, string>): string {
  if (options.password) return options.password;
  if (secrets?.['imessage.password']) return secrets['imessage.password'];

  if (process.env['IMESSAGE_PASSWORD']) return process.env['IMESSAGE_PASSWORD']!;
  if (process.env['BLUEBUBBLES_PASSWORD']) return process.env['BLUEBUBBLES_PASSWORD']!;

  throw new Error(
    'iMessage password not found. Provide via options.password, secrets["imessage.password"], IMESSAGE_PASSWORD, or BLUEBUBBLES_PASSWORD.',
  );
}

class IMessageService {
  private running = false;

  constructor(
    public readonly serverUrl: string,
    public readonly password: string,
  ) {}

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
    if (!this.running) throw new Error('IMessageService not initialized');
    // Scaffold: no-op send (implementation pending)
    return { messageId: `stub-imessage-${Date.now()}` };
  }
}

class IMessageChannelAdapter implements IChannelAdapter {
  readonly platform = 'imessage' as const;
  readonly displayName = 'iMessage';
  readonly capabilities: readonly ChannelCapability[] = ['text', 'rich_text', 'typing_indicator', 'group_chat'] as const;

  private handlers = new Map<ChannelEventHandler, ChannelEventType[] | undefined>();

  constructor(private readonly service: IMessageService) {}

  async initialize(_auth: ChannelAuthConfig): Promise<void> {
    // Inbound wiring planned
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

class IMessageSendMessageTool implements ITool {
  public readonly id = 'imessageChannelSendMessage';
  public readonly name = 'imessageChannelSendMessage';
  public readonly displayName = 'Send iMessage';
  public readonly description = 'Send a text message via the iMessage channel adapter (scaffold).';
  public readonly category = 'communication';
  public readonly version = '0.1.0';
  public readonly hasSideEffects = true;

  public readonly inputSchema = {
    type: 'object' as const,
    required: ['conversationId', 'text'] as const,
    properties: {
      conversationId: { type: 'string', description: 'Target chat/conversation ID' },
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

  constructor(private readonly service: IMessageService) {}

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
  const options = (context.options ?? {}) as IMessageChannelOptions & { secrets?: Record<string, string> };
  const serverUrl = resolveServerUrl(options, options.secrets);
  const password = resolvePassword(options, options.secrets);

  const service = new IMessageService(serverUrl, password);
  const adapter = new IMessageChannelAdapter(service);
  const sendMessageTool = new IMessageSendMessageTool(service);

  const priority = options.priority ?? 50;

  return {
    name: '@framers/agentos-ext-channel-imessage',
    version: '0.1.0',
    descriptors: [
      { id: 'imessageChannelSendMessage', kind: 'tool', priority, payload: sendMessageTool },
      { id: 'imessageChannel', kind: 'messaging-channel', priority, payload: adapter },
    ],
    onActivate: async () => {
      await service.initialize();
      await adapter.initialize({ platform: 'imessage', credential: password });
      context.logger?.info('[iMessageChannel] Extension activated (scaffold)');
    },
    onDeactivate: async () => {
      await adapter.shutdown();
      await service.shutdown();
      context.logger?.info('[iMessageChannel] Extension deactivated');
    },
  };
}

export default createExtensionPack;

