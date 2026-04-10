// @ts-nocheck
/**
 * @fileoverview Email Intelligence Extension for AgentOS.
 *
 * Provides 12 ITool descriptors for querying email threads, projects,
 * attachments, and generating reports via a backend REST API.
 *
 * @module @framers/agentos-ext-email-intelligence
 */

import type { ExtensionPack } from '@framers/agentos';
import { EmailIntelligenceClient } from './EmailIntelligenceClient';
import { createSearchAcrossThreadsTool } from './tools/searchAcrossThreads';
import { createGetThreadHierarchyTool } from './tools/getThreadHierarchy';
import { createListProjectsTool } from './tools/listProjects';
import { createGetProjectSummaryTool } from './tools/getProjectSummary';
import { createGetProjectTimelineTool } from './tools/getProjectTimeline';
import { createListAccountsTool } from './tools/listAccounts';
import { createGetAttachmentTool } from './tools/getAttachment';
import { createCreateProjectTool } from './tools/createProject';
import { createAddThreadToProjectTool } from './tools/addThreadToProject';
import { createGenerateReportTool } from './tools/generateReport';
import { createGetDigestPreviewTool } from './tools/getDigestPreview';
import { createSyncStatusTool } from './tools/syncStatus';

export interface EmailIntelligenceOptions {
  seedId?: string;
  backendUrl?: string;
  secrets?: Record<string, string>;
}

export function createExtensionPack(options?: EmailIntelligenceOptions): ExtensionPack {
  const seedId = options?.seedId ?? process.env.WUNDERLAND_SEED_ID ?? '';
  const backendUrl = options?.backendUrl ?? process.env.WUNDERLAND_BACKEND_URL ?? 'http://localhost:3000';
  const secret = options?.secrets?.['internal.apiSecret'] ?? process.env.INTERNAL_API_SECRET ?? '';

  const client = new EmailIntelligenceClient(backendUrl, seedId, secret);

  const tools = [
    createSearchAcrossThreadsTool(client),
    createGetThreadHierarchyTool(client),
    createListProjectsTool(client),
    createGetProjectSummaryTool(client),
    createGetProjectTimelineTool(client),
    createListAccountsTool(client),
    createGetAttachmentTool(client),
    createCreateProjectTool(client),
    createAddThreadToProjectTool(client),
    createGenerateReportTool(client),
    createGetDigestPreviewTool(client),
    createSyncStatusTool(client),
  ];

  return {
    name: '@framers/agentos-ext-email-intelligence',
    version: '0.1.0',
    descriptors: tools.map((t) => ({
      id: t.id,
      kind: 'tool' as const,
      payload: t,
      priority: 50,
      enableByDefault: true,
    })),
  };
}

export { EmailIntelligenceClient };
export {
  createSearchAcrossThreadsTool,
  createGetThreadHierarchyTool,
  createListProjectsTool,
  createGetProjectSummaryTool,
  createGetProjectTimelineTool,
  createListAccountsTool,
  createGetAttachmentTool,
  createCreateProjectTool,
  createAddThreadToProjectTool,
  createGenerateReportTool,
  createGetDigestPreviewTool,
  createSyncStatusTool,
};

export default createExtensionPack;
