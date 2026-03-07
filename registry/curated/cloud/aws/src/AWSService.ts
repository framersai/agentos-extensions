/**
 * @fileoverview AWS REST API service layer with minimal SigV4 signing.
 *
 * Wraps AWS REST APIs for S3, Lightsail, Route53, Amplify, CloudFront, and Lambda.
 * Uses direct HTTP calls with AWS Signature Version 4 signing — no AWS SDK required.
 * Only depends on Node.js built-in `crypto` module.
 */

import { createHmac, createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AWSConfig {
  /** AWS Access Key ID */
  accessKeyId: string;
  /** AWS Secret Access Key */
  secretAccessKey: string;
  /** AWS Region (defaults to us-east-1) */
  region?: string;
  /** Base URL override for testing */
  baseUrl?: string;
}

export interface S3DeployResult {
  bucketName: string;
  websiteUrl: string;
  region: string;
  filesUploaded: number;
}

export interface LightsailInstance {
  name: string;
  blueprintId: string;
  bundleId: string;
  state: string;
  publicIpAddress?: string;
  privateIpAddress?: string;
  createdAt?: string;
  arn?: string;
}

export interface Route53HostedZone {
  id: string;
  name: string;
  recordCount: number;
  callerReference: string;
}

export interface Route53Record {
  name: string;
  type: string;
  ttl?: number;
  values: string[];
}

export interface AmplifyApp {
  appId: string;
  name: string;
  defaultDomain: string;
  repository?: string;
  platform: string;
  createTime?: string;
}

export interface AmplifyDeployResult {
  appId: string;
  branchName: string;
  jobId: string;
  status: string;
}

export interface CloudFrontDistribution {
  id: string;
  domainName: string;
  status: string;
  enabled: boolean;
  origins: Array<{ id: string; domainName: string }>;
  arn?: string;
}

export interface LambdaFunction {
  functionName: string;
  functionArn: string;
  runtime: string;
  handler: string;
  codeSize: number;
  memorySize: number;
  timeout: number;
  lastModified: string;
}

// ---------------------------------------------------------------------------
// SigV4 Signing
// ---------------------------------------------------------------------------

interface SignedRequest {
  url: string;
  headers: Record<string, string>;
}

/**
 * Minimal AWS Signature Version 4 signer.
 *
 * Implements the four-step signing process:
 * 1. Create canonical request
 * 2. Create string to sign
 * 3. Calculate signing key
 * 4. Add authorization header
 *
 * @see https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv.html
 */
function sha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function hmacSha256(key: string | Buffer, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

function getSigningKey(
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Buffer {
  const kDate = hmacSha256(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  const kSigning = hmacSha256(kService, 'aws4_request');
  return kSigning;
}

function signRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  body: string,
  service: string,
  region: string,
  accessKeyId: string,
  secretAccessKey: string,
): SignedRequest {
  const parsedUrl = new URL(url);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const dateStamp = amzDate.slice(0, 8);

  // Prepare headers
  const signedHeaders: Record<string, string> = {
    ...headers,
    host: parsedUrl.host,
    'x-amz-date': amzDate,
  };

  // Content hash
  const payloadHash = sha256(body);
  signedHeaders['x-amz-content-sha256'] = payloadHash;

  // Sort header keys for canonical headers
  const sortedKeys = Object.keys(signedHeaders)
    .map((k) => k.toLowerCase())
    .sort();
  const canonicalHeaders = sortedKeys
    .map((k) => `${k}:${signedHeaders[Object.keys(signedHeaders).find((hk) => hk.toLowerCase() === k)!]?.trim()}`)
    .join('\n') + '\n';
  const signedHeadersList = sortedKeys.join(';');

  // Canonical query string
  const params = Array.from(parsedUrl.searchParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  // Canonical URI (ensure path is properly encoded)
  const canonicalUri = parsedUrl.pathname || '/';

  // Step 1: Canonical Request
  const canonicalRequest = [
    method.toUpperCase(),
    canonicalUri,
    params,
    canonicalHeaders,
    signedHeadersList,
    payloadHash,
  ].join('\n');

  // Step 2: String to Sign
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join('\n');

  // Step 3: Signing Key
  const signingKey = getSigningKey(secretAccessKey, dateStamp, region, service);

  // Step 4: Signature
  const signature = createHmac('sha256', signingKey)
    .update(stringToSign)
    .digest('hex');

  // Authorization header
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeadersList}, Signature=${signature}`;

  // Return the signed headers (merge authorization into the original casing)
  const resultHeaders: Record<string, string> = { ...headers };
  resultHeaders['x-amz-date'] = amzDate;
  resultHeaders['x-amz-content-sha256'] = payloadHash;
  resultHeaders['Authorization'] = authorization;

  return { url, headers: resultHeaders };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AWSService {
  private config: Required<Pick<AWSConfig, 'accessKeyId' | 'secretAccessKey'>> & {
    region: string;
    baseUrl?: string;
  };
  private running = false;

  constructor(config: AWSConfig) {
    this.config = {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      region: config.region ?? 'us-east-1',
      baseUrl: config.baseUrl,
    };
  }

  async initialize(): Promise<void> {
    // Validate credentials by calling STS GetCallerIdentity
    const result = await this.stsRequest('GetCallerIdentity');
    if (!result.ok) {
      const body = await result.text();
      throw new Error(`AWS auth failed: ${result.status} ${body}`);
    }
    this.running = true;
  }

  async shutdown(): Promise<void> {
    this.running = false;
  }

  get isRunning(): boolean {
    return this.running;
  }

  get region(): string {
    return this.config.region;
  }

  // ── S3 ──────────────────────────────────────────────────────────────────

  /** Create an S3 bucket. */
  async createBucket(bucket: string, region?: string): Promise<void> {
    const r = region ?? this.config.region;
    let body = '';
    // us-east-1 must NOT include LocationConstraint
    if (r !== 'us-east-1') {
      body = `<CreateBucketConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><LocationConstraint>${r}</LocationConstraint></CreateBucketConfiguration>`;
    }
    const res = await this.s3Request('PUT', bucket, '/', {}, body, r);
    // 409 = BucketAlreadyOwnedByYou — that's fine
    if (!res.ok && res.status !== 409) {
      const text = await res.text();
      throw new Error(`S3 CreateBucket failed: ${res.status} ${text.slice(0, 500)}`);
    }
  }

  /** Upload an object to S3. */
  async putObject(
    bucket: string,
    key: string,
    body: string | Buffer,
    contentType?: string,
  ): Promise<void> {
    const headers: Record<string, string> = {};
    if (contentType) headers['Content-Type'] = contentType;
    const res = await this.s3Request(
      'PUT', bucket, `/${encodeURIComponent(key)}`, headers,
      typeof body === 'string' ? body : body.toString('base64'),
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`S3 PutObject failed: ${res.status} ${text.slice(0, 500)}`);
    }
  }

  /** Enable static website hosting on an S3 bucket. */
  async putBucketWebsite(
    bucket: string,
    indexDocument = 'index.html',
    errorDocument = 'error.html',
  ): Promise<void> {
    const body = `<WebsiteConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <IndexDocument><Suffix>${indexDocument}</Suffix></IndexDocument>
  <ErrorDocument><Key>${errorDocument}</Key></ErrorDocument>
</WebsiteConfiguration>`;
    const res = await this.s3Request('PUT', bucket, '/?website', {}, body);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`S3 PutBucketWebsite failed: ${res.status} ${text.slice(0, 500)}`);
    }
  }

  /** Set a public-read bucket policy for static website hosting. */
  async putBucketPolicyPublicRead(bucket: string): Promise<void> {
    const policy = JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'PublicReadGetObject',
          Effect: 'Allow',
          Principal: '*',
          Action: 's3:GetObject',
          Resource: `arn:aws:s3:::${bucket}/*`,
        },
      ],
    });
    const res = await this.s3Request('PUT', bucket, '/?policy', {
      'Content-Type': 'application/json',
    }, policy);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`S3 PutBucketPolicy failed: ${res.status} ${text.slice(0, 500)}`);
    }
  }

  /** Disable S3 Block Public Access so public policies work. */
  async deletePublicAccessBlock(bucket: string): Promise<void> {
    const res = await this.s3Request('DELETE', bucket, '/?publicAccessBlock', {}, '');
    // 404 is fine — means it wasn't set
    if (!res.ok && res.status !== 404) {
      const text = await res.text();
      throw new Error(`S3 DeletePublicAccessBlock failed: ${res.status} ${text.slice(0, 500)}`);
    }
  }

  // ── Lightsail ────────────────────────────────────────────────────────────

  /** Create a Lightsail instance. */
  async createLightsailInstance(opts: {
    instanceName: string;
    blueprintId: string;
    bundleId: string;
    availabilityZone?: string;
    userData?: string;
    tags?: Array<{ key: string; value: string }>;
  }): Promise<LightsailInstance> {
    const payload: Record<string, unknown> = {
      instanceNames: [opts.instanceName],
      blueprintId: opts.blueprintId,
      bundleId: opts.bundleId,
      availabilityZone: opts.availabilityZone ?? `${this.config.region}a`,
    };
    if (opts.userData) payload.userData = opts.userData;
    if (opts.tags) payload.tags = opts.tags;

    const data = await this.lightsailAction('CreateInstances', payload);
    return {
      name: opts.instanceName,
      blueprintId: opts.blueprintId,
      bundleId: opts.bundleId,
      state: 'pending',
    };
  }

  /** Get all Lightsail instances. */
  async getLightsailInstances(): Promise<LightsailInstance[]> {
    const data = await this.lightsailAction('GetInstances', {});
    return (data.instances ?? []).map((i: any) => ({
      name: i.name,
      blueprintId: i.blueprintId ?? '',
      bundleId: i.bundleId ?? '',
      state: i.state?.name ?? 'unknown',
      publicIpAddress: i.publicIpAddress,
      privateIpAddress: i.privateIpAddress,
      createdAt: i.createdAt,
      arn: i.arn,
    }));
  }

  /** Delete a Lightsail instance. */
  async deleteLightsailInstance(instanceName: string): Promise<void> {
    await this.lightsailAction('DeleteInstance', { instanceName });
  }

  /** Create a DNS entry via Lightsail. */
  async createLightsailDomainEntry(domainName: string, entry: {
    name: string;
    type: string;
    target: string;
  }): Promise<void> {
    await this.lightsailAction('CreateDomainEntry', {
      domainName,
      domainEntry: {
        name: entry.name,
        type: entry.type,
        target: entry.target,
      },
    });
  }

  // ── Route53 ──────────────────────────────────────────────────────────────

  /** List Route53 hosted zones. */
  async listHostedZones(): Promise<Route53HostedZone[]> {
    const res = await this.route53Request('GET', '/2013-04-01/hostedzone', '');
    const text = await res.text();
    if (!res.ok) throw new Error(`Route53 ListHostedZones failed: ${res.status} ${text.slice(0, 500)}`);

    const zones: Route53HostedZone[] = [];
    const zoneRegex = /<HostedZone>[\s\S]*?<Id>(.*?)<\/Id>[\s\S]*?<Name>(.*?)<\/Name>[\s\S]*?<ResourceRecordSetCount>(.*?)<\/ResourceRecordSetCount>[\s\S]*?<CallerReference>(.*?)<\/CallerReference>[\s\S]*?<\/HostedZone>/g;
    let match;
    while ((match = zoneRegex.exec(text)) !== null) {
      zones.push({
        id: match[1].replace('/hostedzone/', ''),
        name: match[2],
        recordCount: parseInt(match[3], 10),
        callerReference: match[4],
      });
    }
    return zones;
  }

  /** List resource record sets in a hosted zone. */
  async listRecordSets(hostedZoneId: string): Promise<Route53Record[]> {
    const zoneId = hostedZoneId.replace('/hostedzone/', '');
    const res = await this.route53Request('GET', `/2013-04-01/hostedzone/${zoneId}/rrset`, '');
    const text = await res.text();
    if (!res.ok) throw new Error(`Route53 ListRecordSets failed: ${res.status} ${text.slice(0, 500)}`);

    const records: Route53Record[] = [];
    const rrsetRegex = /<ResourceRecordSet>[\s\S]*?<Name>(.*?)<\/Name>[\s\S]*?<Type>(.*?)<\/Type>[\s\S]*?<\/ResourceRecordSet>/g;
    let match;
    while ((match = rrsetRegex.exec(text)) !== null) {
      const block = match[0];
      const ttlMatch = block.match(/<TTL>(.*?)<\/TTL>/);
      const values: string[] = [];
      const valueRegex = /<Value>(.*?)<\/Value>/g;
      let valMatch;
      while ((valMatch = valueRegex.exec(block)) !== null) {
        values.push(valMatch[1]);
      }
      // Also handle alias records
      const aliasMatch = block.match(/<DNSName>(.*?)<\/DNSName>/);
      if (aliasMatch) values.push(`ALIAS:${aliasMatch[1]}`);

      records.push({
        name: match[1],
        type: match[2],
        ttl: ttlMatch ? parseInt(ttlMatch[1], 10) : undefined,
        values,
      });
    }
    return records;
  }

  /** Change resource record sets (add/delete/upsert). */
  async changeRecordSets(hostedZoneId: string, changes: Array<{
    action: 'CREATE' | 'DELETE' | 'UPSERT';
    name: string;
    type: string;
    ttl?: number;
    values: string[];
    aliasTarget?: { hostedZoneId: string; dnsName: string; evaluateTargetHealth?: boolean };
  }>): Promise<{ changeId: string; status: string }> {
    const zoneId = hostedZoneId.replace('/hostedzone/', '');
    const changesXml = changes.map((c) => {
      let rrsetXml: string;
      if (c.aliasTarget) {
        rrsetXml = `
        <ResourceRecordSet>
          <Name>${c.name}</Name>
          <Type>${c.type}</Type>
          <AliasTarget>
            <HostedZoneId>${c.aliasTarget.hostedZoneId}</HostedZoneId>
            <DNSName>${c.aliasTarget.dnsName}</DNSName>
            <EvaluateTargetHealth>${c.aliasTarget.evaluateTargetHealth ?? false}</EvaluateTargetHealth>
          </AliasTarget>
        </ResourceRecordSet>`;
      } else {
        const resourceRecords = c.values
          .map((v) => `<ResourceRecord><Value>${v}</Value></ResourceRecord>`)
          .join('');
        rrsetXml = `
        <ResourceRecordSet>
          <Name>${c.name}</Name>
          <Type>${c.type}</Type>
          <TTL>${c.ttl ?? 300}</TTL>
          <ResourceRecords>${resourceRecords}</ResourceRecords>
        </ResourceRecordSet>`;
      }

      return `
      <Change>
        <Action>${c.action}</Action>
        ${rrsetXml}
      </Change>`;
    }).join('');

    const body = `<?xml version="1.0" encoding="UTF-8"?>
<ChangeResourceRecordSetsRequest xmlns="https://route53.amazonaws.com/doc/2013-04-01/">
  <ChangeBatch>
    <Changes>${changesXml}
    </Changes>
  </ChangeBatch>
</ChangeResourceRecordSetsRequest>`;

    const res = await this.route53Request('POST', `/2013-04-01/hostedzone/${zoneId}/rrset`, body);
    const text = await res.text();
    if (!res.ok) throw new Error(`Route53 ChangeRecordSets failed: ${res.status} ${text.slice(0, 500)}`);

    const changeIdMatch = text.match(/<Id>(.*?)<\/Id>/);
    const statusMatch = text.match(/<Status>(.*?)<\/Status>/);
    return {
      changeId: changeIdMatch?.[1]?.replace('/change/', '') ?? '',
      status: statusMatch?.[1] ?? 'PENDING',
    };
  }

  // ── Amplify ──────────────────────────────────────────────────────────────

  /** Create an Amplify app from a Git repository. */
  async createAmplifyApp(opts: {
    name: string;
    repository: string;
    oauthToken?: string;
    accessToken?: string;
    platform?: string;
    buildSpec?: string;
    environmentVariables?: Record<string, string>;
  }): Promise<AmplifyApp> {
    const payload: Record<string, unknown> = {
      name: opts.name,
      repository: opts.repository,
      platform: opts.platform ?? 'WEB',
    };
    if (opts.oauthToken) payload.oauthToken = opts.oauthToken;
    if (opts.accessToken) payload.accessToken = opts.accessToken;
    if (opts.buildSpec) payload.buildSpec = opts.buildSpec;
    if (opts.environmentVariables) payload.environmentVariables = opts.environmentVariables;

    const res = await this.amplifyRequest('POST', '/apps', JSON.stringify(payload));
    const data = await this.json(res, 'Amplify CreateApp');
    const app = data.app ?? data;
    return {
      appId: app.appId,
      name: app.name,
      defaultDomain: app.defaultDomain ?? '',
      repository: app.repository,
      platform: app.platform ?? 'WEB',
      createTime: app.createTime,
    };
  }

  /** Start a deployment on an Amplify branch. */
  async startAmplifyDeployment(appId: string, branchName: string): Promise<AmplifyDeployResult> {
    const res = await this.amplifyRequest(
      'POST',
      `/apps/${appId}/branches/${encodeURIComponent(branchName)}/deployments`,
      '{}',
    );
    const data = await this.json(res, 'Amplify StartDeployment');
    return {
      appId,
      branchName,
      jobId: data.jobSummary?.jobId ?? data.jobId ?? '',
      status: data.jobSummary?.status ?? data.status ?? 'PENDING',
    };
  }

  /** Create a branch on an Amplify app. */
  async createAmplifyBranch(appId: string, branchName: string, opts?: {
    framework?: string;
    stage?: string;
    environmentVariables?: Record<string, string>;
  }): Promise<void> {
    const payload: Record<string, unknown> = {
      branchName,
    };
    if (opts?.framework) payload.framework = opts.framework;
    if (opts?.stage) payload.stage = opts.stage;
    if (opts?.environmentVariables) payload.environmentVariables = opts.environmentVariables;

    const res = await this.amplifyRequest(
      'POST',
      `/apps/${appId}/branches`,
      JSON.stringify(payload),
    );
    if (!res.ok) {
      const text = await res.text();
      // 409 = branch already exists, that's fine
      if (res.status !== 409) {
        throw new Error(`Amplify CreateBranch failed: ${res.status} ${text.slice(0, 500)}`);
      }
    }
  }

  // ── CloudFront ───────────────────────────────────────────────────────────

  /** Create a CloudFront distribution. */
  async createDistribution(opts: {
    originDomainName: string;
    originId?: string;
    enabled?: boolean;
    defaultRootObject?: string;
    comment?: string;
    priceClass?: string;
    aliases?: string[];
    viewerProtocolPolicy?: string;
    originProtocolPolicy?: string;
    isS3Origin?: boolean;
  }): Promise<CloudFrontDistribution> {
    const originId = opts.originId ?? `origin-${Date.now()}`;
    const callerRef = `cf-${Date.now()}`;
    const viewerPolicy = opts.viewerProtocolPolicy ?? 'redirect-to-https';

    let originXml: string;
    if (opts.isS3Origin) {
      originXml = `
        <Origin>
          <DomainName>${opts.originDomainName}</DomainName>
          <Id>${originId}</Id>
          <S3OriginConfig>
            <OriginAccessIdentity></OriginAccessIdentity>
          </S3OriginConfig>
        </Origin>`;
    } else {
      const originPolicy = opts.originProtocolPolicy ?? 'https-only';
      originXml = `
        <Origin>
          <DomainName>${opts.originDomainName}</DomainName>
          <Id>${originId}</Id>
          <CustomOriginConfig>
            <HTTPPort>80</HTTPPort>
            <HTTPSPort>443</HTTPSPort>
            <OriginProtocolPolicy>${originPolicy}</OriginProtocolPolicy>
          </CustomOriginConfig>
        </Origin>`;
    }

    let aliasesXml = '<Aliases><Quantity>0</Quantity></Aliases>';
    if (opts.aliases && opts.aliases.length > 0) {
      const items = opts.aliases.map((a) => `<CNAME>${a}</CNAME>`).join('');
      aliasesXml = `<Aliases><Quantity>${opts.aliases.length}</Quantity><Items>${items}</Items></Aliases>`;
    }

    const body = `<?xml version="1.0" encoding="UTF-8"?>
<DistributionConfig xmlns="http://cloudfront.amazonaws.com/doc/2020-05-31/">
  <CallerReference>${callerRef}</CallerReference>
  <Comment>${opts.comment ?? 'Created by AgentOS AWS extension'}</Comment>
  <Enabled>${opts.enabled ?? true}</Enabled>
  <DefaultRootObject>${opts.defaultRootObject ?? 'index.html'}</DefaultRootObject>
  <PriceClass>${opts.priceClass ?? 'PriceClass_100'}</PriceClass>
  ${aliasesXml}
  <Origins>
    <Quantity>1</Quantity>
    ${originXml}
  </Origins>
  <DefaultCacheBehavior>
    <TargetOriginId>${originId}</TargetOriginId>
    <ViewerProtocolPolicy>${viewerPolicy}</ViewerProtocolPolicy>
    <AllowedMethods>
      <Quantity>2</Quantity>
      <Items><Method>GET</Method><Method>HEAD</Method></Items>
    </AllowedMethods>
    <ForwardedValues>
      <QueryString>false</QueryString>
      <Cookies><Forward>none</Forward></Cookies>
    </ForwardedValues>
    <MinTTL>0</MinTTL>
    <DefaultTTL>86400</DefaultTTL>
    <MaxTTL>31536000</MaxTTL>
  </DefaultCacheBehavior>
</DistributionConfig>`;

    const res = await this.cloudFrontRequest('POST', '/2020-05-31/distribution', body);
    const text = await res.text();
    if (!res.ok) throw new Error(`CloudFront CreateDistribution failed: ${res.status} ${text.slice(0, 500)}`);

    const idMatch = text.match(/<Id>(.*?)<\/Id>/);
    const domainMatch = text.match(/<DomainName>([^<]*\.cloudfront\.net)<\/DomainName>/);
    const statusMatch = text.match(/<Status>(.*?)<\/Status>/);

    return {
      id: idMatch?.[1] ?? '',
      domainName: domainMatch?.[1] ?? '',
      status: statusMatch?.[1] ?? 'InProgress',
      enabled: opts.enabled ?? true,
      origins: [{ id: originId, domainName: opts.originDomainName }],
    };
  }

  // ── Lambda ───────────────────────────────────────────────────────────────

  /** Create or update a Lambda function. */
  async createOrUpdateFunction(opts: {
    functionName: string;
    runtime: string;
    handler: string;
    roleArn: string;
    zipBuffer: Buffer;
    memorySize?: number;
    timeout?: number;
    environment?: Record<string, string>;
    description?: string;
  }): Promise<LambdaFunction> {
    // Try to create first; if exists, update code + config
    const zipBase64 = opts.zipBuffer.toString('base64');
    const createPayload = JSON.stringify({
      FunctionName: opts.functionName,
      Runtime: opts.runtime,
      Handler: opts.handler,
      Role: opts.roleArn,
      Code: { ZipFile: zipBase64 },
      MemorySize: opts.memorySize ?? 128,
      Timeout: opts.timeout ?? 30,
      Description: opts.description ?? '',
      Environment: opts.environment
        ? { Variables: opts.environment }
        : undefined,
    });

    const createRes = await this.lambdaRequest(
      'POST',
      '/2015-03-31/functions',
      createPayload,
    );

    if (createRes.ok) {
      const data = await createRes.json() as any;
      return this.mapLambdaFunction(data);
    }

    // If 409 (ResourceConflictException) — function exists, update it
    if (createRes.status === 409) {
      // Update function code
      const codePayload = JSON.stringify({ ZipFile: zipBase64 });
      const codeRes = await this.lambdaRequest(
        'PUT',
        `/2015-03-31/functions/${encodeURIComponent(opts.functionName)}/code`,
        codePayload,
      );
      if (!codeRes.ok) {
        const text = await codeRes.text();
        throw new Error(`Lambda UpdateFunctionCode failed: ${codeRes.status} ${text.slice(0, 500)}`);
      }

      // Update function configuration
      const configPayload = JSON.stringify({
        Handler: opts.handler,
        Runtime: opts.runtime,
        Role: opts.roleArn,
        MemorySize: opts.memorySize ?? 128,
        Timeout: opts.timeout ?? 30,
        Description: opts.description ?? '',
        Environment: opts.environment
          ? { Variables: opts.environment }
          : undefined,
      });
      const configRes = await this.lambdaRequest(
        'PUT',
        `/2015-03-31/functions/${encodeURIComponent(opts.functionName)}/configuration`,
        configPayload,
      );
      const data = await this.json(configRes, 'Lambda UpdateFunctionConfiguration');
      return this.mapLambdaFunction(data);
    }

    const text = await createRes.text();
    throw new Error(`Lambda CreateFunction failed: ${createRes.status} ${text.slice(0, 500)}`);
  }

  /** Get a Lambda function. */
  async getFunction(functionName: string): Promise<LambdaFunction> {
    const res = await this.lambdaRequest(
      'GET',
      `/2015-03-31/functions/${encodeURIComponent(functionName)}`,
      '',
    );
    const data = await this.json(res, 'Lambda GetFunction');
    const config = data.Configuration ?? data;
    return this.mapLambdaFunction(config);
  }

  /** Invoke a Lambda function. */
  async invokeFunction(functionName: string, payload?: unknown): Promise<{
    statusCode: number;
    payload: string;
    functionError?: string;
  }> {
    const body = payload ? JSON.stringify(payload) : '';
    const res = await this.lambdaRequest(
      'POST',
      `/2015-03-31/functions/${encodeURIComponent(functionName)}/invocations`,
      body,
    );
    const text = await res.text();
    return {
      statusCode: res.status,
      payload: text,
      functionError: res.headers.get('x-amz-function-error') ?? undefined,
    };
  }

  // ── Request Helpers ──────────────────────────────────────────────────────

  /** Make a signed request to STS. */
  private async stsRequest(action: string): Promise<Response> {
    const body = `Action=${action}&Version=2011-06-15`;
    const url = this.config.baseUrl
      ? `${this.config.baseUrl}/sts`
      : 'https://sts.amazonaws.com/';
    const signed = signRequest('POST', url, {
      'Content-Type': 'application/x-www-form-urlencoded',
    }, body, 'sts', this.config.region, this.config.accessKeyId, this.config.secretAccessKey);
    return globalThis.fetch(signed.url, {
      method: 'POST',
      headers: signed.headers,
      body,
    });
  }

  /** Make a signed request to S3. */
  private async s3Request(
    method: string,
    bucket: string,
    path: string,
    extraHeaders: Record<string, string> = {},
    body = '',
    region?: string,
  ): Promise<Response> {
    const r = region ?? this.config.region;
    const url = this.config.baseUrl
      ? `${this.config.baseUrl}/s3/${bucket}${path}`
      : `https://${bucket}.s3.${r}.amazonaws.com${path}`;
    const signed = signRequest(
      method, url,
      { 'Content-Type': 'application/xml', ...extraHeaders },
      body, 's3', r,
      this.config.accessKeyId, this.config.secretAccessKey,
    );
    return globalThis.fetch(signed.url, {
      method,
      headers: signed.headers,
      body: method !== 'GET' && method !== 'HEAD' ? body : undefined,
    });
  }

  /** Make a signed POST to the Lightsail JSON API. */
  private async lightsailAction(action: string, payload: Record<string, unknown>): Promise<any> {
    const url = this.config.baseUrl
      ? `${this.config.baseUrl}/lightsail`
      : `https://lightsail.${this.config.region}.amazonaws.com/`;
    const body = JSON.stringify(payload);
    const signed = signRequest('POST', url, {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': `Lightsail_20161128.${action}`,
    }, body, 'lightsail', this.config.region,
    this.config.accessKeyId, this.config.secretAccessKey);
    const res = await globalThis.fetch(signed.url, {
      method: 'POST',
      headers: signed.headers,
      body,
    });
    return this.json(res, `Lightsail ${action}`);
  }

  /** Make a signed request to Route53 (always uses us-east-1). */
  private async route53Request(method: string, path: string, body: string): Promise<Response> {
    // Route53 is a global service — always sign against us-east-1
    const url = this.config.baseUrl
      ? `${this.config.baseUrl}/route53${path}`
      : `https://route53.amazonaws.com${path}`;
    const headers: Record<string, string> = {};
    if (body) headers['Content-Type'] = 'application/xml';
    const signed = signRequest(
      method, url, headers, body,
      'route53', 'us-east-1',
      this.config.accessKeyId, this.config.secretAccessKey,
    );
    return globalThis.fetch(signed.url, {
      method,
      headers: signed.headers,
      body: method !== 'GET' ? body || undefined : undefined,
    });
  }

  /** Make a signed request to AWS Amplify. */
  private async amplifyRequest(method: string, path: string, body: string): Promise<Response> {
    const url = this.config.baseUrl
      ? `${this.config.baseUrl}/amplify${path}`
      : `https://amplify.${this.config.region}.amazonaws.com${path}`;
    const signed = signRequest(
      method, url,
      { 'Content-Type': 'application/json' },
      body, 'amplify', this.config.region,
      this.config.accessKeyId, this.config.secretAccessKey,
    );
    return globalThis.fetch(signed.url, {
      method,
      headers: signed.headers,
      body: method !== 'GET' ? body : undefined,
    });
  }

  /** Make a signed request to CloudFront (always us-east-1). */
  private async cloudFrontRequest(method: string, path: string, body: string): Promise<Response> {
    // CloudFront is a global service — sign against us-east-1
    const url = this.config.baseUrl
      ? `${this.config.baseUrl}/cloudfront${path}`
      : `https://cloudfront.amazonaws.com${path}`;
    const headers: Record<string, string> = {};
    if (body) headers['Content-Type'] = 'application/xml';
    const signed = signRequest(
      method, url, headers, body,
      'cloudfront', 'us-east-1',
      this.config.accessKeyId, this.config.secretAccessKey,
    );
    return globalThis.fetch(signed.url, {
      method,
      headers: signed.headers,
      body: method !== 'GET' ? body || undefined : undefined,
    });
  }

  /** Make a signed request to AWS Lambda. */
  private async lambdaRequest(method: string, path: string, body: string): Promise<Response> {
    const url = this.config.baseUrl
      ? `${this.config.baseUrl}/lambda${path}`
      : `https://lambda.${this.config.region}.amazonaws.com${path}`;
    const headers: Record<string, string> = {};
    if (body) headers['Content-Type'] = 'application/json';
    const signed = signRequest(
      method, url, headers, body,
      'lambda', this.config.region,
      this.config.accessKeyId, this.config.secretAccessKey,
    );
    return globalThis.fetch(signed.url, {
      method,
      headers: signed.headers,
      body: method !== 'GET' && method !== 'HEAD' ? body || undefined : undefined,
    });
  }

  // ── Response Helpers ─────────────────────────────────────────────────────

  private async json(res: Response, label: string): Promise<any> {
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`AWS ${label} failed: ${res.status} ${text.slice(0, 500)}`);
    }
    return res.json();
  }

  private mapLambdaFunction(data: any): LambdaFunction {
    return {
      functionName: data.FunctionName ?? '',
      functionArn: data.FunctionArn ?? '',
      runtime: data.Runtime ?? '',
      handler: data.Handler ?? '',
      codeSize: data.CodeSize ?? 0,
      memorySize: data.MemorySize ?? 128,
      timeout: data.Timeout ?? 30,
      lastModified: data.LastModified ?? '',
    };
  }
}
