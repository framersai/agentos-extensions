// @ts-nocheck
/**
 * @fileoverview ITool for retrieving a full thread hierarchy with messages.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { EmailIntelligenceClient } from '../EmailIntelligenceClient';

interface GetThreadHierarchyArgs {
  threadId: string;
}

export function createGetThreadHierarchyTool(client: EmailIntelligenceClient): ITool<GetThreadHierarchyArgs> {
  return {
    id: 'com.framers.email-intelligence.getThreadHierarchy',
    name: 'getThreadHierarchy',
    displayName: 'Get Thread Hierarchy',
    description: 'Retrieve the full message hierarchy for an email thread, including all replies and forwarded messages.',
    category: 'productivity',
    version: '0.1.0',
    hasSideEffects: false,

    inputSchema: {
      type: 'object' as const,
      required: ['threadId'] as const,
      properties: {
        threadId: { type: 'string', description: 'The thread ID to retrieve' },
      },
    },

    async execute(args: GetThreadHierarchyArgs, _context: ToolExecutionContext): Promise<ToolExecutionResult> {
      try {
        const result = await client.request(`threads/${args.threadId}`);
        return { success: true, output: result };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  };
}
