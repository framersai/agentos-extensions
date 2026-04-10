// @ts-nocheck
/**
 * @fileoverview AWSConfigureLambdaTool — deploy a Lambda function from a zip archive.
 *
 * Creates or updates a Lambda function with the specified runtime, handler,
 * and code package. Supports environment variable injection and memory/timeout
 * configuration.
 */

import { readFileSync } from 'node:fs';
import type { AWSService, LambdaFunction } from '../AWSService.js';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface ConfigureLambdaInput {
  /** Action to perform (default: "deploy"). */
  action?: 'deploy' | 'invoke' | 'get';
  /** Lambda function name. */
  functionName: string;
  /**
   * Runtime (e.g. "nodejs20.x", "python3.12", "java21", "provided.al2023").
   * Required for deploy.
   */
  runtime?: string;
  /**
   * Handler entry point (e.g. "index.handler" for Node.js, "lambda_function.lambda_handler" for Python).
   * Required for deploy.
   */
  handler?: string;
  /**
   * IAM role ARN for the Lambda function execution role.
   * Required for deploy.
   */
  roleArn?: string;
  /**
   * Path to the zip file containing the function code.
   * Required for deploy.
   */
  zipFilePath?: string;
  /** Memory size in MB (default: 128, max: 10240). */
  memorySize?: number;
  /** Timeout in seconds (default: 30, max: 900). */
  timeout?: number;
  /** Environment variables for the function. */
  environment?: Record<string, string>;
  /** Description of the function. */
  description?: string;
  /** Payload to send when invoking the function (for "invoke" action). */
  invokePayload?: unknown;
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export class AWSConfigureLambdaTool {
  readonly id = 'awsConfigureLambda';
  readonly name = 'awsConfigureLambda';
  readonly displayName = 'Deploy Lambda Function';
  readonly description = 'Deploy, update, invoke, or inspect an AWS Lambda function. Uploads code from a local zip file. Creates the function if it does not exist, or updates an existing one. Supports all Lambda runtimes (Node.js, Python, Java, Go, .NET, custom).';
  readonly category = 'cloud';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['deploy', 'invoke', 'get'],
        description: 'Action to perform (default: "deploy")',
      },
      functionName: {
        type: 'string',
        description: 'Lambda function name',
      },
      runtime: {
        type: 'string',
        description: 'Runtime (e.g. "nodejs20.x", "python3.12", "java21"). Required for deploy.',
      },
      handler: {
        type: 'string',
        description: 'Handler entry point (e.g. "index.handler"). Required for deploy.',
      },
      roleArn: {
        type: 'string',
        description: 'IAM execution role ARN. Required for deploy.',
      },
      zipFilePath: {
        type: 'string',
        description: 'Path to the zip file containing function code. Required for deploy.',
      },
      memorySize: {
        type: 'number',
        description: 'Memory in MB (default: 128, max: 10240)',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in seconds (default: 30, max: 900)',
      },
      environment: {
        type: 'object',
        description: 'Environment variables as key-value pairs',
      },
      description: {
        type: 'string',
        description: 'Function description',
      },
      invokePayload: {
        description: 'Payload to send when invoking (for "invoke" action)',
      },
    },
    required: ['functionName'],
  };

  constructor(private service: AWSService) {}

  async execute(args: ConfigureLambdaInput): Promise<{
    success: boolean;
    data?: LambdaFunction | { statusCode: number; payload: string; functionError?: string };
    error?: string;
  }> {
    try {
      const action = args.action ?? 'deploy';

      switch (action) {
        case 'get': {
          const fn = await this.service.getFunction(args.functionName);
          return { success: true, data: fn };
        }

        case 'invoke': {
          const result = await this.service.invokeFunction(args.functionName, args.invokePayload);
          return { success: true, data: result };
        }

        case 'deploy':
        default: {
          if (!args.runtime) {
            return { success: false, error: 'runtime is required for deploy (e.g. "nodejs20.x", "python3.12")' };
          }
          if (!args.handler) {
            return { success: false, error: 'handler is required for deploy (e.g. "index.handler")' };
          }
          if (!args.roleArn) {
            return { success: false, error: 'roleArn is required for deploy (IAM execution role ARN)' };
          }
          if (!args.zipFilePath) {
            return { success: false, error: 'zipFilePath is required for deploy (path to .zip with function code)' };
          }

          const zipBuffer = readFileSync(args.zipFilePath);

          const fn = await this.service.createOrUpdateFunction({
            functionName: args.functionName,
            runtime: args.runtime,
            handler: args.handler,
            roleArn: args.roleArn,
            zipBuffer,
            memorySize: args.memorySize,
            timeout: args.timeout,
            environment: args.environment,
            description: args.description,
          });

          return { success: true, data: fn };
        }
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
