// @ts-nocheck
/**
 * @fileoverview LinodeCreateNodeBalancerTool — create a NodeBalancer for load balancing.
 */

import type { LinodeService, LinodeNodeBalancer } from '../LinodeService.js';

export interface CreateNodeBalancerInput {
  /** Region slug where the NodeBalancer will be created (e.g. "us-east") */
  region: string;
  /** Human-readable label for the NodeBalancer */
  label?: string;
  /** Maximum number of new TCP connections per second per client IP (0 = unlimited) */
  clientConnThrottle?: number;
  /** Tags for organizing NodeBalancers */
  tags?: string[];
  /** Initial configuration — port, protocol, algorithm, health check, and backend nodes */
  config?: {
    /** Port to listen on (default: 80) */
    port?: number;
    /** Protocol: http, https, tcp (default: http) */
    protocol?: 'http' | 'https' | 'tcp';
    /** Load balancing algorithm (default: roundrobin) */
    algorithm?: 'roundrobin' | 'leastconn' | 'source';
    /** Health check type (default: connection) */
    check?: 'none' | 'connection' | 'http' | 'http_body';
    /** Health check interval in seconds */
    checkInterval?: number;
    /** Health check timeout in seconds */
    checkTimeout?: number;
    /** Number of failed checks before marking unhealthy */
    checkAttempts?: number;
    /** Health check HTTP path (for HTTP checks) */
    checkPath?: string;
    /** Session stickiness (default: table) */
    stickiness?: 'none' | 'table' | 'http_cookie';
    /** Backend nodes (private IP:port pairs of Linode instances in the same region) */
    nodes?: Array<{
      /** Backend address as IP:port (e.g. "192.168.1.1:80") */
      address: string;
      /** Human-readable label */
      label: string;
      /** Weight for load balancing (1-255, default: 100) */
      weight?: number;
      /** Mode: accept, reject, drain, backup */
      mode?: 'accept' | 'reject' | 'drain' | 'backup';
    }>;
  };
}

export class LinodeCreateNodeBalancerTool {
  readonly id = 'linodeCreateNodeBalancer';
  readonly name = 'linodeCreateNodeBalancer';
  readonly displayName = 'Create NodeBalancer';
  readonly description = 'Create a Linode NodeBalancer for load balancing traffic across multiple Linode instances. Configure port, protocol, health checks, and backend nodes. NodeBalancers must be in the same region as the instances they balance.';
  readonly category = 'cloud';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      region: { type: 'string', description: 'Region slug (e.g. "us-east"). Must match the region of backend Linode instances.' },
      label: { type: 'string', description: 'Human-readable label for the NodeBalancer' },
      clientConnThrottle: { type: 'number', description: 'Max new TCP connections per second per client IP (0 = unlimited, default: 0)' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Tags for organizing NodeBalancers' },
      config: {
        type: 'object',
        description: 'Initial config with port, protocol, algorithm, health checks, and backend nodes',
        properties: {
          port: { type: 'number', description: 'Port to listen on (default: 80)' },
          protocol: { type: 'string', enum: ['http', 'https', 'tcp'], description: 'Protocol (default: http)' },
          algorithm: { type: 'string', enum: ['roundrobin', 'leastconn', 'source'], description: 'Load balancing algorithm (default: roundrobin)' },
          check: { type: 'string', enum: ['none', 'connection', 'http', 'http_body'], description: 'Health check type' },
          checkInterval: { type: 'number', description: 'Health check interval in seconds' },
          checkTimeout: { type: 'number', description: 'Health check timeout in seconds' },
          checkAttempts: { type: 'number', description: 'Number of failed checks before marking unhealthy' },
          checkPath: { type: 'string', description: 'HTTP health check path (e.g. "/health")' },
          stickiness: { type: 'string', enum: ['none', 'table', 'http_cookie'], description: 'Session stickiness' },
          nodes: {
            type: 'array',
            description: 'Backend nodes (Linode instances in the same region)',
            items: {
              type: 'object',
              properties: {
                address: { type: 'string', description: 'Backend address as private_ip:port (e.g. "192.168.1.1:80")' },
                label: { type: 'string', description: 'Node label' },
                weight: { type: 'number', description: 'Weight 1-255 (default: 100)' },
                mode: { type: 'string', enum: ['accept', 'reject', 'drain', 'backup'], description: 'Node mode' },
              },
              required: ['address', 'label'],
            },
          },
        },
      },
    },
    required: ['region'],
  };

  constructor(private service: LinodeService) {}

  async execute(args: CreateNodeBalancerInput): Promise<{
    success: boolean;
    data?: LinodeNodeBalancer;
    error?: string;
  }> {
    try {
      const configs = args.config ? [{
        port: args.config.port,
        protocol: args.config.protocol,
        algorithm: args.config.algorithm,
        check: args.config.check,
        check_interval: args.config.checkInterval,
        check_timeout: args.config.checkTimeout,
        check_attempts: args.config.checkAttempts,
        check_path: args.config.checkPath,
        stickiness: args.config.stickiness,
        nodes: args.config.nodes?.map(n => ({
          address: n.address,
          label: n.label,
          weight: n.weight,
          mode: n.mode,
        })),
      }] : undefined;

      const nodeBalancer = await this.service.createNodeBalancer(args.region, {
        label: args.label,
        client_conn_throttle: args.clientConnThrottle,
        tags: args.tags,
        configs,
      });
      return { success: true, data: nodeBalancer };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
