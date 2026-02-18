/**
 * @fileoverview Mattermost Channel Extension for AgentOS (scaffold).
 *
 * Placeholder adapter surface for Mattermost. Full implementation will be
 * added in a follow-up.
 *
 * @module @framers/agentos-ext-channel-mattermost
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

export interface MattermostChannelOptions {
  url?: string;
  token?: string;
  priority?: number;
}

function resolveRequiredSecret(
  secretId: 'mattermost.url' | 'mattermost.token',
  envVar: 'MATTERMOST_URL' | 'MATTERMOST_TOKEN',
  options: MattermostChannelOptions,
  secrets?: Record<string, string>,
): string {
  const fromOptions = secretId === 'mattermost.url' ? options.url : options.token;
  if (fromOptions) return fromOptions;

  if (secrets?.[secretId]) return secrets[secretId]!;
  const fromEnv = process.env[envVar];
  if (fromEnv) return fromEnv;

  throw new Error(`Missing ${secretId}. Provide via options, secrets["${secretId}"], or ${envVar}.`);
}

class MattermostService {
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
    if (!this.running) throw new Error('MattermostService not initialized');
    return { messageId: `stub-mattermost-${Date.now()}` };
  }
}

class MattermostChannelAdapter implements IChannelAdapter {
  readonly platform = 'mattermost' as const;
  readonly displayName = 'Mattermost';
  readonly capabilities: readonly ChannelCapability[] = ['text', 'rich_text', 'threads', 'reactions', 'group_chat'] as const;

  private handlers = new Map<ChannelEventHandler, ChannelEventType[] | undefined>();

  constructor(private readonly service: MattermostService) {}

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

class MattermostSendMessageTool implements ITool {
  public readonly id = 'mattermostChannelSendMessage';
  public readonly name = 'mattermostChannelSendMessage';
  public readonly displayName = 'Send Mattermost Message';
  public readonly description = 'Send a text message via the Mattermost channel adapter (scaffold).';
  public readonly category = 'communication';
  public readonly version = '0.1.0';
  public readonly hasSideEffects = true;

  public readonly inputSchema = {
    type: 'object' as const,
    required: ['conversationId', 'text'] as const,
    properties: {
      conversationId: { type: 'string', description: 'Target channelId or direct message channelId' },
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

  constructor(private readonly service: MattermostService) {}

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
  const options = (context.options ?? {}) as MattermostChannelOptions & { secrets?: Record<string, string> };
  const url = resolveRequiredSecret('mattermost.url', 'MATTERMOST_URL', options, options.secrets);
  const token = resolveRequiredSecret('mattermost.token', 'MATTERMOST_TOKEN', options, options.secrets);

  const service = new MattermostService(url, token);
  const adapter = new MattermostChannelAdapter(service);
  const sendMessageTool = new MattermostSendMessageTool(service);
  const priority = options.priority ?? 50;

  return {
    name: '@framers/agentos-ext-channel-mattermost',
    version: '0.1.0',
    descriptors: [
      { id: 'mattermostChannelSendMessage', kind: 'tool', priority, payload: sendMessageTool },
      { id: 'mattermostChannel', kind: 'messaging-channel', priority, payload: adapter },
    ],
    onActivate: async () => {
      await service.initialize();
      await adapter.initialize({ platform: 'mattermost', credential: token, params: { url } });
      context.logger?.info('[MattermostChannel] Extension activated (scaffold)');
    },
    onDeactivate: async () => {
      await adapter.shutdown();
      await service.shutdown();
      context.logger?.info('[MattermostChannel] Extension deactivated');
    },
  };
}

export default createExtensionPack;

