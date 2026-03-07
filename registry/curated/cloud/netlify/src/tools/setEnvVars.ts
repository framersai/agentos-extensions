/**
 * @fileoverview NetlifySetEnvVarsTool — set environment variables on a Netlify site.
 */

import type { NetlifyService, NetlifyEnvVar } from '../NetlifyService.js';

export interface SetEnvVarsInput {
  siteId: string;
  vars?: Record<string, string>;
  action?: 'set' | 'list';
  context?: 'all' | 'dev' | 'branch-deploy' | 'deploy-preview' | 'production';
}

export class NetlifySetEnvVarsTool {
  readonly id = 'netlifySetEnvVars';
  readonly name = 'netlifySetEnvVars';
  readonly displayName = 'Set Environment Variables';
  readonly description = 'Set or list environment variables on a Netlify site. Variables can be scoped to specific deploy contexts (production, deploy-preview, branch-deploy, dev). Available to builds, functions, and edge functions.';
  readonly category = 'cloud';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      siteId: { type: 'string', description: 'Netlify site ID or name' },
      vars: { type: 'object', description: 'Key-value pairs of environment variables to set' },
      action: { type: 'string', enum: ['set', 'list'], description: 'Action to perform (default: set)' },
      context: {
        type: 'string',
        enum: ['all', 'dev', 'branch-deploy', 'deploy-preview', 'production'],
        description: 'Deploy context for the variables (default: all)',
      },
    },
    required: ['siteId'],
  };

  constructor(private service: NetlifyService) {}

  async execute(args: SetEnvVarsInput): Promise<{
    success: boolean;
    data?: { set: number } | NetlifyEnvVar[];
    error?: string;
  }> {
    try {
      const action = args.action ?? 'set';

      if (action === 'list') {
        const envVars = await this.service.listEnvVars(args.siteId);
        return { success: true, data: envVars };
      }

      if (!args.vars || Object.keys(args.vars).length === 0) {
        return { success: false, error: 'No environment variables provided. Pass vars as a key-value object.' };
      }

      const context = args.context ?? 'all';
      await this.service.setEnvVars(args.siteId, args.vars, context);
      return { success: true, data: { set: Object.keys(args.vars).length } };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
