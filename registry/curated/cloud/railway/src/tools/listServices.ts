// @ts-nocheck
/**
 * @fileoverview RailwayListServicesTool — list all projects and services on Railway.
 */

import type { RailwayService, RailwayProject } from '../RailwayService.js';

export interface RailwayListServicesInput {
  projectId?: string;
}

export class RailwayListServicesTool {
  readonly id = 'railwayListServices';
  readonly name = 'railwayListServices';
  readonly displayName = 'List Railway Services';
  readonly description = 'List all Railway projects and their services. Optionally filter to a single project by ID. Shows project name, environments, and all services with their status.';
  readonly category = 'cloud';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      projectId: { type: 'string', description: 'Filter to a specific project ID (optional — lists all projects if omitted)' },
    },
    required: [] as string[],
  };

  constructor(private service: RailwayService) {}

  async execute(args: RailwayListServicesInput): Promise<{ success: boolean; data?: RailwayProject[]; error?: string }> {
    try {
      if (args.projectId) {
        const project = await this.service.getProject(args.projectId);
        return { success: true, data: [project] };
      }

      const projects = await this.service.listProjects();
      return { success: true, data: projects };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
