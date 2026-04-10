// @ts-nocheck
/**
 * @fileoverview Core orchestrator for the Deep Research Engine.
 *
 * Three-phase algorithm:
 *   1. **Decompose** — break query into sub-questions (cheap LLM)
 *   2. **Iterate**  — search → extract → gap-analysis loop
 *   3. **Synthesize** — produce a structured report (mid-tier LLM)
 *
 * Budget tracking enforces cost/time limits at every step.
 */

import { randomUUID as uuid } from 'node:crypto';
import type {
  DeepResearchEngineConfig,
  DeepResearchInput,
  DeepResearchOutput,
  ResearchBudget,
  ResearchDepth,
  ResearchNode,
  ResearchTree,
  SearchResultItem,
  SourceCitation,
  Finding,
  ResearchProgressEvent,
  ResearchPhase,
} from './types.js';
import { BUDGET_DEFAULTS, ITERATION_DEFAULTS } from './types.js';
import { DECOMPOSITION_PROMPT, GAP_ANALYSIS_PROMPT, SYNTHESIS_PROMPT, parseJsonArray } from './prompts.js';
import { ResearchBudgetTracker } from './ResearchBudgetTracker.js';

// ── Helpers ──

/** Limit concurrency for an array of async tasks. */
async function parallelLimit<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = [];
  let idx = 0;

  async function next(): Promise<void> {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => next());
  await Promise.allSettled(workers);
  return results;
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    u.searchParams.delete('utm_source');
    u.searchParams.delete('utm_medium');
    u.searchParams.delete('utm_campaign');
    return u.toString();
  } catch {
    return url;
  }
}

function detectUrlType(url: string): 'youtube' | 'wikipedia' | 'academic' | 'pdf' | 'web' {
  if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube';
  if (/wikipedia\.org/i.test(url)) return 'wikipedia';
  if (/arxiv\.org|scholar\.google|semanticscholar\.org/i.test(url)) return 'academic';
  if (/\.pdf(\?|$)/i.test(url)) return 'pdf';
  return 'web';
}

function truncate(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : text.slice(0, maxChars) + '...';
}

// ── Engine ──

export class DeepResearchEngine {
  private readonly config: DeepResearchEngineConfig;
  /** Per-call progress override set by {@link research}. */
  private activeProgressOverride: ((event: ResearchProgressEvent) => void) | null = null;
  /** Optional Firecrawl client for enhanced content extraction. */
  private readonly firecrawlClient?: import('./FirecrawlClient.js').FirecrawlClient;

  constructor(config: DeepResearchEngineConfig) {
    this.config = config;
    if (config.firecrawlApiKey) {
      // Lazy import to avoid hard dependency
      try {
        const { FirecrawlClient } = require('./FirecrawlClient.js');
        this.firecrawlClient = new FirecrawlClient({
          apiKey: config.firecrawlApiKey,
          maxCrawlPages: config.firecrawl?.maxCrawlPages ?? 10,
        });
      } catch { /* FirecrawlClient not available */ }
    }
  }

