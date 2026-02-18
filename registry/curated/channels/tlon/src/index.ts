/**
 * @fileoverview Tlon (Urbit) Channel Extension for AgentOS (scaffold).
 *
 * Placeholder adapter surface for Tlon/Urbit. Full implementation will be
 * added in a follow-up.
 *
 * @module @framers/agentos-ext-channel-tlon
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

export interface TlonChannelOptions {
  shipUrl?: string;
  code?: string;
  priority?: number;
}

function resolveRequiredSecret(
  secretId: 'tlon.shipUrl' | 'tlon.code',
  envVar: 'TLON_SHIP_URL' | 'TLON_CODE',
  options: TlonChannelOptions,
  secrets?: Record<string, string>,
): string {
  const fromOptions = secretId === 'tlon.shipUrl' ? options.shipUrl : options.code;
  if (fromOptions) return fromOptions;

  if (secrets?.[secretId]) return secrets[secretId]!;
  const fromEnv = process.env[envVar];
  if (fromEnv) return fromEnv;

  throw new Error(`Missing ${secretId}. Provide via options, secrets["${secretId}"], or ${envVar}.`);
}

class TlonService {
  private running = false;
  constructor(
    public readonly shipUrl: string,
    public readonly code: string,
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
    if (!this.running) throw new Error('TlonService not initialized');
    return { messageId: `stub-tlon-${Date.now()}` };
  }
}

class TlonChannelAdapter implements IChannelAdapter {
  readonly platform = 'tlon' as const;
  readonly displayName = 'Tlon (Urbit)';
  readonly capabilities: readonly ChannelCapability[] = ['text', 'rich_text', 'group_chat'] as const;

  private handlers = new Map<ChannelEventHandler, ChannelEventType[] | undefined>();

  constructor(private readonly service: TlonService) {}

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

class TlonSendMessageTool implements ITool {
  public readonly id = 'tlonChannelSendMessage';
  public readonly name = 'tlonChannelSendMessage';
  public readonly displayName = 'Send Tlon (Urbit) Message';
  public readonly description = 'Send a text message via the Tlon/Urbit channel adapter (scaffold).';
  public readonly category = 'communication';
  public readonly version = '0.1.0';
  public readonly hasSideEffects = true;

  public readonly inputSchema = {
    type: 'object' as const,
    required: ['conversationId', 'text'] as const,
    properties: {
      conversationId: { type: 'string', description: 'Target channel/chat identifier (ship-specific)' },
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

  constructor(private readonly service: TlonService) {}

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
  const options = (context.options ?? {}) as TlonChannelOptions & { secrets?: Record<string, string> };
  const shipUrl = resolveRequiredSecret('tlon.shipUrl', 'TLON_SHIP_URL', options, options.secrets);
  const code = resolveRequiredSecret('tlon.code', 'TLON_CODE', options, options.secrets);

  const service = new TlonService(shipUrl, code);
  const adapter = new TlonChannelAdapter(service);
  const sendMessageTool = new TlonSendMessageTool(service);
  const priority = options.priority ?? 50;

  return {
    name: '@framers/agentos-ext-channel-tlon',
    version: '0.1.0',
    descriptors: [
      { id: 'tlonChannelSendMessage', kind: 'tool', priority, payload: sendMessageTool },
      { id: 'tlonChannel', kind: 'messaging-channel', priority, payload: adapter },
    ],
    onActivate: async () => {
      await service.initialize();
      await adapter.initialize({ platform: 'tlon', credential: shipUrl, params: { code } });
      context.logger?.info('[TlonChannel] Extension activated (scaffold)');
    },
    onDeactivate: async () => {
      await adapter.shutdown();
      await service.shutdown();
      context.logger?.info('[TlonChannel] Extension deactivated');
    },
  };
}

export default createExtensionPack;

