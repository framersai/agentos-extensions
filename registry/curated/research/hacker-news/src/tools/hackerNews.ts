/**
 * Hacker News Tool — fetch and filter HN stories via Algolia API.
 *
 * Categories are inferred from title/URL keywords rather than hardcoded,
 * supporting filtering by topic, time range, sort order, and minimum score.
 * No API key required — uses the public Algolia HN Search API.
 */

import { createHash } from 'crypto';
import type { ITool, ToolExecutionContext, ToolExecutionResult, JSONSchemaObject } from '@framers/agentos';

// ---------------------------------------------------------------------------
// Category inference — keyword → category mapping
// ---------------------------------------------------------------------------

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  ai: ['ai', 'machine learning', 'ml', 'llm', 'gpt', 'claude', 'neural', 'transformer', 'deep learning', 'diffusion', 'openai', 'anthropic', 'gemini', 'model', 'inference', 'training', 'fine-tune', 'rag', 'embedding', 'agent'],
  programming: ['rust', 'python', 'javascript', 'typescript', 'golang', 'java', 'c++', 'compiler', 'parser', 'regex', 'algorithm', 'data structure', 'api', 'sdk', 'framework', 'library', 'package', 'npm', 'crate', 'pip'],
  security: ['security', 'vulnerability', 'cve', 'exploit', 'hack', 'breach', 'encryption', 'zero-day', 'malware', 'ransomware', 'phishing', 'auth', 'oauth', 'backdoor'],
  startups: ['startup', 'funding', 'yc', 'seed', 'series a', 'valuation', 'acquisition', 'ipo', 'founder', 'venture', 'pivot', 'launch'],
  infrastructure: ['kubernetes', 'docker', 'aws', 'cloud', 'server', 'database', 'postgres', 'redis', 'kafka', 'deploy', 'ci/cd', 'terraform', 'devops', 'linux', 'nginx', 'cdn'],
  web: ['browser', 'css', 'html', 'react', 'vue', 'svelte', 'nextjs', 'frontend', 'web', 'dom', 'wasm', 'webgl', 'pwa'],
  hardware: ['chip', 'cpu', 'gpu', 'arm', 'risc-v', 'fpga', 'silicon', 'semiconductor', 'asic', 'circuit', 'embedded', 'iot', 'raspberry pi', 'arduino'],
  science: ['research', 'paper', 'study', 'physics', 'biology', 'chemistry', 'space', 'nasa', 'quantum', 'genome', 'neuroscience', 'arxiv', 'peer review'],
  crypto: ['bitcoin', 'ethereum', 'blockchain', 'crypto', 'defi', 'nft', 'solana', 'web3', 'token', 'wallet'],
  policy: ['regulation', 'gdpr', 'copyright', 'patent', 'antitrust', 'fcc', 'eu', 'legislation', 'congress', 'court', 'ruling', 'ban', 'censorship', 'privacy'],
  career: ['hiring', 'layoff', 'remote', 'salary', 'interview', 'resume', 'job', 'career', 'engineer', 'manager', 'burnout', 'culture'],
  open_source: ['open source', 'oss', 'mit license', 'gpl', 'apache', 'github', 'gitlab', 'fork', 'contributor', 'maintainer', 'bsd'],
  design: ['design', 'ux', 'ui', 'typography', 'figma', 'color', 'accessibility', 'a11y', 'responsive', 'animation'],
  business: ['revenue', 'profit', 'market', 'growth', 'enterprise', 'saas', 'pricing', 'customer', 'churn', 'b2b', 'b2c', 'monetize'],
  gaming: ['game', 'gaming', 'unity', 'unreal', 'godot', 'steam', 'console', 'vr', 'ar', 'metaverse', '3d'],
  mathematics: ['math', 'proof', 'theorem', 'algebra', 'geometry', 'topology', 'statistics', 'probability', 'optimization', 'graph theory'],
};

/**
 * Infer categories from title and URL by matching against keyword dictionary.
 * Returns all matching categories sorted by match count (strongest first).
 */
function inferCategories(title: string, url: string): string[] {
  const text = `${title} ${url}`.toLowerCase();
  const scores: [string, number][] = [];

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const matchCount = keywords.filter(kw => text.includes(kw)).length;
    if (matchCount > 0) scores.push([category, matchCount]);
  }

  scores.sort((a, b) => b[1] - a[1]);
  const matched = scores.map(([cat]) => cat);

  return matched.length > 0 ? matched : ['general'];
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HackerNewsInput {
  /** Search query (empty = front page). */
  query?: string;
  /** Filter results to specific categories. */
  categories?: string[];
  /** Sort order. */
  sortBy?: 'relevance' | 'date' | 'points';
  /** Minimum point threshold. */
  minPoints?: number;
  /** Time range filter. */
  timeRange?: 'day' | 'week' | 'month' | 'year';
  /** Maximum results to return. */
  maxResults?: number;
}