  /**
   * Run the research pipeline.
   * @param input Research query and options.
   * @param onProgressOverride Optional per-call progress callback that takes
   *   priority over the one provided at construction time. This allows callers
   *   (like DeepResearchTool) to forward runtime progress to the tool-calling
   *   layer without rebuilding the engine.
   */
  async research(
    input: DeepResearchInput,
    onProgressOverride?: (event: ResearchProgressEvent) => void,
  ): Promise<DeepResearchOutput> {
    this.activeProgressOverride = onProgressOverride ?? null;
    try {
    const depth: ResearchDepth = input.depth ?? 'moderate';
    const maxIterations = input.maxIterations ?? ITERATION_DEFAULTS[depth];
    const budgetConfig: ResearchBudget = { ...BUDGET_DEFAULTS[depth], ...input.budget };
    const budget = new ResearchBudgetTracker(budgetConfig);
    const seenUrls = new Set<string>();

    // ── Build tree ──
    const rootId = uuid();
    const tree: ResearchTree = {
      rootQuery: input.query,
      rootId,
      nodes: {
        [rootId]: this.createNode(rootId, input.query, null, 0),
      },
      maxDepth: depth === 'quick' ? 1 : depth === 'moderate' ? 2 : 3,
      iterations: 0,
    };

    // ── Phase 1: Decompose ──
    this.emitProgress('decomposing', 0, maxIterations, budget, tree, input.query);

    let subQueries: string[];
    if (budget.canCallLLM()) {
      const focusSection = input.focusAreas?.length
        ? `\nFocus especially on: ${input.focusAreas.join(', ')}`
        : '';
      const prompt = DECOMPOSITION_PROMPT
        .replace('{query}', input.query)
        .replace('{focusAreas}', focusSection);
      try {
        const raw = await this.config.smallInvoker(prompt);
        budget.recordLLMCall();
        subQueries = parseJsonArray(raw);
      } catch {
        subQueries = [input.query];
      }
    } else {
      subQueries = [input.query];
    }

    // Add sub-queries as children of root
    const rootNode = tree.nodes[rootId];
    rootNode.subQueries = subQueries;
    for (const sq of subQueries) {
      const childId = uuid();
      tree.nodes[childId] = this.createNode(childId, sq, rootId, 1);
      rootNode.children.push(childId);
    }

    // ── Phase 2: Iterative Search/Extract/Gap loop ──
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      if (budget.isExhausted()) break;
      tree.iterations = iteration + 1;

      // 2a — Search pending leaf nodes
      const pendingNodes = this.getPendingLeaves(tree);
      if (pendingNodes.length === 0) break;

      this.emitProgress('searching', iteration, maxIterations, budget, tree);

      const searchTasks = pendingNodes
        .filter(() => budget.canSearch())
        .map((node) => async () => {
          node.status = 'searching';
          try {
            const results = await this.searchNode(node, input.sources);
            budget.recordSearch();
            node.searchResults = results;
          } catch {
            node.status = 'failed';
          }
        });

      await parallelLimit(searchTasks, 5);

      // 2b — Extract content from top URLs
      this.emitProgress('extracting', iteration, maxIterations, budget, tree);

      const extractableNodes = pendingNodes.filter(
        (n) => n.searchResults.length > 0 && n.status !== 'failed',
      );

      for (const node of extractableNodes) {
        if (!budget.canExtract()) break;
        node.status = 'extracting';

        // Take top 3 URLs per node that we haven't seen
        const urls = node.searchResults
          .map((r) => r.url)
          .filter((url) => {
            const norm = normalizeUrl(url);
            if (seenUrls.has(norm)) return false;
            seenUrls.add(norm);
            return true;
          })
          .slice(0, 3);

        for (const url of urls) {
          if (!budget.canExtract()) break;
          try {
            const extracted = await this.extractUrl(url);
            budget.recordExtraction();
            node.extractedContent.push({
              url,
              title: extracted.title,
              content: truncate(extracted.content, 2000),
              wordCount: extracted.wordCount,
              type: detectUrlType(url),
              extractedAt: new Date().toISOString(),
            });
          } catch {
            // Skip failed extractions
          }
        }

        // Build findings from extracted content
        node.findings = this.buildFindings(node);
        node.status = 'complete';
        node.confidenceScore = node.findings.length > 0 ? Math.min(node.findings.length / 3, 1) : 0;
      }

      // 2c — Gap analysis (skip on last iteration)
      if (iteration < maxIterations - 1 && budget.canCallLLM()) {
        this.emitProgress('analyzing_gaps', iteration, maxIterations, budget, tree);

        const allFindings = this.collectAllFindings(tree);
        if (allFindings.length > 0) {
          const findingsSummary = allFindings
            .map((f) => `- ${f.claim} (sources: ${f.sources.join(', ')})`)
            .join('\n');

          const gapPrompt = GAP_ANALYSIS_PROMPT
            .replace('{query}', input.query)
            .replace('{findings}', truncate(findingsSummary, 3000));

          try {
            const raw = await this.config.smallInvoker(gapPrompt);
            budget.recordLLMCall();
            const gapQueries = parseJsonArray(raw);

            // Add new leaf nodes for gaps
            for (const gq of gapQueries.slice(0, 3)) {
              if (!budget.canSearch()) break;
              const gapId = uuid();
              const parentId = rootId;
              tree.nodes[gapId] = this.createNode(gapId, gq, parentId, 2);
              tree.nodes[parentId].children.push(gapId);
            }
          } catch {
            // Skip gap analysis if LLM fails
          }
        }
      }
    }

    // ── Phase 2b: Firecrawl deep crawl (deep depth only) ──
    if (
      input.depth === 'deep' &&
      this.firecrawlClient &&
      this.config.firecrawl?.enableCrawl
    ) {
      this.emitProgress('extracting', tree.iterations, maxIterations, budget, tree);

      const domainCounts = new Map<string, number>();
      for (const node of Object.values(tree.nodes)) {
        for (const result of node.searchResults) {
          try {
            const domain = new URL(result.url).hostname;
            domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
          } catch { /* skip invalid URLs */ }
        }
      }

      const topDomains = [...domainCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([domain]) => domain);

      for (const domain of topDomains) {
        if (budget.isExhausted()) break;
        try {
          const crawlResult = await this.firecrawlClient.crawl(`https://${domain}`);
          const rootNode = tree.nodes[tree.rootId];
          for (const page of crawlResult.pages) {
            if (budget.isExhausted()) break;
            rootNode.extractedContent.push({
              url: page.url,
              title: page.title,
              content: page.content.slice(0, 5000),
              wordCount: page.wordCount,
              type: 'web',
              extractedAt: new Date().toISOString(),
            });
            budget.recordExtraction();
          }
        } catch { /* crawl failed for this domain — continue */ }
      }
    }

    // ── Phase 2c: Rerank findings before synthesis ──
    if (this.config.rerankFindingsFn) {
      const preRankFindings = this.collectAllFindings(tree);
      if (preRankFindings.length > 0) {
        try {
          const reranked = await this.config.rerankFindingsFn(input.query, preRankFindings);
          tree.nodes[tree.rootId].findings = reranked;
        } catch { /* reranking failed — proceed with unranked */ }
      }
    }

    // ── Phase 3: Synthesize ──
    this.emitProgress('synthesizing', maxIterations, maxIterations, budget, tree);

    const allFindings = this.collectAllFindings(tree);
    const allContent = this.collectAllContent(tree);

    // Build evidence string for synthesis
    const evidenceLines = allContent
      .map((c) => `[Source: ${c.url}] ${c.title}\n${truncate(c.content, 1500)}`)
      .join('\n\n');

    const maxEvidenceChars = budgetConfig.maxOutputTokens * 2;
    const evidenceTruncated = truncate(evidenceLines, maxEvidenceChars);

    let report = '';
    if (budget.canCallLLM() && allContent.length > 0) {
      const synthPrompt = SYNTHESIS_PROMPT
        .replace('{query}', input.query)
        .replace('{evidence}', evidenceTruncated);

      try {
        report = await this.config.synthesisInvoker(synthPrompt);
        budget.recordLLMCall();
      } catch {
        report = this.fallbackSynthesis(input.query, allFindings);
      }
    } else {
      report = this.fallbackSynthesis(input.query, allFindings);
    }

    // Parse report sections
    const { executiveSummary, knowledgeGaps } = this.parseReport(report);

    // Build source citations
    const sources = this.buildSourceCitations(tree, allFindings);

    this.emitProgress('complete', maxIterations, maxIterations, budget, tree);

    const used = budget.getUsed();

    return {
      executiveSummary,
      detailedFindings: allFindings,
      sources,
      knowledgeGaps,
      researchTree: tree,
      metadata: {
        query: input.query,
        depth,
        totalSearches: used.searchesUsed,
        totalExtractions: used.extractionsUsed,
        totalLLMCalls: used.llmCallsUsed,
        totalTimeMs: budget.getElapsedMs(),
        iterations: tree.iterations,
      },
    };
    } finally {
      this.activeProgressOverride = null;
    }
  }

  // ── Private: Node helpers ──

  private createNode(id: string, query: string, parentId: string | null, depth: number): ResearchNode {
    return {
      id,
      query,
      parentId,
      depth,
      status: 'pending',
      searchResults: [],
      extractedContent: [],
      findings: [],
      subQueries: [],
      children: [],
      confidenceScore: 0,
      gapAnalysis: [],
    };
  }

  private getPendingLeaves(tree: ResearchTree): ResearchNode[] {
    return Object.values(tree.nodes).filter(
      (n) => n.status === 'pending' && n.children.length === 0,
    );
  }

  // ── Private: Search ──

  private async searchNode(
    node: ResearchNode,
    sources?: Array<'web' | 'academic' | 'news' | 'social'>,
  ): Promise<SearchResultItem[]> {
    const searchFn = this.config.searchFn;
    if (searchFn) {
      return searchFn(node.query, 10);
    }

    // Fallback: use DuckDuckGo HTML scraping
    const results: SearchResultItem[] = [];
    try {
      const resp = await fetch('https://html.duckduckgo.com/html/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'AgentOS-DeepResearch/1.0' },
        body: `q=${encodeURIComponent(node.query)}`,
      });
      const html = await resp.text();
      const linkRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
      const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
      const links: { url: string; title: string }[] = [];
      let match;
      while ((match = linkRegex.exec(html)) !== null) {
        let url = match[1];
        const uddgMatch = url.match(/[?&]uddg=([^&]+)/);
        if (uddgMatch) url = decodeURIComponent(uddgMatch[1]);
        const title = match[2].replace(/<[^>]+>/g, '').trim();
        links.push({ url, title });
      }
      const snippets: string[] = [];
      while ((match = snippetRegex.exec(html)) !== null) {
        snippets.push(match[1].replace(/<[^>]+>/g, '').trim());
      }
      for (let i = 0; i < links.length && i < 10; i++) {
        results.push({
          title: links[i].title,
          url: links[i].url,
          snippet: snippets[i] ?? '',
        });
      }
    } catch {
      // Return empty results on failure
    }
    return results;
  }

  // ── Private: Extraction ──

  private async extractUrl(url: string): Promise<{ title: string; content: string; wordCount: number }> {
    // Priority 1: Firecrawl scrape (JS-rendered, anti-bot, clean markdown)
    if (this.firecrawlClient && this.config.firecrawl?.scrapeForIterate !== false) {
      try {
        const scraped = await this.firecrawlClient.scrape(url);
        return { title: scraped.title, content: scraped.content, wordCount: scraped.wordCount };
      } catch { /* fall through to other methods */ }
    }

    // Priority 2: Custom extraction function
    if (this.config.extractFn) {
      return this.config.extractFn(url);
    }

    // Priority 3: Basic fetch + HTML strip
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'AgentOS-DeepResearch/1.0', 'Accept': 'text/html' },
      signal: AbortSignal.timeout(15000),
    });
    const html = await resp.text();
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '';
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyHtml = bodyMatch?.[1] ?? html;
    const content = bodyHtml
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const wordCount = content.split(/\s+/).length;
    return { title, content, wordCount };
  }

  // ── Private: Findings ──

  private buildFindings(node: ResearchNode): Finding[] {
    const findings: Finding[] = [];

    // From search results
    for (const sr of node.searchResults) {
      if (sr.snippet && sr.snippet.length > 20) {
        findings.push({
          claim: sr.snippet,
          evidence: sr.snippet,
          sources: [sr.url],
          confidence: 0.5,
          category: 'search',
        });
      }
    }

    // From extracted content — higher confidence
    for (const ec of node.extractedContent) {
      if (ec.content.length > 50) {
        findings.push({
          claim: ec.title || ec.content.slice(0, 100),
          evidence: ec.content.slice(0, 500),
          sources: [ec.url],
          confidence: 0.8,
          category: 'extracted',
        });
      }
    }

    return findings;
  }

  private collectAllFindings(tree: ResearchTree): Finding[] {
    const all: Finding[] = [];
    for (const node of Object.values(tree.nodes)) {
      all.push(...node.findings);
    }
    return all;
  }

  private collectAllContent(tree: ResearchTree) {
    const all: ResearchNode['extractedContent'] = [];
    for (const node of Object.values(tree.nodes)) {
      all.push(...node.extractedContent);
    }
    return all;
  }

  // ── Private: Synthesis helpers ──

  private fallbackSynthesis(query: string, findings: Finding[]): string {
    if (findings.length === 0) {
      return `## Executive Summary\nNo substantial findings could be gathered for: "${query}"\n\n## Knowledge Gaps\n- Unable to find relevant sources`;
    }
    const body = findings
      .slice(0, 10)
      .map((f) => `- ${f.claim} [Source: ${f.sources[0]}]`)
      .join('\n');
    return `## Executive Summary\nResearch on "${query}" yielded ${findings.length} findings across multiple sources.\n\n## Detailed Findings\n${body}\n\n## Knowledge Gaps\n- Synthesis limited — no LLM budget remaining`;
  }

  private parseReport(report: string): { executiveSummary: string; knowledgeGaps: string[] } {
    // Extract executive summary
    const summaryMatch = report.match(
      /(?:\*\*)?Executive Summary(?:\*\*)?[:\s]*([\s\S]*?)(?=\n##|\n\*\*Detailed|\n\*\*Knowledge|$)/i,
    );
    const executiveSummary = summaryMatch?.[1]?.trim() || report.slice(0, 500);

    // Extract knowledge gaps
    const gapsMatch = report.match(
      /(?:\*\*)?Knowledge Gaps(?:\*\*)?[:\s]*([\s\S]*?)$/i,
    );
    const gapsText = gapsMatch?.[1]?.trim() || '';
    const knowledgeGaps = gapsText
      .split('\n')
      .map((line) => line.replace(/^[\s\-*]+/, '').trim())
      .filter((line) => line.length > 5);

    return { executiveSummary, knowledgeGaps };
  }

  private buildSourceCitations(tree: ResearchTree, findings: Finding[]): SourceCitation[] {
    const urlMap = new Map<string, SourceCitation>();

    // From extracted content
    for (const node of Object.values(tree.nodes)) {
      for (const ec of node.extractedContent) {
        const norm = normalizeUrl(ec.url);
        if (!urlMap.has(norm)) {
          urlMap.set(norm, {
            url: ec.url,
            title: ec.title,
            relevance: 0.8,
            confidence: 0.8,
            citedInFindings: [],
          });
        }
      }
    }

    // Link findings to sources
    for (const f of findings) {
      for (const src of f.sources) {
        const norm = normalizeUrl(src);
        const citation = urlMap.get(norm);
        if (citation) {
          citation.citedInFindings.push(f.claim.slice(0, 80));
          citation.confidence = Math.min(1, citation.confidence + 0.1);
        }
      }
    }

    return Array.from(urlMap.values()).sort((a, b) => b.confidence - a.confidence);
  }

  // ── Private: Progress ──

  private emitProgress(
    phase: ResearchPhase,
    iteration: number,
    totalIterations: number,
    budget: ResearchBudgetTracker,
    tree: ResearchTree,
    currentQuery?: string,
  ): void {
    const cb = this.activeProgressOverride ?? this.config.onProgress;
    if (!cb) return;

    const findings = this.collectAllFindings(tree);
    const sources = new Set<string>();
    for (const node of Object.values(tree.nodes)) {
      for (const ec of node.extractedContent) sources.add(ec.url);
    }

    const event: ResearchProgressEvent = {
      phase,
      iteration,
      totalIterations,
      currentQuery,
      findingsCount: findings.length,
      sourcesCount: sources.size,
      elapsedMs: budget.getElapsedMs(),
      budget: budget.getUsed(),
    };

    cb(event);
  }
}
