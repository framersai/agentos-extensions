// @ts-nocheck
/**
 * @fileoverview VercelListProjectsTool — list all projects on a Vercel account.
 */

import type { VercelService, VercelProject } from '../VercelService.js';

export class VercelListProjectsTool {
  readonly id = 'vercelListProjects';
  readonly name = 'vercelListProjects';
  readonly displayName = 'List Vercel Projects';
  readonly description = 'List all projects in the connected Vercel account. Shows project name, framework, linked Git repo, and latest deployment status.';
  readonly category = 'cloud';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      limit: { type: 'number', description: 'Maximum number of projects to return (default: 20, max: 100)' },
    },
    required: [] as string[],
  };

  constructor(private service: VercelService) {}

  async execute(args: { limit?: number }): Promise<{ success: boolean; data?: VercelProject[]; error?: string }> {
    try {
      const projects = await this.service.listProjects(args.limit ?? 20);
      return { success: true, data: projects };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
