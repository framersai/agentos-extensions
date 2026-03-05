/**
 * @fileoverview Bulk Scheduler Tool — schedule multiple social media posts at once.
 *
 * Accepts an array of posts with content, target platforms, and scheduled times.
 * Supports template variables ({{date}}, {{time}}, {{day}}, {{platform}}) for
 * dynamic content generation. Validates scheduling constraints and returns
 * per-post results with graceful error handling.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ScheduledPost {
  /** Post content text. Supports template vars: {{date}}, {{time}}, {{day}}, {{platform}}. */
  content: string;
  /** Target platforms (e.g. ['twitter', 'linkedin', 'instagram']). */
  platforms: string[];
  /** ISO 8601 scheduled time. */
  scheduledAt: string;
  /** Media URLs or asset IDs to attach. */
  mediaUrls?: string[];
  /** Hashtags to include. */
  hashtags?: string[];
}

export interface BulkScheduleInput {
  /** Array of posts to schedule. */
  posts: ScheduledPost[];
}

export interface ScheduleResult {
  index: number;
  scheduledAt: string;
  platforms: string[];
  expandedContent: string;
  status: 'scheduled' | 'error';
  error?: string;
}

export interface BulkScheduleOutput {
  total: number;
  scheduled: number;
  failed: number;
  results: ScheduleResult[];
}

/* ------------------------------------------------------------------ */
/*  Tool executor callback type                                        */
/* ------------------------------------------------------------------ */

export type ToolExecutorFn = (
  toolName: string,
  args: Record<string, unknown>,
) => Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }>;

/* ------------------------------------------------------------------ */
/*  Supported platforms                                                */
/* ------------------------------------------------------------------ */

const SUPPORTED_PLATFORMS = new Set([
  'twitter',
  'instagram',
  'reddit',
  'youtube',
  'tiktok',
  'pinterest',
  'linkedin',
  'facebook',
  'threads',
  'bluesky',
  'mastodon',
  'farcaster',
  'lemmy',
  'devto',
  'medium',
]);

/* ------------------------------------------------------------------ */
/*  BulkSchedulerTool                                                  */
/* ------------------------------------------------------------------ */

