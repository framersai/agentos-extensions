/**
 * @fileoverview IChannelAdapter implementation for Discord via discord.js.
 */

import type {
  IChannelAdapter,
  ChannelPlatform,
  ChannelCapability,
  ChannelAuthConfig,
  ChannelConnectionInfo,
  ChannelSendResult,
  MessageContent,
  ChannelEventHandler,
  ChannelEventType,
  ChannelEvent,
  ChannelMessage,
  RemoteUser,
  ConversationType,
} from '@framers/agentos';
import { DiscordService } from './DiscordService';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  type APIEmbed,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Interaction,
  type Message,
} from 'discord.js';
import { randomTriviaQuestion, type TriviaQuestion } from './TriviaBank';

export class DiscordChannelAdapter implements IChannelAdapter {
  readonly platform: ChannelPlatform = 'discord';
  readonly displayName = 'Discord';
  readonly capabilities: readonly ChannelCapability[] = [
    'text',
    'rich_text',
    'images',
    'documents',
    'embeds',
    'reactions',
    'threads',
    'typing_indicator',
    'group_chat',
    'mentions',
    'editing',
    'deletion',
  ] as const;

  private handlers = new Map<ChannelEventHandler, ChannelEventType[] | undefined>();
  private messageHandler: ((message: Message) => void) | null = null;
  private interactionHandler: ((interaction: Interaction) => void) | null = null;
  private triviaSessions = new Map<
    string,
    {
      question: TriviaQuestion;
      answeredUserIds: Set<string>;
      expiresAtMs: number;
      cleanupTimer: ReturnType<typeof setTimeout>;
    }
  >();

  /** Optional external interaction handlers (e.g., Founders extension). */
  private externalInteractionHandlers: Array<(interaction: Interaction) => Promise<boolean>> = [];

  constructor(private readonly service: DiscordService) {}

  /**
   * Register an external interaction handler that runs before built-in handling.
   * The handler should return `true` if it consumed the interaction, `false` otherwise.
   */
  registerExternalInteractionHandler(
    handler: (interaction: Interaction) => Promise<boolean>,
  ): void {
    this.externalInteractionHandlers.push(handler);
  }

  async initialize(_auth: ChannelAuthConfig): Promise<void> {
    this.messageHandler = (message: Message) => this.handleInboundMessage(message);
    this.service.onMessage(this.messageHandler);

    this.interactionHandler = (interaction: Interaction) => {
      void this.handleInboundInteraction(interaction);
    };
    this.service.onInteraction(this.interactionHandler);
  }

  async shutdown(): Promise<void> {
    if (this.messageHandler) {
      this.service.offMessage(this.messageHandler);
      this.messageHandler = null;
    }
    if (this.interactionHandler) {
      this.service.offInteraction(this.interactionHandler);
      this.interactionHandler = null;
    }
    this.handlers.clear();
    for (const s of this.triviaSessions.values()) {
      try {
        clearTimeout(s.cleanupTimer);
      } catch {
        // ignore
      }
    }
    this.triviaSessions.clear();
  }

  getConnectionInfo(): ChannelConnectionInfo {
    return {
      status: this.service.isRunning ? 'connected' : 'disconnected',
    };
  }

  async sendMessage(conversationId: string, content: MessageContent): Promise<ChannelSendResult> {
    const textBlock = content.blocks.find((b) => b.type === 'text');
    const imageBlock = content.blocks.find((b) => b.type === 'image');
    const documentBlock = content.blocks.find((b) => b.type === 'document');
    const embedBlock = content.blocks.find((b) => b.type === 'embed');

    // Build embeds array from embed blocks
    const embeds: APIEmbed[] = [];
    if (embedBlock && embedBlock.type === 'embed') {
      embeds.push({
        title: (embedBlock as any).title,
        description: (embedBlock as any).description,
        color: (embedBlock as any).color,
        fields: (embedBlock as any).fields,
      });
    }

    if (imageBlock && imageBlock.type === 'image') {
      // Send image as attachment with optional text
      const result = await this.service.sendFile(
        conversationId,
        imageBlock.url,
        imageBlock.caption ?? undefined,
      );
      return { messageId: result.id, timestamp: new Date().toISOString() };
    }

    if (documentBlock && documentBlock.type === 'document') {
      const result = await this.service.sendFile(
        conversationId,
        documentBlock.url,
        documentBlock.filename,
      );
      return { messageId: result.id, timestamp: new Date().toISOString() };
    }

    const text = textBlock?.text ?? '';
    const result = await this.service.sendMessage(conversationId, text, {
      embeds: embeds.length > 0 ? embeds : undefined,
      replyToMessageId: content.replyToMessageId ?? undefined,
    });

    return { messageId: result.id, timestamp: result.timestamp };
  }

