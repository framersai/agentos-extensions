/**
 * @fileoverview TypeScript interfaces for the Python Scraper API responses.
 */

// ---------------------------------------------------------------------------
// News
// ---------------------------------------------------------------------------

export interface NewsArticle {
  type?: 'single';
  date: string;
  title: string;
  url: string;
  summary: string;
  image_url: string;
}

export interface NewsSource {
  title: string;
  url: string;
  domain: string;
  date: string;
}

export interface NewsCluster {
  type: 'cluster';
  title: string;
  summary: string;
  sources: NewsSource[];
  image_url: string;
}

/** Union type for items in the clustered news response. */
export type NewsItem = NewsArticle | NewsCluster;

export interface NewsResponse {
  category: string;
  articles: NewsItem[];
  elapsed_seconds: number;
}

// ---------------------------------------------------------------------------
// Deals
// ---------------------------------------------------------------------------

export interface UdemyDeal {
  date: string;
  title: string;
  link: string;
  coupon: string;
  enroll_url: string;
}

export interface DealsResponse {
  deals: UdemyDeal[];
  elapsed_seconds: number;
}

// ---------------------------------------------------------------------------
// Trades
// ---------------------------------------------------------------------------

export interface ShortSqueezeStock {
  ticker: string;
  name: string;
  exchange: string;
  si_pct: string;
  float_shares: string;
  outstanding: string;
  industry: string;
}

export interface ShortSqueezeResponse {
  stocks: ShortSqueezeStock[];
  elapsed_seconds: number;
}

export interface TrendingCoin {
  rank: number;
  name: string;
  symbol: string;
  price: string;
  change_24h: string;
  market_cap: string;
  volume: string;
  url: string;
}

export interface TrendingCryptoHistory {
  [symbol: string]: {
    rank: number;
    price_usd: number;
    change_24h?: number;
    scraped_at?: string;
  };
}

export interface TrendingCryptoResponse {
  coins: TrendingCoin[];
  history_7d: TrendingCryptoHistory;
  elapsed_seconds: number;
}

// ---------------------------------------------------------------------------
// Threat Intelligence
// ---------------------------------------------------------------------------

export interface ThreatIntelArticle {
  title: string;
  url: string;
  summary: string;
  source: string;
  date: string;
  image_url: string;
  color?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
}

export interface ThreatIntelResponse {
  articles: ThreatIntelArticle[];
  elapsed_seconds: number;
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export interface JobListing {
  company: string;
  title: string;
  url: string;
  logo: string;
  timestamp: number;
  description: string;
  summary: string;
  is_remote: boolean;
  location: string;
  salary: string;
}

export interface JobsResponse {
  search_title: string;
  search_location: string;
  jobs: JobListing[];
  elapsed_seconds: number;
}

// ---------------------------------------------------------------------------
// Papers
// ---------------------------------------------------------------------------

export interface Paper {
  title: string;
  url: string;
  abstract: string;
  source: string;
  arxiv_id: string;
  document_id?: number;
  dedupe_key?: string;
  /** LLM-generated digest (TL;DR + Key Contributions + Why It Matters). */
  digest?: string;
}

export interface PapersResponse {
  papers: Paper[];
  elapsed_seconds: number;
}

// ---------------------------------------------------------------------------
// Sniper
// ---------------------------------------------------------------------------

export interface SniperStatus {
  available: boolean;
  initialized: boolean;
  last_block: number | null;
  daily_requests: number;
}

export interface SniperEvent {
  token: string;
  pair: string;
  token0: string;
  token1: string;
  time: string;
  etherscan_token: string;
  etherscan_pair: string;
  honeypot_url: string;
  honeypot: boolean;
  contract_verified?: boolean;
  token_name: string;
  token_symbol: string;
}

// ---------------------------------------------------------------------------
// Discord Embed
// ---------------------------------------------------------------------------

export interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  timestamp?: string;
  author?: { name: string; icon_url?: string; url?: string };
  footer?: { text: string; icon_url?: string };
  thumbnail?: { url: string };
  image?: { url: string };
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
}

// ---------------------------------------------------------------------------
// Feed config
// ---------------------------------------------------------------------------

export interface FeedChannels {
  us_news: string;
  world_news: string;
  tech_news: string;
  finance_news: string;
  science_news: string;
  media_news: string;
  threat_intelligence: string;
  ai_papers: string;
  udemy_deals: string;
  short_squeeze: string;
  cmc_trending: string;
  uniswap_sniper: string;
  debug: string;
  [key: string]: string;
}

export interface JobConfig {
  title: string;
  channelId: string;
}

export interface FeedTimers {
  news: number;
  threat_intel: number;
  ai_papers: number;
  deals: number;
  trades: number;
  jobs: number;
}

export interface FeedsConfig {
  scraperApiUrl: string;
  scraperApiKey?: string;
  /** Dedicated bot token for posting feeds (separate identity from the AI bot). */
  botToken?: string;
  channels: FeedChannels;
  jobs: JobConfig[];
  timers: FeedTimers;
  locations?: string[];
}
