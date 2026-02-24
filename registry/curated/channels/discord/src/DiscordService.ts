/**
 * @fileoverview Discord SDK wrapper using discord.js.
 * Handles bot lifecycle, message sending, and event dispatch.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';

import {
  Client,
  GatewayIntentBits,
  AttachmentBuilder,
  type Message,
  type TextBasedChannel,
  type TextBasedChannelFields,
  type Interaction,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
  ApplicationCommandOptionType,
  type APIEmbed,
} from 'discord.js';

import { dayKeyForTz, LocalStateStore, type QuotaCommand, type Tier } from './LocalState';

export interface DiscordChannelConfig {
  botToken: string;
  applicationId?: string;
  intents?: number[];
  registerSlashCommands?: boolean;
}

type PendingInteraction = {
  interaction: ChatInputCommandInteraction;
  usedEditReply: boolean;
  cleanupTimer: ReturnType<typeof setTimeout>;
  quota?: {
    dayKey: string;
    userId: string;
    command: QuotaCommand;
    amount: number;
  };
};

export class DiscordService {
  private client: Client | null = null;
  private running = false;
  private messageHandlers: Array<(message: Message) => void> = [];
  private interactionHandlers: Array<(interaction: Interaction) => void> = [];
  private pendingInteractions = new Map<string, PendingInteraction>();
  private readonly config: DiscordChannelConfig;
  private readonly state: LocalStateStore;
  private additionalSlashCommands: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [];

  constructor(config: DiscordChannelConfig) {
    this.config = config;
    this.state = new LocalStateStore(resolveStatePath());
  }

  async initialize(): Promise<void> {
    if (this.running) return;

    const intents = this.config.intents ?? [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ];

    this.client = new Client({ intents });

    // Register inbound message listener
    this.client.on('messageCreate', (message: Message) => {
      // Ignore messages from the bot itself
      if (message.author.id === this.client?.user?.id) return;
      for (const handler of this.messageHandlers) {
        handler(message);
      }
    });

    this.client.on('interactionCreate', (interaction: Interaction) => {
      for (const handler of this.interactionHandlers) {
        handler(interaction);
      }
    });

    // Login and wait for ready
    await new Promise<void>((resolve, reject) => {
      if (!this.client) return reject(new Error('Client not created'));

      const timeout = setTimeout(() => {
        reject(new Error('Discord client ready timeout after 30s'));
      }, 30_000);

      this.client.once('ready', () => {
        clearTimeout(timeout);
        this.running = true;
        void this.registerDefaultSlashCommands();
        resolve();
      });

      this.client.login(this.config.botToken).catch((err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  async shutdown(): Promise<void> {
    if (!this.running || !this.client) return;
    this.client.destroy();
    this.running = false;
    this.client = null;
  }

  get isRunning(): boolean {
    return this.running;
  }

  onMessage(handler: (message: Message) => void): void {
    this.messageHandlers.push(handler);
  }

  offMessage(handler: (message: Message) => void): void {
    const idx = this.messageHandlers.indexOf(handler);
    if (idx >= 0) this.messageHandlers.splice(idx, 1);
  }

  onInteraction(handler: (interaction: Interaction) => void): void {
    this.interactionHandlers.push(handler);
  }

  offInteraction(handler: (interaction: Interaction) => void): void {
    const idx = this.interactionHandlers.indexOf(handler);
    if (idx >= 0) this.interactionHandlers.splice(idx, 1);
  }

  /** Register additional slash commands to be included in the guild command set. */
  registerSlashCommands(commands: RESTPostAPIChatInputApplicationCommandsJSONBody[]): void {
    this.additionalSlashCommands.push(...commands);
  }

  registerPendingInteraction(interaction: ChatInputCommandInteraction, ttlMs = 15 * 60_000): void {
    const id = interaction.id;
    const existing = this.pendingInteractions.get(id);
    if (existing) {
      try {
        clearTimeout(existing.cleanupTimer);
      } catch {
        // ignore
      }
    }

    const cleanupTimer = setTimeout(() => {
      this.pendingInteractions.delete(id);
    }, ttlMs);

    this.pendingInteractions.set(id, { interaction, usedEditReply: false, cleanupTimer });
  }

  registerPendingInteractionWithQuota(
    interaction: ChatInputCommandInteraction,
    quota: { dayKey: string; userId: string; command: QuotaCommand; amount?: number },
    ttlMs = 15 * 60_000,
  ): void {
    const amount = Number.isFinite(quota.amount) ? Math.max(1, Math.floor(Number(quota.amount))) : 1;
    this.registerPendingInteraction(interaction, ttlMs);
    const existing = this.pendingInteractions.get(interaction.id);
    if (existing) existing.quota = { dayKey: quota.dayKey, userId: quota.userId, command: quota.command, amount };
  }

  async sendMessage(
    channelId: string,
    text: string,
    options?: {
      embeds?: APIEmbed[];
      files?: AttachmentBuilder[];
      replyToMessageId?: string;
    },
  ): Promise<{ id: string; channelId: string; timestamp: string }> {
    const replyTo = options?.replyToMessageId ?? '';
    if (replyTo.startsWith('interaction:')) {
      const interactionId = replyTo.slice('interaction:'.length);
      const pending = this.pendingInteractions.get(interactionId);
      if (pending) {
        if (!pending.usedEditReply) {
          pending.usedEditReply = true;
          const embedReply = shouldUseEmbedReplies();
          const brandColor = resolveBrandColor();
          const footer = resolveFooterText();

          const embeds = options?.embeds ?? undefined;
          const canEmbed = embedReply && !embeds && typeof text === 'string' && text.length > 0 && text.length <= 4096;

          try {
            await pending.interaction.editReply(
              canEmbed
                ? {
                    content: undefined,
                    embeds: [
                      {
                        description: text,
                        color: brandColor,
                        footer: footer ? { text: footer } : undefined,
                      } as APIEmbed,
                    ],
                    files: options?.files,
                  }
                : {
                    content: text || undefined,
                    embeds,
                    files: options?.files,
                  },
            );

            // Only count quota usage after we successfully produced the first response.
            if (pending.quota) {
              try {
                this.state.incrementUsage(pending.quota.dayKey, pending.quota.userId, pending.quota.command, pending.quota.amount);
                this.state.pruneUsage();
              } catch {
                // ignore
              } finally {
                pending.quota = undefined;
              }
            }
            const msg = await pending.interaction.fetchReply();
            return { id: msg.id, channelId: msg.channelId, timestamp: msg.createdAt.toISOString() };
          } catch (editErr) {
            // editReply failed (interaction expired or deferReply didn't register).
            // Fall back to sending as a regular channel message.
            console.warn('[DiscordService] editReply failed, falling back to channel.send:', editErr instanceof Error ? editErr.message : String(editErr));
            const channel = await this.fetchTextChannel(channelId);
            const msg = await channel.send({
              content: text || undefined,
              embeds: options?.embeds,
              files: options?.files,
            });
            return { id: msg.id, channelId: msg.channelId, timestamp: msg.createdAt.toISOString() };
          }
        }

        try {
          const msg = await pending.interaction.followUp({
            content: text || undefined,
            embeds: options?.embeds,
            files: options?.files,
          });
          return { id: msg.id, channelId: msg.channelId, timestamp: msg.createdAt.toISOString() };
        } catch (followUpErr) {
          console.warn('[DiscordService] followUp failed, falling back to channel.send:', followUpErr instanceof Error ? followUpErr.message : String(followUpErr));
          const channel = await this.fetchTextChannel(channelId);
          const msg = await channel.send({
            content: text || undefined,
            embeds: options?.embeds,
            files: options?.files,
          });
          return { id: msg.id, channelId: msg.channelId, timestamp: msg.createdAt.toISOString() };
        }
      }
    }

    const channel = await this.fetchTextChannel(channelId);
    const msg = await channel.send({
      content: text || undefined,
      embeds: options?.embeds,
      files: options?.files,
      reply: options?.replyToMessageId
        ? { messageReference: options.replyToMessageId }
        : undefined,
    });
    return { id: msg.id, channelId: msg.channelId, timestamp: msg.createdAt.toISOString() };
  }

  async sendFile(
    channelId: string,
    url: string,
    filename?: string,
    description?: string,
  ): Promise<{ id: string }> {
    const channel = await this.fetchTextChannel(channelId);
    const attachment = new AttachmentBuilder(url, {
      name: filename,
      description,
    });
    const msg = await channel.send({ files: [attachment] });
    return { id: msg.id };
  }

  async setTyping(channelId: string): Promise<void> {
    const channel = await this.fetchTextChannel(channelId);
    await channel.sendTyping();
  }

  async getBotInfo(): Promise<{ id: string; username: string; discriminator: string; tag: string } | null> {
    if (!this.client?.user) return null;
    return {
      id: this.client.user.id,
      username: this.client.user.username,
      discriminator: this.client.user.discriminator,
      tag: this.client.user.tag,
    };
  }

  /**
   * Access the underlying discord.js Client for advanced operations.
   * Throws if the service has not been initialized.
   */
  getClient(): Client {
    if (!this.client) throw new Error('DiscordService not initialized');
    return this.client;
  }

  private async fetchTextChannel(channelId: string): Promise<TextBasedChannel & TextBasedChannelFields> {
    if (!this.client) throw new Error('DiscordService not initialized');
    const channel = await this.client.channels.fetch(channelId);
    if (!channel || !('send' in channel)) {
      throw new Error(`Channel ${channelId} is not a text-based channel or does not exist`);
    }
    return channel as TextBasedChannel & TextBasedChannelFields;
  }

  private async registerDefaultSlashCommands(): Promise<void> {
    if (!this.client?.application) return;
    if (this.config.registerSlashCommands === false) return;

    const commands: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [
      {
        name: 'ask',
        description: 'Ask Rabbit Hole AI in this channel',
        options: [
          {
            name: 'question',
            description: 'Your question',
            type: ApplicationCommandOptionType.String,
            required: true,
          },
          {
            name: 'explain',
            description: 'Include a tool/API trace after the answer',
            type: ApplicationCommandOptionType.Boolean,
            required: false,
          },
        ],
      },
      {
        name: 'summarize',
        description: 'Summarize a link in this channel',
        options: [
          {
            name: 'url',
            description: 'URL to summarize',
            type: ApplicationCommandOptionType.String,
            required: true,
          },
          {
            name: 'explain',
            description: 'Include a tool/API trace after the answer',
            type: ApplicationCommandOptionType.Boolean,
            required: false,
          },
        ],
      },
      {
        name: 'deepdive',
        description: 'Get a deeper answer (counts against a separate daily quota)',
        options: [
          {
            name: 'question',
            description: 'Your question',
            type: ApplicationCommandOptionType.String,
            required: true,
          },
          {
            name: 'explain',
            description: 'Include a tool/API trace after the answer',
            type: ApplicationCommandOptionType.Boolean,
            required: false,
          },
        ],
      },
      {
        name: 'paper',
        description: 'Summarize an arXiv paper (AI/LLMs)',
        options: [
          {
            name: 'arxiv',
            description: 'arXiv id or URL (e.g., 2401.12345 or https://arxiv.org/abs/2401.12345)',
            type: ApplicationCommandOptionType.String,
            required: true,
          },
          {
            name: 'explain',
            description: 'Include a tool/API trace after the answer',
            type: ApplicationCommandOptionType.Boolean,
            required: false,
          },
        ],
      },
      {
        name: 'pair',
        description: 'Request pairing / allowlist access for this user',
      },
      {
        name: 'help',
        description: 'Show bot help',
      },
      {
        name: 'quota',
        description: 'Show your daily quotas and remaining usage',
      },
      {
        name: 'status',
        description: 'Show bot health and Ollama connectivity',
      },
      {
        name: 'faq',
        description: 'Show FAQ entries',
        options: [
          {
            name: 'key',
            description: 'Optional FAQ key to show a single entry',
            type: ApplicationCommandOptionType.String,
            required: false,
          },
        ],
      },
      {
        name: 'faq_set',
        description: 'Create/update an FAQ entry (Team only)',
        options: [
          {
            name: 'key',
            description: 'FAQ key (short identifier)',
            type: ApplicationCommandOptionType.String,
            required: true,
          },
          {
            name: 'question',
            description: 'FAQ question',
            type: ApplicationCommandOptionType.String,
            required: true,
          },
          {
            name: 'answer',
            description: 'FAQ answer',
            type: ApplicationCommandOptionType.String,
            required: true,
          },
        ],
      },
      {
        name: 'note_add',
        description: 'Save a personal note (ephemeral)',
        options: [
          {
            name: 'body',
            description: 'Note text',
            type: ApplicationCommandOptionType.String,
            required: true,
          },
          {
            name: 'title',
            description: 'Optional note title',
            type: ApplicationCommandOptionType.String,
            required: false,
          },
        ],
      },
      {
        name: 'note_list',
        description: 'List your personal notes (ephemeral)',
      },
      {
        name: 'note_delete',
        description: 'Delete a personal note by id (ephemeral)',
        options: [
          {
            name: 'id',
            description: 'Note id',
            type: ApplicationCommandOptionType.Integer,
            required: true,
          },
        ],
      },
      {
        name: 'trivia',
        description: 'Start a trivia question (anyone can answer once)',
      },
      {
        name: 'trivia_leaderboard',
        description: 'Show trivia leaderboard',
      },
      {
        name: 'clear',
        description: 'Clear bot messages from this channel (Team only)',
        options: [
          {
            name: 'count',
            description: 'Number of recent messages to scan (default 50, max 100)',
            type: ApplicationCommandOptionType.Integer,
            required: false,
          },
        ],
      },
    ];

    // Merge any additional slash commands from extensions (e.g., Founders).
    const allCommands = [...commands, ...this.additionalSlashCommands];

    const guildId = String(process.env.DISCORD_GUILD_ID || '').trim();
    try {
      if (guildId) {
        const guild = await this.client.guilds.fetch(guildId);
        await guild.commands.set(allCommands);
        return;
      }
    } catch {
      // Fall back to global registration if guild fetch/registration fails.
    }

    await this.client.application.commands.set(allCommands);
  }

  // ---------------------------------------------------------------------------
  // Rabbit Hole community helpers (rate limits, notes, faq, trivia stats)
  // ---------------------------------------------------------------------------

  getStateStorePath(): string {
    return this.state.getPath();
  }

  getTierFromInteraction(interaction: ChatInputCommandInteraction): Tier {
    const teamRole = String(process.env['ROLE_TEAM'] || 'Team').trim();
    const proRole = String(process.env['ROLE_PRO'] || 'Pro').trim();
    const enterpriseRole = String(process.env['ROLE_ENTERPRISE_ALIAS'] || 'Enterprise').trim();

    const guild = interaction.guild;
    if (!guild) return 'starter';

    // Guild owner is always team tier
    if (interaction.user.id === guild.ownerId) return 'team';

    const memberAny: any = interaction.member as any;
    const roleIds: string[] = (() => {
      if (!memberAny?.roles) return [];
      if (Array.isArray(memberAny.roles)) return memberAny.roles.map(String);
      if (memberAny.roles?.cache) return Array.from(memberAny.roles.cache.keys()).map(String);
      return [];
    })();

    const roleNames = roleIds
      .map((id) => guild.roles.cache.get(id)?.name)
      .filter((n): n is string => typeof n === 'string' && n.length > 0);

    if (teamRole && roleNames.includes(teamRole)) return 'team';
    if (proRole && roleNames.includes(proRole)) return 'pro';
    if (enterpriseRole && roleNames.includes(enterpriseRole)) return 'pro';
    return 'starter';
  }

  quotaDayKey(): string {
    const tz = String(process.env['RABBITHOLE_TZ'] || 'America/Los_Angeles').trim() || 'UTC';
    return dayKeyForTz(tz);
  }

  private quotaBucket(command: QuotaCommand): QuotaCommand {
    if (command === 'deepdive') return 'deepdive';
    return 'ask';
  }

  quotaLimit(tier: Tier, command: QuotaCommand): number {
    if (tier === 'team') return 10_000_000;
    const bucket = this.quotaBucket(command);
    if (bucket === 'deepdive') {
      const starter = Number(process.env['STARTER_DEEPDIVE_PER_DAY'] ?? 3) || 3;
      const pro = Number(process.env['PRO_DEEPDIVE_PER_DAY'] ?? 10) || 10;
      return tier === 'pro' ? pro : starter;
    }
    const starter = Number(process.env['STARTER_ASK_PER_DAY'] ?? 10) || 10;
    const pro = Number(process.env['PRO_ASK_PER_DAY'] ?? 30) || 30;
    return tier === 'pro' ? pro : starter;
  }

  checkQuota(userId: string, tier: Tier, command: QuotaCommand): { allowed: boolean; used: number; limit: number; dayKey: string; bucket: QuotaCommand } {
    const dayKey = this.quotaDayKey();
    const bucket = this.quotaBucket(command);
    const used = this.state.getUsage(dayKey, userId, bucket);
    const limit = this.quotaLimit(tier, command);
    const allowed = tier === 'team' ? true : used < limit;
    return { allowed, used, limit, dayKey, bucket };
  }

  // Notes / FAQ / Trivia stats

  addNote(userId: string, title: string, body: string) {
    return this.state.addNote(userId, title, body);
  }

  listNotes(userId: string) {
    return this.state.listNotes(userId);
  }

  deleteNote(userId: string, id: number) {
    return this.state.deleteNote(userId, id);
  }

  setFaq(key: string, question: string, answer: string, updatedBy: string) {
    return this.state.setFaq(key, question, answer, updatedBy);
  }

  getFaq(key: string) {
    return this.state.getFaq(key);
  }

  listFaq() {
    return this.state.listFaq();
  }

  recordTriviaPlay(userId: string, won: boolean) {
    return this.state.recordTriviaPlay(userId, won);
  }

  triviaLeaderboard(limit = 10) {
    return this.state.triviaLeaderboard(limit);
  }
}

