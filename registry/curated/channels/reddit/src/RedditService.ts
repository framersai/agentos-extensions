/**
 * @fileoverview Reddit SDK wrapper using snoowrap.
 * Handles OAuth2 lifecycle, posting, commenting, voting, searching, messaging, and analytics.
 */

import Snoowrap from 'snoowrap';

export interface RedditServiceConfig {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  userAgent?: string;
}

export interface RedditPostOptions {
  subreddit: string;
  title: string;
  content: string;
  type: 'text' | 'link' | 'image' | 'poll';
  pollOptions?: string[];
  pollDurationDays?: number;
  flairId?: string;
  nsfw?: boolean;
  spoiler?: boolean;
}

export interface RedditSearchOptions {
  subreddit?: string;
  sort?: 'relevance' | 'hot' | 'top' | 'new' | 'comments';
  time?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
  limit?: number;
}

export interface RedditTrendingOptions {
  subreddit?: string;
  sort?: 'hot' | 'top' | 'rising' | 'new' | 'controversial';
  time?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
  limit?: number;
}

export interface RedditPostResult {
  id: string;
  name: string;
  url: string;
  permalink: string;
}

export interface RedditCommentResult {
  id: string;
  name: string;
  permalink: string;
}

export interface RedditSearchResult {
  id: string;
  title: string;
  author: string;
  subreddit: string;
  score: number;
  numComments: number;
  url: string;
  permalink: string;
  createdUtc: number;
  selftext: string;
}

export interface RedditTrendingResult {
  id: string;
  title: string;
  author: string;
  subreddit: string;
  score: number;
  numComments: number;
  url: string;
  permalink: string;
  createdUtc: number;
}

export interface RedditInboxMessage {
  id: string;
  author: string;
  subject: string;
  body: string;
  createdUtc: number;
  isUnread: boolean;
  parentId?: string;
}

export interface RedditAnalytics {
  username: string;
  linkKarma: number;
  commentKarma: number;
  totalKarma: number;
  accountCreatedUtc: number;
  isGold: boolean;
  isMod: boolean;
  topSubreddits: Array<{ subreddit: string; count: number }>;
  recentActivity: {
    posts: number;
    comments: number;
  };
}

export class RedditService {
  private client: Snoowrap | null = null;
  private running = false;
  private readonly config: RedditServiceConfig;
  private inboxPollInterval: ReturnType<typeof setInterval> | null = null;
  private inboxHandlers: Array<(message: RedditInboxMessage) => void> = [];
  private lastSeenMessageId: string | null = null;

  constructor(config: RedditServiceConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.running) return;

    this.client = new Snoowrap({
      userAgent: this.config.userAgent ?? `AgentOS:RedditChannelExt:v0.1.0 (by /u/${this.config.username})`,
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
      username: this.config.username,
      password: this.config.password,
    });

    // Configure snoowrap settings
    this.client.config({
      requestDelay: 1000,
      continueAfterRatelimitError: true,
      retryDelay: 5000,
      maxRetryAttempts: 3,
      warnings: false,
    });

    // Validate credentials by fetching the authenticated user
    try {
      await this.client.getMe();
      this.running = true;
    } catch (err: any) {
      this.client = null;
      throw new Error(`Reddit authentication failed: ${err.message}`);
    }

