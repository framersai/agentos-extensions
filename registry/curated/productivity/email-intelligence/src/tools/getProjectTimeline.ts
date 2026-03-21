/**
 * @fileoverview ITool for retrieving a project timeline.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { EmailIntelligenceClient } from '../EmailIntelligenceClient';

interface GetProjectTimelineArgs {
  projectId: string;
  granularity?: string;
}

export function createGetProjectTimelineTool(client: EmailIntelligenceClient): ITool<GetProjectTimelineArgs> {
  return {
    id: 'com.framers.email-intelligence.getProjectTimeline',
    name: 'getProjectTimeline',
    displayName: 'Get Project Timeline',
    description: 'Retrieve a chronological timeline of key events and milestones for a project.',
    category: 'productivity',
    version: '0.1.0',
    hasSideEffects: false,

    inputSchema: {
      type: 'object' as const,
      required: ['projectId'] as const,
      properties: {
        projectId: { type: 'string', description: 'The project ID' },
        granularity: { type: 'string', description: 'Timeline granularity: day, week, or month', default: 'day' },
      },
    },

    async execute(args: GetProjectTimelineArgs, _context: ToolExecutionContext): Promise<ToolExecutionResult> {
      try {
        const query: Record<string, string> = {};
        if (args.granularity) query.granularity = args.granularity;
        const result = await client.request(`projects/${args.projectId}/timeline`, { query });
        return { success: true, output: result };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  };
}
