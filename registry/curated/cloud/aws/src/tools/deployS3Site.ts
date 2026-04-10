// @ts-nocheck
/**
 * @fileoverview AWSDeployS3SiteTool — deploy a static site to S3 with website hosting enabled.
 *
 * Creates the bucket if it doesn't exist, enables static website hosting,
 * sets a public-read bucket policy, and uploads files.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import type { AWSService, S3DeployResult } from '../AWSService.js';

// ---------------------------------------------------------------------------
// MIME type lookup (minimal — covers common static site assets)
// ---------------------------------------------------------------------------

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
  '.map': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

function getMimeType(filePath: string): string {
  return MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

/** Recursively collect all file paths under a directory. */
function walkDir(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...walkDir(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface DeployS3SiteInput {
  /** S3 bucket name (must be globally unique). */
  bucketName: string;
  /** Path to the local directory containing the static site files. */
  sourceDir: string;
  /** Index document filename (default: "index.html"). */
  indexDocument?: string;
  /** Error document filename (default: "error.html"). */
  errorDocument?: string;
  /** AWS region for the bucket (uses service default if omitted). */
  region?: string;
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export class AWSDeployS3SiteTool {
  readonly id = 'awsDeployS3Site';
  readonly name = 'awsDeployS3Site';
  readonly displayName = 'Deploy S3 Static Site';
  readonly description = 'Deploy a static website to an S3 bucket. Creates the bucket if needed, enables static website hosting, sets a public-read bucket policy, and uploads all files from a local directory. Returns the website URL.';
  readonly category = 'cloud';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      bucketName: { type: 'string', description: 'S3 bucket name (must be globally unique)' },
      sourceDir: { type: 'string', description: 'Path to local directory containing static site files' },
      indexDocument: { type: 'string', description: 'Index document filename (default: "index.html")' },
      errorDocument: { type: 'string', description: 'Error document filename (default: "error.html")' },
      region: { type: 'string', description: 'AWS region for the bucket (uses configured default if omitted)' },
    },
    required: ['bucketName', 'sourceDir'],
  };

  constructor(private service: AWSService) {}

  async execute(args: DeployS3SiteInput): Promise<{
    success: boolean;
    data?: S3DeployResult;
    error?: string;
  }> {
    try {
      const region = args.region ?? this.service.region;
      const indexDoc = args.indexDocument ?? 'index.html';
      const errorDoc = args.errorDocument ?? 'error.html';

      // 1. Create bucket
      await this.service.createBucket(args.bucketName, region);

      // 2. Remove public access block (required before setting public policy)
      await this.service.deletePublicAccessBlock(args.bucketName);

      // 3. Enable website hosting
      await this.service.putBucketWebsite(args.bucketName, indexDoc, errorDoc);

      // 4. Set public-read bucket policy
      await this.service.putBucketPolicyPublicRead(args.bucketName);

      // 5. Upload files
      const files = walkDir(args.sourceDir);
      let uploaded = 0;
      for (const filePath of files) {
        const key = relative(args.sourceDir, filePath).replace(/\\/g, '/');
        const content = readFileSync(filePath);
        const contentType = getMimeType(filePath);
        await this.service.putObject(args.bucketName, key, content, contentType);
        uploaded++;
      }

      const websiteUrl = `http://${args.bucketName}.s3-website-${region}.amazonaws.com`;

      return {
        success: true,
        data: {
          bucketName: args.bucketName,
          websiteUrl,
          region,
          filesUploaded: uploaded,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