function resolveStatePath(): string {
  const explicit = String(process.env['DISCORD_STATE_DIR'] || '').trim();
  if (explicit) return join(explicit, 'rabbithole_discord_state.json');

  const ws = String(process.env['WUNDERLAND_WORKSPACE_DIR'] || '').trim();
  if (ws) return join(ws, 'discord', 'rabbithole_discord_state.json');

  return join(homedir(), '.wunderland', 'discord', 'rabbithole_discord_state.json');
}

function resolveBrandColor(): number {
  const raw = String(process.env['DISCORD_BRAND_COLOR'] || '').trim();
  if (!raw) return 0x8B6914;
  if (raw.startsWith('0x')) {
    const n = Number.parseInt(raw.slice(2), 16);
    return Number.isFinite(n) ? n : 0x8B6914;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0x8B6914;
}

function resolveFooterText(): string {
  return String(process.env['DISCORD_BRAND_FOOTER'] || 'Powered by Rabbit Hole | rabbithole.inc').trim();
}

function shouldUseEmbedReplies(): boolean {
  const raw = String(process.env['DISCORD_USE_EMBED_REPLIES'] || '').trim().toLowerCase();
  if (!raw) return true;
  return raw !== 'false' && raw !== '0' && raw !== 'no' && raw !== 'off';
}
