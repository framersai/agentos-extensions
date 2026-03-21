/**
 * @fileoverview ITool for generating a project report.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { EmailIntelligenceClient } from '../EmailIntelligenceClient';

interface GenerateReportArgs {
  projectId: string;
  format?: string;
}

export function createGenerateReportTool(client: EmailIntelligenceClient): ITool<GenerateReportArgs> {
  return {
    id: 'com.framers.email-intelligence.generateReport',
    name: 'generateReport',
    displayName: 'Generate Report',
    description: 'Generate a comprehensive report for a project including thread summaries, key participants, action items, and timeline.',
    category: 'productivity',
    version: '0.1.0',
    hasSideEffects: false,

    inputSchema: {
      type: 'object' as const,
      required: ['projectId'] as const,
      properties: {
        projectId: { type: 'string', description: 'The project ID to generate a report for' },
        format: { type: 'string', description: 'Report format: markdown, json, or html', default: 'markdown' },
      },
    },

    async execute(args: GenerateReportArgs, _context: ToolExecutionContext): Promise<ToolExecutionResult> {
      try {
        const body: Record<string, any> = {};
        if (args.format) body.format = args.format;
        const result = await client.request(`reports/project/${args.projectId}`, {
          method: 'POST',
          body,
        });
        return { success: true, output: result };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  };
}
