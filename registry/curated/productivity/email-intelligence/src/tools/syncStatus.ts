// @ts-nocheck
/**
 * @fileoverview ITool for checking email account sync status.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { EmailIntelligenceClient } from '../EmailIntelligenceClient';

interface SyncStatusArgs {
  accountId?: string;
}

export function createSyncStatusTool(client: EmailIntelligenceClient): ITool<SyncStatusArgs> {
  return {
    id: 'com.framers.email-intelligence.syncStatus',
    name: 'syncStatus',
    displayName: 'Sync Status',
    description: 'Check the sync status of email accounts. If accountId is provided, returns status for that account; otherwise returns status for all accounts.',
    category: 'productivity',
    version: '0.1.0',
    hasSideEffects: false,

    inputSchema: {
      type: 'object' as const,
      required: [] as const,
      properties: {
        accountId: { type: 'string', description: 'Optional account ID to check. If omitted, returns all accounts.' },
      },
    },

    async execute(args: SyncStatusArgs, _context: ToolExecutionContext): Promise<ToolExecutionResult> {
      try {
        const path = args.accountId ? `accounts/${args.accountId}/status` : 'accounts';
        const result = await client.request(path);
        return { success: true, output: result };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  };
}
