// @ts-nocheck
/**
 * @fileoverview VercelGetDeploymentTool — check the status of a Vercel deployment.
 */

import type { VercelService, VercelDeployment } from '../VercelService.js';

export class VercelGetDeploymentTool {
  readonly id = 'vercelGetDeployment';
  readonly name = 'vercelGetDeployment';
  readonly displayName = 'Get Deployment Status';
  readonly description = 'Check the current status of a Vercel deployment by its ID. Returns state (BUILDING, READY, ERROR), URL, and inspector link.';
  readonly category = 'cloud';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      deploymentId: { type: 'string', description: 'The deployment ID or URL to check' },
    },
    required: ['deploymentId'],
  };

  constructor(private service: VercelService) {}

  async execute(args: { deploymentId: string }): Promise<{ success: boolean; data?: VercelDeployment; error?: string }> {
    try {
      const deployment = await this.service.getDeployment(args.deploymentId);
      return { success: true, data: deployment };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
