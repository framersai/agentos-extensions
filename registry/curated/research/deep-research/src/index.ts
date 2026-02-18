/**
 * @fileoverview Deep Research Extension for AgentOS.
 *
 * Provides 5 tools for multi-source investigation, academic search,
 * content scraping, aggregate search, and trend discovery.
 *
 * @module @framers/agentos-ext-deep-research
 */

import { ResearchService } from './ResearchService.js';
import type { ResearchConfig } from './ResearchService.js';
import { ResearchInvestigateTool } from './tools/investigate.js';
import { ResearchAcademicTool } from './tools/academic.js';
import { ResearchScrapeTool } from './tools/scrape.js';
import { ResearchAggregateTool } from './tools/aggregate.js';
import { ResearchTrendingTool } from './tools/trending.js';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface DeepResearchOptions {
  serperApiKey?: string;
  braveApiKey?: string;
  serpApiKey?: string;
  secrets?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Secret Resolution
// ---------------------------------------------------------------------------

function resolveConfig(opts: DeepResearchOptions, secrets: Record<string, string>): ResearchConfig {
  return {
    serperApiKey: opts.serperApiKey ?? secrets['serper.apiKey'] ?? process.env.SERPER_API_KEY ?? '',
    braveApiKey: opts.braveApiKey ?? secrets['brave.apiKey'] ?? process.env.BRAVE_API_KEY,
    serpApiKey: opts.serpApiKey ?? secrets['serpapi.apiKey'] ?? process.env.SERPAPI_API_KEY,
  };
}

// ---------------------------------------------------------------------------
// Extension Context (matches AgentOS extension protocol)
// ---------------------------------------------------------------------------

export interface ExtensionContext {
  options?: Record<string, unknown>;
  secrets?: Record<string, string>;
}

export interface ExtensionPack {
  name: string;
  version: string;
  descriptors: Array<{ id: string; kind: string; priority?: number; payload: unknown }>;
  onActivate?: () => Promise<void>;
  onDeactivate?: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createExtensionPack(context: ExtensionContext): ExtensionPack {
  const opts = (context.options ?? {}) as DeepResearchOptions;
  const secrets = opts.secrets ?? context.secrets ?? {};
  const config = resolveConfig(opts, secrets);

  const service = new ResearchService(config);

  const investigateTool = new ResearchInvestigateTool(service);
  const academicTool = new ResearchAcademicTool(service);
  const scrapeTool = new ResearchScrapeTool(service);
  const aggregateTool = new ResearchAggregateTool(service);
  const trendingTool = new ResearchTrendingTool(service);

  return {
    name: '@framers/agentos-ext-deep-research',
    version: '0.1.0',
    descriptors: [
      { id: 'researchInvestigate', kind: 'tool', priority: 50, payload: investigateTool },
      { id: 'researchAcademic', kind: 'tool', priority: 50, payload: academicTool },
      { id: 'researchScrape', kind: 'tool', priority: 50, payload: scrapeTool },
      { id: 'researchAggregate', kind: 'tool', priority: 50, payload: aggregateTool },
      { id: 'researchTrending', kind: 'tool', priority: 50, payload: trendingTool },
    ],
    onActivate: async () => {
      await service.initialize();
    },
    onDeactivate: async () => {
      await service.shutdown();
    },
  };
}

// ---------------------------------------------------------------------------
// Public exports
// ---------------------------------------------------------------------------

export { ResearchService } from './ResearchService.js';
export type {
  ResearchConfig,
  InvestigationResult,
  AcademicResult,
  ScrapeResult,
  AggregateResult,
  TrendingResult,
} from './ResearchService.js';
export { ResearchInvestigateTool } from './tools/investigate.js';
export { ResearchAcademicTool } from './tools/academic.js';
export { ResearchScrapeTool } from './tools/scrape.js';
export { ResearchAggregateTool } from './tools/aggregate.js';
export { ResearchTrendingTool } from './tools/trending.js';
