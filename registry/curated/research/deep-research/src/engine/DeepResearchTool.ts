// @ts-nocheck
/**
 * @fileoverview ITool wrapper for the Deep Research Engine.
 *
 * Exposes the engine as a single `deep_research` tool call that agents
 * can invoke to conduct comprehensive, multi-source research.
 */

import type { ITool, JSONSchemaObject, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { DeepResearchInput, DeepResearchOutput, ResearchProgressEvent, ResearchPhase } from './types.js';
import { DeepResearchEngine } from './DeepResearchEngine.js';

/** Human-readable labels for each research phase. */
const PHASE_LABELS: Record<ResearchPhase, string> = {
  decomposing: 'Decomposing query into sub-questions',
  searching: 'Searching sources',
  extracting: 'Extracting content from sources',
  analyzing_gaps: 'Analyzing knowledge gaps',
  synthesizing: 'Synthesizing report',
  complete: 'Research complete',
};

export class DeepResearchTool implements ITool<DeepResearchInput, DeepResearchOutput> {
  public readonly id = 'deep-research-v1';
  public readonly name = 'deep_research';
  public readonly displayName = 'Deep Research';
  public readonly description =
    'Conduct comprehensive multi-source research. Recursively decomposes queries, ' +
    'searches web/academic/news, extracts content, identifies gaps, and synthesizes a ' +
    'detailed report with citations. Use for complex questions requiring thorough investigation.';
  public readonly category = 'research';
  public readonly hasSideEffects = false;

  public readonly inputSchema: JSONSchemaObject = {
    type: 'object',
    required: ['query'],
    properties: {
      query: {
        type: 'string',
        description: 'Research question or topic to investigate',
      },
      depth: {
        type: 'string',
        enum: ['quick', 'moderate', 'deep'],
        default: 'moderate',
        description: 'Research depth — quick (30s, 10 searches), moderate (2min, 20 searches), deep (9min, 50 searches)',
      },
      maxIterations: {
        type: 'integer',
        minimum: 1,
        maximum: 10,
        description: 'Maximum search-extract-analyze iterations',
      },
      sources: {
        type: 'array',
        items: { type: 'string', enum: ['web', 'academic', 'news', 'social'] },
        description: 'Source types to search',
      },
      focusAreas: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific aspects to focus on',
      },
    },
    additionalProperties: false,
  };

  public readonly requiredCapabilities = ['capability:web_search'];

  constructor(private readonly engine: DeepResearchEngine) {}

  async execute(
    input: DeepResearchInput,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<DeepResearchOutput>> {
    // Build a per-call progress bridge: translate ResearchProgressEvent into
    // the generic onToolProgress shape expected by the wunderland runtime.
    const ctxAny = context as unknown as Record<string, unknown>;
    const runtimeProgressCb = typeof ctxAny['onToolProgress'] === 'function'
      ? ctxAny['onToolProgress'] as (info: { phase: string; message: string; progress?: number }) => void
      : null;

    const onProgress = runtimeProgressCb
      ? (event: ResearchProgressEvent) => {
          const label = PHASE_LABELS[event.phase] ?? event.phase;
          const detail = event.currentQuery ? ` "${event.currentQuery}"` : '';
          const sources = event.sourcesCount > 0 ? `, ${event.sourcesCount} sources` : '';
          const message = `${label}${detail} (iter ${event.iteration}/${event.totalIterations}, ${event.findingsCount} findings${sources})`;
          const progress = event.totalIterations > 0
            ? Math.min(event.iteration / event.totalIterations, 1)
            : undefined;
          runtimeProgressCb({ phase: event.phase, message, progress });
        }
      : undefined;

    try {
      const result = await this.engine.research(input, onProgress);
      return { success: true, output: result };
    } catch (error: any) {
      return { success: false, error: error?.message || String(error) };
    }
  }

  validateArgs(input: Record<string, any>): { isValid: boolean; errors?: any[] } {
    const errors: string[] = [];

    if (!input.query) {
      errors.push('query is required');
    } else if (typeof input.query !== 'string') {
      errors.push('query must be a string');
    } else if (input.query.length < 3) {
      errors.push('query must be at least 3 characters');
    }

    if (input.depth !== undefined) {
      if (!['quick', 'moderate', 'deep'].includes(input.depth)) {
        errors.push('depth must be quick, moderate, or deep');
      }
    }

    if (input.maxIterations !== undefined) {
      if (typeof input.maxIterations !== 'number' || input.maxIterations < 1 || input.maxIterations > 10) {
        errors.push('maxIterations must be 1-10');
      }
    }

    return errors.length === 0 ? { isValid: true } : { isValid: false, errors };
  }
}
