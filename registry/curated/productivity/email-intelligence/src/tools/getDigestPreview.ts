// @ts-nocheck
/**
 * @fileoverview ITool for previewing a digest before sending.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { EmailIntelligenceClient } from '../EmailIntelligenceClient';

interface GetDigestPreviewArgs {
  digestId: string;
  format?: string;
}

export function createGetDigestPreviewTool(client: EmailIntelligenceClient): ITool<GetDigestPreviewArgs> {
  return {
    id: 'com.framers.email-intelligence.getDigestPreview',
    name: 'getDigestPreview',
    displayName: 'Get Digest Preview',
    description: 'Preview a digest email before it is sent, showing the rendered content and recipient list.',
    category: 'productivity',
    version: '0.1.0',
    hasSideEffects: false,

    inputSchema: {
      type: 'object' as const,
      required: ['digestId'] as const,
      properties: {
        digestId: { type: 'string', description: 'The digest ID to preview' },
        format: { type: 'string', description: 'Preview format: html or text', default: 'html' },
      },
    },

    async execute(args: GetDigestPreviewArgs, _context: ToolExecutionContext): Promise<ToolExecutionResult> {
      try {
        const body: Record<string, any> = {};
        if (args.format) body.format = args.format;
        const result = await client.request(`digests/${args.digestId}/preview`, {
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
