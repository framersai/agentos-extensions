/**
 * Founders Query tool — LLM-callable tool for querying founder data.
 * This lets the AI agent answer questions about founders, projects, and leaderboards.
 */

import type {
  ITool,
  ToolExecutionContext,
  ToolExecutionResult,
  JSONSchemaObject,
} from '@framers/agentos';

import type { FounderStore, Founder, FounderProject } from '../store/FounderStore.js';
import { levelInfo, xpProgressBar, xpToNextLevel } from '../store/xp.js';

export interface FoundersQueryInput {
  action: 'profile' | 'projects' | 'leaderboard' | 'directory' | 'search_cofounders';
  userId?: string;
  skill?: string;
  limit?: number;
}

export interface FoundersQueryOutput {
  action: string;
  data: any;
}

export class FoundersQueryTool implements ITool<FoundersQueryInput, FoundersQueryOutput> {
  readonly id = 'founders-query-v1';
  readonly name = 'founders_query';
  readonly displayName = 'Founders Query';
  readonly description =
    'Query The Founders gamification system. Look up founder profiles, projects, leaderboards, and cofounder search results.';
  readonly category = 'community';
  readonly version = '1.0.0';
  readonly hasSideEffects = false;

  readonly inputSchema: JSONSchemaObject = {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['profile', 'projects', 'leaderboard', 'directory', 'search_cofounders'],
        description: 'The query action to perform',
      },
      userId: {
        type: 'string',
        description: 'Discord user ID (required for profile/projects)',
      },
      skill: {
        type: 'string',
        description: 'Skill filter for directory/cofounder search',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 50,
        default: 10,
        description: 'Max results to return',
      },
    },
    additionalProperties: false,
  };

  constructor(private readonly store: FounderStore) {}

  async execute(
    args: FoundersQueryInput,
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<FoundersQueryOutput>> {
    try {
      switch (args.action) {
        case 'profile': {
          if (!args.userId) return { success: false, error: 'userId is required for profile lookup' };
          const founder = this.store.getFounder(args.userId);
          if (!founder) return { success: true, output: { action: 'profile', data: null } };
          const projects = this.store.getProjects(args.userId);
          const info = levelInfo(founder.level);
          return {
            success: true,
            output: {
              action: 'profile',
              data: {
                ...founder,
                levelName: info.name,
                progressBar: xpProgressBar(founder.xp),
                xpToNext: xpToNextLevel(founder.xp),
                projects: projects.map((p) => ({
                  name: p.name,
                  description: p.description,
                  stage: p.stage,
                  techStack: p.techStack,
                  isPrimary: p.isPrimary,
                })),
              },
            },
          };
        }
        case 'projects': {
          if (!args.userId) return { success: false, error: 'userId is required for projects lookup' };
          const projects = this.store.getProjects(args.userId);
          return { success: true, output: { action: 'projects', data: projects } };
        }
        case 'leaderboard': {
          const founders = this.store.leaderboard(args.limit ?? 10);
          return {
            success: true,
            output: {
              action: 'leaderboard',
              data: founders.map((f, i) => ({
                rank: i + 1,
                displayName: f.displayName,
                xp: f.xp,
                level: f.level,
                levelName: levelInfo(f.level).name,
                streakDaily: f.streakDaily,
              })),
            },
          };
        }
        case 'directory': {
          const founders = this.store.listFounders({
            skillFilter: args.skill,
            limit: args.limit ?? 10,
          });
          const total = this.store.countFounders({ skillFilter: args.skill });
          return {
            success: true,
            output: {
              action: 'directory',
              data: { total, founders: founders.map(summarizeFounder) },
            },
          };
        }
        case 'search_cofounders': {
          const founders = this.store.listFounders({
            skillFilter: args.skill,
            optInOnly: true,
            limit: args.limit ?? 10,
          });
          const total = this.store.countFounders({ skillFilter: args.skill, optInOnly: true });
          return {
            success: true,
            output: {
              action: 'search_cofounders',
              data: { total, founders: founders.map(summarizeFounder) },
            },
          };
        }
        default:
          return { success: false, error: `Unknown action: ${args.action}` };
      }
    } catch (err: any) {
      return { success: false, error: `Founders query failed: ${err.message}` };
    }
  }

  validateArgs(input: Record<string, any>): { isValid: boolean; errors?: any[] } {
    const errors: string[] = [];
    const validActions = ['profile', 'projects', 'leaderboard', 'directory', 'search_cofounders'];
    if (!input.action || !validActions.includes(input.action)) {
      errors.push(`action must be one of: ${validActions.join(', ')}`);
    }
    return { isValid: errors.length === 0, errors: errors.length ? errors : undefined };
  }
}

function summarizeFounder(f: Founder) {
  return {
    userId: f.userId,
    displayName: f.displayName,
    tagline: f.tagline,
    skills: f.skills,
    lookingFor: f.lookingFor,
    xp: f.xp,
    level: f.level,
    levelName: levelInfo(f.level).name,
    optInMatching: f.optInMatching,
  };
}
