/**
 * @fileoverview ITool for retrieving attachment metadata.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { EmailIntelligenceClient } from '../EmailIntelligenceClient';

interface GetAttachmentArgs {
  attachmentId: string;
}

export function createGetAttachmentTool(client: EmailIntelligenceClient): ITool<GetAttachmentArgs> {
  return {
    id: 'com.framers.email-intelligence.getAttachment',
    name: 'getAttachment',
    displayName: 'Get Attachment',
    description: 'Retrieve metadata and download info for an email attachment by its ID.',
    category: 'productivity',
    version: '0.1.0',
    hasSideEffects: false,

    inputSchema: {
      type: 'object' as const,
      required: ['attachmentId'] as const,
      properties: {
        attachmentId: { type: 'string', description: 'The attachment ID to retrieve' },
      },
    },

    async execute(args: GetAttachmentArgs, _context: ToolExecutionContext): Promise<ToolExecutionResult> {
      try {
        const result = await client.request(`attachments/${args.attachmentId}`);
        return { success: true, output: result };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  };
}
