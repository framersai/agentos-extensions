/**
 * @fileoverview CfCreateWorkerTool — deploy a Cloudflare Worker script.
 */

import type { CloudflareService, CloudflareWorker } from '../CloudflareService.js';

export interface CreateWorkerInput {
  name: string;
  script: string;
  routes?: string[];
  compatibilityDate?: string;
  bindings?: Record<string, string>;
}

export class CfCreateWorkerTool {
  readonly id = 'cfCreateWorker';
  readonly name = 'cfCreateWorker';
  readonly displayName = 'Deploy Cloudflare Worker';
  readonly description = 'Deploy a Cloudflare Worker script to the edge. Supports ES modules format, route patterns, compatibility dates, and environment variable bindings. Workers run on Cloudflare\'s global network with sub-millisecond cold starts.';
  readonly category = 'cloud';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      name: { type: 'string', description: 'Worker script name (used as the identifier, e.g. "my-api-worker")' },
      script: { type: 'string', description: 'JavaScript or TypeScript source code for the Worker (ES modules format with default export)' },
      routes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Route patterns to bind the Worker to (e.g. ["example.com/api/*", "*.example.com/webhook"])',
      },
      compatibilityDate: { type: 'string', description: 'Workers runtime compatibility date (e.g. "2024-01-01", default: "2024-01-01")' },
      bindings: { type: 'object', description: 'Environment variable bindings as key-value pairs' },
    },
    required: ['name', 'script'],
  };

  constructor(private service: CloudflareService) {}

  async execute(args: CreateWorkerInput): Promise<{ success: boolean; data?: CloudflareWorker; error?: string }> {
    try {
      const worker = await this.service.deployWorker({
        name: args.name,
        script: args.script,
        routes: args.routes,
        compatibilityDate: args.compatibilityDate,
        bindings: args.bindings,
      });

      return { success: true, data: worker };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
