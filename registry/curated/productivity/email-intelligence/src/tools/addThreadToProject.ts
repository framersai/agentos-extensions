/**
 * @fileoverview ITool for adding a thread to an existing project.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { EmailIntelligenceClient } from '../EmailIntelligenceClient';

interface AddThreadToProjectArgs {
  projectId: string;
  threadId: string;
}

export function createAddThreadToProjectTool(client: EmailIntelligenceClient): ITool<AddThreadToProjectArgs> {
  return {
    id: 'com.framers.email-intelligence.addThreadToProject',
    name: 'addThreadToProject',
    displayName: 'Add Thread to Project',
    description: 'Add an email thread to an existing project for organization and tracking.',
    category: 'productivity',
    version: '0.1.0',
    hasSideEffects: true,

    inputSchema: {
      type: 'object' as const,
      required: ['projectId', 'threadId'] as const,
      properties: {
        projectId: { type: 'string', description: 'The project ID to add the thread to' },
        threadId: { type: 'string', description: 'The thread ID to add' },
      },
    },

    async execute(args: AddThreadToProjectArgs, _context: ToolExecutionContext): Promise<ToolExecutionResult> {
      try {
        const result = await client.request(`projects/${args.projectId}/threads`, {
          method: 'POST',
          body: { threadId: args.threadId },
        });
        return { success: true, output: result };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  };
}
