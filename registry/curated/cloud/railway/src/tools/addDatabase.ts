// @ts-nocheck
/**
 * @fileoverview RailwayAddDatabaseTool — provision a database plugin on Railway.
 */

import type { RailwayService, RailwayPlugin } from '../RailwayService.js';

export interface RailwayAddDatabaseInput {
  projectId: string;
  plugin: 'postgresql' | 'redis' | 'mysql' | 'mongodb';
}

export class RailwayAddDatabaseTool {
  readonly id = 'railwayAddDatabase';
  readonly name = 'railwayAddDatabase';
  readonly displayName = 'Add Railway Database';
  readonly description = 'Provision a database plugin in a Railway project. Supports PostgreSQL, Redis, MySQL, and MongoDB. The database will be automatically connected to services in the same project via environment variables.';
  readonly category = 'cloud';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      projectId: { type: 'string', description: 'Railway project ID to add the database to' },
      plugin: {
        type: 'string',
        enum: ['postgresql', 'redis', 'mysql', 'mongodb'],
        description: 'Database type to provision',
      },
    },
    required: ['projectId', 'plugin'],
  };

  constructor(private service: RailwayService) {}

  async execute(args: RailwayAddDatabaseInput): Promise<{ success: boolean; data?: RailwayPlugin; error?: string }> {
    try {
      const plugin = await this.service.createPlugin(args.projectId, args.plugin);
      return { success: true, data: plugin };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
