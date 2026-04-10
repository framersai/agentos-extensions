// @ts-nocheck
/**
 * @fileoverview Site Deploy Orchestration Tool — deploy from source to any
 * cloud provider with optional domain registration and DNS configuration.
 *
 * This tool acts as a high-level orchestrator that delegates to per-provider
 * deploy tools and per-registrar domain tools via a `setToolExecutor()` pattern.
 * Similar to MultiChannelPostTool, it does not call cloud or registrar APIs
 * directly — it invokes other tools by name.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type CloudProvider =
  | 'vercel'
  | 'cloudflare'
  | 'digitalocean'
  | 'netlify'
  | 'heroku'
  | 'aws'
  | 'linode'
  | 'railway'
  | 'flyio';

export type DomainRegistrar =
  | 'porkbun'
  | 'namecheap'
  | 'godaddy'
  | 'cloudflare';

export type Framework =
  | 'nextjs'
  | 'react'
  | 'vue'
  | 'svelte'
  | 'astro'
  | 'static'
  | 'node'
  | 'python'
  | 'auto';

export interface SiteDeployInput {
  /** Git repository URL or local directory path. */
  source: string;
  /** Cloud provider to deploy to (default: auto-detect best fit). */
  cloudProvider?: CloudProvider;
  /** Custom domain to configure (optional). */
  domain?: string;
  /** Domain registrar for domain purchase (required if domain is not already registered). */
  domainRegistrar?: DomainRegistrar;
  /** Framework/runtime (default: auto-detect). */
  framework?: Framework;
  /** Environment variables to set on the deployment. */
  envVars?: Record<string, string>;
  /** Build command override. */
  buildCommand?: string;
  /** Output directory override. */
  outputDirectory?: string;
  /** Preview the deployment plan without executing (default: false). */
  dryRun?: boolean;
}

