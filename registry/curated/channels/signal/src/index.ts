/**
 * @fileoverview Signal Channel Extension for AgentOS (scaffold).
 *
 * This package scaffolds the extension surface area (tool + adapter) so the
 * platform can be configured and loaded. A full signal-cli integration will be
 * implemented in a follow-up.
 *
 * @module @framers/agentos-ext-channel-signal
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

export interface SignalChannelOptions {
  phoneNumber?: string;
  phoneNumberEnv?: string;
  priority?: number;
}

function resolvePhoneNumber(options: SignalChannelOptions, secrets?: Record<string, string>): string {
  if (options.phoneNumber) return options.phoneNumber;
  if (secrets?.['signal.phoneNumber']) return secrets['signal.phoneNumber'];

  const envName = options.phoneNumberEnv ?? 'SIGNAL_PHONE_NUMBER';
  const envValue = process.env[envName];
  if (envValue) return envValue;

  if (process.env['SIGNAL_PHONE_NUMBER']) return process.env['SIGNAL_PHONE_NUMBER']!;

  throw new Error(
    'Signal phone number not found. Provide via options.phoneNumber, secrets["signal.phoneNumber"], or SIGNAL_PHONE_NUMBER env var.',
  );
}

class SignalService {
  private running = false;
  constructor(public readonly phoneNumber: string) {}

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
    if (!this.running) throw new Error('SignalService not initialized');
    // Scaffold: no-op send (implementation pending)
    return { messageId: `stub-signal-${Date.now()}` };
  }
}

class SignalChannelAdapter implements IChannelAdapter {
  readonly platform = 'signal' as const;
  readonly displayName = 'Signal';
  readonly capabilities: readonly ChannelCapability[] = ['text', 'rich_text', 'typing_indicator', 'group_chat'] as const;

  private handlers = new Map<ChannelEventHandler, ChannelEventType[] | undefined>();

  constructor(private readonly service: SignalService) {}

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

class SignalSendMessageTool implements ITool {
  public readonly id = 'signalChannelSendMessage';
  public readonly name = 'signalChannelSendMessage';
  public readonly displayName = 'Send Signal Message';
  public readonly description = 'Send a text message via the Signal channel adapter (scaffold).';
  public readonly category = 'communication';
  public readonly version = '0.1.0';
  public readonly hasSideEffects = true;

  public readonly inputSchema = {
    type: 'object' as const,
    required: ['conversationId', 'text'] as const,
    properties: {
      conversationId: { type: 'string', description: 'Recipient phone number or group ID' },
      text: { type: 'string', description: 'Message text' },
    },
  };

  public readonly outputSchema = {
    type: 'object' as const,
    properties: {
      messageId: { type: 'string', description: 'Sent message ID' },
      conversationId: { type: 'string', description: 'Recipient conversation ID' },
    },
  };

  constructor(private readonly service: SignalService) {}

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
  const options = (context.options ?? {}) as SignalChannelOptions & { secrets?: Record<string, string> };
  const phoneNumber = resolvePhoneNumber(options, options.secrets);
  const service = new SignalService(phoneNumber);
  const adapter = new SignalChannelAdapter(service);
  const sendMessageTool = new SignalSendMessageTool(service);

  const priority = options.priority ?? 50;

  return {
    name: '@framers/agentos-ext-channel-signal',
    version: '0.1.0',
    descriptors: [
      { id: 'signalChannelSendMessage', kind: 'tool', priority, payload: sendMessageTool },
      { id: 'signalChannel', kind: 'messaging-channel', priority, payload: adapter },
    ],
    onActivate: async () => {
      await service.initialize();
      await adapter.initialize({ platform: 'signal', credential: phoneNumber });
      context.logger?.info('[SignalChannel] Extension activated (scaffold)');
    },
    onDeactivate: async () => {
      await adapter.shutdown();
      await service.shutdown();
      context.logger?.info('[SignalChannel] Extension deactivated');
    },
  };
}

export default createExtensionPack;

