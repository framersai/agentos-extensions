/**
 * @fileoverview LinodeDeployStackScriptTool — deploy a Linode instance using a StackScript
 * for automated setup and provisioning.
 */

import type { LinodeService, LinodeInstance } from '../LinodeService.js';

export interface DeployStackScriptInput {
  /** StackScript ID to deploy */
  stackscriptId: number;
  /** Region slug (e.g. "us-east") */
  region: string;
  /** Instance type/plan (e.g. "g6-nanode-1") */
  plan: string;
  /** OS image compatible with the StackScript (e.g. "linode/ubuntu22.04") */
  image: string;
  /** Root password for the instance */
  rootPass: string;
  /** StackScript user-defined fields (UDFs) as key-value pairs */
  stackscriptData?: Record<string, string>;
  /** Human-readable label for the instance */
  label?: string;
  /** Tags for organizing instances */
  tags?: string[];
  /** Authorized SSH public keys */
  authorizedKeys?: string[];
  /** Enable automatic backups */
  backupsEnabled?: boolean;
  /** Allocate a private IP address */
  privateIp?: boolean;
}

export class LinodeDeployStackScriptTool {
  readonly id = 'linodeDeployStackScript';
  readonly name = 'linodeDeployStackScript';
  readonly displayName = 'Deploy StackScript';
  readonly description = 'Deploy a new Linode instance using a StackScript for automated setup. StackScripts are reusable provisioning scripts that run on first boot. Provide the StackScript ID, required user-defined fields, and instance configuration.';
  readonly category = 'cloud';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      stackscriptId: { type: 'number', description: 'StackScript ID to deploy (find IDs in Linode Cloud Manager or via API)' },
      region: { type: 'string', description: 'Region slug (e.g. "us-east", "eu-west")' },
      plan: { type: 'string', description: 'Instance type/plan (e.g. "g6-nanode-1", "g6-standard-2")' },
      image: { type: 'string', description: 'OS image compatible with the StackScript (e.g. "linode/ubuntu22.04")' },
      rootPass: { type: 'string', description: 'Root password for the instance' },
      stackscriptData: { type: 'object', description: 'StackScript user-defined fields (UDFs) as key-value pairs. Check the StackScript for required fields.' },
      label: { type: 'string', description: 'Human-readable label for the instance' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Tags for organizing instances' },
      authorizedKeys: { type: 'array', items: { type: 'string' }, description: 'Authorized SSH public keys' },
      backupsEnabled: { type: 'boolean', description: 'Enable automatic backups (default: false)' },
      privateIp: { type: 'boolean', description: 'Allocate a private IP address (default: false)' },
    },
    required: ['stackscriptId', 'region', 'plan', 'image', 'rootPass'],
  };

  constructor(private service: LinodeService) {}

  async execute(args: DeployStackScriptInput): Promise<{ success: boolean; data?: LinodeInstance; error?: string }> {
    try {
      const instance = await this.service.createInstance({
        region: args.region,
        type: args.plan,
        image: args.image,
        root_pass: args.rootPass,
        stackscript_id: args.stackscriptId,
        stackscript_data: args.stackscriptData,
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
