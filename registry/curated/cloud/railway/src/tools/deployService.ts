// @ts-nocheck
/**
 * @fileoverview RailwayDeployServiceTool — deploy a service on Railway from a Git repo.
 */

import type { RailwayService, RailwayDeployment, RailwayService_ } from '../RailwayService.js';

export interface RailwayDeployServiceInput {
  projectId?: string;
  projectName?: string;
  repo?: string;
  serviceName?: string;
  serviceId?: string;
  environmentId?: string;
  variables?: Record<string, string>;
}

export class RailwayDeployServiceTool {
  readonly id = 'railwayDeployService';
  readonly name = 'railwayDeployService';
  readonly displayName = 'Deploy Railway Service';
  readonly description = 'Deploy a service on Railway. Either create a new service from a GitHub repo in a project, or trigger a redeployment of an existing service. Can set environment variables before deploying.';
  readonly category = 'cloud';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      projectId: { type: 'string', description: 'Railway project ID to deploy into. If omitted and projectName is given, a new project is created.' },
      projectName: { type: 'string', description: 'Name for a new project (used only when projectId is omitted)' },
      repo: { type: 'string', description: 'GitHub repository to deploy from (e.g. "user/repo"). Required for new services.' },
      serviceName: { type: 'string', description: 'Name for the service (optional)' },
      serviceId: { type: 'string', description: 'Existing service ID to redeploy (triggers rebuild of latest commit)' },
      environmentId: { type: 'string', description: 'Environment ID for redeployment (required with serviceId, defaults to production)' },
      variables: { type: 'object', description: 'Environment variables to set (key-value pairs)' },
    },
    required: [] as string[],
  };

  constructor(private service: RailwayService) {}

  async execute(args: RailwayDeployServiceInput): Promise<{ success: boolean; data?: { service?: RailwayService_; deployment?: RailwayDeployment; projectId: string }; error?: string }> {
    try {
      // Case 1: Redeploy existing service
      if (args.serviceId && args.environmentId) {
        // Set variables if provided
        if (args.variables && Object.keys(args.variables).length > 0) {
          await this.service.upsertVariables(args.serviceId, args.environmentId, args.variables);
        }

        const deployment = await this.service.redeployService(args.serviceId, args.environmentId);
        return {
          success: true,
          data: {
            deployment,
            projectId: args.projectId ?? '',
          },
        };
      }

      // Case 2: Create new service (and project if needed)
      let projectId = args.projectId;

      if (!projectId) {
        const project = await this.service.createProject(
          args.projectName ?? `project-${Date.now()}`,
        );
        projectId = project.id;
      }

      const svc = await this.service.createService(projectId, {
        name: args.serviceName,
        source: args.repo ? { repo: args.repo } : undefined,
        variables: args.variables,
      });

      return {
        success: true,
        data: {
          service: svc,
          projectId,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
