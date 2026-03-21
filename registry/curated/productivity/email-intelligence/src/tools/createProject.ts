/**
 * @fileoverview ITool for creating a new email project.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { EmailIntelligenceClient } from '../EmailIntelligenceClient';

interface CreateProjectArgs {
  name: string;
  description?: string;
  threadIds?: string[];
}

export function createCreateProjectTool(client: EmailIntelligenceClient): ITool<CreateProjectArgs> {
  return {
    id: 'com.framers.email-intelligence.createProject',
    name: 'createProject',
    displayName: 'Create Project',
    description: 'Create a new project to group related email threads together. Optionally assign initial threads.',
    category: 'productivity',
    version: '0.1.0',
    hasSideEffects: true,

    inputSchema: {
      type: 'object' as const,
      required: ['name'] as const,
      properties: {
        name: { type: 'string', description: 'Project name' },
        description: { type: 'string', description: 'Optional project description' },
        threadIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of thread IDs to assign to the project',
        },
      },
    },

    async execute(args: CreateProjectArgs, _context: ToolExecutionContext): Promise<ToolExecutionResult> {
      try {
        const result = await client.request('projects', {
          method: 'POST',
          body: {
            name: args.name,
            description: args.description,
            threadIds: args.threadIds,
          },
        });
        return { success: true, output: result };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  };
}
