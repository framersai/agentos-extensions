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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

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

/** Scrape intervals — how often to CHECK for new content (not how often to post). */
const DEFAULT_TIMERS = {
  news: 14_400_000,        // 4h — check for news, LLM decides if it's worth posting
  threat_intel: 14_400_000,
  ai_papers: 14_400_000,
  deals: 43_200_000,       // 12h
  trades: 43_200_000,
  jobs: 86_400_000,        // 24h
};

// ---------------------------------------------------------------------------
// LLM Post Judge — decides if an article is worth posting
// ---------------------------------------------------------------------------

/** Recent post history for LLM context. */
interface PostRecord {
  title: string;
  category: string;
  postedAt: number; // epoch ms
}

const recentPosts: PostRecord[] = [];
const MAX_POST_HISTORY = 50;
const CATEGORY_DAILY_POST_LIMIT = 2;
const MAX_APPROVED_ARTICLES_PER_CYCLE = 2;
const CATEGORY_DAILY_WINDOW_MS = 24 * 3600_000;
const POST_HISTORY_MAX_AGE_MS = 7 * 24 * 3600_000;
let recentPostsHydrated = false;

function resolvePostHistoryFile(): string {
  return process.env.WUNDERBOT_FEEDS_STATE_FILE || join(homedir(), '.wunderland', 'wunderbot-feeds-post-history.json');
}

function pruneRecentPosts(now = Date.now()): void {
  for (let i = recentPosts.length - 1; i >= 0; i--) {
    const post = recentPosts[i];
    if (!post || !Number.isFinite(post.postedAt) || now - post.postedAt > POST_HISTORY_MAX_AGE_MS) {
      recentPosts.splice(i, 1);
    }
  }

  if (recentPosts.length > MAX_POST_HISTORY) {
    recentPosts.splice(0, recentPosts.length - MAX_POST_HISTORY);
  }
}

function hydrateRecentPosts(): void {
  if (recentPostsHydrated) return;
  recentPostsHydrated = true;

  try {
    const file = resolvePostHistoryFile();
    if (!existsSync(file)) return;

    const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown;
    if (!Array.isArray(parsed)) return;

    recentPosts.length = 0;
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue;
      const title = String((entry as any).title ?? '').trim();
      const category = String((entry as any).category ?? '').trim();
      const postedAt = Number((entry as any).postedAt);
      if (!title || !category || !Number.isFinite(postedAt)) continue;
      recentPosts.push({ title, category, postedAt });
    }
    pruneRecentPosts();
  } catch (error: any) {
    console.warn(`[wunderbot-feeds] Failed to load post history: ${error?.message ?? error}`);
  }
}

function persistRecentPosts(): void {
  hydrateRecentPosts();
  pruneRecentPosts();

  try {
    const file = resolvePostHistoryFile();
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(recentPosts, null, 2));
  } catch (error: any) {
    console.warn(`[wunderbot-feeds] Failed to persist post history: ${error?.message ?? error}`);
  }
}

function addPostRecord(title: string, category: string, postedAt = Date.now()): void {
  hydrateRecentPosts();
  recentPosts.push({ title, category, postedAt });
  pruneRecentPosts(postedAt);
  persistRecentPosts();
}

function getRecentPostsSummary(): string {
  hydrateRecentPosts();
  const now = Date.now();
  const last48h = recentPosts.filter(p => now - p.postedAt < 48 * 3600_000);
  if (last48h.length === 0) return 'No posts in the last 48 hours.';

  const lines = last48h.map(p => {
    const hoursAgo = Math.round((now - p.postedAt) / 3600_000);
    return `- [${p.category}] "${p.title}" (${hoursAgo}h ago)`;
  });
  return `Posts in the last 48 hours (${last48h.length} total):\n${lines.join('\n')}`;
}

function getRecentCategoryPostCount(category: string, windowMs = CATEGORY_DAILY_WINDOW_MS): number {
  hydrateRecentPosts();
  const now = Date.now();
  return recentPosts.filter((post) => post.category === category && now - post.postedAt < windowMs).length;
}

function getRemainingDailySlots(category: string): number {
  const used = getRecentCategoryPostCount(category);
  return Math.max(0, CATEGORY_DAILY_POST_LIMIT - used);
}

function fallbackSelection(
  articles: Array<{ title: string; summary?: string; url?: string }>,
  maxSelections: number,
): boolean[] {
  const fallbackCount = Math.min(Math.max(0, maxSelections), 1);
  return articles.map((_, i) => i < fallbackCount);
}

/**
 * Ask an LLM whether articles are worth posting to the Discord community.
 * Returns an array of booleans (one per article) — true = post it.
 */
