import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AWSService } from '../src/AWSService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockResponse(data: unknown, status = 200, headers?: Record<string, string>): Response {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Headers(headers ?? {}),
    text: vi.fn().mockResolvedValue(body),
    json: vi.fn().mockResolvedValue(typeof data === 'string' ? JSON.parse(data) : data),
    clone: vi.fn(),
  } as unknown as Response;
}

function xmlResponse(xml: string, status = 200): Response {
  return mockResponse(xml, status);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AWSService', () => {
  let service: AWSService;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    service = new AWSService({
      accessKeyId: 'AKIATEST123',
      secretAccessKey: 'secretTest456',
      region: 'us-east-1',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Initialize / Shutdown ───────────────────────────────────────────────

  describe('initialize', () => {
    it('should succeed when STS returns 200', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('<GetCallerIdentityResult></GetCallerIdentityResult>'));
      await service.initialize();
      expect(service.isRunning).toBe(true);
    });

    it('should throw when STS returns non-OK status', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('InvalidClientTokenId', 403));
      await expect(service.initialize()).rejects.toThrow('AWS auth failed: 403');
      expect(service.isRunning).toBe(false);
    });
  });

  describe('shutdown', () => {
    it('should set isRunning to false', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('ok'));
      await service.initialize();
      expect(service.isRunning).toBe(true);
      await service.shutdown();
      expect(service.isRunning).toBe(false);
    });
  });

  // ── Region ──────────────────────────────────────────────────────────────

  describe('region', () => {
    it('should return the configured region', () => {
      expect(service.region).toBe('us-east-1');
    });

    it('should default to us-east-1 when no region is provided', () => {
      const svc = new AWSService({ accessKeyId: 'a', secretAccessKey: 'b' });
      expect(svc.region).toBe('us-east-1');
    });
  });

  // ── S3 ──────────────────────────────────────────────────────────────────

  describe('createBucket', () => {
    it('should create a bucket in us-east-1 without LocationConstraint', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('', 200));
      await service.createBucket('my-bucket');
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callArgs = mockFetch.mock.calls[0];
      // us-east-1 should not include LocationConstraint body
      expect(callArgs[1].body).toBe('');
    });

    it('should include LocationConstraint for non-us-east-1 regions', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('', 200));
      await service.createBucket('my-bucket', 'eu-west-1');
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].body).toContain('<LocationConstraint>eu-west-1</LocationConstraint>');
    });

    it('should treat 409 (BucketAlreadyOwnedByYou) as success', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('BucketAlreadyOwnedByYou', 409));
      await expect(service.createBucket('existing-bucket')).resolves.toBeUndefined();
    });

    it('should throw on non-OK, non-409 responses', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('Access Denied', 403));
      await expect(service.createBucket('forbidden-bucket')).rejects.toThrow('S3 CreateBucket failed: 403');
    });
  });

  describe('putObject', () => {
    it('should upload an object with content type', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('', 200));
      await service.putObject('my-bucket', 'index.html', '<html></html>', 'text/html');
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('my-bucket');
      expect(url).toContain('index.html');
    });

    it('should throw on non-OK response', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('NoSuchBucket', 404));
      await expect(service.putObject('missing', 'file.txt', 'data')).rejects.toThrow('S3 PutObject failed: 404');
    });
  });

  describe('putBucketWebsite', () => {
    it('should configure static website hosting', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('', 200));
      await service.putBucketWebsite('my-bucket');
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].body).toContain('<Suffix>index.html</Suffix>');
      expect(callArgs[1].body).toContain('<Key>error.html</Key>');
    });

    it('should accept custom index and error documents', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('', 200));
      await service.putBucketWebsite('my-bucket', 'main.html', '404.html');
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].body).toContain('<Suffix>main.html</Suffix>');
      expect(callArgs[1].body).toContain('<Key>404.html</Key>');
    });

    it('should throw on failure', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('Forbidden', 403));
      await expect(service.putBucketWebsite('bad-bucket')).rejects.toThrow('S3 PutBucketWebsite failed: 403');
    });
  });

  describe('putBucketPolicyPublicRead', () => {
    it('should set a public-read policy with correct resource ARN', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('', 200));
      await service.putBucketPolicyPublicRead('my-bucket');
      const body = mockFetch.mock.calls[0][1].body;
      expect(body).toContain('arn:aws:s3:::my-bucket/*');
      expect(body).toContain('s3:GetObject');
    });

    it('should throw on failure', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('Access Denied', 403));
      await expect(service.putBucketPolicyPublicRead('x')).rejects.toThrow('S3 PutBucketPolicy failed: 403');
    });
  });

  describe('deletePublicAccessBlock', () => {
    it('should succeed on 200', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('', 200));
      await expect(service.deletePublicAccessBlock('my-bucket')).resolves.toBeUndefined();
    });

    it('should treat 404 as success (not set)', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('Not Found', 404));
      await expect(service.deletePublicAccessBlock('my-bucket')).resolves.toBeUndefined();
    });

    it('should throw on other errors', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('Internal Error', 500));
      await expect(service.deletePublicAccessBlock('my-bucket')).rejects.toThrow('S3 DeletePublicAccessBlock failed: 500');
    });
  });

  // ── Lightsail ───────────────────────────────────────────────────────────

  describe('createLightsailInstance', () => {
    it('should create an instance and return a pending LightsailInstance', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ operations: [{ status: 'Succeeded' }] }));
      const result = await service.createLightsailInstance({
        instanceName: 'web-1',
        blueprintId: 'ubuntu_22_04',
        bundleId: 'nano_3_0',
      });
      expect(result.name).toBe('web-1');
      expect(result.blueprintId).toBe('ubuntu_22_04');
      expect(result.bundleId).toBe('nano_3_0');
      expect(result.state).toBe('pending');
    });
  });

  describe('getLightsailInstances', () => {
    it('should parse and return a list of instances', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        instances: [
          {
            name: 'web-1',
            blueprintId: 'ubuntu_22_04',
            bundleId: 'nano_3_0',
            state: { name: 'running' },
            publicIpAddress: '1.2.3.4',
            privateIpAddress: '10.0.0.1',
            arn: 'arn:aws:lightsail:us-east-1:123:Instance/abc',
          },
        ],
      }));
      const instances = await service.getLightsailInstances();
      expect(instances).toHaveLength(1);
      expect(instances[0].name).toBe('web-1');
      expect(instances[0].state).toBe('running');
      expect(instances[0].publicIpAddress).toBe('1.2.3.4');
    });

    it('should return an empty array when no instances exist', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ instances: [] }));
      const instances = await service.getLightsailInstances();
      expect(instances).toHaveLength(0);
    });
  });

  describe('deleteLightsailInstance', () => {
    it('should call DeleteInstance action', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ operations: [] }));
      await service.deleteLightsailInstance('web-1');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('createLightsailDomainEntry', () => {
    it('should call CreateDomainEntry action', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ operation: {} }));
      await service.createLightsailDomainEntry('example.com', {
        name: 'www',
        type: 'A',
        target: '1.2.3.4',
      });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  // ── Route53 ─────────────────────────────────────────────────────────────

  describe('listHostedZones', () => {
    it('should parse XML and return hosted zones', async () => {
      const xml = `<ListHostedZonesResponse>
        <HostedZones>
          <HostedZone>
            <Id>/hostedzone/Z12345</Id>
            <Name>example.com.</Name>
            <ResourceRecordSetCount>5</ResourceRecordSetCount>
            <CallerReference>ref-123</CallerReference>
          </HostedZone>
        </HostedZones>
      </ListHostedZonesResponse>`;
      mockFetch.mockResolvedValueOnce(xmlResponse(xml));
      const zones = await service.listHostedZones();
      expect(zones).toHaveLength(1);
      expect(zones[0].id).toBe('Z12345');
      expect(zones[0].name).toBe('example.com.');
      expect(zones[0].recordCount).toBe(5);
      expect(zones[0].callerReference).toBe('ref-123');
    });

    it('should throw on non-OK response', async () => {
      mockFetch.mockResolvedValueOnce(xmlResponse('Forbidden', 403));
      await expect(service.listHostedZones()).rejects.toThrow('Route53 ListHostedZones failed: 403');
    });
  });

  describe('listRecordSets', () => {
    it('should parse XML record sets with TTL and values', async () => {
      const xml = `<ListResourceRecordSetsResponse>
        <ResourceRecordSets>
          <ResourceRecordSet>
            <Name>example.com.</Name>
            <Type>A</Type>
            <TTL>300</TTL>
            <ResourceRecords>
              <ResourceRecord><Value>1.2.3.4</Value></ResourceRecord>
            </ResourceRecords>
          </ResourceRecordSet>
        </ResourceRecordSets>
      </ListResourceRecordSetsResponse>`;
      mockFetch.mockResolvedValueOnce(xmlResponse(xml));
      const records = await service.listRecordSets('Z12345');
      expect(records).toHaveLength(1);
      expect(records[0].name).toBe('example.com.');
      expect(records[0].type).toBe('A');
      expect(records[0].ttl).toBe(300);
      expect(records[0].values).toContain('1.2.3.4');
    });

    it('should handle alias records', async () => {
      const xml = `<ListResourceRecordSetsResponse>
        <ResourceRecordSets>
          <ResourceRecordSet>
            <Name>alias.example.com.</Name>
            <Type>A</Type>
            <AliasTarget>
              <DNSName>d111111abcdef8.cloudfront.net</DNSName>
            </AliasTarget>
          </ResourceRecordSet>
        </ResourceRecordSets>
      </ListResourceRecordSetsResponse>`;
      mockFetch.mockResolvedValueOnce(xmlResponse(xml));
      const records = await service.listRecordSets('Z12345');
      expect(records[0].values).toContain('ALIAS:d111111abcdef8.cloudfront.net');
    });

    it('should strip /hostedzone/ prefix from zone IDs', async () => {
      mockFetch.mockResolvedValueOnce(xmlResponse('<ListResourceRecordSetsResponse><ResourceRecordSets></ResourceRecordSets></ListResourceRecordSetsResponse>'));
      await service.listRecordSets('/hostedzone/Z12345');
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/hostedzone/Z12345/rrset');
      expect(url).not.toContain('/hostedzone//hostedzone/');
    });
  });

  describe('changeRecordSets', () => {
    it('should send UPSERT changes and return changeId and status', async () => {
      const xml = `<ChangeResourceRecordSetsResponse>
        <ChangeInfo>
          <Id>/change/C12345</Id>
          <Status>PENDING</Status>
        </ChangeInfo>
      </ChangeResourceRecordSetsResponse>`;
      mockFetch.mockResolvedValueOnce(xmlResponse(xml));
      const result = await service.changeRecordSets('Z12345', [{
        action: 'UPSERT',
        name: 'test.example.com',
        type: 'A',
        ttl: 300,
        values: ['1.2.3.4'],
      }]);
      expect(result.changeId).toBe('C12345');
      expect(result.status).toBe('PENDING');
    });

    it('should throw on error', async () => {
      mockFetch.mockResolvedValueOnce(xmlResponse('InvalidChangeBatch', 400));
      await expect(service.changeRecordSets('Z12345', [{
        action: 'CREATE',
        name: 'dup.example.com',
        type: 'A',
        values: ['1.1.1.1'],
      }])).rejects.toThrow('Route53 ChangeRecordSets failed: 400');
    });
  });

  // ── Amplify ─────────────────────────────────────────────────────────────

  describe('createAmplifyApp', () => {
    it('should create an app and return AmplifyApp', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        app: {
          appId: 'app-123',
          name: 'my-app',
          defaultDomain: 'd111111.amplifyapp.com',
          repository: 'https://github.com/user/repo',
          platform: 'WEB',
          createTime: '2024-01-01T00:00:00Z',
        },
      }));
      const app = await service.createAmplifyApp({
        name: 'my-app',
        repository: 'https://github.com/user/repo',
      });
      expect(app.appId).toBe('app-123');
      expect(app.name).toBe('my-app');
      expect(app.platform).toBe('WEB');
    });

    it('should throw on non-OK response', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('Unauthorized', 401));
      await expect(service.createAmplifyApp({
        name: 'bad',
        repository: 'https://github.com/user/repo',
      })).rejects.toThrow('AWS Amplify CreateApp failed: 401');
    });
  });

  describe('startAmplifyDeployment', () => {
    it('should return a deployment result', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        jobSummary: {
          jobId: 'job-abc',
          status: 'PENDING',
        },
      }));
      const result = await service.startAmplifyDeployment('app-123', 'main');
      expect(result.appId).toBe('app-123');
      expect(result.branchName).toBe('main');
      expect(result.jobId).toBe('job-abc');
      expect(result.status).toBe('PENDING');
    });
  });

  describe('createAmplifyBranch', () => {
    it('should succeed on 200', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ branch: { branchName: 'dev' } }));
      await expect(service.createAmplifyBranch('app-123', 'dev')).resolves.toBeUndefined();
    });

    it('should treat 409 (branch exists) as success', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('BranchAlreadyExists', 409));
      await expect(service.createAmplifyBranch('app-123', 'main')).resolves.toBeUndefined();
    });

    it('should throw on other errors', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('Not Found', 404));
      await expect(service.createAmplifyBranch('bad-app', 'main')).rejects.toThrow('Amplify CreateBranch failed: 404');
    });
  });

  // ── CloudFront ──────────────────────────────────────────────────────────

  describe('createDistribution', () => {
    it('should parse XML response and return distribution details', async () => {
      const xml = `<Distribution>
        <Id>E1234ABCDEF</Id>
        <DomainName>d111111abcdef8.cloudfront.net</DomainName>
        <Status>InProgress</Status>
      </Distribution>`;
      mockFetch.mockResolvedValueOnce(xmlResponse(xml));
      const dist = await service.createDistribution({
        originDomainName: 'my-bucket.s3.amazonaws.com',
        isS3Origin: true,
      });
      expect(dist.id).toBe('E1234ABCDEF');
      expect(dist.domainName).toBe('d111111abcdef8.cloudfront.net');
      expect(dist.status).toBe('InProgress');
      expect(dist.enabled).toBe(true);
      expect(dist.origins).toHaveLength(1);
      expect(dist.origins[0].domainName).toBe('my-bucket.s3.amazonaws.com');
    });

    it('should throw on non-OK response', async () => {
      mockFetch.mockResolvedValueOnce(xmlResponse('MalformedInput', 400));
      await expect(service.createDistribution({
        originDomainName: 'bad',
      })).rejects.toThrow('CloudFront CreateDistribution failed: 400');
    });
  });

  // ── Lambda ──────────────────────────────────────────────────────────────

  describe('createOrUpdateFunction', () => {
    const baseFnOpts = {
      functionName: 'my-fn',
      runtime: 'nodejs20.x',
      handler: 'index.handler',
      roleArn: 'arn:aws:iam::123:role/lambda-role',
      zipBuffer: Buffer.from('fake-zip'),
    };

    it('should create a new function on 200', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        FunctionName: 'my-fn',
        FunctionArn: 'arn:aws:lambda:us-east-1:123:function:my-fn',
        Runtime: 'nodejs20.x',
        Handler: 'index.handler',
        CodeSize: 1024,
        MemorySize: 128,
        Timeout: 30,
        LastModified: '2024-01-01',
      }));
      const fn = await service.createOrUpdateFunction(baseFnOpts);
      expect(fn.functionName).toBe('my-fn');
      expect(fn.runtime).toBe('nodejs20.x');
      expect(fn.handler).toBe('index.handler');
      expect(fn.memorySize).toBe(128);
    });

    it('should update code and config when function exists (409)', async () => {
      // Create returns 409
      mockFetch.mockResolvedValueOnce(mockResponse('ResourceConflictException', 409));
      // UpdateFunctionCode succeeds
      mockFetch.mockResolvedValueOnce(mockResponse('{}'));
      // UpdateFunctionConfiguration succeeds
      mockFetch.mockResolvedValueOnce(mockResponse({
        FunctionName: 'my-fn',
        FunctionArn: 'arn:aws:lambda:us-east-1:123:function:my-fn',
        Runtime: 'nodejs20.x',
        Handler: 'index.handler',
        CodeSize: 2048,
        MemorySize: 256,
        Timeout: 60,
        LastModified: '2024-01-02',
      }));
      const fn = await service.createOrUpdateFunction({
        ...baseFnOpts,
        memorySize: 256,
        timeout: 60,
      });
      expect(fn.functionName).toBe('my-fn');
      expect(fn.memorySize).toBe(256);
      expect(fn.timeout).toBe(60);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should throw if update code fails after 409', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('ResourceConflictException', 409));
      mockFetch.mockResolvedValueOnce(mockResponse('Internal Error', 500));
      await expect(service.createOrUpdateFunction(baseFnOpts)).rejects.toThrow('Lambda UpdateFunctionCode failed: 500');
    });

    it('should throw on non-409 create failure', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('InvalidParameterValue', 400));
      await expect(service.createOrUpdateFunction(baseFnOpts)).rejects.toThrow('Lambda CreateFunction failed: 400');
    });
  });

  describe('getFunction', () => {
    it('should return a mapped LambdaFunction', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        Configuration: {
          FunctionName: 'my-fn',
          FunctionArn: 'arn:aws:lambda:us-east-1:123:function:my-fn',
          Runtime: 'nodejs20.x',
          Handler: 'index.handler',
          CodeSize: 4096,
          MemorySize: 512,
          Timeout: 15,
          LastModified: '2024-06-01',
        },
      }));
      const fn = await service.getFunction('my-fn');
      expect(fn.functionName).toBe('my-fn');
      expect(fn.codeSize).toBe(4096);
      expect(fn.memorySize).toBe(512);
    });

    it('should throw on non-OK response', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('ResourceNotFoundException', 404));
      await expect(service.getFunction('missing-fn')).rejects.toThrow('AWS Lambda GetFunction failed: 404');
    });
  });

  describe('invokeFunction', () => {
    it('should invoke a function and return the result', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(JSON.stringify({ result: 'ok' })));
      const result = await service.invokeFunction('my-fn', { key: 'value' });
      expect(result.statusCode).toBe(200);
      expect(result.payload).toContain('result');
    });

    it('should invoke with empty body when no payload provided', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('null'));
      const result = await service.invokeFunction('my-fn');
      expect(result.statusCode).toBe(200);
    });

    it('should return functionError when present in headers', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse('{"errorMessage":"timeout"}', 200, { 'x-amz-function-error': 'Unhandled' }),
      );
      const result = await service.invokeFunction('my-fn');
      expect(result.functionError).toBe('Unhandled');
    });
  });
});
