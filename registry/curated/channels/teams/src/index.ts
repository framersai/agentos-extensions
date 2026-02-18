/**
 * @fileoverview Microsoft Teams Channel Extension for AgentOS (scaffold).
 *
 * Provides a placeholder adapter surface for Teams. Full implementation will be
 * added in a follow-up.
 *
 * @module @framers/agentos-ext-channel-teams
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

export interface TeamsChannelOptions {
  appId?: string;
  appPassword?: string;
  priority?: number;
}

function resolveAppId(options: TeamsChannelOptions, secrets?: Record<string, string>): string {
  if (options.appId) return options.appId;
  if (secrets?.['teams.appId']) return secrets['teams.appId'];
  if (process.env['TEAMS_APP_ID']) return process.env['TEAMS_APP_ID']!;
  throw new Error('Teams App ID not found. Provide via options.appId, secrets["teams.appId"], or TEAMS_APP_ID.');
}

function resolveAppPassword(options: TeamsChannelOptions, secrets?: Record<string, string>): string {
  if (options.appPassword) return options.appPassword;
  if (secrets?.['teams.appPassword']) return secrets['teams.appPassword'];
  if (process.env['TEAMS_APP_PASSWORD']) return process.env['TEAMS_APP_PASSWORD']!;
  throw new Error(
    'Teams App Password not found. Provide via options.appPassword, secrets["teams.appPassword"], or TEAMS_APP_PASSWORD.',
  );
}

class TeamsService {
  private running = false;
  constructor(public readonly appId: string, public readonly appPassword: string) {}

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
    if (!this.running) throw new Error('TeamsService not initialized');
    // Scaffold: no-op send (implementation pending)
    return { messageId: `stub-teams-${Date.now()}` };
  }
}

class TeamsChannelAdapter implements IChannelAdapter {
  readonly platform = 'teams' as const;
  readonly displayName = 'Microsoft Teams';
  readonly capabilities: readonly ChannelCapability[] = ['text', 'rich_text', 'threads', 'group_chat'] as const;

  private handlers = new Map<ChannelEventHandler, ChannelEventType[] | undefined>();

  constructor(private readonly service: TeamsService) {}

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

class TeamsSendMessageTool implements ITool {
  public readonly id = 'teamsChannelSendMessage';
  public readonly name = 'teamsChannelSendMessage';
  public readonly displayName = 'Send Teams Message';
  public readonly description = 'Send a text message via the Teams channel adapter (scaffold).';
  public readonly category = 'communication';
  public readonly version = '0.1.0';
  public readonly hasSideEffects = true;

  public readonly inputSchema = {
    type: 'object' as const,
    required: ['conversationId', 'text'] as const,
    properties: {
      conversationId: { type: 'string', description: 'Target conversation/chat ID' },
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

  constructor(private readonly service: TeamsService) {}

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
  const options = (context.options ?? {}) as TeamsChannelOptions & { secrets?: Record<string, string> };
  const appId = resolveAppId(options, options.secrets);
  const appPassword = resolveAppPassword(options, options.secrets);

  const service = new TeamsService(appId, appPassword);
  const adapter = new TeamsChannelAdapter(service);
  const sendMessageTool = new TeamsSendMessageTool(service);
  const priority = options.priority ?? 50;

  return {
    name: '@framers/agentos-ext-channel-teams',
    version: '0.1.0',
    descriptors: [
      { id: 'teamsChannelSendMessage', kind: 'tool', priority, payload: sendMessageTool },
      { id: 'teamsChannel', kind: 'messaging-channel', priority, payload: adapter },
    ],
    onActivate: async () => {
      await service.initialize();
      await adapter.initialize({ platform: 'teams', credential: appPassword });
      context.logger?.info('[TeamsChannel] Extension activated (scaffold)');
    },
    onDeactivate: async () => {
      await adapter.shutdown();
      await service.shutdown();
      context.logger?.info('[TeamsChannel] Extension deactivated');
    },
  };
}

export default createExtensionPack;

