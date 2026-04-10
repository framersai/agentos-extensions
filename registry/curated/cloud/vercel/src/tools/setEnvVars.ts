// @ts-nocheck
/**
 * @fileoverview VercelSetEnvVarsTool — set environment variables on a Vercel project.
 */

import type { VercelService, VercelEnvVar } from '../VercelService.js';

export interface SetEnvVarsInput {
  projectId: string;
  vars?: Record<string, string>;
  action?: 'set' | 'list';
  target?: ('production' | 'preview' | 'development')[];
}

export class VercelSetEnvVarsTool {
  readonly id = 'vercelSetEnvVars';
  readonly name = 'vercelSetEnvVars';
  readonly displayName = 'Set Environment Variables';
  readonly description = 'Set or list environment variables on a Vercel project. Variables are encrypted at rest. Targets production, preview, and development environments by default.';
  readonly category = 'cloud';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      projectId: { type: 'string', description: 'Vercel project ID or name' },
      vars: { type: 'object', description: 'Key-value pairs of environment variables to set' },
      action: { type: 'string', enum: ['set', 'list'], description: 'Action to perform (default: set)' },
      target: {
        type: 'array',
        items: { type: 'string', enum: ['production', 'preview', 'development'] },
        description: 'Deployment targets for the variables (default: all three)',
      },
    },
    required: ['projectId'],
  };

  constructor(private service: VercelService) {}

  async execute(args: SetEnvVarsInput): Promise<{
    success: boolean;
    data?: { set: number } | VercelEnvVar[];
    error?: string;
  }> {
    try {
      const action = args.action ?? 'set';

      if (action === 'list') {
        const envVars = await this.service.listEnvVars(args.projectId);
        return { success: true, data: envVars };
      }

      if (!args.vars || Object.keys(args.vars).length === 0) {
        return { success: false, error: 'No environment variables provided. Pass vars as a key-value object.' };
      }

      const target = args.target ?? ['production', 'preview', 'development'];
      await this.service.setEnvVars(args.projectId, args.vars, target);
      return { success: true, data: { set: Object.keys(args.vars).length } };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
