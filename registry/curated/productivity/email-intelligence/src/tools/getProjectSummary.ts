// @ts-nocheck
/**
 * @fileoverview ITool for retrieving a project summary with key metrics.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { EmailIntelligenceClient } from '../EmailIntelligenceClient';

interface GetProjectSummaryArgs {
  projectId: string;
}

export function createGetProjectSummaryTool(client: EmailIntelligenceClient): ITool<GetProjectSummaryArgs> {
  return {
    id: 'com.framers.email-intelligence.getProjectSummary',
    name: 'getProjectSummary',
    displayName: 'Get Project Summary',
    description: 'Get an AI-generated summary of a project including key participants, topics, action items, and thread count.',
    category: 'productivity',
    version: '0.1.0',
    hasSideEffects: false,

    inputSchema: {
      type: 'object' as const,
      required: ['projectId'] as const,
      properties: {
        projectId: { type: 'string', description: 'The project ID to summarize' },
      },
    },

    async execute(args: GetProjectSummaryArgs, _context: ToolExecutionContext): Promise<ToolExecutionResult> {
      try {
        const result = await client.request(`projects/${args.projectId}/summary`);
        return { success: true, output: result };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  };
}
