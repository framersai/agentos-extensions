/**
 * @fileoverview Matrix Channel Extension for AgentOS (scaffold).
 *
 * Provides a placeholder adapter surface for Matrix. Full implementation using
 * matrix-js-sdk will be added in a follow-up.
 *
 * @module @framers/agentos-ext-channel-matrix
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

export interface MatrixChannelOptions {
  homeserverUrl?: string;
  accessToken?: string;
  priority?: number;
}

function resolveHomeserverUrl(options: MatrixChannelOptions, secrets?: Record<string, string>): string {
  if (options.homeserverUrl) return options.homeserverUrl;
  if (secrets?.['matrix.homeserverUrl']) return secrets['matrix.homeserverUrl'];
  if (process.env['MATRIX_HOMESERVER_URL']) return process.env['MATRIX_HOMESERVER_URL']!;
  throw new Error(
    'Matrix homeserver URL not found. Provide via options.homeserverUrl, secrets["matrix.homeserverUrl"], or MATRIX_HOMESERVER_URL.',
  );
}

function resolveAccessToken(options: MatrixChannelOptions, secrets?: Record<string, string>): string {
  if (options.accessToken) return options.accessToken;
  if (secrets?.['matrix.accessToken']) return secrets['matrix.accessToken'];
  if (process.env['MATRIX_ACCESS_TOKEN']) return process.env['MATRIX_ACCESS_TOKEN']!;
  throw new Error(
    'Matrix access token not found. Provide via options.accessToken, secrets["matrix.accessToken"], or MATRIX_ACCESS_TOKEN.',
  );
}

class MatrixService {
  private running = false;
  constructor(public readonly homeserverUrl: string, public readonly accessToken: string) {}

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
    if (!this.running) throw new Error('MatrixService not initialized');
    // Scaffold: no-op send (implementation pending)
    return { messageId: `stub-matrix-${Date.now()}` };
  }
}

class MatrixChannelAdapter implements IChannelAdapter {
  readonly platform = 'matrix' as const;
  readonly displayName = 'Matrix';
  readonly capabilities: readonly ChannelCapability[] = ['text', 'rich_text', 'threads', 'group_chat'] as const;

  private handlers = new Map<ChannelEventHandler, ChannelEventType[] | undefined>();

  constructor(private readonly service: MatrixService) {}

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

class MatrixSendMessageTool implements ITool {
  public readonly id = 'matrixChannelSendMessage';
  public readonly name = 'matrixChannelSendMessage';
  public readonly displayName = 'Send Matrix Message';
  public readonly description = 'Send a text message via the Matrix channel adapter (scaffold).';
  public readonly category = 'communication';
  public readonly version = '0.1.0';
  public readonly hasSideEffects = true;

  public readonly inputSchema = {
    type: 'object' as const,
    required: ['conversationId', 'text'] as const,
    properties: {
      conversationId: { type: 'string', description: 'Target room ID' },
      text: { type: 'string', description: 'Message text' },
    },
  };

  public readonly outputSchema = {
    type: 'object' as const,
    properties: {
      messageId: { type: 'string', description: 'Sent message ID' },
      conversationId: { type: 'string', description: 'Target room ID' },
    },
  };

  constructor(private readonly service: MatrixService) {}

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
  const options = (context.options ?? {}) as MatrixChannelOptions & { secrets?: Record<string, string> };
  const homeserverUrl = resolveHomeserverUrl(options, options.secrets);
  const accessToken = resolveAccessToken(options, options.secrets);

  const service = new MatrixService(homeserverUrl, accessToken);
  const adapter = new MatrixChannelAdapter(service);
  const sendMessageTool = new MatrixSendMessageTool(service);
  const priority = options.priority ?? 50;

  return {
    name: '@framers/agentos-ext-channel-matrix',
    version: '0.1.0',
    descriptors: [
      { id: 'matrixChannelSendMessage', kind: 'tool', priority, payload: sendMessageTool },
      { id: 'matrixChannel', kind: 'messaging-channel', priority, payload: adapter },
    ],
    onActivate: async () => {
      await service.initialize();
      await adapter.initialize({ platform: 'matrix', credential: accessToken });
      context.logger?.info('[MatrixChannel] Extension activated (scaffold)');
    },
    onDeactivate: async () => {
      await adapter.shutdown();
      await service.shutdown();
      context.logger?.info('[MatrixChannel] Extension deactivated');
    },
  };
}

export default createExtensionPack;

