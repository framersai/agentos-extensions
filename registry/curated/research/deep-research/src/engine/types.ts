// @ts-nocheck
/**
 * @fileoverview Type definitions for the Deep Research Engine.
 */

// ---------------------------------------------------------------------------
// Depth & Budget
// ---------------------------------------------------------------------------

export type ResearchDepth = 'quick' | 'moderate' | 'deep';

export interface ResearchBudget {
  maxSearchQueries: number;
  maxPageExtractions: number;
  maxLLMCalls: number;
  maxTotalTimeMs: number;
  maxOutputTokens: number;
}

export const BUDGET_DEFAULTS: Record<ResearchDepth, ResearchBudget> = {
  quick:    { maxSearchQueries: 10, maxPageExtractions: 5,  maxLLMCalls: 3,  maxTotalTimeMs: 30_000,  maxOutputTokens: 2_000 },
  moderate: { maxSearchQueries: 20, maxPageExtractions: 10, maxLLMCalls: 8,  maxTotalTimeMs: 120_000, maxOutputTokens: 8_000 },
  deep:     { maxSearchQueries: 50, maxPageExtractions: 25, maxLLMCalls: 20, maxTotalTimeMs: 540_000, maxOutputTokens: 20_000 },
};

export const ITERATION_DEFAULTS: Record<ResearchDepth, number> = {
  quick: 1,
  moderate: 3,
  deep: 6,
};

// ---------------------------------------------------------------------------
// Research Tree
// ---------------------------------------------------------------------------

export interface Finding {
  claim: string;
  evidence: string;
  sources: string[];
  confidence: number;
  category: string;
}

export interface ExtractedContent {
  url: string;
  title: string;
  content: string;
  wordCount: number;
  type: 'web' | 'pdf' | 'youtube' | 'wikipedia' | 'academic';
  extractedAt: string;
}

export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
}

export type NodeStatus = 'pending' | 'searching' | 'extracting' | 'complete' | 'failed';

export interface ResearchNode {
  id: string;
  query: string;
  parentId: string | null;
  depth: number;
  status: NodeStatus;
  searchResults: SearchResultItem[];
  extractedContent: ExtractedContent[];
  findings: Finding[];
  subQueries: string[];
  children: string[];
  confidenceScore: number;
  gapAnalysis: string[];
}

export interface ResearchTree {
  rootQuery: string;
  rootId: string;
  nodes: Record<string, ResearchNode>;
  maxDepth: number;
  iterations: number;
}

// ---------------------------------------------------------------------------
// Source Citations
// ---------------------------------------------------------------------------

export interface SourceCitation {
  url: string;
  title: string;
  relevance: number;
  confidence: number;
  citedInFindings: string[];
}

// ---------------------------------------------------------------------------
// Progress Reporting
// ---------------------------------------------------------------------------

export type ResearchPhase = 'decomposing' | 'searching' | 'extracting' | 'analyzing_gaps' | 'synthesizing' | 'complete';

export interface ResearchProgressEvent {
  phase: ResearchPhase;
  iteration: number;
  totalIterations: number;
  currentQuery?: string;
  findingsCount: number;
  sourcesCount: number;
  elapsedMs: number;
  budget: { searchesUsed: number; extractionsUsed: number; llmCallsUsed: number };
}

// ---------------------------------------------------------------------------
// Input / Output
// ---------------------------------------------------------------------------

export interface DeepResearchInput {
  query: string;
  depth?: ResearchDepth;
  maxIterations?: number;
  sources?: Array<'web' | 'academic' | 'news' | 'social'>;
  focusAreas?: string[];
  budget?: Partial<ResearchBudget>;
}

export interface DeepResearchOutput {
  executiveSummary: string;
  detailedFindings: Finding[];
  sources: SourceCitation[];
  knowledgeGaps: string[];
  researchTree: ResearchTree;
  metadata: {
    query: string;
    depth: ResearchDepth;
    totalSearches: number;
    totalExtractions: number;
    totalLLMCalls: number;
    totalTimeMs: number;
    iterations: number;
  };
}

// ---------------------------------------------------------------------------
// Engine Config
// ---------------------------------------------------------------------------

/** Async function that calls an LLM and returns the text response. */
export type LLMInvoker = (prompt: string) => Promise<string>;

export interface DeepResearchEngineConfig {
  /** Cheap LLM for decomposition & gap analysis (e.g. gpt-4o-mini). */
  smallInvoker: LLMInvoker;
  /** Mid-tier LLM for final synthesis (e.g. gpt-4o). */
  synthesisInvoker: LLMInvoker;
  /** Optional web search service. Engine creates a minimal one if not provided. */
  searchFn?: (query: string, maxResults?: number) => Promise<SearchResultItem[]>;
  /** Optional content extraction function. */
  extractFn?: (url: string) => Promise<{ title: string; content: string; wordCount: number }>;
  /** Optional progress callback. */
  onProgress?: (event: ResearchProgressEvent) => void;
  /** Firecrawl API key for enhanced content extraction. */
  firecrawlApiKey?: string;
  /** Firecrawl configuration. */
  firecrawl?: {
    /** Use Firecrawl /scrape instead of raw fetch in iterate phase. Default: true when API key present. */
    scrapeForIterate?: boolean;
    /** Enable /crawl for deep research depth. Default: false. */
    enableCrawl?: boolean;
    /** Max pages per crawl job. Default: 10. */
    maxCrawlPages?: number;
  };
  /** Optional reranker function — runs on findings before synthesis. */
  rerankFindingsFn?: (query: string, findings: Finding[]) => Promise<Finding[]>;
}
