// @ts-nocheck
/**
 * @fileoverview ITool for listing email projects.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { EmailIntelligenceClient } from '../EmailIntelligenceClient';

interface ListProjectsArgs {
  status?: string;
  limit?: number;
}

export function createListProjectsTool(client: EmailIntelligenceClient): ITool<ListProjectsArgs> {
  return {
    id: 'com.framers.email-intelligence.listProjects',
    name: 'listProjects',
    displayName: 'List Projects',
    description: 'List all email projects with optional status filter. Projects group related email threads together.',
    category: 'productivity',
    version: '0.1.0',
    hasSideEffects: false,

    inputSchema: {
      type: 'object' as const,
      required: [] as const,
      properties: {
        status: { type: 'string', description: 'Filter by project status (active, archived, all)', default: 'active' },
        limit: { type: 'number', description: 'Maximum number of projects to return', default: 50 },
      },
    },

    async execute(args: ListProjectsArgs, _context: ToolExecutionContext): Promise<ToolExecutionResult> {
      try {
        const query: Record<string, string> = {};
        if (args.status) query.status = args.status;
        if (args.limit) query.limit = String(args.limit);
        const result = await client.request('projects', { query });
        return { success: true, output: result };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  };
}
