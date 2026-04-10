// @ts-nocheck
/**
 * @fileoverview AWSConfigureCloudFrontTool — create/configure a CloudFront distribution.
 *
 * Sets up a CloudFront CDN distribution pointing to an S3 bucket (static website)
 * or a custom origin (API, ALB, etc.). Supports custom domain aliases and
 * viewer protocol policies.
 */

import type { AWSService, CloudFrontDistribution } from '../AWSService.js';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface ConfigureCloudFrontInput {
  /** The origin domain name (e.g. "my-bucket.s3.us-east-1.amazonaws.com" or "api.example.com"). */
  originDomainName: string;
  /** Custom origin ID (auto-generated if omitted). */
  originId?: string;
  /** Whether the origin is an S3 bucket (default: true). If false, uses CustomOriginConfig. */
  isS3Origin?: boolean;
  /** Whether the distribution is enabled (default: true). */
  enabled?: boolean;
  /** Default root object (default: "index.html"). */
  defaultRootObject?: string;
  /** Comment/description for the distribution. */
  comment?: string;
  /**
   * Price class controlling which edge locations are used.
   * "PriceClass_100" = US/Canada/Europe (cheapest).
   * "PriceClass_200" = + Asia/Middle East/Africa.
   * "PriceClass_All" = all edge locations.
   * Default: "PriceClass_100".
   */
  priceClass?: string;
  /** Custom domain aliases (CNAMEs) for the distribution (e.g. ["www.example.com"]). */
  aliases?: string[];
  /**
   * Viewer protocol policy.
   * "redirect-to-https" (default), "allow-all", or "https-only".
   */
  viewerProtocolPolicy?: string;
  /**
   * Origin protocol policy (for custom origins only).
   * "https-only" (default), "http-only", or "match-viewer".
   */
  originProtocolPolicy?: string;
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export class AWSConfigureCloudFrontTool {
  readonly id = 'awsConfigureCloudFront';
  readonly name = 'awsConfigureCloudFront';
  readonly displayName = 'Configure CloudFront';
  readonly description = 'Create a CloudFront CDN distribution for an S3 bucket or custom origin. Configures edge caching, HTTPS redirection, price class, and custom domain aliases. Returns the CloudFront domain name (*.cloudfront.net) for DNS configuration.';
  readonly category = 'cloud';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      originDomainName: {
        type: 'string',
        description: 'Origin domain name (e.g. "my-bucket.s3.us-east-1.amazonaws.com" or "api.example.com")',
      },
      originId: {
        type: 'string',
        description: 'Custom origin ID (auto-generated if omitted)',
      },
      isS3Origin: {
        type: 'boolean',
        description: 'Whether the origin is an S3 bucket (default: true). Set to false for custom origins.',
      },
      enabled: {
        type: 'boolean',
        description: 'Whether the distribution is enabled (default: true)',
      },
      defaultRootObject: {
        type: 'string',
        description: 'Default root object (default: "index.html")',
      },
      comment: {
        type: 'string',
        description: 'Comment/description for the distribution',
      },
      priceClass: {
        type: 'string',
        enum: ['PriceClass_100', 'PriceClass_200', 'PriceClass_All'],
        description: 'Price class — PriceClass_100 (cheapest, US/CA/EU), PriceClass_200, or PriceClass_All',
      },
      aliases: {
        type: 'array',
        items: { type: 'string' },
        description: 'Custom domain aliases/CNAMEs (e.g. ["www.example.com"])',
      },
      viewerProtocolPolicy: {
        type: 'string',
        enum: ['redirect-to-https', 'allow-all', 'https-only'],
        description: 'Viewer protocol policy (default: "redirect-to-https")',
      },
      originProtocolPolicy: {
        type: 'string',
        enum: ['https-only', 'http-only', 'match-viewer'],
        description: 'Origin protocol policy for custom origins (default: "https-only")',
      },
    },
    required: ['originDomainName'],
  };

  constructor(private service: AWSService) {}

  async execute(args: ConfigureCloudFrontInput): Promise<{
    success: boolean;
    data?: CloudFrontDistribution & { dnsInstructions?: string };
    error?: string;
  }> {
    try {
      const distribution = await this.service.createDistribution({
        originDomainName: args.originDomainName,
        originId: args.originId,
        isS3Origin: args.isS3Origin ?? true,
        enabled: args.enabled,
        defaultRootObject: args.defaultRootObject,
        comment: args.comment,
        priceClass: args.priceClass,
        aliases: args.aliases,
        viewerProtocolPolicy: args.viewerProtocolPolicy,
        originProtocolPolicy: args.originProtocolPolicy,
      });

      let dnsInstructions: string | undefined;
      if (args.aliases && args.aliases.length > 0) {
        dnsInstructions = `To use custom domains, create CNAME records pointing to "${distribution.domainName}":\n`
          + args.aliases.map((a) => `  ${a} -> ${distribution.domainName}`).join('\n')
          + '\nNote: You also need an SSL certificate in ACM (us-east-1) covering these domains.';
      }

      return {
        success: true,
        data: { ...distribution, dnsInstructions },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
