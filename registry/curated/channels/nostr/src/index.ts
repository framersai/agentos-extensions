/**
 * @fileoverview Nostr Channel Extension for AgentOS (scaffold).
 *
 * @module @framers/agentos-ext-channel-nostr
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

export interface NostrChannelOptions {
  privateKey?: string;
  priority?: number;
}

function resolvePrivateKey(options: NostrChannelOptions, secrets?: Record<string, string>): string {
  if (options.privateKey) return options.privateKey;
  if (secrets?.['nostr.privateKey']) return secrets['nostr.privateKey'];
  if (process.env['NOSTR_PRIVATE_KEY']) return process.env['NOSTR_PRIVATE_KEY']!;
  throw new Error(
    'Nostr private key not found. Provide via options.privateKey, secrets["nostr.privateKey"], or NOSTR_PRIVATE_KEY.',
  );
}

class NostrService {
  private running = false;
  constructor(public readonly privateKey: string) {}

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
    if (!this.running) throw new Error('NostrService not initialized');
    // Scaffold: no-op send (implementation pending)
    return { messageId: `stub-nostr-${Date.now()}` };
  }
}

class NostrChannelAdapter implements IChannelAdapter {
  readonly platform = 'nostr' as const;
  readonly displayName = 'Nostr';
  readonly capabilities: readonly ChannelCapability[] = ['text', 'rich_text'] as const;

  private handlers = new Map<ChannelEventHandler, ChannelEventType[] | undefined>();
  constructor(private readonly service: NostrService) {}

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

class NostrSendMessageTool implements ITool {
  public readonly id = 'nostrChannelSendMessage';
  public readonly name = 'nostrChannelSendMessage';
  public readonly displayName = 'Send Nostr Message';
  public readonly description = 'Send a text message via the Nostr channel adapter (scaffold). conversationId should be a pubkey or DM target.';
  public readonly category = 'communication';
  public readonly version = '0.1.0';
  public readonly hasSideEffects = true;

  public readonly inputSchema = {
    type: 'object' as const,
    required: ['conversationId', 'text'] as const,
    properties: {
      conversationId: { type: 'string', description: 'Target pubkey / conversation identifier' },
      text: { type: 'string', description: 'Message text' },
    },
  };

  public readonly outputSchema = {
    type: 'object' as const,
    properties: {
      messageId: { type: 'string', description: 'Sent message ID' },
      conversationId: { type: 'string', description: 'Target identifier' },
    },
  };

  constructor(private readonly service: NostrService) {}

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
  const options = (context.options ?? {}) as NostrChannelOptions & { secrets?: Record<string, string> };
  const privateKey = resolvePrivateKey(options, options.secrets);

  const service = new NostrService(privateKey);
  const adapter = new NostrChannelAdapter(service);
  const sendMessageTool = new NostrSendMessageTool(service);
  const priority = options.priority ?? 50;

  return {
    name: '@framers/agentos-ext-channel-nostr',
    version: '0.1.0',
    descriptors: [
      { id: 'nostrChannelSendMessage', kind: 'tool', priority, payload: sendMessageTool },
      { id: 'nostrChannel', kind: 'messaging-channel', priority, payload: adapter },
    ],
    onActivate: async () => {
      await service.initialize();
      await adapter.initialize({ platform: 'nostr', credential: privateKey });
      context.logger?.info('[NostrChannel] Extension activated (scaffold)');
    },
    onDeactivate: async () => {
      await adapter.shutdown();
      await service.shutdown();
      context.logger?.info('[NostrChannel] Extension deactivated');
    },
  };
}

export default createExtensionPack;