export interface DeployStepResult {
  step: string;
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

export interface SiteDeployOutput {
  /** Detected or specified framework. */
  framework: string;
  /** Selected cloud provider. */
  cloudProvider: string;
  /** Deployment URL (if deployment succeeded). */
  deploymentUrl?: string;
  /** Custom domain status. */
  domainStatus?: 'configured' | 'pending_dns' | 'not_configured' | 'registration_failed';
  /** DNS instructions if manual setup is needed. */
  dnsInstructions?: string[];
  /** Per-step results for transparency. */
  steps: DeployStepResult[];
}

/* ------------------------------------------------------------------ */
/*  Tool executor callback type                                        */
/* ------------------------------------------------------------------ */

export type ToolExecutorFn = (
  toolName: string,
  args: Record<string, unknown>,
) => Promise<{ success: boolean; data?: any; error?: string }>;

/* ------------------------------------------------------------------ */
/*  Static maps                                                        */
/* ------------------------------------------------------------------ */

/** Map cloud provider to its deploy tool name. */
const PROVIDER_TOOL_MAP: Record<CloudProvider, string> = {
  vercel: 'vercelDeploy',
  cloudflare: 'cfDeployPages',
  digitalocean: 'doCreateApp',
  netlify: 'netlifyDeploy',
  heroku: 'herokuDeploy',
  aws: 'awsDeploy',
  linode: 'linodeDeploy',
  railway: 'railwayDeploy',
  flyio: 'flyioDeploy',
};

/** Map registrar to search/register/dns tool names. */
const REGISTRAR_TOOL_MAP: Record<DomainRegistrar, { search: string; register: string; dns: string }> = {
  porkbun: {
    search: 'porkbunSearchDomain',
    register: 'porkbunRegisterDomain',
    dns: 'porkbunConfigureDns',
  },
  namecheap: {
    search: 'namecheapSearchDomain',
    register: 'namecheapRegisterDomain',
    dns: 'namecheapConfigureDns',
  },
  godaddy: {
    search: 'godaddySearchDomain',
    register: 'godaddyRegisterDomain',
    dns: 'godaddyConfigureDns',
  },
  cloudflare: {
    search: 'cfRegGetDomainInfo',
    register: 'cfRegTransferDomain',
    dns: 'cfRegConfigureDns',
  },
};

/** Framework -> recommended providers (first = primary recommendation). */
const FRAMEWORK_PROVIDER_RECOMMENDATIONS: Record<string, CloudProvider[]> = {
  nextjs: ['vercel', 'netlify', 'railway', 'flyio'],
  react: ['vercel', 'cloudflare', 'netlify'],
  vue: ['vercel', 'cloudflare', 'netlify'],
  svelte: ['vercel', 'cloudflare', 'netlify'],
  astro: ['cloudflare', 'vercel', 'netlify'],
  static: ['cloudflare', 'vercel', 'netlify'],
  node: ['railway', 'heroku', 'flyio', 'digitalocean'],
  python: ['railway', 'heroku', 'flyio', 'digitalocean'],
};

/** Framework detection heuristics: filename pattern -> framework. */
const FRAMEWORK_INDICATORS: Array<{ pattern: string; framework: Framework }> = [
  { pattern: 'next.config', framework: 'nextjs' },
  { pattern: 'nuxt.config', framework: 'vue' },
  { pattern: 'vue.config', framework: 'vue' },
  { pattern: 'vite.config', framework: 'vue' },
  { pattern: 'svelte.config', framework: 'svelte' },
  { pattern: 'astro.config', framework: 'astro' },
  { pattern: 'requirements.txt', framework: 'python' },
  { pattern: 'Pipfile', framework: 'python' },
  { pattern: 'pyproject.toml', framework: 'python' },
  { pattern: 'package.json', framework: 'node' },
  { pattern: 'index.html', framework: 'static' },
];

/* ------------------------------------------------------------------ */
/*  SiteDeployTool                                                     */
/* ------------------------------------------------------------------ */

export class SiteDeployTool {
  readonly id = 'siteDeploy';
  readonly name = 'siteDeploy';
  readonly displayName = 'Deploy Site';
  readonly description =
    'Deploy a site from a Git repository or local directory to any supported cloud provider ' +
    '(Vercel, Cloudflare Pages, DigitalOcean, Netlify, Heroku, AWS, Linode, Railway, Fly.io) ' +
    'with optional custom domain registration and DNS configuration. Auto-detects framework ' +
    'and selects the optimal provider if not specified.';
  readonly category = 'cloud';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      source: {
        type: 'string',
        description: 'Git repository URL or local directory path',
      },
      cloudProvider: {
        type: 'string',
        enum: ['vercel', 'cloudflare', 'digitalocean', 'netlify', 'heroku', 'aws', 'linode', 'railway', 'flyio'],
        description: 'Cloud provider to deploy to (default: auto-detect best fit)',
      },
      domain: {
        type: 'string',
        description: 'Custom domain to configure (optional). If not registered, will attempt to register via domainRegistrar.',
      },
      domainRegistrar: {
        type: 'string',
        enum: ['porkbun', 'namecheap', 'godaddy', 'cloudflare'],
        description: 'Domain registrar to use for domain purchase (required if domain is not already registered)',
      },
      framework: {
        type: 'string',
        enum: ['nextjs', 'react', 'vue', 'svelte', 'astro', 'static', 'node', 'python', 'auto'],
        description: 'Framework/runtime (default: auto-detect)',
      },
      envVars: {
        type: 'object',
        additionalProperties: { type: 'string' },
        description: 'Environment variables to set on the deployment',
      },
      buildCommand: {
        type: 'string',
        description: 'Build command override',
      },
      outputDirectory: {
        type: 'string',
        description: 'Output directory override',
      },
      dryRun: {
        type: 'boolean',
        description: 'Preview the deployment plan without executing (default: false)',
      },
    },
    required: ['source'],
  };

  /* -------------------------------------------------------------- */
  /*  Tool executor — set by the orchestrator that loads this ext    */
  /* -------------------------------------------------------------- */

  private toolExecutor?: ToolExecutorFn;

  setToolExecutor(executor: ToolExecutorFn): void {
    this.toolExecutor = executor;
  }

  /* -------------------------------------------------------------- */
  /*  execute()                                                      */
  /* -------------------------------------------------------------- */

  async execute(
    args: SiteDeployInput,
  ): Promise<{ success: boolean; data?: SiteDeployOutput; error?: string }> {
    const steps: DeployStepResult[] = [];
    const dryRun = args.dryRun ?? false;

    try {
      // ── Step 1: Detect framework ─────────────────────────────────
      const framework = this.detectFramework(args.source, args.framework);
      steps.push({
        step: 'detect_framework',
        success: true,
        data: { framework, source: args.source },
      });

      // ── Step 2: Select cloud provider ────────────────────────────
      const provider = this.selectProvider(framework, args.cloudProvider);
      steps.push({
        step: 'select_provider',
        success: true,
        data: { provider, reason: args.cloudProvider ? 'user-specified' : 'auto-selected' },
      });

      // ── Dry run: return the plan ─────────────────────────────────
      if (dryRun) {
        const plan: SiteDeployOutput = {
          framework,
          cloudProvider: provider,
          steps,
          domainStatus: args.domain ? 'not_configured' : undefined,
          dnsInstructions: args.domain
            ? [`Would configure ${args.domain} on ${provider} after deployment.`]
            : undefined,
        };

        if (args.domain && args.domainRegistrar) {
          plan.dnsInstructions!.push(
            `Would check/register ${args.domain} via ${args.domainRegistrar}.`,
          );
        }

        steps.push({
          step: 'dry_run_plan',
          success: true,
          data: {
            deployTool: PROVIDER_TOOL_MAP[provider],
            registrarTools: args.domainRegistrar
              ? REGISTRAR_TOOL_MAP[args.domainRegistrar as DomainRegistrar]
              : undefined,
            envVars: args.envVars ? Object.keys(args.envVars) : [],
            buildCommand: args.buildCommand,
            outputDirectory: args.outputDirectory,
          },
        });

        return { success: true, data: plan };
      }

      // ── Step 3: Deploy to cloud provider ─────────────────────────
      const deployResult = await this.deployToProvider(provider, {
        source: args.source,
        framework,
        envVars: args.envVars,
        buildCommand: args.buildCommand,
        outputDirectory: args.outputDirectory,
      });

      steps.push({
        step: 'deploy',
        success: deployResult.success,
        data: deployResult.data,
        error: deployResult.error,
      });

      if (!deployResult.success) {
        return {
          success: false,
          data: {
            framework,
            cloudProvider: provider,
            steps,
            domainStatus: 'not_configured',
          },
          error: `Deployment to ${provider} failed: ${deployResult.error}`,
        };
      }

      const deploymentUrl =
        (deployResult.data?.url as string) ??
        (deployResult.data?.deploymentUrl as string) ??
        (deployResult.data?.appUrl as string);

      // ── Step 4: Domain setup (if requested) ──────────────────────
      let domainStatus: SiteDeployOutput['domainStatus'] = 'not_configured';
      let dnsInstructions: string[] | undefined;

      if (args.domain) {
        const domainResult = await this.setupDomain(
          args.domain,
          args.domainRegistrar as DomainRegistrar | undefined,
          provider,
          deploymentUrl,
        );

        domainStatus = domainResult.status;
        dnsInstructions = domainResult.instructions;

        for (const step of domainResult.steps) {
          steps.push(step);
        }
      }

      return {
        success: true,
        data: {
          framework,
          cloudProvider: provider,
          deploymentUrl,
          domainStatus,
          dnsInstructions,
          steps,
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        data: {
          framework: args.framework ?? 'auto',
          cloudProvider: args.cloudProvider ?? 'auto',
          steps,
        },
        error: message,
      };
    }
  }

  /* -------------------------------------------------------------- */
  /*  Framework detection                                            */
  /* -------------------------------------------------------------- */

  /**
   * Detect the framework from source path heuristics.
   * Falls back to 'static' if nothing matches.
   */
  private detectFramework(source: string, specified?: string): string {
    if (specified && specified !== 'auto') return specified;

    const lowerSource = source.toLowerCase();

    // Check if the source URL or path hints at a framework
    for (const { pattern, framework } of FRAMEWORK_INDICATORS) {
      if (lowerSource.includes(pattern.toLowerCase())) {
        return framework;
      }
    }

    // Heuristic: GitHub URLs often have framework in the name
    if (lowerSource.includes('next')) return 'nextjs';
    if (lowerSource.includes('react') || lowerSource.includes('cra')) return 'react';
    if (lowerSource.includes('vue') || lowerSource.includes('nuxt')) return 'vue';
    if (lowerSource.includes('svelte') || lowerSource.includes('sveltekit')) return 'svelte';
    if (lowerSource.includes('astro')) return 'astro';
    if (lowerSource.includes('flask') || lowerSource.includes('django') || lowerSource.includes('fastapi')) return 'python';

    // Default to static for unknown sources
    return 'static';
  }

  /* -------------------------------------------------------------- */
  /*  Provider selection                                             */
  /* -------------------------------------------------------------- */

  private selectProvider(
    framework: string,
    specified?: CloudProvider,
  ): CloudProvider {
    if (specified) return specified;

    const recommendations = FRAMEWORK_PROVIDER_RECOMMENDATIONS[framework];
    if (recommendations && recommendations.length > 0) {
      return recommendations[0];
    }

    // Fallback: vercel for frontend, railway for backend
    if (framework === 'node' || framework === 'python') return 'railway';
    return 'vercel';
  }

  /* -------------------------------------------------------------- */
  /*  Deployment                                                     */
  /* -------------------------------------------------------------- */

  private async deployToProvider(
    provider: CloudProvider,
    opts: {
      source: string;
      framework: string;
      envVars?: Record<string, string>;
      buildCommand?: string;
      outputDirectory?: string;
    },
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const toolName = PROVIDER_TOOL_MAP[provider];
    if (!toolName) {
      return { success: false, error: `Unknown cloud provider: ${provider}` };
    }

    if (!this.toolExecutor) {
      return {
        success: false,
        error: `No tool executor available. Deploy tool "${toolName}" cannot be invoked. Ensure the ${provider} extension is installed.`,
      };
    }

    const deployArgs: Record<string, unknown> = {
      source: opts.source,
      framework: opts.framework,
    };
    if (opts.envVars) deployArgs.envVars = opts.envVars;
    if (opts.buildCommand) deployArgs.buildCommand = opts.buildCommand;
    if (opts.outputDirectory) deployArgs.outputDirectory = opts.outputDirectory;

    return this.toolExecutor(toolName, deployArgs);
  }

  /* -------------------------------------------------------------- */
  /*  Domain setup                                                   */
  /* -------------------------------------------------------------- */

  private async setupDomain(
    domain: string,
    registrar: DomainRegistrar | undefined,
    provider: CloudProvider,
    deploymentUrl?: string,
  ): Promise<{
    status: SiteDeployOutput['domainStatus'];
    instructions?: string[];
    steps: DeployStepResult[];
  }> {
    const steps: DeployStepResult[] = [];
    const instructions: string[] = [];

    if (!this.toolExecutor) {
      steps.push({
        step: 'domain_setup',
        success: false,
        error: 'No tool executor available for domain configuration.',
      });
      return { status: 'not_configured', instructions: ['Domain tools not available. Configure DNS manually.'], steps };
    }

    // ── Check if domain is already configured via registrar ────────
    if (registrar) {
      const registrarTools = REGISTRAR_TOOL_MAP[registrar];
      if (!registrarTools) {
        steps.push({
          step: 'domain_check',
          success: false,
          error: `Unknown registrar: ${registrar}`,
        });
        return { status: 'registration_failed', steps };
      }

      // Search / check domain availability
      try {
        const searchResult = await this.toolExecutor(registrarTools.search, { domain });
        steps.push({
          step: 'domain_search',
          success: searchResult.success,
          data: searchResult.data,
          error: searchResult.error,
        });

        // If the domain is available (not yet registered), try to register it.
        // Cloudflare registrar only supports transfers, not new registrations.
        const isAvailable =
          searchResult.data?.available === true ||
          searchResult.data?.status === 'available';

        if (isAvailable && registrar !== 'cloudflare') {
          try {
            const registerResult = await this.toolExecutor(registrarTools.register, {
              domain,
              years: 1,
            });
            steps.push({
              step: 'domain_register',
              success: registerResult.success,
              data: registerResult.data,
              error: registerResult.error,
            });

            if (!registerResult.success) {
              instructions.push(
                `Domain registration failed: ${registerResult.error}. Register ${domain} manually and point DNS to your deployment.`,
              );
              return { status: 'registration_failed', instructions, steps };
            }
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            steps.push({
              step: 'domain_register',
              success: false,
              error: message,
            });
            instructions.push(`Domain registration failed: ${message}. Register ${domain} manually.`);
            return { status: 'registration_failed', instructions, steps };
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        steps.push({
          step: 'domain_search',
          success: false,
          error: message,
        });
        // Continue — domain might already be registered elsewhere
      }

      // ── Configure DNS records ──────────────────────────────────
      try {
        const dnsTarget = this.getDnsTarget(provider, deploymentUrl);

        const dnsResult = await this.toolExecutor(registrarTools.dns, {
          domain,
          action: 'add',
          type: dnsTarget.type,
          name: dnsTarget.name,
          content: dnsTarget.content,
        });

        steps.push({
          step: 'domain_dns',
          success: dnsResult.success,
          data: dnsResult.data,
          error: dnsResult.error,
        });

        if (dnsResult.success) {
          instructions.push(
            `DNS ${dnsTarget.type} record created: ${dnsTarget.name} -> ${dnsTarget.content}`,
          );
          instructions.push('DNS propagation may take up to 48 hours.');
          return { status: 'configured', instructions, steps };
        } else {
          instructions.push(
            `DNS configuration failed: ${dnsResult.error}. Manually add a ${dnsTarget.type} record for ${domain} pointing to ${dnsTarget.content}.`,
          );
          return { status: 'pending_dns', instructions, steps };
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        steps.push({
          step: 'domain_dns',
          success: false,
          error: message,
        });
        instructions.push(`DNS configuration failed: ${message}. Configure DNS manually.`);
        return { status: 'pending_dns', instructions, steps };
      }
    }

    // No registrar specified — provide manual instructions
    const dnsTarget = this.getDnsTarget(provider, deploymentUrl);
    instructions.push(
      `Add a ${dnsTarget.type} record for ${domain} pointing to ${dnsTarget.content} at your DNS provider.`,
    );
    instructions.push('DNS propagation may take up to 48 hours.');
    steps.push({
      step: 'domain_manual_instructions',
      success: true,
      data: { dnsTarget },
    });
    return { status: 'pending_dns', instructions, steps };
  }

  /* -------------------------------------------------------------- */
  /*  DNS target resolution                                          */
  /* -------------------------------------------------------------- */

  /** Determine the appropriate DNS record to create based on the provider. */
  private getDnsTarget(
    provider: CloudProvider,
    deploymentUrl?: string,
  ): { type: string; name: string; content: string } {
    // Extract hostname from deployment URL if available
    let deployHost = '';
    if (deploymentUrl) {
      try {
        deployHost = new URL(
          deploymentUrl.startsWith('http') ? deploymentUrl : `https://${deploymentUrl}`,
        ).hostname;
      } catch {
        deployHost = deploymentUrl;
      }
    }

    // Provider-specific DNS targets
    switch (provider) {
      case 'vercel':
        return { type: 'CNAME', name: '@', content: deployHost || 'cname.vercel-dns.com' };
      case 'cloudflare':
        return { type: 'CNAME', name: '@', content: deployHost || 'pages.dev' };
      case 'netlify':
        return { type: 'CNAME', name: '@', content: deployHost || 'apex-loadbalancer.netlify.com' };
      case 'heroku':
        return { type: 'CNAME', name: '@', content: deployHost || 'dns-target.herokudns.com' };
      case 'railway':
        return { type: 'CNAME', name: '@', content: deployHost || 'railway.app' };
      case 'flyio':
        return { type: 'CNAME', name: '@', content: deployHost || 'fly.dev' };
      case 'digitalocean':
        return { type: 'CNAME', name: '@', content: deployHost || 'ondigitalocean.app' };
      case 'aws':
        return { type: 'CNAME', name: '@', content: deployHost || 'cloudfront.net' };
      case 'linode':
        return { type: 'CNAME', name: '@', content: deployHost || 'nodebalancer.linode.com' };
      default:
        return { type: 'CNAME', name: '@', content: deployHost || 'unknown-provider' };
    }
  }
}