    // Start polling inbox for new messages
    this.startInboxPolling();
  }

  async shutdown(): Promise<void> {
    if (!this.running) return;
    this.stopInboxPolling();
    this.client = null;
    this.running = false;
    this.inboxHandlers = [];
    this.lastSeenMessageId = null;
  }

  get isRunning(): boolean {
    return this.running;
  }

  // ── Posting ──

  async submitPost(options: RedditPostOptions): Promise<RedditPostResult> {
    const client = this.requireClient();
    const subreddit = client.getSubreddit(options.subreddit);
    let submission: any;

    switch (options.type) {
      case 'text':
        submission = await subreddit.submitSelfpost({
          title: options.title,
          text: options.content,
          flairId: options.flairId,
          nsfw: options.nsfw,
          spoiler: options.spoiler,
        });
        break;

      case 'link':
        submission = await subreddit.submitLink({
          title: options.title,
          url: options.content,
          flairId: options.flairId,
          nsfw: options.nsfw,
          spoiler: options.spoiler,
        });
        break;

      case 'image':
        // snoowrap does not natively support image uploads; submit as link
        submission = await subreddit.submitLink({
          title: options.title,
          url: options.content,
          flairId: options.flairId,
          nsfw: options.nsfw,
          spoiler: options.spoiler,
        });
        break;

      case 'poll':
        // Reddit API poll endpoint — snoowrap may not have native support,
        // fall back to text post with poll options in body
        const pollBody = options.pollOptions
          ? `Poll options:\n${options.pollOptions.map((o, i) => `${i + 1}. ${o}`).join('\n')}\n\n${options.content}`
          : options.content;
        submission = await subreddit.submitSelfpost({
          title: options.title,
          text: pollBody,
          flairId: options.flairId,
          nsfw: options.nsfw,
          spoiler: options.spoiler,
        });
        break;

      default:
        throw new Error(`Unsupported post type: ${options.type}`);
    }

    return {
      id: submission.name.replace(/^t3_/, ''),
      name: submission.name,
      url: `https://www.reddit.com${submission.permalink}`,
      permalink: submission.permalink,
    };
  }

  // ── Commenting ──

  async comment(thingId: string, text: string): Promise<RedditCommentResult> {
    const client = this.requireClient();

    // thingId can be a post (t3_xxx) or comment (t1_xxx) fullname
    const fullname = this.ensureFullname(thingId);
    let parent: any;

    if (fullname.startsWith('t3_')) {
      parent = client.getSubmission(fullname.replace(/^t3_/, ''));
    } else if (fullname.startsWith('t1_')) {
      parent = client.getComment(fullname.replace(/^t1_/, ''));
    } else {
      throw new Error(`Invalid thing ID for commenting: ${thingId}`);
    }

    const reply = await parent.reply(text);

    return {
      id: reply.name.replace(/^t1_/, ''),
      name: reply.name,
      permalink: reply.permalink ?? '',
    };
  }

  // ── Voting ──

  async vote(thingId: string, direction: 'up' | 'down' | 'none'): Promise<void> {
    const client = this.requireClient();
    const fullname = this.ensureFullname(thingId);

    let thing: any;
    if (fullname.startsWith('t3_')) {
      thing = client.getSubmission(fullname.replace(/^t3_/, ''));
    } else if (fullname.startsWith('t1_')) {
      thing = client.getComment(fullname.replace(/^t1_/, ''));
    } else {
      throw new Error(`Invalid thing ID for voting: ${thingId}`);
    }

    switch (direction) {
      case 'up':
        await thing.upvote();
        break;
      case 'down':
        await thing.downvote();
        break;
      case 'none':
        await thing.unvote();
        break;
    }
  }

  // ── Search ──

  async search(query: string, options?: RedditSearchOptions): Promise<RedditSearchResult[]> {
    const client = this.requireClient();
    const limit = options?.limit ?? 25;
    const sort = options?.sort ?? 'relevance';
    const time = options?.time ?? 'all';

    let results: any[];

    if (options?.subreddit) {
      results = await client.getSubreddit(options.subreddit).search({
        query,
        sort: sort as any,
        time: time as any,
        limit,
      });
    } else {
      results = await client.search({
        query,
        sort: sort as any,
        time: time as any,
        limit,
      });
    }

    return results.map((post: any) => ({
      id: post.id,
      title: post.title,
      author: post.author?.name ?? '[deleted]',
      subreddit: post.subreddit?.display_name ?? post.subreddit_name_prefixed?.replace('r/', '') ?? '',
      score: post.score,
      numComments: post.num_comments,
      url: post.url,
      permalink: `https://www.reddit.com${post.permalink}`,
      createdUtc: post.created_utc,
      selftext: post.selftext ?? '',
    }));
  }

  // ── Trending ──

  async getTrending(options?: RedditTrendingOptions): Promise<RedditTrendingResult[]> {
    const client = this.requireClient();
    const limit = options?.limit ?? 25;
    const sort = options?.sort ?? 'hot';
    const time = options?.time ?? 'day';
    const subredditName = options?.subreddit;

    let listing: any;
    const subreddit = subredditName ? client.getSubreddit(subredditName) : client;

    switch (sort) {
      case 'hot':
        listing = await (subreddit as any).getHot({ limit });
        break;
      case 'top':
        listing = await (subreddit as any).getTop({ time: time as any, limit });
        break;
      case 'rising':
        listing = await (subreddit as any).getRising({ limit });
        break;
      case 'new':
        listing = await (subreddit as any).getNew({ limit });
        break;
      case 'controversial':
        listing = await (subreddit as any).getControversial({ time: time as any, limit });
        break;
      default:
        listing = await (subreddit as any).getHot({ limit });
    }

    return (listing as any[]).map((post: any) => ({
      id: post.id,
      title: post.title,
      author: post.author?.name ?? '[deleted]',
      subreddit: post.subreddit?.display_name ?? post.subreddit_name_prefixed?.replace('r/', '') ?? '',
      score: post.score,
      numComments: post.num_comments,
      url: post.url,
      permalink: `https://www.reddit.com${post.permalink}`,
      createdUtc: post.created_utc,
    }));
  }

  // ── Subscribe/Unsubscribe ──

  async subscribe(subreddit: string, action: 'subscribe' | 'unsubscribe'): Promise<void> {
    const client = this.requireClient();
    const sub = client.getSubreddit(subreddit);

    if (action === 'subscribe') {
      await sub.subscribe();
    } else {
      await sub.unsubscribe();
    }
  }

  // ── Inbox ──

  async getInbox(options?: { filter?: 'unread' | 'all'; limit?: number }): Promise<RedditInboxMessage[]> {
    const client = this.requireClient();
    const limit = options?.limit ?? 25;
    const filter = options?.filter ?? 'all';

    let messages: any[];

    if (filter === 'unread') {
      messages = await client.getUnreadMessages({ limit });
    } else {
      messages = await client.getInbox({ limit });
    }

    return messages.map((msg: any) => ({
      id: msg.id,
      author: msg.author?.name ?? msg.author ?? '[unknown]',
      subject: msg.subject ?? '',
      body: msg.body ?? '',
      createdUtc: msg.created_utc,
      isUnread: msg.new ?? false,
      parentId: msg.parent_id ?? undefined,
    }));
  }

  async sendMessage(to: string, subject: string, body: string): Promise<void> {
    const client = this.requireClient();
    await client.composeMessage({
      to,
      subject,
      text: body,
    });
  }

  // ── Analytics ──

  async getAnalytics(username?: string): Promise<RedditAnalytics> {
    const client = this.requireClient();

    const user = username ? client.getUser(username) : await client.getMe();
    const userData: any = await user.fetch();

    // Fetch recent submissions and comments for activity metrics
    let recentPosts = 0;
    let recentComments = 0;
    const topSubreddits: Map<string, number> = new Map();

    try {
      const submissions: any[] = await (user as any).getSubmissions({ limit: 100 });
      recentPosts = submissions.length;
      for (const sub of submissions) {
        const srName = sub.subreddit?.display_name ?? '';
        if (srName) {
          topSubreddits.set(srName, (topSubreddits.get(srName) ?? 0) + 1);
        }
      }
    } catch {
      // User may have private submissions
    }

    try {
      const comments: any[] = await (user as any).getComments({ limit: 100 });
      recentComments = comments.length;
      for (const comment of comments) {
        const srName = comment.subreddit?.display_name ?? '';
        if (srName) {
          topSubreddits.set(srName, (topSubreddits.get(srName) ?? 0) + 1);
        }
      }
    } catch {
      // User may have private comments
    }

    const sortedSubreddits = Array.from(topSubreddits.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([subreddit, count]) => ({ subreddit, count }));

    return {
      username: userData.name,
      linkKarma: userData.link_karma ?? 0,
      commentKarma: userData.comment_karma ?? 0,
      totalKarma: (userData.link_karma ?? 0) + (userData.comment_karma ?? 0),
      accountCreatedUtc: userData.created_utc,
      isGold: userData.is_gold ?? false,
      isMod: userData.is_mod ?? false,
      topSubreddits: sortedSubreddits,
      recentActivity: {
        posts: recentPosts,
        comments: recentComments,
      },
    };
  }

  // ── Inbox Polling (for inbound message events) ──

  onInboxMessage(handler: (message: RedditInboxMessage) => void): void {
    this.inboxHandlers.push(handler);
  }

  offInboxMessage(handler: (message: RedditInboxMessage) => void): void {
    const idx = this.inboxHandlers.indexOf(handler);
    if (idx >= 0) this.inboxHandlers.splice(idx, 1);
  }

  /**
   * Access the underlying snoowrap client for advanced operations.
   * Throws if the service has not been initialized.
   */
  getClient(): Snoowrap {
    return this.requireClient();
  }

  getBotInfo(): { username: string } | null {
    if (!this.running || !this.config.username) return null;
    return { username: this.config.username };
  }

  // ── Private ──

  private requireClient(): Snoowrap {
    if (!this.client) throw new Error('RedditService not initialized');
    return this.client;
  }

  private ensureFullname(thingId: string): string {
    // If already a fullname (t1_, t3_, t4_, etc.), return as-is
    if (/^t\d_/.test(thingId)) return thingId;
    // Default to post (t3_) if no prefix — caller should provide proper prefix
    return `t3_${thingId}`;
  }

  private startInboxPolling(): void {
    // Poll every 60 seconds for new inbox messages
    this.inboxPollInterval = setInterval(async () => {
      try {
        await this.pollInbox();
      } catch (err: any) {
        console.error('[RedditService] Inbox polling error:', err.message);
      }
    }, 60_000);
  }

  private stopInboxPolling(): void {
    if (this.inboxPollInterval) {
      clearInterval(this.inboxPollInterval);
      this.inboxPollInterval = null;
    }
  }

  private async pollInbox(): Promise<void> {
    if (!this.client || this.inboxHandlers.length === 0) return;

    const unread = await this.client.getUnreadMessages({ limit: 10 });

    for (const msg of unread) {
      const msgAny = msg as any;
      // Skip if we've already seen this message
      if (this.lastSeenMessageId && msgAny.id === this.lastSeenMessageId) break;

      const parsed: RedditInboxMessage = {
        id: msgAny.id,
        author: msgAny.author?.name ?? msgAny.author ?? '[unknown]',
        subject: msgAny.subject ?? '',
        body: msgAny.body ?? '',
        createdUtc: msgAny.created_utc,
        isUnread: true,
        parentId: msgAny.parent_id ?? undefined,
      };

      for (const handler of this.inboxHandlers) {
        handler(parsed);
      }
    }

    if (unread.length > 0) {
      this.lastSeenMessageId = (unread[0] as any).id;
    }
  }
}
