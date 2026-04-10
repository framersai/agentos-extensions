// @ts-nocheck
/**
 * @fileoverview AWSDeployAmplifyTool — deploy an application via AWS Amplify from a Git repository.
 *
 * Creates an Amplify app linked to a Git repo, creates a branch, and triggers
 * a deployment. Supports framework detection and environment variable injection.
 */

import type { AWSService, AmplifyApp, AmplifyDeployResult } from '../AWSService.js';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface DeployAmplifyInput {
  /** Application name in Amplify. */
  appName: string;
  /** Git repository URL (e.g. "https://github.com/user/repo"). */
  repository: string;
  /** Branch to deploy (default: "main"). */
  branch?: string;
  /**
   * OAuth token for repository access (GitHub personal access token).
   * Required for private repositories.
   */
  oauthToken?: string;
  /** Framework preset (e.g. "Next.js - SSR", "React"). Auto-detected if omitted. */
  framework?: string;
  /** Amplify build specification (amplify.yml content). */
  buildSpec?: string;
  /** Environment variables to set on the app. */
  environmentVariables?: Record<string, string>;
  /** Deployment stage (default: "PRODUCTION"). */
  stage?: string;
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export class AWSDeployAmplifyTool {
  readonly id = 'awsDeployAmplify';
  readonly name = 'awsDeployAmplify';
  readonly displayName = 'Deploy via Amplify';
  readonly description = 'Deploy an application via AWS Amplify from a Git repository. Creates the Amplify app if it does not exist, sets up a branch, and triggers a deployment. Supports Next.js, React, Vue, Angular, and static sites with automatic framework detection.';
  readonly category = 'cloud';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      appName: { type: 'string', description: 'Application name in Amplify' },
      repository: { type: 'string', description: 'Git repository URL (e.g. "https://github.com/user/repo")' },
      branch: { type: 'string', description: 'Branch to deploy (default: "main")' },
      oauthToken: { type: 'string', description: 'OAuth/personal access token for private repos' },
      framework: { type: 'string', description: 'Framework preset (auto-detected if omitted)' },
      buildSpec: { type: 'string', description: 'Amplify build specification (amplify.yml content)' },
      environmentVariables: { type: 'object', description: 'Environment variables as key-value pairs' },
      stage: { type: 'string', description: 'Deployment stage (default: "PRODUCTION")' },
    },
    required: ['appName', 'repository'],
  };

  constructor(private service: AWSService) {}

  async execute(args: DeployAmplifyInput): Promise<{
    success: boolean;
    data?: { app: AmplifyApp; deployment: AmplifyDeployResult };
    error?: string;
  }> {
    try {
      const branchName = args.branch ?? 'main';

      // 1. Create the Amplify app
      const app = await this.service.createAmplifyApp({
        name: args.appName,
        repository: args.repository,
        oauthToken: args.oauthToken,
        buildSpec: args.buildSpec,
        environmentVariables: args.environmentVariables,
      });

      // 2. Create the branch
      await this.service.createAmplifyBranch(app.appId, branchName, {
        framework: args.framework,
        stage: args.stage ?? 'PRODUCTION',
        environmentVariables: args.environmentVariables,
      });

      // 3. Start deployment
      const deployment = await this.service.startAmplifyDeployment(app.appId, branchName);

      return {
        success: true,
        data: { app, deployment },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
