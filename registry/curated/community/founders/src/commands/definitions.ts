/**
 * Slash command JSON definitions for The Founders.
 * These get merged into the Discord adapter's command registration.
 */

import { ApplicationCommandOptionType } from 'discord.js';
import type { RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';

export const FOUNDERS_SLASH_COMMANDS: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [
  {
    name: 'join_founders',
    description: 'Join The Founders \u2014 build in public, level up, ship.',
  },
  {
    name: 'profile',
    description: "View a Founder's profile card.",
    options: [
      {
        name: 'user',
        description: 'The founder to view (defaults to you)',
        type: ApplicationCommandOptionType.User,
        required: false,
      },
    ],
  },
  {
    name: 'profile_edit',
    description: 'Edit your Founder profile.',
  },
  {
    name: 'project_add',
    description: 'Add a new project to your Founder profile.',
  },
  {
    name: 'project_edit',
    description: 'Edit one of your projects.',
    options: [
      {
        name: 'project',
        description: 'Project name to edit',
        type: ApplicationCommandOptionType.String,
        required: true,
        autocomplete: true,
      },
    ],
  },
  {
    name: 'project_primary',
    description: 'Set your primary (pinned) project.',
    options: [
      {
        name: 'project',
        description: 'Project name to pin as primary',
        type: ApplicationCommandOptionType.String,
        required: true,
        autocomplete: true,
      },
    ],
  },
  {
    name: 'projects',
    description: "List a Founder's projects.",
    options: [
      {
        name: 'user',
        description: 'The founder to view (defaults to you)',
        type: ApplicationCommandOptionType.User,
        required: false,
      },
    ],
  },
  {
    name: 'daily',
    description: 'Post your daily standup check-in.',
  },
  {
    name: 'weekly',
    description: 'Post your weekly progress update.',
  },
  {
    name: 'feedback',
    description: 'Give feedback to another Founder (+15 XP).',
    options: [
      {
        name: 'user',
        description: 'The founder you are giving feedback to',
        type: ApplicationCommandOptionType.User,
        required: true,
      },
    ],
  },
  {
    name: 'milestone',
    description: 'Record a project milestone.',
  },
  {
    name: 'leaderboard',
    description: 'View the Founders XP leaderboard.',
  },
  {
    name: 'founders',
    description: 'Browse the Founders directory.',
    options: [
      {
        name: 'skill',
        description: 'Filter by skill (e.g., Python, React)',
        type: ApplicationCommandOptionType.String,
        required: false,
      },
    ],
  },
  {
    name: 'cofounder_opt_in',
    description: 'Opt into cofounder matching.',
  },
  {
    name: 'cofounder_opt_out',
    description: 'Opt out of cofounder matching.',
  },
  {
    name: 'cofounder_search',
    description: 'Search for potential cofounders.',
    options: [
      {
        name: 'skill',
        description: 'Filter by skill (e.g., Python, React, Design)',
        type: ApplicationCommandOptionType.String,
        required: false,
      },
    ],
  },
  {
    name: 'showcase',
    description: 'Showcase your project (once per month).',
  },
];
