/**
 * @fileoverview Wunderbot Feeds — AgentOS extension that fetches data from the
 * Python Scraper API on a schedule and posts formatted Discord embeds.
 *
 * Also exposes LLM tools so the agent can answer questions like
 * "what are the latest tech news?" by calling the scraper on demand.
 */

import type {
  ExtensionPackContext,
  ExtensionPack,
  ExtensionLifecycleContext,
  ITool,
  ToolExecutionContext,
  ToolExecutionResult,
  JSONSchemaObject,
} from '@framers/agentos';

import { Client, GatewayIntentBits, ActivityType } from 'discord.js';

import type { FeedsConfig, SniperEvent } from './types.js';
import { ScraperClient } from './ScraperClient.js';
import { DiscordPoster } from './DiscordPoster.js';

// Formatters
import { formatNewsEmbeds } from './formatters/news.js';
import { formatDealsEmbeds } from './formatters/deals.js';
import { formatShortSqueezeEmbed, formatTrendingCryptoEmbed } from './formatters/trades.js';
import { formatJobEmbeds } from './formatters/jobs.js';
import { formatThreatIntelEmbeds } from './formatters/threatIntel.js';
import { formatPaperEmbeds } from './formatters/papers.js';
import { formatSniperEmbed } from './formatters/sniper.js';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_TIMERS = {
  news: 7_440_000,         // ~2h4m
  threat_intel: 7_440_000,
  ai_papers: 7_440_000,
  deals: 3_720_000,        // ~1h2m
  trades: 3_720_000,
  jobs: 14_400_000,        // 4h
};

const NEWS_CATEGORIES = ['us', 'world', 'tech', 'finance', 'science', 'media'] as const;

// ---------------------------------------------------------------------------
// LLM Tools
// ---------------------------------------------------------------------------

class FetchNewsTool implements ITool {
  readonly id = 'wunderbot-fetch-news';
  readonly name = 'fetchNews';
  readonly displayName = 'Fetch News';
  readonly description = 'Fetch the latest news headlines from Google News via the Python scraper API. Categories: us, world, tech, finance, science, media. NOTE: This is slow (~5 min per category).';
  readonly category = 'information';
  readonly hasSideEffects = false;
  readonly inputSchema: JSONSchemaObject = {
    type: 'object',
    required: ['category'],
    properties: {
      category: { type: 'string', enum: ['us', 'world', 'tech', 'finance', 'science', 'media'], description: 'News category' },
      limit: { type: 'integer', description: 'Max articles', default: 3, minimum: 1, maximum: 10 },
    },
    additionalProperties: false,
  };

  constructor(private client: ScraperClient) {}