  async sendTypingIndicator(conversationId: string, isTyping: boolean): Promise<void> {
    if (isTyping) {
      await this.service.setTyping(conversationId);
    }
    // Discord typing indicator auto-clears after ~10 seconds or on message send.
  }

  on(handler: ChannelEventHandler, eventTypes?: ChannelEventType[]): () => void {
    this.handlers.set(handler, eventTypes);
    return () => {
      this.handlers.delete(handler);
    };
  }

  async editMessage(conversationId: string, messageId: string, content: MessageContent): Promise<void> {
    const client = this.service.getClient();
    const channel = await client.channels.fetch(conversationId);
    if (!channel || !('messages' in channel)) return;

    const msg = await (channel as any).messages.fetch(messageId);
    const textBlock = content.blocks.find((b) => b.type === 'text');
    if (textBlock && textBlock.type === 'text') {
      await msg.edit({ content: textBlock.text });
    }
  }

  async deleteMessage(conversationId: string, messageId: string): Promise<void> {
    const client = this.service.getClient();
    const channel = await client.channels.fetch(conversationId);
    if (!channel || !('messages' in channel)) return;

    const msg = await (channel as any).messages.fetch(messageId);
    await msg.delete();
  }

  async addReaction(conversationId: string, messageId: string, emoji: string): Promise<void> {
    const client = this.service.getClient();
    const channel = await client.channels.fetch(conversationId);
    if (!channel || !('messages' in channel)) return;

    const msg = await (channel as any).messages.fetch(messageId);
    await msg.react(emoji);
  }

  async getConversationInfo(conversationId: string): Promise<{
    name?: string;
    memberCount?: number;
    isGroup: boolean;
    metadata?: Record<string, unknown>;
  }> {
    const client = this.service.getClient();
    const channel = await client.channels.fetch(conversationId);
    if (!channel) {
      return { isGroup: false };
    }

    const isDM = channel.isDMBased();
    const isGroup = !isDM;

    return {
      name: 'name' in channel ? (channel as any).name : undefined,
      memberCount: 'guild' in channel && (channel as any).guild
        ? (channel as any).guild.memberCount
        : undefined,
      isGroup,
      metadata: {
        type: ChannelType[channel.type],
        guildId: 'guildId' in channel ? (channel as any).guildId : undefined,
      },
    };
  }

  // -- Private --

  private handleInboundMessage(message: Message): void {
    // No-DM policy: ignore direct messages / group DMs.
    if (message.channel.isDMBased()) return;

    const sender: RemoteUser = {
      id: message.author.id,
      displayName: message.member?.displayName ?? message.author.displayName ?? undefined,
      username: message.author.username,
    };

    const conversationType: ConversationType = this.resolveConversationType(message);

    const channelMessage: ChannelMessage = {
      messageId: message.id,
      platform: 'discord',
      conversationId: message.channelId,
      conversationType,
      sender,
      content: [{ type: 'text', text: message.content ?? '' }],
      text: message.content ?? '',
      timestamp: message.createdAt.toISOString(),
      replyToMessageId: message.reference?.messageId ?? undefined,
      rawEvent: message,
    };

    const event: ChannelEvent<ChannelMessage> = {
      type: 'message',
      platform: 'discord',
      conversationId: message.channelId,
      timestamp: channelMessage.timestamp,
      data: channelMessage,
    };

    this.emit(event);
  }