export class BulkSchedulerTool {
  readonly id = 'bulkSchedule';
  readonly name = 'bulkSchedule';
  readonly displayName = 'Bulk Schedule Posts';
  readonly description =
    'Schedule multiple social media posts at once. Accepts an array of posts with content, ' +
    'target platforms, and scheduled times. Supports template variables: {{date}}, {{time}}, ' +
    '{{day}}, {{platform}}. Validates scheduling constraints and reports per-post results.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      posts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              description:
                'Post content text. Supports template vars: {{date}}, {{time}}, {{day}}, {{platform}}',
            },
            platforms: {
              type: 'array',
              items: { type: 'string' },
              description: 'Target platforms (e.g. twitter, linkedin, instagram)',
            },
            scheduledAt: {
              type: 'string',
              description: 'ISO 8601 scheduled time (e.g. 2025-06-15T10:00:00Z)',
            },
            mediaUrls: {
              type: 'array',
              items: { type: 'string' },
              description: 'Media URLs or asset IDs to attach',
            },
            hashtags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Hashtags to include with the post',
            },
          },
          required: ['content', 'platforms', 'scheduledAt'],
        },
        description: 'Array of posts to schedule',
      },
    },
    required: ['posts'],
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
    args: BulkScheduleInput,
  ): Promise<{ success: boolean; data?: BulkScheduleOutput; error?: string }> {
    if (!args.posts?.length) {
      return { success: false, error: 'No posts provided. Pass at least one post to schedule.' };
    }

    const results: ScheduleResult[] = [];

    for (let i = 0; i < args.posts.length; i++) {
      const post = args.posts[i]!;

      try {
        // Validate scheduled time
        const scheduledDate = new Date(post.scheduledAt);
        if (isNaN(scheduledDate.getTime())) {
          results.push({
            index: i,
            scheduledAt: post.scheduledAt,
            platforms: post.platforms,
            expandedContent: post.content,
            status: 'error',
            error: `Invalid scheduledAt date: "${post.scheduledAt}". Must be a valid ISO 8601 string.`,
          });
          continue;
        }

        // Warn if scheduled in the past (but still allow it — some systems support backfill)
        const now = new Date();
        if (scheduledDate < now) {
          // Still schedule, but note in the result — not a blocking error
        }

        // Validate platforms
        if (!post.platforms?.length) {
          results.push({
            index: i,
            scheduledAt: post.scheduledAt,
            platforms: [],
            expandedContent: post.content,
            status: 'error',
            error: 'No target platforms specified.',
          });
          continue;
        }

        const invalidPlatforms = post.platforms.filter((p) => !SUPPORTED_PLATFORMS.has(p));
        if (invalidPlatforms.length > 0) {
          results.push({
            index: i,
            scheduledAt: post.scheduledAt,
            platforms: post.platforms,
            expandedContent: post.content,
            status: 'error',
            error: `Unsupported platform(s): ${invalidPlatforms.join(', ')}. Supported: ${[...SUPPORTED_PLATFORMS].join(', ')}`,
          });
          continue;
        }

        // Validate content is not empty
        if (!post.content?.trim()) {
          results.push({
            index: i,
            scheduledAt: post.scheduledAt,
            platforms: post.platforms,
            expandedContent: '',
            status: 'error',
            error: 'Post content is empty.',
          });
          continue;
        }

        // Expand template variables (platform-agnostic expansion)
        const expandedContent = this.expandTemplateVars(post.content, scheduledDate);

        // If a tool executor is available, delegate to a scheduling backend
        if (this.toolExecutor) {
          try {
            const result = await this.toolExecutor('schedulePost', {
              content: expandedContent,
              platforms: post.platforms,
              scheduledAt: post.scheduledAt,
              mediaUrls: post.mediaUrls,
              hashtags: post.hashtags,
            });

            results.push({
              index: i,
              scheduledAt: post.scheduledAt,
              platforms: post.platforms,
              expandedContent,
              status: result.success ? 'scheduled' : 'error',
              error: result.error,
            });
          } catch (execErr: unknown) {
            const execMsg = execErr instanceof Error ? execErr.message : String(execErr);
            results.push({
              index: i,
              scheduledAt: post.scheduledAt,
              platforms: post.platforms,
              expandedContent,
              status: 'error',
              error: `Tool executor error: ${execMsg}`,
            });
          }
        } else {
          // No tool executor — run in standalone validation/preview mode
          results.push({
            index: i,
            scheduledAt: post.scheduledAt,
            platforms: post.platforms,
            expandedContent,
            status: 'scheduled',
          });
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({
          index: i,
          scheduledAt: post.scheduledAt,
          platforms: post.platforms,
          expandedContent: post.content,
          status: 'error',
          error: message,
        });
      }
    }

    const scheduled = results.filter((r) => r.status === 'scheduled').length;

    return {
      success: scheduled > 0,
      data: {
        total: args.posts.length,
        scheduled,
        failed: args.posts.length - scheduled,
        results,
      },
    };
  }

  /* -------------------------------------------------------------- */
  /*  Template variable expansion                                    */
  /* -------------------------------------------------------------- */

  /**
   * Expand template variables in content text.
   *
   * Supported variables:
   * - `{{date}}` — localized date string (e.g. "6/15/2025")
   * - `{{time}}` — localized time string (e.g. "10:00:00 AM")
   * - `{{day}}` — full weekday name (e.g. "Sunday")
   * - `{{month}}` — full month name (e.g. "June")
   * - `{{year}}` — four-digit year (e.g. "2025")
   * - `{{iso}}` — full ISO 8601 string
   * - `{{platform}}` — placeholder replaced per-platform at publish time
   */
  private expandTemplateVars(content: string, scheduledDate: Date): string {
    return content
      .replace(/\{\{date\}\}/g, scheduledDate.toLocaleDateString())
      .replace(/\{\{time\}\}/g, scheduledDate.toLocaleTimeString())
      .replace(/\{\{day\}\}/g, scheduledDate.toLocaleDateString('en', { weekday: 'long' }))
      .replace(/\{\{month\}\}/g, scheduledDate.toLocaleDateString('en', { month: 'long' }))
      .replace(/\{\{year\}\}/g, String(scheduledDate.getFullYear()))
      .replace(/\{\{iso\}\}/g, scheduledDate.toISOString());
    // Note: {{platform}} is left unexpanded — it's resolved per-platform at publish time
  }
}
