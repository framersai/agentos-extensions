/**
 * @fileoverview Feishu / Lark Channel Extension for AgentOS (scaffold).
 *
 * Placeholder adapter surface for Feishu. Full implementation will be
 * added in a follow-up.
 *
 * @module @framers/agentos-ext-channel-feishu
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

export interface FeishuChannelOptions {
  appId?: string;
  appSecret?: string;
  priority?: number;
}

function resolveRequiredSecret(
  secretId: 'feishu.appId' | 'feishu.appSecret',
  envVar: 'FEISHU_APP_ID' | 'FEISHU_APP_SECRET',
  options: FeishuChannelOptions,
  secrets?: Record<string, string>,
): string {
  const fromOptions = secretId === 'feishu.appId' ? options.appId : options.appSecret;
  if (fromOptions) return fromOptions;

  if (secrets?.[secretId]) return secrets[secretId]!;
  const fromEnv = process.env[envVar];
  if (fromEnv) return fromEnv;

  throw new Error(`Missing ${secretId}. Provide via options, secrets["${secretId}"], or ${envVar}.`);
}

class FeishuService {
  private running = false;
  constructor(
    public readonly appId: string,
    public readonly appSecret: string,
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
    if (!this.running) throw new Error('FeishuService not initialized');
    return { messageId: `stub-feishu-${Date.now()}` };
  }
}

class FeishuChannelAdapter implements IChannelAdapter {
  readonly platform = 'feishu' as const;
  readonly displayName = 'Feishu / Lark';
  readonly capabilities: readonly ChannelCapability[] = [
    'text',
    'rich_text',
    'buttons',
    'threads',
    'group_chat',
  ] as const;

  private handlers = new Map<ChannelEventHandler, ChannelEventType[] | undefined>();

  constructor(private readonly service: FeishuService) {}

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

class FeishuSendMessageTool implements ITool {
  public readonly id = 'feishuChannelSendMessage';
  public readonly name = 'feishuChannelSendMessage';
  public readonly displayName = 'Send Feishu Message';
  public readonly description = 'Send a text message via the Feishu/Lark channel adapter (scaffold).';
  public readonly category = 'communication';
  public readonly version = '0.1.0';
  public readonly hasSideEffects = true;

  public readonly inputSchema = {
    type: 'object' as const,
    required: ['conversationId', 'text'] as const,
    properties: {
      conversationId: { type: 'string', description: 'Target chat/room identifier' },
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

  constructor(private readonly service: FeishuService) {}

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
  const options = (context.options ?? {}) as FeishuChannelOptions & { secrets?: Record<string, string> };
  const appId = resolveRequiredSecret('feishu.appId', 'FEISHU_APP_ID', options, options.secrets);
  const appSecret = resolveRequiredSecret('feishu.appSecret', 'FEISHU_APP_SECRET', options, options.secrets);

  const service = new FeishuService(appId, appSecret);
  const adapter = new FeishuChannelAdapter(service);
  const sendMessageTool = new FeishuSendMessageTool(service);
  const priority = options.priority ?? 50;

  return {
    name: '@framers/agentos-ext-channel-feishu',
    version: '0.1.0',
    descriptors: [
      { id: 'feishuChannelSendMessage', kind: 'tool', priority, payload: sendMessageTool },
      { id: 'feishuChannel', kind: 'messaging-channel', priority, payload: adapter },
    ],
    onActivate: async () => {
      await service.initialize();
      await adapter.initialize({ platform: 'feishu', credential: appId, params: { appSecret } });
      context.logger?.info('[FeishuChannel] Extension activated (scaffold)');
    },
    onDeactivate: async () => {
      await adapter.shutdown();
      await service.shutdown();
      context.logger?.info('[FeishuChannel] Extension deactivated');
    },
  };
}

export default createExtensionPack;