  private async handleInboundInteraction(interaction: Interaction): Promise<void> {
    // Delegate to external handlers first (e.g., Founders extension).
    for (const handler of this.externalInteractionHandlers) {
      try {
        const consumed = await handler(interaction);
        if (consumed) return;
      } catch (err) {
        console.error('[Discord] External interaction handler error:', err);
      }
    }

    if (interaction.isButton()) {
      await this.handleButtonInteraction(interaction);
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    // No-DM policy: ignore direct-message invocations.
    if (!interaction.inGuild()) {
      try {
        await interaction.reply({ content: 'Use me in server channels (not DMs).', ephemeral: true });
      } catch {
        // ignore
      }
      return;
    }

    const channel = interaction.channel;
    if (!channel) return;
    if (channel.isDMBased()) return;

    const command = interaction.commandName;

    if (command === 'help') {
      const text =
        [
          '**Rabbit Hole AI — Help**',
          '',
          '- `/ask question:<text>` — ask in this channel (daily quota)',
          '- `/deepdive question:<text>` — deeper answer (separate quota)',
          '- `/summarize url:<link>` — summarize a link (counts as `/ask`)',
          '- `/paper arxiv:<id-or-url>` — summarize an arXiv paper (counts as `/ask`)',
          '- `/ask explain:true` — include a tool/API trace after the answer',
          '- `/quota` — view your remaining quotas (ephemeral)',
          '- `/status` — bot health (ephemeral)',
          '- `/faq [key]` — view FAQ (ephemeral)',
          '- `/note_add`, `/note_list`, `/note_delete` — your notes (ephemeral)',
          '- `/trivia` — start a trivia question',
          '- `/trivia_leaderboard` — trivia leaderboard (ephemeral)',
          '- `/pair` — request allowlist/pairing access (posts a pairing code)',
          '',
          'DMs: this bot ignores DMs by default.',
        ].join('\n');
      try {
        await interaction.reply({ content: text, ephemeral: true });
      } catch {
        // ignore
      }
      return;
    }

    if (command === 'pair') {
      try {
        await interaction.deferReply({ ephemeral: false });
      } catch {
        // ignore
      }
      this.service.registerPendingInteraction(interaction);
      this.emitSyntheticInteractionMessage(interaction, '!pair', { explicitInvocation: true });
      return;
    }

    if (command === 'ask') {
      const question = interaction.options.getString('question', true);
      const explain = interaction.options.getBoolean('explain') ?? false;

      const tier = this.service.getTierFromInteraction(interaction);
      const quota = this.service.checkQuota(interaction.user.id, tier, 'ask');
      if (!quota.allowed) {
        await this.safeEphemeralReply(
          interaction,
          `Daily quota reached for **/ask**.\nUsed: **${quota.used}/${quota.limit}** (resets daily — ${this.quotaTzLabel()}).\nRun \`/quota\` to see your limits.`,
        );
        return;
      }

      try {
        await interaction.deferReply({ ephemeral: false });
      } catch {
        // ignore
      }
      this.service.registerPendingInteractionWithQuota(interaction, {
        dayKey: quota.dayKey,
        userId: interaction.user.id,
        command: quota.bucket,
        amount: 1,
      });
      this.emitSyntheticInteractionMessage(interaction, question, {
        explicitInvocation: true,
        explain,
      });
      return;
    }

    if (command === 'summarize') {
      const url = interaction.options.getString('url', true);
      const explain = interaction.options.getBoolean('explain') ?? false;

      const tier = this.service.getTierFromInteraction(interaction);
      const quota = this.service.checkQuota(interaction.user.id, tier, 'summarize');
      if (!quota.allowed) {
        await this.safeEphemeralReply(
          interaction,
          `Daily quota reached for **/summarize** (counts as **/ask**).\nUsed: **${quota.used}/${quota.limit}** (resets daily — ${this.quotaTzLabel()}).\nRun \`/quota\` to see your limits.`,
        );
        return;
      }

      try {
        await interaction.deferReply({ ephemeral: false });
      } catch {
        // ignore
      }
      this.service.registerPendingInteractionWithQuota(interaction, {
        dayKey: quota.dayKey,
        userId: interaction.user.id,
        command: quota.bucket,
        amount: 1,
      });
      this.emitSyntheticInteractionMessage(interaction, `Summarize this link:\n${url}`, {
        explicitInvocation: true,
        explain,
      });
      return;
    }

    if (command === 'deepdive') {
      const question = interaction.options.getString('question', true);
      const explain = interaction.options.getBoolean('explain') ?? false;

      const tier = this.service.getTierFromInteraction(interaction);
      const quota = this.service.checkQuota(interaction.user.id, tier, 'deepdive');
      if (!quota.allowed) {
        await this.safeEphemeralReply(
          interaction,
          `Daily quota reached for **/deepdive**.\nUsed: **${quota.used}/${quota.limit}** (resets daily — ${this.quotaTzLabel()}).\nRun \`/quota\` to see your limits.`,
        );
        return;
      }

      try {
        await interaction.deferReply({ ephemeral: false });
      } catch {
        // ignore
      }
      this.service.registerPendingInteractionWithQuota(interaction, {
        dayKey: quota.dayKey,
        userId: interaction.user.id,
        command: quota.bucket,
        amount: 1,
      });
      this.emitSyntheticInteractionMessage(interaction, `Deep dive:\n${question}`, {
        explicitInvocation: true,
        explain,
      });
      return;
    }

    if (command === 'paper') {
      const arxiv = interaction.options.getString('arxiv', true);
      const explain = interaction.options.getBoolean('explain') ?? false;

      const tier = this.service.getTierFromInteraction(interaction);
      const quota = this.service.checkQuota(interaction.user.id, tier, 'paper');
      if (!quota.allowed) {
        await this.safeEphemeralReply(
          interaction,
          `Daily quota reached for **/paper** (counts as **/ask**).\nUsed: **${quota.used}/${quota.limit}** (resets daily — ${this.quotaTzLabel()}).\nRun \`/quota\` to see your limits.`,
        );
        return;
      }

      try {
        await interaction.deferReply({ ephemeral: false });
      } catch {
        // ignore
      }
      this.service.registerPendingInteractionWithQuota(interaction, {
        dayKey: quota.dayKey,
        userId: interaction.user.id,
        command: quota.bucket,
        amount: 1,
      });
      this.emitSyntheticInteractionMessage(
        interaction,
        `Summarize this arXiv paper for an AI/LLM practitioner:\n${arxiv}`,
        { explicitInvocation: true, explain },
      );
      return;
    }

    if (command === 'quota') {
      const tier = this.service.getTierFromInteraction(interaction);
      const ask = this.service.checkQuota(interaction.user.id, tier, 'ask');
      const deepdive = this.service.checkQuota(interaction.user.id, tier, 'deepdive');

      const lines = [
        '**Rabbit Hole AI — Quotas**',
        `Tier: **${tier.toUpperCase()}**`,
        `Reset: daily (${this.quotaTzLabel()}) — key: \`${ask.dayKey}\``,
        '',
        `- **Ask**: ${ask.used}/${ask.limit} used (remaining: ${Math.max(0, ask.limit - ask.used)})`,
        `- **Deepdive**: ${deepdive.used}/${deepdive.limit} used (remaining: ${Math.max(0, deepdive.limit - deepdive.used)})`,
      ];

      await this.safeEphemeralReply(interaction, lines.join('\n'));
      return;
    }

    if (command === 'status') {
      const tier = this.service.getTierFromInteraction(interaction);
      const bot = await this.service.getBotInfo();
      const ollama = await this.probeOllama();
      const statePath = this.service.getStateStorePath();

      const text = [
        '**Rabbit Hole AI — Status**',
        `Bot: ${bot ? `**${bot.tag}** (\`${bot.id}\`)` : 'unknown'}`,
        `Tier: **${tier.toUpperCase()}**`,
        `State: \`${statePath}\``,
        `Ollama: ${ollama.ok ? `✅ ${ollama.baseUrl}` : `❌ ${ollama.baseUrl} (${ollama.error})`}`,
        'DM policy: ignores DMs by default.',
      ].join('\n');

      await this.safeEphemeralReply(interaction, text);
      return;
    }

    if (command === 'faq') {
      const keyRaw = interaction.options.getString('key') ?? '';
      const key = keyRaw.trim().toLowerCase();

      if (key) {
        const entry = this.service.getFaq(key);
        if (!entry) {
          await this.safeEphemeralReply(interaction, `No FAQ entry found for key: \`${key}\`.`);
          return;
        }
        const embed: APIEmbed = {
          title: `FAQ: ${entry.key}`,
          description: `**Q:** ${entry.question}\n\n**A:** ${entry.answer}`,
          color: this.brandColor(),
          footer: this.brandFooter() ? { text: this.brandFooter()! } : undefined,
        };
        await this.safeEphemeralReply(interaction, undefined, { embeds: [embed] });
        return;
      }

      const list = this.service.listFaq();
      if (list.length === 0) {
        await this.safeEphemeralReply(interaction, 'No FAQ entries yet.');
        return;
      }

      list.sort((a, b) => a.key.localeCompare(b.key));
      const top = list.slice(0, 20);
      const lines = [
        '**Rabbit Hole AI — FAQ**',
        ...top.map((e) => `- \`${e.key}\` — ${e.question}`),
        list.length > top.length ? `\n…and ${list.length - top.length} more.` : '',
        '\nUse `/faq key:<key>` to view one entry.',
      ].filter((l) => l !== '');
      await this.safeEphemeralReply(interaction, lines.join('\n'));
      return;
    }

    if (command === 'faq_set') {
      const tier = this.service.getTierFromInteraction(interaction);
      if (tier !== 'team') {
        await this.safeEphemeralReply(interaction, 'Only **Team** can set FAQ entries.');
        return;
      }

      const key = (interaction.options.getString('key', true) || '').trim().toLowerCase();
      const question = (interaction.options.getString('question', true) || '').trim();
      const answer = (interaction.options.getString('answer', true) || '').trim();
      if (!key) {
        await this.safeEphemeralReply(interaction, 'FAQ key cannot be empty.');
        return;
      }

      const entry = this.service.setFaq(key, question, answer, interaction.user.id);
      await this.safeEphemeralReply(interaction, `Saved FAQ \`${entry.key}\` (updated ${entry.updatedAt}).`);
      return;
    }

    if (command === 'note_add') {
      const title = (interaction.options.getString('title') || '').trim();
      const body = (interaction.options.getString('body', true) || '').trim();
      if (!body) {
        await this.safeEphemeralReply(interaction, 'Note body cannot be empty.');
        return;
      }
      const note = this.service.addNote(interaction.user.id, title, body);
      await this.safeEphemeralReply(interaction, `Saved note **#${note.id}**: ${note.title}`);
      return;
    }

    if (command === 'note_list') {
      const notes = this.service.listNotes(interaction.user.id);
      if (notes.length === 0) {
        await this.safeEphemeralReply(interaction, 'No notes yet. Use `/note_add` to create one.');
        return;
      }
      const top = notes.slice(-25).reverse();
      const lines = [
        '**Your Notes**',
        ...top.map((n) => `- **#${n.id}** — ${n.title} (\`${n.createdAt.slice(0, 10)}\`)`),
        '\nDelete with `/note_delete id:<id>`.',
      ];
      await this.safeEphemeralReply(interaction, lines.join('\n'));
      return;
    }

    if (command === 'note_delete') {
      const id = interaction.options.getInteger('id', true);
      const ok = this.service.deleteNote(interaction.user.id, id);
      await this.safeEphemeralReply(interaction, ok ? `Deleted note **#${id}**.` : `Note **#${id}** not found.`);
      return;
    }

    if (command === 'trivia') {
      const q = randomTriviaQuestion();
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`rh_trivia:${q.id}:0`).setLabel('A').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`rh_trivia:${q.id}:1`).setLabel('B').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`rh_trivia:${q.id}:2`).setLabel('C').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`rh_trivia:${q.id}:3`).setLabel('D').setStyle(ButtonStyle.Secondary),
      );

      const embed: APIEmbed = {
        title: 'Rabbit Hole Trivia',
        description: [
          `**${q.question}**`,
          '',
          `**A.** ${q.choices[0]}`,
          `**B.** ${q.choices[1]}`,
          `**C.** ${q.choices[2]}`,
          `**D.** ${q.choices[3]}`,
          '',
          '_Click a button to answer (one attempt per user)._',
        ].join('\n'),
        color: this.brandColor(),
        footer: this.brandFooter() ? { text: this.brandFooter()! } : undefined,
      };

      try {
        await interaction.reply({ embeds: [embed], components: [row], ephemeral: false });
      } catch {
        return;
      }

      try {
        const msg = await interaction.fetchReply();
        const ttlMs = 10 * 60_000;
        const cleanupTimer = setTimeout(() => {
          this.triviaSessions.delete(msg.id);
          try {
            void (msg as any).edit({ components: [] });
          } catch {
            // ignore
          }
        }, ttlMs);

        this.triviaSessions.set(msg.id, {
          question: q,
          answeredUserIds: new Set<string>(),
          expiresAtMs: Date.now() + ttlMs,
          cleanupTimer,
        });
      } catch {
        // ignore
      }
      return;
    }

    if (command === 'trivia_leaderboard') {
      const rows = this.service.triviaLeaderboard(10);
      if (rows.length === 0) {
        await this.safeEphemeralReply(interaction, 'No trivia stats yet. Run `/trivia` to start!');
        return;
      }

      const lines = [
        '**Trivia Leaderboard**',
        ...rows.map((r, idx) => `**${idx + 1}.** <@${r.userId}> — **${r.wins}** wins / ${r.plays} plays`),
      ];
      await this.safeEphemeralReply(interaction, lines.join('\n'));
      return;
    }
  }

  private async handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.inGuild()) {
      try {
        await interaction.reply({ content: 'Use me in server channels (not DMs).', ephemeral: true });
      } catch {
        // ignore
      }
      return;
    }

    const messageId = interaction.message?.id;
    if (!messageId) return;

    const session = this.triviaSessions.get(messageId);
    if (!session) return;

    const now = Date.now();
    if (now > session.expiresAtMs) {
      this.triviaSessions.delete(messageId);
      try {
        await interaction.reply({ content: 'This trivia question has expired. Start a new one with `/trivia`.', ephemeral: true });
      } catch {
        // ignore
      }
      return;
    }

    if (session.answeredUserIds.has(interaction.user.id)) {
      try {
        await interaction.reply({ content: 'You already answered this question.', ephemeral: true });
      } catch {
        // ignore
      }
      return;
    }

    const { choiceIndex, questionId } = parseTriviaCustomId(interaction.customId);
    if (questionId !== session.question.id || choiceIndex == null) {
      try {
        await interaction.reply({ content: 'That trivia button is no longer valid.', ephemeral: true });
      } catch {
        // ignore
      }
      return;
    }

    session.answeredUserIds.add(interaction.user.id);

    const correct = choiceIndex === session.question.answerIndex;
    try {
      this.service.recordTriviaPlay(interaction.user.id, correct);
    } catch {
      // ignore
    }

    const correctLetter = ['A', 'B', 'C', 'D'][session.question.answerIndex] || 'A';
    const prefix = correct ? '✅ Correct!' : '❌ Not quite.';
    const content = [
      prefix,
      correct ? `+1 win recorded.` : `Correct answer: **${correctLetter}**.`,
      '',
      session.question.explanation,
    ].join('\n');

    try {
      await interaction.reply({ content, ephemeral: true });
    } catch {
      // ignore
    }
  }

  private quotaTzLabel(): string {
    return String(process.env['RABBITHOLE_TZ'] || 'America/Los_Angeles').trim() || 'UTC';
  }

  private brandColor(): number {
    const raw = String(process.env['DISCORD_BRAND_COLOR'] || '').trim();
    if (!raw) return 0x8B6914;
    if (raw.startsWith('0x')) {
      const n = Number.parseInt(raw.slice(2), 16);
      return Number.isFinite(n) ? n : 0x8B6914;
    }
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0x8B6914;
  }

  private brandFooter(): string {
    return String(process.env['DISCORD_BRAND_FOOTER'] || 'Powered by Rabbit Hole | rabbithole.inc').trim();
  }

  private async safeEphemeralReply(
    interaction: ChatInputCommandInteraction,
    content?: string,
    extra?: { embeds?: APIEmbed[] },
  ): Promise<void> {
    try {
      await interaction.reply({ content, embeds: extra?.embeds, ephemeral: true });
    } catch {
      // ignore
    }
  }

  private async probeOllama(): Promise<{ ok: boolean; baseUrl: string; error?: string }> {
    const raw = String(process.env['OLLAMA_BASE_URL'] || '').trim() || 'http://localhost:11434';
    const base = raw.endsWith('/') ? raw.slice(0, -1) : raw;
    const baseNoV1 = base.endsWith('/v1') ? base.slice(0, -3) : base;
    const url = `${baseNoV1}/api/version`;
    try {
      const res = await fetch(url, { method: 'GET' });
      if (!res.ok) return { ok: false, baseUrl: baseNoV1, error: `HTTP ${res.status}` };
      return { ok: true, baseUrl: baseNoV1 };
    } catch (err) {
      return { ok: false, baseUrl: baseNoV1, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private emitSyntheticInteractionMessage(
    interaction: Interaction & { isChatInputCommand(): boolean },
    text: string,
    rawMeta: Record<string, unknown>,
  ): void {
    if (!interaction.isChatInputCommand()) return;

    const sender: RemoteUser = {
      id: interaction.user.id,
      displayName: (interaction.member as any)?.displayName ?? interaction.user.displayName ?? undefined,
      username: interaction.user.username,
    };

    const channelType = interaction.channel?.type;
    const conversationType: ConversationType =
      channelType === ChannelType.PublicThread ||
      channelType === ChannelType.PrivateThread ||
      channelType === ChannelType.AnnouncementThread
        ? 'thread'
        : 'group';

    const channelMessage: ChannelMessage = {
      messageId: `interaction:${interaction.id}`,
      platform: 'discord',
      conversationId: interaction.channelId,
      conversationType,
      sender,
      content: [{ type: 'text', text: text ?? '' }],
      text: text ?? '',
      timestamp: interaction.createdAt.toISOString(),
      rawEvent: { interaction, ...rawMeta },
    };

    const event: ChannelEvent<ChannelMessage> = {
      type: 'message',
      platform: 'discord',
      conversationId: interaction.channelId,
      timestamp: channelMessage.timestamp,
      data: channelMessage,
    };

    this.emit(event);
  }

  private resolveConversationType(message: Message): ConversationType {
    const channelType = message.channel.type;

    if (channelType === ChannelType.DM) return 'direct';
    if (
      channelType === ChannelType.PublicThread ||
      channelType === ChannelType.PrivateThread ||
      channelType === ChannelType.AnnouncementThread
    ) {
      return 'thread';
    }
    // GuildText, GuildAnnouncement, GuildVoice, GuildStageVoice, GroupDM, etc.
    return 'group';
  }

  private emit(event: ChannelEvent): void {
    for (const [handler, filter] of this.handlers) {
      if (!filter || filter.includes(event.type)) {
        Promise.resolve(handler(event)).catch((err) => {
          console.error('[DiscordChannelAdapter] Handler error:', err);
        });
      }
    }
  }
}

function parseTriviaCustomId(customId: string): { questionId: string; choiceIndex: number | null } {
  // Format: rh_trivia:<questionId>:<choiceIndex>
  const parts = String(customId || '').split(':');
  if (parts.length !== 3) return { questionId: '', choiceIndex: null };
  if (parts[0] !== 'rh_trivia') return { questionId: '', choiceIndex: null };
  const questionId = String(parts[1] || '').trim();
  const idx = Number(parts[2]);
  const choiceIndex = Number.isFinite(idx) ? Math.max(0, Math.min(3, Math.floor(idx))) : null;
  return { questionId, choiceIndex };
}