async function judgeArticles(
  articles: Array<{ title: string; summary?: string; url?: string }>,
  category: string,
  logger: Logger,
): Promise<boolean[]> {
  const remainingSlots = Math.min(MAX_APPROVED_ARTICLES_PER_CYCLE, getRemainingDailySlots(category));
  if (remainingSlots <= 0) {
    log(logger, `${category}: daily cap reached, skipping judge`);
    return articles.map(() => false);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // No API key — fall back to posting the first article only
    log(logger, 'No OPENAI_API_KEY — skipping LLM judge, posting first article only');
    return fallbackSelection(articles, remainingSlots);
  }

  const recentSummary = getRecentPostsSummary();

  const articleList = articles.map((a, i) =>
    `${i + 1}. "${a.title}"${a.summary ? `\n   Summary: ${a.summary.slice(0, 200)}` : ''}`
  ).join('\n');

  const prompt = `You are a content curator for a tech Discord community (Rabbit Hole Inc). Your job is to decide which articles are worth posting. The community is sophisticated — engineers, founders, security researchers, crypto traders.

RULES:
- Only approve articles that are genuinely interesting, surprising, or important
- Reject anything that's clickbait, mundane, or repeats topics already posted recently
- Max 1-2 articles per category per day. If we already posted similar content today, reject everything
- Right now you may approve AT MOST ${remainingSlots} article(s) for this category
- Breaking news, novel discoveries, major industry shifts = always post
- Generic "X company did Y" or rehashed takes = skip
- Prefer stories that will still feel discussion-worthy tomorrow or next week, not just this hour
- Be VERY selective. When in doubt, don't post. Quality over quantity.

RECENT POST HISTORY:
${recentSummary}

CANDIDATE ARTICLES (category: ${category}):
${articleList}

Respond with ONLY JSON in this exact shape:
{"approved_indexes":[0,2]}

Rules for approved_indexes:
- use 0-based indexes from the numbered list above
- keep them in ranked order, best first
- include no more than ${remainingSlots} indexes
- if nothing is worth posting, return {"approved_indexes":[]}

No markdown. No explanation. JSON only.`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 100,
        temperature: 0.15,
      }),
    });

    if (!res.ok) {
      log(logger, `LLM judge API error ${res.status} — falling back to first article only`);
      return fallbackSelection(articles, remainingSlots);
    }

    const data = await res.json() as any;
    const content = data?.choices?.[0]?.message?.content?.trim() ?? '';

    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      log(logger, `LLM judge returned unparseable response: ${content.slice(0, 100)}`);
      return fallbackSelection(articles, remainingSlots);
    }

    const parsed = JSON.parse(match[0]) as { approved_indexes?: unknown };
    const rawIndexes = Array.isArray(parsed?.approved_indexes) ? parsed.approved_indexes : [];
    const approvedIndexes = Array.from(new Set(
      rawIndexes
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value >= 0 && value < articles.length),
    )).slice(0, remainingSlots);

    return articles.map((_, i) => approvedIndexes.includes(i));
  } catch (err: any) {
    log(logger, `LLM judge error: ${err.message} — falling back to first article only`);
    return fallbackSelection(articles, remainingSlots);
  }
}

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

  // --- News (6 categories, LLM-judged posting) ---
  const newsChannels = NEWS_CATEGORIES
    .map((cat) => ({ cat, channelId: ch[`${cat}_news`] }))
    .filter((c) => c.channelId);

  if (newsChannels.length > 0) {
    const sequentialNewsJob = wrapJob('news', logger, async () => {
      for (const { cat, channelId } of newsChannels) {
        try {
          log(logger, `Fetching ${cat} news...`);
          const data = await client.fetchNews(cat, 5);
          const articles = data.articles as any[];
          if (!articles.length) {
            log(logger, `${cat} news: no articles`);
            continue;
          }

          const remainingSlots = Math.min(MAX_APPROVED_ARTICLES_PER_CYCLE, getRemainingDailySlots(cat));
          if (remainingSlots <= 0) {
            log(logger, `${cat} news: daily cap already reached, skipping`);
            continue;
          }

          // LLM judges which articles are worth posting
          const decisions = await judgeArticles(
            articles.map((a: any) => ({ title: a.title, summary: a.summary, url: a.url })),
            cat,
            logger,
          );

          const approved = articles.filter((_: any, i: number) => decisions[i]).slice(0, remainingSlots);
          log(logger, `${cat} news: LLM approved ${approved.length}/${articles.length} articles`);

          if (approved.length === 0) continue;

          const embeds = formatNewsEmbeds(approved, cat);
          for (let i = 0; i < embeds.length; i++) {
            await poster.postEmbeds(channelId, [embeds[i]]);
            addPostRecord(approved[i]?.title ?? 'unknown', cat);
          }
          log(logger, `Posted ${embeds.length} ${cat} news embeds (${data.elapsed_seconds}s)`);
        } catch (err) {
          logError(logger, `news/${cat} failed: ${err}`);
        }
      }
    });

    // Initial fetch after 30s (let fast feeds go first), then repeat on timer
    const initialTimer = setTimeout(() => {
      sequentialNewsJob();
      timers.push(setInterval(sequentialNewsJob, t.news));
    }, 30_000);
    timers.push(initialTimer as unknown as NodeJS.Timeout);
  }

  // --- Threat Intel (RSS-based, LLM-judged) ---
  if (ch.threat_intelligence) {
    const job = wrapJob('threat-intel', logger, async () => {
      log(logger, 'Fetching threat intel...');
      const data = await client.fetchThreatIntel(5);
      if (!data.articles.length) {
        log(logger, 'Threat intel: no articles');
        return;
      }

      const remainingSlots = Math.min(MAX_APPROVED_ARTICLES_PER_CYCLE, getRemainingDailySlots('threat-intel'));
      if (remainingSlots <= 0) {
        log(logger, 'Threat intel: daily cap already reached, skipping');
        return;
      }

      const decisions = await judgeArticles(
        data.articles.map((a: any) => ({ title: a.title, summary: a.summary, url: a.url })),
        'threat-intel',
        logger,
      );

      const approved = data.articles.filter((_: any, i: number) => decisions[i]).slice(0, remainingSlots);
      log(logger, `Threat intel: LLM approved ${approved.length}/${data.articles.length}`);

      if (approved.length === 0) return;
      const embeds = formatThreatIntelEmbeds(approved);
      for (let i = 0; i < embeds.length; i++) {
        await poster.postEmbeds(ch.threat_intelligence, [embeds[i]]);
        addPostRecord(approved[i]?.title ?? 'unknown', 'threat-intel');
      }
      log(logger, `Posted ${embeds.length} threat intel articles`);
    });
    job(); // fire immediately — RSS only, no Chrome
    timers.push(setInterval(job, t.threat_intel));
  }

  // --- AI Papers (with server-side dedup + LLM digest) ---
  if (ch.ai_papers) {
    const postedPaperKeys = new Set<string>();
    const job = wrapJob('ai-papers', logger, async () => {
      log(logger, 'Fetching AI papers...');
      const data = await client.fetchPapers(2, ch.ai_papers);
      if (!data.papers.length) {
        log(logger, 'AI papers: no new papers');
        return;
      }

      let posted = 0;
      for (const paper of data.papers) {
        const dedupeKey = paper.dedupe_key || paper.url || paper.title;

        // Local dedup guard (survives within a process lifetime)
        if (postedPaperKeys.has(dedupeKey)) {
          log(logger, `AI papers: skipping already-posted "${paper.title?.slice(0, 50)}"`);
          continue;
        }

        // Skip papers without a proper digest — don't post raw abstracts
        if (!paper.digest || paper.digest.trim().length < 50) {
          log(logger, `AI papers: skipping "${paper.title?.slice(0, 50)}" — no digest (OpenAI quota may be exhausted)`);
          // Still mark as posted so we don't retry every cycle
          try {
            await client.markPaperPosted(ch.ai_papers, dedupeKey, paper.document_id);
          } catch { /* non-critical */ }
          postedPaperKeys.add(dedupeKey);
          continue;
        }

        const embeds = formatPaperEmbeds([paper]);
        if (embeds.length > 0) {
          await poster.postEmbeds(ch.ai_papers, [embeds[0]]);
          posted++;
        }

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

  // --- Udemy Deals (uses Selenium — stagger 45 min after startup to avoid overlapping with news) ---
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
    const dealsInitial = setTimeout(() => {
      job();
      timers.push(setInterval(job, t.deals));
    }, 45 * 60_000); // 45 min delay — let news finish first
    timers.push(dealsInitial as unknown as NodeJS.Timeout);
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

  // --- Jobs (run sequentially, staggered 60 min after startup) ---
  if (config.jobs?.length) {
    const location = config.locations?.[0] ?? 'United States';
    const jobConfigs = config.jobs.filter((j: any) => j.channelId);

    if (jobConfigs.length > 0) {
      const sequentialJobsJob = wrapJob('jobs', logger, async () => {
        for (const jobConfig of jobConfigs) {
          try {
            log(logger, `Fetching jobs: ${jobConfig.title}...`);
            const data = await client.fetchJobs(jobConfig.title, location, 15);
            const embeds = formatJobEmbeds(data.jobs, jobConfig.title);
            for (const embed of embeds) {
              await poster.postEmbeds(jobConfig.channelId, [embed]);
            }
            log(logger, `Posted ${embeds.length} job embeds for "${jobConfig.title}"`);
          } catch (err) {
            logError(logger, `jobs/${jobConfig.title} failed: ${err}`);
          }
        }
      });

      const jobsInitial = setTimeout(() => {
        sequentialJobsJob();
        timers.push(setInterval(sequentialJobsJob, t.jobs));
      }, 60 * 60_000); // 60 min delay — let news + deals finish first
      timers.push(jobsInitial as unknown as NodeJS.Timeout);
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
      hydrateRecentPosts();

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

export const __testing = {
  addPostRecord,
  getRecentPostsSummary,
  getRecentCategoryPostCount,
  getRemainingDailySlots,
  judgeArticles,
  hydrateRecentPosts,
  persistRecentPosts,
  resolvePostHistoryFile,
  resetRecentPosts(): void {
    recentPosts.length = 0;
    recentPostsHydrated = false;
  },
};

export default createExtensionPack;
