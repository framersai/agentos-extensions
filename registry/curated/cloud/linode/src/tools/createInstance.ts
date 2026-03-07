/**
 * @fileoverview LinodeCreateInstanceTool — create a Linode VPS instance.
 */

import type { LinodeService, LinodeInstance } from '../LinodeService.js';

export interface CreateInstanceInput {
  /** Region slug (e.g. "us-east", "eu-west", "ap-south") */
  region: string;
  /** Instance type/plan (e.g. "g6-nanode-1", "g6-standard-2") */
  plan: string;
  /** Image ID (e.g. "linode/ubuntu22.04", "linode/debian12", "linode/almalinux9") */
  image: string;
  /** Human-readable label for the instance */
  label?: string;
  /** Root password (must be 7-128 characters with two complexity requirements) */
  rootPass: string;
  /** Tags for organizing instances */
  tags?: string[];
  /** Authorized SSH public keys */
  authorizedKeys?: string[];
  /** Enable automatic backups */
  backupsEnabled?: boolean;
  /** Allocate a private IP address */
  privateIp?: boolean;
}

export class LinodeCreateInstanceTool {
  readonly id = 'linodeCreateInstance';
  readonly name = 'linodeCreateInstance';
  readonly displayName = 'Create Linode Instance';
  readonly description = 'Create a new Linode VPS instance. Specify region, plan, OS image, and optional SSH keys. The instance will begin provisioning immediately and is typically ready within 1-2 minutes.';
  readonly category = 'cloud';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      region: { type: 'string', description: 'Region slug (e.g. "us-east", "eu-west", "ap-south"). Use linodeListInstances to see available regions.' },
      plan: { type: 'string', description: 'Instance type/plan (e.g. "g6-nanode-1" for 1GB, "g6-standard-2" for 4GB)' },
      image: { type: 'string', description: 'OS image ID (e.g. "linode/ubuntu22.04", "linode/debian12", "linode/almalinux9")' },
      label: { type: 'string', description: 'Human-readable label for the instance' },
      rootPass: { type: 'string', description: 'Root password (7-128 chars, must meet complexity requirements)' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Tags for organizing instances' },
      authorizedKeys: { type: 'array', items: { type: 'string' }, description: 'Authorized SSH public keys' },
      backupsEnabled: { type: 'boolean', description: 'Enable automatic backups (default: false)' },
      privateIp: { type: 'boolean', description: 'Allocate a private IP address (default: false)' },
    },
    required: ['region', 'plan', 'image', 'rootPass'],
  };

  constructor(private service: LinodeService) {}

  async execute(args: CreateInstanceInput): Promise<{ success: boolean; data?: LinodeInstance; error?: string }> {
    try {
      const instance = await this.service.createInstance({
        region: args.region,
        type: args.plan,
        image: args.image,
        root_pass: args.rootPass,
        label: args.label,
        tags: args.tags,
        authorized_keys: args.authorizedKeys,
        backups_enabled: args.backupsEnabled,
        private_ip: args.privateIp,
      });
      return { success: true, data: instance };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