export interface HackerNewsStory {
  title: string;
  url: string;
  points: number;
  author: string;
  commentCount: number;
  hnUrl: string;
  categories: string[];
  publishedAt: string;
  contentHash: string;
}

export interface HackerNewsOutput {
  query: string;
  stories: HackerNewsStory[];
  totalFound: number;
  categoriesFound: string[];
}

// ---------------------------------------------------------------------------
// Tool implementation
// ---------------------------------------------------------------------------

export class HackerNewsTool implements ITool<HackerNewsInput, HackerNewsOutput> {
  readonly id = 'hacker-news-v1';
  readonly name = 'hacker_news';
  readonly displayName = 'Hacker News';
  readonly description =
    'Fetch and search Hacker News stories. Supports filtering by category, time range, ' +
    'minimum points, and search query. Categories are inferred from content — not limited ' +
    'to a fixed set. No API key required.';
  readonly category = 'research';
  readonly version = '1.0.0';
  readonly hasSideEffects = false;

  readonly inputSchema: JSONSchemaObject = {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query. Leave empty for front page stories.' },
      categories: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by inferred categories: ai, programming, security, startups, infrastructure, web, hardware, science, crypto, policy, career, open_source, design, business, gaming, mathematics, general.',
      },
      sortBy: { type: 'string', enum: ['relevance', 'date', 'points'], default: 'points' },
      minPoints: { type: 'integer', minimum: 0, default: 0, description: 'Minimum upvote threshold.' },
      timeRange: { type: 'string', enum: ['day', 'week', 'month', 'year'], description: 'Restrict results to a time window.' },
      maxResults: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
    },
    required: [],
  };

  readonly requiredCapabilities = ['capability:web_search'];

  async execute(args: HackerNewsInput, _context: ToolExecutionContext): Promise<ToolExecutionResult<HackerNewsOutput>> {
    try {
      const maxResults = args.maxResults ?? 10;
      const query = args.query?.trim() ?? '';

      // Build Algolia API URL
      let url: string;
      if (query) {
        const params = new URLSearchParams({
          query,
          hitsPerPage: String(Math.min(maxResults * 3, 100)), // over-fetch for filtering
          tags: 'story',
        });
        if (args.timeRange) {
          const now = Math.floor(Date.now() / 1000);
          const ranges: Record<string, number> = { day: 86400, week: 604800, month: 2592000, year: 31536000 };
          params.set('numericFilters', `created_at_i>${now - (ranges[args.timeRange] ?? 604800)}`);
        }
        url = `https://hn.algolia.com/api/v1/search?${params}`;
      } else {
        url = `https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=${Math.min(maxResults * 2, 100)}`;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      let data: any;
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) return { success: false, error: `HN API returned ${res.status}` };
        data = await res.json();
      } finally {
        clearTimeout(timeout);
      }

      if (!data.hits?.length) {
        return { success: true, output: { query, stories: [], totalFound: 0, categoriesFound: [] } };
      }

      // Map and enrich with categories
      let stories: HackerNewsStory[] = data.hits
        .filter((h: any) => h.title)
        .map((hit: any) => {
          const storyUrl = hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`;
          return {
            title: hit.title,
            url: storyUrl,
            points: hit.points ?? 0,
            author: hit.author ?? 'unknown',
            commentCount: hit.num_comments ?? 0,
            hnUrl: `https://news.ycombinator.com/item?id=${hit.objectID}`,
            categories: inferCategories(hit.title, storyUrl),
            publishedAt: hit.created_at ?? new Date().toISOString(),
            contentHash: createHash('sha256').update(`${hit.title}::${storyUrl}`).digest('hex'),
          };
        });

      // Filter by minimum points
      if (args.minPoints && args.minPoints > 0) {
        stories = stories.filter(s => s.points >= args.minPoints!);
      }

      // Filter by categories
      if (args.categories?.length) {
        const targetCats = new Set(args.categories.map(c => c.toLowerCase()));
        stories = stories.filter(s => s.categories.some(c => targetCats.has(c)));
      }

      // Sort
      if (args.sortBy === 'date') {
        stories.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
      } else if (args.sortBy === 'points' || !args.sortBy) {
        stories.sort((a, b) => b.points - a.points);
      }
      // 'relevance' — keep Algolia's ordering

      // Trim to maxResults
      stories = stories.slice(0, maxResults);

      // Collect all categories found
      const categoriesFound = [...new Set(stories.flatMap(s => s.categories))].sort();

      return {
        success: true,
        output: { query, stories, totalFound: stories.length, categoriesFound },
      };
    } catch (err: any) {
      return { success: false, error: `Hacker News fetch failed: ${err.message}` };
    }
  }
}