  async execute(args: { category: string; limit?: number }, _context: ToolExecutionContext): Promise<ToolExecutionResult> {
    try {
      const data = await this.client.fetchNews(args.category, args.limit ?? 3);
      return { success: true, output: data };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}

class FetchDealsTool implements ITool {
  readonly id = 'wunderbot-fetch-deals';
  readonly name = 'fetchDeals';
  readonly displayName = 'Fetch Udemy Deals';
  readonly description = 'Fetch free Udemy course deals from the Python scraper API.';
  readonly category = 'information';
  readonly hasSideEffects = false;
  readonly inputSchema: JSONSchemaObject = {
    type: 'object',
    properties: {},
    additionalProperties: false,
  };

  constructor(private client: ScraperClient) {}

  async execute(_args: Record<string, never>, _context: ToolExecutionContext): Promise<ToolExecutionResult> {
    try {
      const data = await this.client.fetchDeals();
      return { success: true, output: data };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}

class FetchTradesTool implements ITool {
  readonly id = 'wunderbot-fetch-trades';
  readonly name = 'fetchTrades';
  readonly displayName = 'Fetch Market Data';
  readonly description = 'Fetch short squeeze stocks and/or trending crypto from the Python scraper API.';
  readonly category = 'information';
  readonly hasSideEffects = false;
  readonly inputSchema: JSONSchemaObject = {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['short-squeeze', 'trending-crypto', 'both'], default: 'both', description: 'Which market data to fetch' },
    },
    additionalProperties: false,
  };

  constructor(private client: ScraperClient) {}

  async execute(args: { type?: string }, _context: ToolExecutionContext): Promise<ToolExecutionResult> {
    try {
      const t = args.type ?? 'both';
      const results: Record<string, unknown> = {};
      if (t === 'short-squeeze' || t === 'both') {
        results.shortSqueeze = await this.client.fetchShortSqueeze();
      }
      if (t === 'trending-crypto' || t === 'both') {
        results.trendingCrypto = await this.client.fetchTrendingCrypto();
      }
      return { success: true, output: results };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}

// ---------------------------------------------------------------------------
// Feed job helpers
// ---------------------------------------------------------------------------

type Logger = { info: (msg: string) => void; error: (msg: string) => void; warn: (msg: string) => void };
const noopLogger: Logger = { info: () => {}, error: () => {}, warn: () => {} };

function log(logger: Logger, msg: string): void {
  logger.info(`[wunderbot-feeds] ${msg}`);
}

function logError(logger: Logger, msg: string): void {
  logger.error(`[wunderbot-feeds] ${msg}`);
}

/**
 * Wraps a feed job in error handling + logging. Returns a function suitable
 * for setInterval.
 */
function wrapJob(name: string, logger: Logger, fn: () => Promise<void>): () => void {
  return () => {
    fn().catch((err) => logError(logger, `${name} failed: ${err}`));
  };
}

// ---------------------------------------------------------------------------
// Cron registration
// ---------------------------------------------------------------------------

function registerFeedJobs(
  client: ScraperClient,
  poster: DiscordPoster,
  config: FeedsConfig,
  logger: Logger,
): NodeJS.Timeout[] {
  const timers: NodeJS.Timeout[] = [];
  const ch = config.channels;
  const t = { ...DEFAULT_TIMERS, ...config.timers };

  // --- News (6 categories, staggered by 30s each) ---
  for (let i = 0; i < NEWS_CATEGORIES.length; i++) {
    const cat = NEWS_CATEGORIES[i];
    const channelId = ch[`${cat}_news`];
    if (!channelId) continue;

    const stagger = i * 30_000; // stagger categories so they don't all hit at once
    const job = wrapJob(`news/${cat}`, logger, async () => {
      log(logger, `Fetching ${cat} news...`);
      const data = await client.fetchNews(cat, 10);
      const embeds = formatNewsEmbeds(data.articles as any, cat);
      for (const embed of embeds) {
        await poster.postEmbeds(channelId, [embed]);
      }
      log(logger, `Posted ${embeds.length} ${cat} news embeds (${data.elapsed_seconds}s)`);
    });

    // Initial fetch after stagger, then repeat on timer
    const initialTimer = setTimeout(() => {
      job();
      timers.push(setInterval(job, t.news));
    }, stagger);
    timers.push(initialTimer as unknown as NodeJS.Timeout);
  }

  // --- Threat Intel ---
  if (ch.threat_intelligence) {
    const job = wrapJob('threat-intel', logger, async () => {
      log(logger, 'Fetching threat intel...');
      const data = await client.fetchThreatIntel(5);
      const embeds = formatThreatIntelEmbeds(data.articles);
      for (const embed of embeds) {
        await poster.postEmbeds(ch.threat_intelligence, [embed]);
      }
      log(logger, `Posted ${embeds.length} threat intel articles`);
    });
    job(); // fire immediately
    timers.push(setInterval(job, t.threat_intel));
  }

  // --- AI Papers (with dedup + LLM digest) ---
  if (ch.ai_papers) {
    const postedPaperKeys = new Set<string>();
    const job = wrapJob('ai-papers', logger, async () => {
      log(logger, 'Fetching AI papers...');
      const data = await client.fetchPapers(2, ch.ai_papers);
      if (!data.papers.length) {
        log(logger, 'AI papers: no new papers');
        return;
      }
      const embeds = formatPaperEmbeds(data.papers);
      let posted = 0;
      for (let i = 0; i < embeds.length; i++) {
        const paper = data.papers[i];
        const dedupeKey = paper.dedupe_key || paper.url || paper.title;

        // Local dedup guard
        if (postedPaperKeys.has(dedupeKey)) {
          log(logger, `AI papers: skipping already-posted "${paper.title?.slice(0, 50)}"`);
          continue;
        }

        await poster.postEmbeds(ch.ai_papers, [embeds[i]]);
        posted++;

        // Mark posted in KB store so it won't be returned again
        try {
          await client.markPaperPosted(ch.ai_papers, dedupeKey, paper.document_id);
        } catch (e) {
          logError(logger, `AI papers: mark-posted failed: ${e}`);
        }
        postedPaperKeys.add(dedupeKey);
      }
      log(logger, `Posted ${posted} AI papers`);
    });
    job(); // fire immediately
    timers.push(setInterval(job, t.ai_papers));
  }

  // --- Udemy Deals ---
  if (ch.udemy_deals) {
    const postedDealTitles = new Set<string>();
    const job = wrapJob('deals', logger, async () => {
      log(logger, 'Fetching Udemy deals...');
      const data = await client.fetchDeals();
      let posted = 0;
      for (const deal of data.deals) {
        const key = (deal.title || '').trim().toLowerCase();
        if (!key || postedDealTitles.has(key)) continue;
        const embeds = formatDealsEmbeds([deal]);
        for (const embed of embeds) {
          await poster.postEmbeds(ch.udemy_deals, [embed]);
        }
        postedDealTitles.add(key);
        posted++;
      }
      log(logger, `Posted ${posted} new deal embeds (${postedDealTitles.size} total seen)`);
    });
    job(); // fire immediately
    timers.push(setInterval(job, t.deals));
  }

  // --- Short Squeeze ---
  if (ch.short_squeeze) {
    let lastSqueezeHash = '';
    const job = wrapJob('short-squeeze', logger, async () => {
      log(logger, 'Fetching short squeeze data...');
      const data = await client.fetchShortSqueeze();
      if (data.stocks.length > 0) {
        // Dedup: only post if the top stocks list changed
        const hash = data.stocks.map((s: any) => `${s.ticker}|${s.si_pct}`).join(',');
        if (hash === lastSqueezeHash) {
          log(logger, 'Short squeeze: data unchanged, skipping');
          return;
        }
        lastSqueezeHash = hash;
        const embed = formatShortSqueezeEmbed(data.stocks);
        await poster.postEmbeds(ch.short_squeeze, [embed]);
        log(logger, `Posted short squeeze (${data.stocks.length} stocks)`);
      } else {
        log(logger, 'Short squeeze: no data from scraper');
      }
    });
    job(); // fire immediately
    timers.push(setInterval(job, t.trades));
  }

  // --- Trending Crypto ---
  if (ch.cmc_trending) {
    const job = wrapJob('trending-crypto', logger, async () => {
      log(logger, 'Fetching trending crypto...');
      const data = await client.fetchTrendingCrypto();
      if (data.coins.length > 0) {
        const embed = formatTrendingCryptoEmbed(data.coins, data.history_7d);
        await poster.postEmbeds(ch.cmc_trending, [embed]);
        log(logger, `Posted trending crypto (${data.coins.length} coins)`);
      } else {
        log(logger, 'Trending crypto: no data');
      }
    });
    job(); // fire immediately
    timers.push(setInterval(job, t.trades));
  }

  // --- Jobs (one per job title config) ---
  if (config.jobs?.length) {
    const location = config.locations?.[0] ?? 'United States';
    for (let i = 0; i < config.jobs.length; i++) {
      const jobConfig = config.jobs[i];
      if (!jobConfig.channelId) continue;

      const stagger = i * 10_000;
      const job = wrapJob(`jobs/${jobConfig.title}`, logger, async () => {
        log(logger, `Fetching jobs: ${jobConfig.title}...`);
        const data = await client.fetchJobs(jobConfig.title, location, 15);
        const embeds = formatJobEmbeds(data.jobs, jobConfig.title);
        for (const embed of embeds) {
          await poster.postEmbeds(jobConfig.channelId, [embed]);
        }
        log(logger, `Posted ${embeds.length} job embeds for "${jobConfig.title}"`);
      });

      const initialTimer = setTimeout(() => {
        job();
        timers.push(setInterval(job, t.jobs));
      }, stagger);
      timers.push(initialTimer as unknown as NodeJS.Timeout);
    }
  }

  return timers;
}

// ---------------------------------------------------------------------------
// SSE Sniper connection
// ---------------------------------------------------------------------------

async function connectSniperStream(
  client: ScraperClient,
  poster: DiscordPoster,
  channelId: string,
  logger: Logger,
  abortSignal: AbortSignal,
): Promise<void> {
  const url = `${client.baseUrl}/api/v1/sniper/stream`;
  const headers: Record<string, string> = { Accept: 'text/event-stream' };
  if (client.apiKey) {
    headers['x-api-key'] = client.apiKey;
  }

  while (!abortSignal.aborted) {
    try {
      log(logger, 'Connecting to sniper SSE stream...');
      const res = await fetch(url, { headers, signal: abortSignal });

      if (!res.ok || !res.body) {
        logError(logger, `Sniper stream HTTP ${res.status}`);
        await sleep(30_000);
        continue;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!abortSignal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6)) as SniperEvent;
            // Skip tokens with no metadata — raw addresses are noise
            const hasName = Boolean(event.token_name?.trim());
            const hasSymbol = Boolean(event.token_symbol?.trim());
            if (!hasName && !hasSymbol) {
              log(logger, `Sniper: skipping token with no metadata (${event.token?.slice(0, 10)}...)`);
              continue;
            }
            const embed = formatSniperEmbed(event);
            await poster.postEmbeds(channelId, [embed]);
          } catch (e) {
            logError(logger, `Sniper parse error: ${e}`);
          }
        }
      }
    } catch (err: any) {
      if (abortSignal.aborted) return;
      logError(logger, `Sniper stream error: ${err.message}`);
      await sleep(30_000);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Extension Pack Factory
// ---------------------------------------------------------------------------

export function createExtensionPack(context: ExtensionPackContext): ExtensionPack {
  const options = (context.options ?? {}) as Record<string, unknown>;
  const feedsConfig = (options.feeds ?? options) as FeedsConfig;

  const scraperApiUrl = (feedsConfig.scraperApiUrl as string) || process.env.SCRAPER_API_URL || 'http://localhost:8420';
  const scraperApiKey = (feedsConfig.scraperApiKey as string) || context.getSecret?.('scraper.apiKey') || process.env.SCRAPER_API_KEY || '';
  // Use a dedicated news bot token for posting feeds (separate identity from the AI slash-command bot).
  // Falls back to DISCORD_BOT_TOKEN if no separate news token is configured.
  const botToken = (feedsConfig.botToken as string)
    || context.getSecret?.('discord.newsBotToken')
    || process.env.WUNDERBOT_NEWS_TOKEN
    || process.env.DISCORD_BOT_TOKEN
    || '';

  const client = new ScraperClient(scraperApiUrl, scraperApiKey);

  // Tools for LLM access
  const fetchNewsTool = new FetchNewsTool(client);
  const fetchDealsTool = new FetchDealsTool(client);
  const fetchTradesTool = new FetchTradesTool(client);

  // State for cleanup
  let intervalTimers: NodeJS.Timeout[] = [];
  let sniperAbort: AbortController | null = null;
  let presenceClient: Client | null = null;

  return {
    name: '@framers/agentos-ext-wunderbot-feeds',
    version: '1.0.0',
    descriptors: [
      { id: fetchNewsTool.name, kind: 'tool', priority: 50, payload: fetchNewsTool },
      { id: fetchDealsTool.name, kind: 'tool', priority: 50, payload: fetchDealsTool },
      { id: fetchTradesTool.name, kind: 'tool', priority: 50, payload: fetchTradesTool },
    ],

    onActivate: async (lc: ExtensionLifecycleContext) => {
      const logger = (lc.logger as Logger) ?? noopLogger;

      if (!botToken) {
        logger.warn?.('[wunderbot-feeds] No WUNDERBOT_NEWS_TOKEN or DISCORD_BOT_TOKEN — cron posting disabled (tools still available)');
        return;
      }
      if (!feedsConfig.channels) {
        logger.warn?.('[wunderbot-feeds] No channel config — cron posting disabled');
        return;
      }

      const poster = new DiscordPoster(botToken);

      log(logger, `Activating feeds → ${scraperApiUrl}`);

      // Register cron jobs
      intervalTimers = registerFeedJobs(client, poster, feedsConfig, logger);
      log(logger, `Registered ${intervalTimers.length} feed timers`);

      // Sniper SSE stream
      if (feedsConfig.channels.uniswap_sniper) {
        sniperAbort = new AbortController();
        connectSniperStream(client, poster, feedsConfig.channels.uniswap_sniper, logger, sniperAbort.signal);
        log(logger, 'Sniper SSE stream started');
      }

      // Post startup debug message
      if (feedsConfig.channels.debug) {
        await poster.postDebug(
          feedsConfig.channels.debug,
          `Wunderbot Feeds activated — ${intervalTimers.length} timers, scraper at \`${scraperApiUrl}\``,
        );
      }

      // Lightweight gateway connection so the news bot appears "online" in Discord.
      // Only needs Guilds intent — no message handling.
      try {
        presenceClient = new Client({
          intents: [GatewayIntentBits.Guilds],
          presence: {
            status: 'online',
            activities: [{ name: 'Delivering news', type: ActivityType.Custom }],
          },
        });
        await presenceClient.login(botToken);
        log(logger, 'News bot presence: online');
      } catch (err: any) {
        logError(logger, `News bot presence failed: ${err.message}`);
        presenceClient = null;
      }
    },

    onDeactivate: async (lc: ExtensionLifecycleContext) => {
      const logger = (lc.logger as Logger) ?? noopLogger;
      log(logger, 'Deactivating feeds...');

      // Clear all interval timers
      for (const timer of intervalTimers) {
        clearInterval(timer);
        clearTimeout(timer);
      }
      intervalTimers = [];

      // Abort sniper stream
      if (sniperAbort) {
        sniperAbort.abort();
        sniperAbort = null;
      }

      // Disconnect presence client
      if (presenceClient) {
        presenceClient.destroy();
        presenceClient = null;
      }

      log(logger, 'Feeds deactivated');
    },
  };
}

export default createExtensionPack;
