// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AWSConfigureCloudFrontTool } from '../src/tools/configureCloudFront';
import { AWSConfigureLambdaTool } from '../src/tools/configureLambda';
import { AWSCreateLightsailTool } from '../src/tools/createLightsail';
import { AWSDeployAmplifyTool } from '../src/tools/deployAmplify';
import { AWSDeployS3SiteTool } from '../src/tools/deployS3Site';
import { AWSManageRoute53Tool } from '../src/tools/manageRoute53';

// ---------------------------------------------------------------------------
// Mock fs (used by configureLambda and deployS3Site)
// ---------------------------------------------------------------------------

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(() => Buffer.from('mock-zip-data')),
  readdirSync: vi.fn(() => ['index.html', 'style.css']),
  statSync: vi.fn(() => ({ isDirectory: () => false })),
}));

// ---------------------------------------------------------------------------
// AWSConfigureCloudFrontTool
// ---------------------------------------------------------------------------

describe('AWSConfigureCloudFrontTool', () => {
  let service: any;
  let tool: AWSConfigureCloudFrontTool;

  beforeEach(() => {
    service = {
      createDistribution: vi.fn(),
    };
    tool = new AWSConfigureCloudFrontTool(service);
  });

  it('should have correct metadata', () => {
    expect(tool.id).toBe('awsConfigureCloudFront');
    expect(tool.name).toBe('awsConfigureCloudFront');
    expect(tool.displayName).toBe('Configure CloudFront');
    expect(tool.inputSchema.type).toBe('object');
    expect(tool.inputSchema.required).toContain('originDomainName');
    expect(tool.category).toBe('cloud');
  });

  it('should create a distribution successfully', async () => {
    service.createDistribution.mockResolvedValue({
      id: 'E1234',
      domainName: 'd111111abcdef8.cloudfront.net',
      status: 'Deployed',
    });

    const result = await tool.execute({
      originDomainName: 'my-bucket.s3.us-east-1.amazonaws.com',
    });

    expect(result.success).toBe(true);
    expect(result.data?.domainName).toBe('d111111abcdef8.cloudfront.net');
    expect(service.createDistribution).toHaveBeenCalledWith(
      expect.objectContaining({
        originDomainName: 'my-bucket.s3.us-east-1.amazonaws.com',
        isS3Origin: true,
      }),
    );
  });

  it('should include DNS instructions when aliases are provided', async () => {
    service.createDistribution.mockResolvedValue({
      id: 'E1234',
      domainName: 'd111111abcdef8.cloudfront.net',
      status: 'Deployed',
    });

    const result = await tool.execute({
      originDomainName: 'my-bucket.s3.us-east-1.amazonaws.com',
      aliases: ['www.example.com'],
    });

    expect(result.success).toBe(true);
    expect(result.data?.dnsInstructions).toContain('www.example.com');
    expect(result.data?.dnsInstructions).toContain('d111111abcdef8.cloudfront.net');
  });

  it('should not include DNS instructions when no aliases', async () => {
    service.createDistribution.mockResolvedValue({
      id: 'E1234',
      domainName: 'd111111abcdef8.cloudfront.net',
      status: 'Deployed',
    });

    const result = await tool.execute({
      originDomainName: 'my-bucket.s3.us-east-1.amazonaws.com',
    });

    expect(result.success).toBe(true);
    expect(result.data?.dnsInstructions).toBeUndefined();
  });

  it('should handle errors gracefully', async () => {
    service.createDistribution.mockRejectedValue(new Error('Access denied'));

    const result = await tool.execute({
      originDomainName: 'my-bucket.s3.us-east-1.amazonaws.com',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Access denied');
  });
});

// ---------------------------------------------------------------------------
// AWSConfigureLambdaTool
// ---------------------------------------------------------------------------

describe('AWSConfigureLambdaTool', () => {
  let service: any;
  let tool: AWSConfigureLambdaTool;

  beforeEach(() => {
    service = {
      createOrUpdateFunction: vi.fn(),
      getFunction: vi.fn(),
      invokeFunction: vi.fn(),
    };
    tool = new AWSConfigureLambdaTool(service);
  });

  it('should have correct metadata', () => {
    expect(tool.id).toBe('awsConfigureLambda');
    expect(tool.name).toBe('awsConfigureLambda');
    expect(tool.inputSchema.type).toBe('object');
    expect(tool.inputSchema.required).toContain('functionName');
  });

  it('should deploy a Lambda function successfully', async () => {
    service.createOrUpdateFunction.mockResolvedValue({
      functionName: 'my-func',
      functionArn: 'arn:aws:lambda:us-east-1:123456789:function:my-func',
      runtime: 'nodejs20.x',
      state: 'Active',
    });

    const result = await tool.execute({
      functionName: 'my-func',
      runtime: 'nodejs20.x',
      handler: 'index.handler',
      roleArn: 'arn:aws:iam::123456789:role/lambda-exec',
      zipFilePath: '/tmp/function.zip',
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('functionName', 'my-func');
    expect(service.createOrUpdateFunction).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'my-func',
        runtime: 'nodejs20.x',
        handler: 'index.handler',
      }),
    );
  });

  it('should get a Lambda function', async () => {
    service.getFunction.mockResolvedValue({
      functionName: 'my-func',
      runtime: 'nodejs20.x',
      state: 'Active',
    });

    const result = await tool.execute({
      functionName: 'my-func',
      action: 'get',
    });

    expect(result.success).toBe(true);
    expect(service.getFunction).toHaveBeenCalledWith('my-func');
  });

  it('should invoke a Lambda function', async () => {
    service.invokeFunction.mockResolvedValue({
      statusCode: 200,
      payload: '{"result":"ok"}',
    });

    const result = await tool.execute({
      functionName: 'my-func',
      action: 'invoke',
      invokePayload: { key: 'value' },
    });

    expect(result.success).toBe(true);
    expect(service.invokeFunction).toHaveBeenCalledWith('my-func', { key: 'value' });
  });

  it('should fail deploy when runtime is missing', async () => {
    const result = await tool.execute({
      functionName: 'my-func',
      action: 'deploy',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('runtime is required');
  });

  it('should fail deploy when handler is missing', async () => {
    const result = await tool.execute({
      functionName: 'my-func',
      action: 'deploy',
      runtime: 'nodejs20.x',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('handler is required');
  });

  it('should fail deploy when roleArn is missing', async () => {
    const result = await tool.execute({
      functionName: 'my-func',
      action: 'deploy',
      runtime: 'nodejs20.x',
      handler: 'index.handler',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('roleArn is required');
  });

  it('should fail deploy when zipFilePath is missing', async () => {
    const result = await tool.execute({
      functionName: 'my-func',
      action: 'deploy',
      runtime: 'nodejs20.x',
      handler: 'index.handler',
      roleArn: 'arn:aws:iam::123456789:role/lambda-exec',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('zipFilePath is required');
  });

  it('should handle errors gracefully', async () => {
    service.createOrUpdateFunction.mockRejectedValue(new Error('Rate exceeded'));

    const result = await tool.execute({
      functionName: 'my-func',
      runtime: 'nodejs20.x',
      handler: 'index.handler',
      roleArn: 'arn:aws:iam::123456789:role/lambda-exec',
      zipFilePath: '/tmp/function.zip',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Rate exceeded');
  });
});

// ---------------------------------------------------------------------------
// AWSCreateLightsailTool
// ---------------------------------------------------------------------------

describe('AWSCreateLightsailTool', () => {
  let service: any;
  let tool: AWSCreateLightsailTool;

  beforeEach(() => {
    service = {
      createLightsailInstance: vi.fn(),
      getLightsailInstances: vi.fn(),
      deleteLightsailInstance: vi.fn(),
    };
    tool = new AWSCreateLightsailTool(service);
  });

  it('should have correct metadata', () => {
    expect(tool.id).toBe('awsCreateLightsail');
    expect(tool.name).toBe('awsCreateLightsail');
    expect(tool.inputSchema.type).toBe('object');
    expect(tool.inputSchema.required).toEqual([]);
  });

  it('should create a Lightsail instance', async () => {
    service.createLightsailInstance.mockResolvedValue({
      name: 'my-server',
      state: 'running',
      publicIpAddress: '1.2.3.4',
    });

    const result = await tool.execute({
      instanceName: 'my-server',
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('name', 'my-server');
    expect(service.createLightsailInstance).toHaveBeenCalledWith(
      expect.objectContaining({
        instanceName: 'my-server',
        blueprintId: 'ubuntu_22_04',
        bundleId: 'nano_3_0',
      }),
    );
  });

  it('should list Lightsail instances', async () => {
    service.getLightsailInstances.mockResolvedValue([
      { name: 'inst-1', state: 'running' },
      { name: 'inst-2', state: 'stopped' },
    ]);

    const result = await tool.execute({ action: 'list' });

    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
    expect(service.getLightsailInstances).toHaveBeenCalled();
  });

  it('should delete a Lightsail instance', async () => {
    service.deleteLightsailInstance.mockResolvedValue(undefined);

    const result = await tool.execute({
      action: 'delete',
      instanceName: 'my-server',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ deleted: 'my-server' });
  });

  it('should fail create without instanceName', async () => {
    const result = await tool.execute({ action: 'create' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('instanceName is required');
  });

  it('should fail delete without instanceName', async () => {
    const result = await tool.execute({ action: 'delete' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('instanceName is required');
  });

  it('should handle errors gracefully', async () => {
    service.createLightsailInstance.mockRejectedValue(new Error('Quota exceeded'));

    const result = await tool.execute({
      instanceName: 'my-server',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Quota exceeded');
  });
});

// ---------------------------------------------------------------------------
// AWSDeployAmplifyTool
// ---------------------------------------------------------------------------

describe('AWSDeployAmplifyTool', () => {
  let service: any;
  let tool: AWSDeployAmplifyTool;

  beforeEach(() => {
    service = {
      createAmplifyApp: vi.fn(),
      createAmplifyBranch: vi.fn(),
      startAmplifyDeployment: vi.fn(),
    };
    tool = new AWSDeployAmplifyTool(service);
  });

  it('should have correct metadata', () => {
    expect(tool.id).toBe('awsDeployAmplify');
    expect(tool.name).toBe('awsDeployAmplify');
    expect(tool.inputSchema.type).toBe('object');
    expect(tool.inputSchema.required).toContain('appName');
    expect(tool.inputSchema.required).toContain('repository');
  });

  it('should deploy an Amplify app from a repository', async () => {
    service.createAmplifyApp.mockResolvedValue({
      appId: 'app-123',
      name: 'my-app',
      defaultDomain: 'my-app.amplifyapp.com',
    });
    service.createAmplifyBranch.mockResolvedValue({ branchName: 'main' });
    service.startAmplifyDeployment.mockResolvedValue({
      jobId: 'job-456',
      status: 'PENDING',
    });

    const result = await tool.execute({
      appName: 'my-app',
      repository: 'https://github.com/user/repo',
    });

    expect(result.success).toBe(true);
    expect(result.data?.app.appId).toBe('app-123');
    expect(result.data?.deployment.jobId).toBe('job-456');
    expect(service.createAmplifyApp).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'my-app', repository: 'https://github.com/user/repo' }),
    );
    expect(service.createAmplifyBranch).toHaveBeenCalledWith('app-123', 'main', expect.any(Object));
    expect(service.startAmplifyDeployment).toHaveBeenCalledWith('app-123', 'main');
  });

  it('should use custom branch name', async () => {
    service.createAmplifyApp.mockResolvedValue({ appId: 'app-1' });
    service.createAmplifyBranch.mockResolvedValue({});
    service.startAmplifyDeployment.mockResolvedValue({ jobId: 'j1' });

    await tool.execute({
      appName: 'app',
      repository: 'https://github.com/user/repo',
      branch: 'develop',
    });

    expect(service.createAmplifyBranch).toHaveBeenCalledWith('app-1', 'develop', expect.any(Object));
  });

  it('should handle errors gracefully', async () => {
    service.createAmplifyApp.mockRejectedValue(new Error('Invalid repo'));

    const result = await tool.execute({
      appName: 'my-app',
      repository: 'https://github.com/bad/repo',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid repo');
  });
});

// ---------------------------------------------------------------------------
// AWSDeployS3SiteTool
// ---------------------------------------------------------------------------

describe('AWSDeployS3SiteTool', () => {
  let service: any;
  let tool: AWSDeployS3SiteTool;

  beforeEach(() => {
    service = {
      region: 'us-east-1',
      createBucket: vi.fn(),
      deletePublicAccessBlock: vi.fn(),
      putBucketWebsite: vi.fn(),
      putBucketPolicyPublicRead: vi.fn(),
      putObject: vi.fn(),
    };
    tool = new AWSDeployS3SiteTool(service);
  });

  it('should have correct metadata', () => {
    expect(tool.id).toBe('awsDeployS3Site');
    expect(tool.name).toBe('awsDeployS3Site');
    expect(tool.inputSchema.type).toBe('object');
    expect(tool.inputSchema.required).toContain('bucketName');
    expect(tool.inputSchema.required).toContain('sourceDir');
  });

  it('should deploy a static site to S3', async () => {
    const result = await tool.execute({
      bucketName: 'my-site-bucket',
      sourceDir: '/tmp/build',
    });

    expect(result.success).toBe(true);
    expect(result.data?.bucketName).toBe('my-site-bucket');
    expect(result.data?.websiteUrl).toContain('my-site-bucket');
    expect(result.data?.region).toBe('us-east-1');
    expect(service.createBucket).toHaveBeenCalledWith('my-site-bucket', 'us-east-1');
    expect(service.deletePublicAccessBlock).toHaveBeenCalledWith('my-site-bucket');
    expect(service.putBucketWebsite).toHaveBeenCalledWith('my-site-bucket', 'index.html', 'error.html');
    expect(service.putBucketPolicyPublicRead).toHaveBeenCalledWith('my-site-bucket');
  });

  it('should use custom region', async () => {
    const result = await tool.execute({
      bucketName: 'my-site-bucket',
      sourceDir: '/tmp/build',
      region: 'eu-west-1',
    });

    expect(result.success).toBe(true);
    expect(result.data?.region).toBe('eu-west-1');
    expect(service.createBucket).toHaveBeenCalledWith('my-site-bucket', 'eu-west-1');
  });

  it('should handle errors gracefully', async () => {
    service.createBucket.mockRejectedValue(new Error('Bucket already exists'));

    const result = await tool.execute({
      bucketName: 'existing-bucket',
      sourceDir: '/tmp/build',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Bucket already exists');
  });
});

// ---------------------------------------------------------------------------
// AWSManageRoute53Tool
// ---------------------------------------------------------------------------

describe('AWSManageRoute53Tool', () => {
  let service: any;
  let tool: AWSManageRoute53Tool;

  beforeEach(() => {
    service = {
      listHostedZones: vi.fn(),
      listRecordSets: vi.fn(),
      changeRecordSets: vi.fn(),
    };
    tool = new AWSManageRoute53Tool(service);
  });

  it('should have correct metadata', () => {
    expect(tool.id).toBe('awsManageRoute53');
    expect(tool.name).toBe('awsManageRoute53');
    expect(tool.inputSchema.type).toBe('object');
    expect(tool.inputSchema.required).toContain('action');
  });

  it('should list hosted zones', async () => {
    service.listHostedZones.mockResolvedValue([
      { id: 'Z1234', name: 'example.com.', recordCount: 5 },
    ]);

    const result = await tool.execute({ action: 'list-zones' });

    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
    expect(service.listHostedZones).toHaveBeenCalled();
  });

  it('should list records in a hosted zone', async () => {
    service.listRecordSets.mockResolvedValue([
      { name: 'example.com.', type: 'A', ttl: 300, values: ['1.2.3.4'] },
    ]);

    const result = await tool.execute({
      action: 'list',
      hostedZoneId: 'Z1234',
    });

    expect(result.success).toBe(true);
    expect(service.listRecordSets).toHaveBeenCalledWith('Z1234');
  });

  it('should fail list without hostedZoneId', async () => {
    const result = await tool.execute({ action: 'list' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('hostedZoneId is required');
  });

  it('should upsert a DNS record', async () => {
    service.changeRecordSets.mockResolvedValue({
      changeId: 'C1234',
      status: 'PENDING',
    });

    const result = await tool.execute({
      action: 'upsert',
      hostedZoneId: 'Z1234',
      recordName: 'www.example.com',
      recordType: 'A',
      values: ['1.2.3.4'],
      ttl: 300,
    });

    expect(result.success).toBe(true);
    expect(service.changeRecordSets).toHaveBeenCalledWith('Z1234', [
      expect.objectContaining({
        action: 'UPSERT',
        name: 'www.example.com.',
        type: 'A',
      }),
    ]);
  });

  it('should add a DNS record with CREATE action', async () => {
    service.changeRecordSets.mockResolvedValue({ changeId: 'C5', status: 'PENDING' });

    const result = await tool.execute({
      action: 'add',
      hostedZoneId: 'Z1234',
      recordName: 'mail.example.com.',
      recordType: 'MX',
      values: ['10 mx.example.com'],
    });

    expect(result.success).toBe(true);
    expect(service.changeRecordSets).toHaveBeenCalledWith('Z1234', [
      expect.objectContaining({ action: 'CREATE' }),
    ]);
  });

  it('should remove a DNS record', async () => {
    service.changeRecordSets.mockResolvedValue({ changeId: 'C6', status: 'PENDING' });

    const result = await tool.execute({
      action: 'remove',
      hostedZoneId: 'Z1234',
      recordName: 'old.example.com',
      recordType: 'CNAME',
      values: ['target.example.com'],
    });

    expect(result.success).toBe(true);
    expect(service.changeRecordSets).toHaveBeenCalledWith('Z1234', [
      expect.objectContaining({ action: 'DELETE' }),
    ]);
  });

  it('should fail add/upsert without recordName and recordType', async () => {
    const result = await tool.execute({
      action: 'add',
      hostedZoneId: 'Z1234',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('recordName and recordType are required');
  });

  it('should fail add/upsert without values or aliasTarget', async () => {
    const result = await tool.execute({
      action: 'upsert',
      hostedZoneId: 'Z1234',
      recordName: 'www.example.com',
      recordType: 'A',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Either values or aliasTarget is required');
  });

  it('should handle errors gracefully', async () => {
    service.listHostedZones.mockRejectedValue(new Error('Throttling'));

    const result = await tool.execute({ action: 'list-zones' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Throttling');
  });
});
