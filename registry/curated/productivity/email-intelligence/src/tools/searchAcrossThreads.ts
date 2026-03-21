/**
 * @fileoverview ITool for semantic search across email threads.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { EmailIntelligenceClient } from '../EmailIntelligenceClient';

interface SearchAcrossThreadsArgs {
  query: string;
  maxResults?: number;
  accountId?: string;
  projectId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export function createSearchAcrossThreadsTool(client: EmailIntelligenceClient): ITool<SearchAcrossThreadsArgs> {
  return {
    id: 'com.framers.email-intelligence.searchAcrossThreads',
    name: 'searchAcrossThreads',
    displayName: 'Search Across Threads',
    description:
      'Semantic search across all email threads. Supports natural language queries, ' +
      'optional filtering by account, project, and date range.',
    category: 'productivity',
    version: '0.1.0',
    hasSideEffects: false,

    inputSchema: {
      type: 'object' as const,
      required: ['query'] as const,
      properties: {
        query: { type: 'string', description: 'Natural language search query' },
        maxResults: { type: 'number', description: 'Maximum results to return (default: 20)', default: 20 },
        accountId: { type: 'string', description: 'Filter by email account ID' },
        projectId: { type: 'string', description: 'Filter by project ID' },
        dateFrom: { type: 'string', description: 'Start date filter (ISO 8601)' },
        dateTo: { type: 'string', description: 'End date filter (ISO 8601)' },
      },
    },

    async execute(args: SearchAcrossThreadsArgs, _context: ToolExecutionContext): Promise<ToolExecutionResult> {
      try {
        const result = await client.request('query', {
          method: 'POST',
          body: {
            query: args.query,
            maxResults: args.maxResults ?? 20,
            accountId: args.accountId,
            projectId: args.projectId,
            dateFrom: args.dateFrom,
            dateTo: args.dateTo,
          },
        });
        return { success: true, output: result };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  };
}
