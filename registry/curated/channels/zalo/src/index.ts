/**
 * @fileoverview Zalo Channel Extension for AgentOS (scaffold).
 *
 * @module @framers/agentos-ext-channel-zalo
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

export interface ZaloChannelOptions {
  appId?: string;
  secretKey?: string;
  priority?: number;
}

function resolveAppId(options: ZaloChannelOptions, secrets?: Record<string, string>): string {
  if (options.appId) return options.appId;
  if (secrets?.['zalo.appId']) return secrets['zalo.appId'];
  if (process.env['ZALO_APP_ID']) return process.env['ZALO_APP_ID']!;
  throw new Error('Zalo App ID not found. Provide via options.appId, secrets["zalo.appId"], or ZALO_APP_ID.');
}

function resolveSecretKey(options: ZaloChannelOptions, secrets?: Record<string, string>): string {
  if (options.secretKey) return options.secretKey;
  if (secrets?.['zalo.secretKey']) return secrets['zalo.secretKey'];
  if (process.env['ZALO_SECRET_KEY']) return process.env['ZALO_SECRET_KEY']!;
  throw new Error(
    'Zalo secret key not found. Provide via options.secretKey, secrets["zalo.secretKey"], or ZALO_SECRET_KEY.',
  );
}

class ZaloService {
  private running = false;
  constructor(public readonly appId: string, public readonly secretKey: string) {}

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
    if (!this.running) throw new Error('ZaloService not initialized');
    return { messageId: `stub-zalo-${Date.now()}` };
  }
}

class ZaloChannelAdapter implements IChannelAdapter {
  readonly platform = 'zalo' as const;
  readonly displayName = 'Zalo';
  readonly capabilities: readonly ChannelCapability[] = ['text', 'rich_text', 'group_chat'] as const;

  private handlers = new Map<ChannelEventHandler, ChannelEventType[] | undefined>();
  constructor(private readonly service: ZaloService) {}

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
    // no-op scaffold
  }

  on(handler: ChannelEventHandler, eventTypes?: ChannelEventType[]): () => void {
    this.handlers.set(handler, eventTypes);
    return () => this.handlers.delete(handler);
  }
}

class ZaloSendMessageTool implements ITool {
  public readonly id = 'zaloChannelSendMessage';
  public readonly name = 'zaloChannelSendMessage';
  public readonly displayName = 'Send Zalo Message';
  public readonly description = 'Send a text message via the Zalo channel adapter (scaffold).';
  public readonly category = 'communication';
  public readonly version = '0.1.0';
  public readonly hasSideEffects = true;

  public readonly inputSchema = {
    type: 'object' as const,
    required: ['conversationId', 'text'] as const,
    properties: {
      conversationId: { type: 'string', description: 'Target Zalo user/thread ID' },
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

  constructor(private readonly service: ZaloService) {}

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
  const options = (context.options ?? {}) as ZaloChannelOptions & { secrets?: Record<string, string> };
  const appId = resolveAppId(options, options.secrets);
  const secretKey = resolveSecretKey(options, options.secrets);

  const service = new ZaloService(appId, secretKey);
  const adapter = new ZaloChannelAdapter(service);
  const sendMessageTool = new ZaloSendMessageTool(service);
  const priority = options.priority ?? 50;

  return {
    name: '@framers/agentos-ext-channel-zalo',
    version: '0.1.0',
    descriptors: [
      { id: 'zaloChannelSendMessage', kind: 'tool', priority, payload: sendMessageTool },
      { id: 'zaloChannel', kind: 'messaging-channel', priority, payload: adapter },
    ],
    onActivate: async () => {
      await service.initialize();
      await adapter.initialize({ platform: 'zalo', credential: secretKey });
      context.logger?.info('[ZaloChannel] Extension activated (scaffold)');
    },
    onDeactivate: async () => {
      await adapter.shutdown();
      await service.shutdown();
      context.logger?.info('[ZaloChannel] Extension deactivated');
    },
  };
}

export default createExtensionPack;

