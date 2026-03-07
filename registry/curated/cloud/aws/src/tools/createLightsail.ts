/**
 * @fileoverview AWSCreateLightsailTool — create, list, or delete Lightsail instances.
 *
 * Supports creating instances with specific blueprints (OS/app images) and bundles
 * (instance sizes), listing existing instances, and deleting instances.
 */

import type { AWSService, LightsailInstance } from '../AWSService.js';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface CreateLightsailInput {
  /** Action to perform (default: "create"). */
  action?: 'create' | 'list' | 'delete';
  /** Instance name (required for create and delete). */
  instanceName?: string;
  /**
   * Blueprint ID — the OS or application image.
   * Examples: "amazon_linux_2", "ubuntu_22_04", "nodejs", "wordpress", "lamp_8"
   * Default: "ubuntu_22_04"
   */
  blueprintId?: string;
  /**
   * Bundle ID — the instance size/plan.
   * Examples: "nano_3_0" ($3.50/mo), "micro_3_0" ($5/mo), "small_3_0" ($10/mo), "medium_3_0" ($20/mo)
   * Default: "nano_3_0"
   */
  bundleId?: string;
  /** Availability zone (default: {region}a). */
  availabilityZone?: string;
  /** User data script to run on instance launch (base64-encoded or plain text). */
  userData?: string;
  /** Tags to apply to the instance. */
  tags?: Array<{ key: string; value: string }>;
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export class AWSCreateLightsailTool {
  readonly id = 'awsCreateLightsail';
  readonly name = 'awsCreateLightsail';
  readonly displayName = 'Create Lightsail Instance';
  readonly description = 'Create, list, or delete AWS Lightsail instances. Lightsail provides simple virtual private servers with fixed pricing. Supports blueprints for common OS images (Ubuntu, Amazon Linux) and application stacks (WordPress, Node.js, LAMP).';
  readonly category = 'cloud';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['create', 'list', 'delete'],
        description: 'Action to perform (default: "create")',
      },
      instanceName: {
        type: 'string',
        description: 'Instance name (required for create and delete)',
      },
      blueprintId: {
        type: 'string',
        description: 'Blueprint ID — OS or app image (e.g. "ubuntu_22_04", "wordpress", "nodejs"). Default: "ubuntu_22_04"',
      },
      bundleId: {
        type: 'string',
        description: 'Bundle ID — instance size (e.g. "nano_3_0" $3.50/mo, "micro_3_0" $5/mo, "small_3_0" $10/mo). Default: "nano_3_0"',
      },
      availabilityZone: {
        type: 'string',
        description: 'Availability zone (default: {region}a)',
      },
      userData: {
        type: 'string',
        description: 'User data script to run on instance launch',
      },
      tags: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string' },
            value: { type: 'string' },
          },
          required: ['key', 'value'],
        },
        description: 'Tags to apply to the instance',
      },
    },
    required: [] as string[],
  };

  constructor(private service: AWSService) {}

  async execute(args: CreateLightsailInput): Promise<{
    success: boolean;
    data?: LightsailInstance | LightsailInstance[] | { deleted: string };
    error?: string;
  }> {
    try {
      const action = args.action ?? 'create';

      switch (action) {
        case 'list': {
          const instances = await this.service.getLightsailInstances();
          return { success: true, data: instances };
        }

        case 'delete': {
          if (!args.instanceName) {
            return { success: false, error: 'instanceName is required for delete action' };
          }
          await this.service.deleteLightsailInstance(args.instanceName);
          return { success: true, data: { deleted: args.instanceName } };
        }

        case 'create':
        default: {
          if (!args.instanceName) {
            return { success: false, error: 'instanceName is required for create action' };
          }
          const instance = await this.service.createLightsailInstance({
            instanceName: args.instanceName,
            blueprintId: args.blueprintId ?? 'ubuntu_22_04',
            bundleId: args.bundleId ?? 'nano_3_0',
            availabilityZone: args.availabilityZone,
            userData: args.userData,
            tags: args.tags,
          });
          return { success: true, data: instance };
        }
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
