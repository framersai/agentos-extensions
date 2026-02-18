/**
 * @fileoverview NextCloud Talk Channel Extension for AgentOS (scaffold).
 *
 * Placeholder adapter surface for NextCloud Talk. Full implementation will be
 * added in a follow-up.
 *
 * @module @framers/agentos-ext-channel-nextcloud
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

export interface NextcloudTalkChannelOptions {
  url?: string;
  token?: string;
  priority?: number;
}

function resolveRequiredSecret(
  secretId: 'nextcloud.url' | 'nextcloud.token',
  envVar: 'NEXTCLOUD_URL' | 'NEXTCLOUD_TOKEN',
  options: NextcloudTalkChannelOptions,
  secrets?: Record<string, string>,
): string {
  const fromOptions = secretId === 'nextcloud.url' ? options.url : options.token;
  if (fromOptions) return fromOptions;

  if (secrets?.[secretId]) return secrets[secretId]!;
  const fromEnv = process.env[envVar];
  if (fromEnv) return fromEnv;

  throw new Error(`Missing ${secretId}. Provide via options, secrets["${secretId}"], or ${envVar}.`);
}

class NextcloudTalkService {
  private running = false;
  constructor(
    public readonly url: string,
    public readonly token: string,
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
    if (!this.running) throw new Error('NextcloudTalkService not initialized');
    return { messageId: `stub-nextcloud-${Date.now()}` };
  }
}

class NextcloudTalkChannelAdapter implements IChannelAdapter {
  readonly platform = 'nextcloud-talk' as const;
  readonly displayName = 'NextCloud Talk';
  readonly capabilities: readonly ChannelCapability[] = ['text', 'rich_text', 'threads', 'group_chat'] as const;

  private handlers = new Map<ChannelEventHandler, ChannelEventType[] | undefined>();

  constructor(private readonly service: NextcloudTalkService) {}

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

class NextcloudTalkSendMessageTool implements ITool {
  public readonly id = 'nextcloudChannelSendMessage';
  public readonly name = 'nextcloudChannelSendMessage';
  public readonly displayName = 'Send NextCloud Talk Message';
  public readonly description = 'Send a text message via the NextCloud Talk channel adapter (scaffold).';
  public readonly category = 'communication';
  public readonly version = '0.1.0';
  public readonly hasSideEffects = true;

  public readonly inputSchema = {
    type: 'object' as const,
    required: ['conversationId', 'text'] as const,
    properties: {
      conversationId: { type: 'string', description: 'Target room/conversation ID' },
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

  constructor(private readonly service: NextcloudTalkService) {}

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
  const options = (context.options ?? {}) as NextcloudTalkChannelOptions & { secrets?: Record<string, string> };
  const url = resolveRequiredSecret('nextcloud.url', 'NEXTCLOUD_URL', options, options.secrets);
  const token = resolveRequiredSecret('nextcloud.token', 'NEXTCLOUD_TOKEN', options, options.secrets);

  const service = new NextcloudTalkService(url, token);
  const adapter = new NextcloudTalkChannelAdapter(service);
  const sendMessageTool = new NextcloudTalkSendMessageTool(service);
  const priority = options.priority ?? 50;

  return {
    name: '@framers/agentos-ext-channel-nextcloud',
    version: '0.1.0',
    descriptors: [
      { id: 'nextcloudChannelSendMessage', kind: 'tool', priority, payload: sendMessageTool },
      { id: 'nextcloudChannel', kind: 'messaging-channel', priority, payload: adapter },
    ],
    onActivate: async () => {
      await service.initialize();
      await adapter.initialize({ platform: 'nextcloud-talk', credential: token, params: { url } });
      context.logger?.info('[NextcloudTalkChannel] Extension activated (scaffold)');
    },
    onDeactivate: async () => {
      await adapter.shutdown();
      await service.shutdown();
      context.logger?.info('[NextcloudTalkChannel] Extension deactivated');
    },
  };
}

export default createExtensionPack;

