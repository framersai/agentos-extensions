/**
 * @fileoverview Cross-Platform Analytics Tool — aggregate engagement metrics from N platforms.
 *
 * This tool acts as an orchestrator that delegates to per-platform analytics tools
 * (twitterAnalytics, instagramAnalytics, etc.) and aggregates the results into a
 * unified view with per-platform breakdowns and overall totals.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface CrossPlatformAnalyticsInput {
  /** Platforms to query analytics from. */
  platforms: string[];
  /** Platform-to-postId mapping (e.g., { twitter: "123", linkedin: "456" }). */
  postIds?: Record<string, string>;
  /** Time range for analytics (default: '7d'). */
  timeRange?: '24h' | '7d' | '30d' | '90d';
}

export interface PlatformMetrics {
  likes?: number;
  comments?: number;
  shares?: number;
  impressions?: number;
  engagementRate?: number;
  /** Platform-specific raw data fields. */
  [key: string]: unknown;
}

export interface PlatformAnalyticsResult {
  /** Metrics when successful, or an error descriptor on failure. */
  [key: string]: PlatformMetrics | { error: string };
}

export interface AnalyticsTotals {
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
  /** Overall engagement rate as a percentage (0-100). */
  engagement: number;
}

export interface CrossPlatformAnalyticsOutput {
  platforms: PlatformAnalyticsResult;
  totals: AnalyticsTotals;
  timeRange: string;
}

/* ------------------------------------------------------------------ */
/*  Tool executor callback type                                        */
/* ------------------------------------------------------------------ */

export type ToolExecutorFn = (
  toolName: string,
  args: Record<string, unknown>,
) => Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }>;

/* ------------------------------------------------------------------ */
/*  CrossPlatformAnalyticsTool                                         */
/* ------------------------------------------------------------------ */

export class CrossPlatformAnalyticsTool {
  readonly id = 'crossPlatformAnalytics';
  readonly name = 'crossPlatformAnalytics';
  readonly displayName = 'Cross-Platform Analytics';
  readonly description =
    'Aggregate engagement metrics across social platforms. Returns likes, comments, ' +
    'shares, impressions, and engagement rate per platform and totals.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      platforms: {
        type: 'array',
        items: { type: 'string' },
        description: 'Platforms to query analytics from',
      },
      postIds: {
        type: 'object',
        additionalProperties: { type: 'string' },
        description: 'Platform-to-postId mapping (e.g., { twitter: "123", linkedin: "456" })',
      },
      timeRange: {
        type: 'string',
        enum: ['24h', '7d', '30d', '90d'],
        description: 'Time range for analytics (default: 7d)',
      },
    },
    required: ['platforms'],
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
    args: CrossPlatformAnalyticsInput,
  ): Promise<{ success: boolean; data?: CrossPlatformAnalyticsOutput; error?: string }> {
    const platformResults: PlatformAnalyticsResult = {};
    const totals: AnalyticsTotals = {
      likes: 0,
      comments: 0,
      shares: 0,
      impressions: 0,
      engagement: 0,
    };

    for (const platform of args.platforms) {
      const analyticsToolName = `${platform}Analytics`;
      const postId = args.postIds?.[platform];

      try {
        if (this.toolExecutor && postId) {
          const result = await this.toolExecutor(analyticsToolName, {
            postId,
            timeRange: args.timeRange ?? '7d',
          });

          if (result.success && result.data) {
            const data = result.data;
            platformResults[platform] = data as PlatformMetrics;

            // Accumulate totals — normalize platform-specific field names.
            totals.likes += this.toNumber(data.likes ?? data.favouritesCount);
            totals.comments += this.toNumber(data.comments ?? data.repliesCount);
            totals.shares += this.toNumber(
              data.shares ?? data.retweets ?? data.reblogsCount ?? data.reposts,
            );
            totals.impressions += this.toNumber(data.impressions ?? data.views);
          } else {
            platformResults[platform] = { error: result.error ?? 'No data returned' };
          }
        } else {
          platformResults[platform] = {
            error: postId
              ? 'No tool executor available'
              : 'No post ID provided for this platform',
          };
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        platformResults[platform] = { error: message };
      }
    }

    // Calculate overall engagement rate.
    if (totals.impressions > 0) {
      totals.engagement = Number(
        (((totals.likes + totals.comments + totals.shares) / totals.impressions) * 100).toFixed(2),
      );
    }

    return {
      success: true,
      data: {
        platforms: platformResults,
        totals,
        timeRange: args.timeRange ?? '7d',
      },
    };
  }

  /* -------------------------------------------------------------- */
  /*  Helpers                                                        */
  /* -------------------------------------------------------------- */

  /** Safely coerce an unknown value to a number, defaulting to 0. */
  private toNumber(value: unknown): number {
    if (typeof value === 'number' && !Number.isNaN(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  }
}
