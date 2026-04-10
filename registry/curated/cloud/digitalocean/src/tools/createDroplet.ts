// @ts-nocheck
/**
 * @fileoverview DOCreateDropletTool — create a VPS Droplet with specified region, size, and image.
 */

import type { DigitalOceanService, DODroplet } from '../DigitalOceanService.js';

export interface CreateDropletInput {
  name: string;
  region: string;
  size: string;
  image: string;
  sshKeys?: (string | number)[];
  userData?: string;
  backups?: boolean;
  ipv6?: boolean;
  tags?: string[];
}

export class DOCreateDropletTool {
  readonly id = 'doCreateDroplet';
  readonly name = 'doCreateDroplet';
  readonly displayName = 'Create DO Droplet';
  readonly description = 'Create a DigitalOcean Droplet (VPS instance) with a specified region, size, and OS image. Supports SSH key injection, cloud-init user data scripts, backups, IPv6, and tagging.';
  readonly category = 'cloud';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      name: { type: 'string', description: 'Droplet hostname (e.g. "my-server-01")' },
      region: { type: 'string', description: 'Region slug (e.g. "nyc1", "sfo3", "ams3", "sgp1", "lon1")' },
      size: { type: 'string', description: 'Size slug (e.g. "s-1vcpu-1gb", "s-2vcpu-4gb", "s-4vcpu-8gb")' },
      image: { type: 'string', description: 'Image slug or ID (e.g. "ubuntu-24-04-x64", "debian-12-x64", "docker-20-04")' },
      sshKeys: {
        type: 'array',
        items: { type: ['string', 'number'] },
        description: 'SSH key IDs or fingerprints to embed in the Droplet',
      },
      userData: { type: 'string', description: 'Cloud-init user data script for automated setup' },
      backups: { type: 'boolean', description: 'Enable weekly backups (default: false)' },
      ipv6: { type: 'boolean', description: 'Enable IPv6 networking (default: false)' },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Tags to apply to the Droplet for organization and filtering',
      },
    },
    required: ['name', 'region', 'size', 'image'],
  };

  constructor(private service: DigitalOceanService) {}

  async execute(args: CreateDropletInput): Promise<{ success: boolean; data?: DODroplet; error?: string }> {
    try {
      const droplet = await this.service.createDroplet({
        name: args.name,
        region: args.region,
        size: args.size,
        image: args.image,
        sshKeys: args.sshKeys,
        userData: args.userData,
        backups: args.backups,
        ipv6: args.ipv6,
        tags: args.tags,
      });

      return { success: true, data: droplet };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
