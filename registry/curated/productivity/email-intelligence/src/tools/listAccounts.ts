// @ts-nocheck
/**
 * @fileoverview ITool for listing connected email accounts.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { EmailIntelligenceClient } from '../EmailIntelligenceClient';

export function createListAccountsTool(client: EmailIntelligenceClient): ITool<Record<string, never>> {
  return {
    id: 'com.framers.email-intelligence.listAccounts',
    name: 'listAccounts',
    displayName: 'List Accounts',
    description: 'List all connected email accounts with their sync status and message counts.',
    category: 'productivity',
    version: '0.1.0',
    hasSideEffects: false,

    inputSchema: {
      type: 'object' as const,
      required: [] as const,
      properties: {},
    },

    async execute(_args: Record<string, never>, _context: ToolExecutionContext): Promise<ToolExecutionResult> {
      try {
        const result = await client.request('accounts');
        return { success: true, output: result };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  };
}
