/**
 * FounderStore — SQLite data access layer for The Founders system.
 */

import Database from 'better-sqlite3';
import { initFoundersSchema } from './schema.js';
import {
  FEEDBACK_DAILY_CAP,
  MILESTONE_XP,
  MIN_CHECKIN_LENGTH,
  UNIQUE_MILESTONE_TYPES,
  XP_DAILY_CHECKIN,
  XP_FEEDBACK_GIVEN,
  XP_SHOWCASE_POST,
  XP_WEEKLY_UPDATE,
  calculateDailyStreak,
  calculateWeeklyStreak,
  dailyStreakBonus,
  levelForXp,
  weeklyStreakBonus,
} from './xp.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface Founder {
  userId: string;
  displayName: string;
  tagline: string | null;
  skills: string | null;
  lookingFor: string | null;
  bio: string | null;
  websiteUrl: string | null;
  twitterUrl: string | null;
  githubUrl: string | null;
  linkedinUrl: string | null;
  optInMatching: boolean;
  xp: number;
  level: number;
  streakDaily: number;
  streakWeekly: number;
  lastDailyCheckin: string | null;
  lastWeeklyCheckin: string | null;
  lastShowcasePost: string | null;
  joinedAt: string;
  updatedAt: string;
}

export interface FounderProject {
  id: number;
  userId: string;
  name: string;
  description: string | null;
  stage: string | null;
  techStack: string | null;
  industry: string | null;
  websiteUrl: string | null;
  repoUrl: string | null;
  lookingForRoles: string | null;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FounderCheckin {
  id: number;
  userId: string;
  type: string;
  content: string;
  blockers: string | null;
  milestonesText: string | null;
  lessons: string | null;
  metrics: string | null;
  feedbackUrl: string | null;
  xpEarned: number;
  messageId: string | null;
  createdAt: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString();
}

function rowToFounder(row: any): Founder {
  return {
    userId: String(row.user_id),
    displayName: row.display_name,
    tagline: row.tagline ?? null,
    skills: row.skills ?? null,
    lookingFor: row.looking_for ?? null,
    bio: row.bio ?? null,
    websiteUrl: row.website_url ?? null,
    twitterUrl: row.twitter_url ?? null,
    githubUrl: row.github_url ?? null,
    linkedinUrl: row.linkedin_url ?? null,
    optInMatching: !!row.opt_in_matching,
    xp: row.xp,
    level: row.level,
    streakDaily: row.streak_daily,
    streakWeekly: row.streak_weekly,
    lastDailyCheckin: row.last_daily_checkin ?? null,
    lastWeeklyCheckin: row.last_weekly_checkin ?? null,
    lastShowcasePost: row.last_showcase_post ?? null,
    joinedAt: row.joined_at,
    updatedAt: row.updated_at,
  };
}

function rowToProject(row: any): FounderProject {
  return {
    id: row.id,
    userId: String(row.user_id),
    name: row.name,
    description: row.description ?? null,
    stage: row.stage ?? null,
    techStack: row.tech_stack ?? null,
    industry: row.industry ?? null,
    websiteUrl: row.website_url ?? null,
    repoUrl: row.repo_url ?? null,
    lookingForRoles: row.looking_for_roles ?? null,
    isPrimary: !!row.is_primary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Store ──────────────────────────────────────────────────────────────────

export class FounderStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
    initFoundersSchema(this.db);
  }

  close(): void {
    try {
      this.db.close();
    } catch {
      // ignore
    }
  }

  // ── Founders CRUD ──────────────────────────────────────────────────────

  getFounder(userId: string): Founder | null {
    const row = this.db
      .prepare('SELECT * FROM founders WHERE user_id = ?')
      .get(userId);
    return row ? rowToFounder(row) : null;
  }

  createFounder(
    userId: string,
    displayName: string,
    skills?: string | null,
    lookingFor?: string | null,
  ): Founder {
    const now = nowIso();
    try {
      this.db
        .prepare(
          `INSERT INTO founders (user_id, display_name, skills, looking_for, joined_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(userId, displayName, skills ?? null, lookingFor ?? null, now, now);
    } catch (err: any) {
      if (err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || err.message?.includes('UNIQUE')) {
        // Idempotent — founder already exists.
        this.db
          .prepare(
            `INSERT OR IGNORE INTO founder_settings (user_id, dm_reminders, public_profile, updated_at)
             VALUES (?, 1, 1, ?)`,
          )
          .run(userId, now);
        const existing = this.getFounder(userId);
        if (existing) return existing;
        throw err;
      }
      throw err;
    }
    // Default settings row.
    this.db
      .prepare(
        `INSERT OR IGNORE INTO founder_settings (user_id, dm_reminders, public_profile, updated_at)
         VALUES (?, 1, 1, ?)`,
      )
      .run(userId, now);
    return this.getFounder(userId)!;
  }

  updateFounderProfile(
    userId: string,
    fields: {
      tagline?: string | null;
      skills?: string | null;
      lookingFor?: string | null;
      bio?: string | null;
      websiteUrl?: string | null;
      twitterUrl?: string | null;
      githubUrl?: string | null;
      linkedinUrl?: string | null;
    },
  ): void {
    const mapping: [string, any][] = [
      ['tagline', fields.tagline],
      ['skills', fields.skills],
      ['looking_for', fields.lookingFor],
      ['bio', fields.bio],
      ['website_url', fields.websiteUrl],
      ['twitter_url', fields.twitterUrl],
      ['github_url', fields.githubUrl],
      ['linkedin_url', fields.linkedinUrl],
    ];
    const sets: string[] = [];
    const vals: any[] = [];
    for (const [col, val] of mapping) {
      if (val !== undefined) {
        sets.push(`${col} = ?`);
        vals.push(val);
      }
    }
    if (sets.length === 0) return;
    sets.push('updated_at = ?');
    vals.push(nowIso());
    vals.push(userId);
    this.db
      .prepare(`UPDATE founders SET ${sets.join(', ')} WHERE user_id = ?`)
      .run(...vals);
  }

  setOptInMatching(userId: string, optIn: boolean): void {
    this.db
      .prepare(
        'UPDATE founders SET opt_in_matching = ?, updated_at = ? WHERE user_id = ?',
      )
      .run(optIn ? 1 : 0, nowIso(), userId);
  }

  listFounders(opts?: {
    skillFilter?: string | null;
    optInOnly?: boolean;
    limit?: number;
    offset?: number;
  }): Founder[] {
    const { skillFilter, optInOnly, limit = 50, offset = 0 } = opts ?? {};
    let query = 'SELECT * FROM founders WHERE 1=1';
    const params: any[] = [];
    if (skillFilter) {
      query += ' AND LOWER(skills) LIKE ?';
      params.push(`%${skillFilter.toLowerCase()}%`);
    }
    if (optInOnly) {
      query += ' AND opt_in_matching = 1';
    }
    query += ' ORDER BY xp DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    return this.db
      .prepare(query)
      .all(...params)
      .map(rowToFounder);
  }

  countFounders(opts?: {
    skillFilter?: string | null;
    optInOnly?: boolean;
  }): number {
    const { skillFilter, optInOnly } = opts ?? {};
    let query = 'SELECT COUNT(*) as cnt FROM founders WHERE 1=1';
    const params: any[] = [];
    if (skillFilter) {
      query += ' AND LOWER(skills) LIKE ?';
      params.push(`%${skillFilter.toLowerCase()}%`);
    }
    if (optInOnly) {
      query += ' AND opt_in_matching = 1';
    }
    const row = this.db.prepare(query).get(...params) as any;
    return row?.cnt ?? 0;
  }

  leaderboard(limit = 20, offset = 0): Founder[] {
    return this.db
      .prepare('SELECT * FROM founders ORDER BY xp DESC LIMIT ? OFFSET ?')
      .all(limit, offset)
      .map(rowToFounder);
  }

  // ── Projects CRUD ──────────────────────────────────────────────────────

  createProject(
    userId: string,
    opts: {
      name: string;
      description?: string | null;
      stage?: string | null;
      techStack?: string | null;
      industry?: string | null;
      websiteUrl?: string | null;
      repoUrl?: string | null;
      lookingForRoles?: string | null;
      isPrimary?: boolean;
    },
  ): FounderProject {
    const now = nowIso();
    if (opts.isPrimary) {
      this.db
        .prepare('UPDATE founder_projects SET is_primary = 0 WHERE user_id = ?')
        .run(userId);
    }
    const result = this.db
      .prepare(
        `INSERT INTO founder_projects
           (user_id, name, description, stage, tech_stack, industry, website_url, repo_url, looking_for_roles, is_primary, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        userId,
        opts.name,
        opts.description ?? null,
        opts.stage ?? null,
        opts.techStack ?? null,
        opts.industry ?? null,
        opts.websiteUrl ?? null,
        opts.repoUrl ?? null,
        opts.lookingForRoles ?? null,
        opts.isPrimary ? 1 : 0,
        now,
        now,
      );
    return this.getProject(Number(result.lastInsertRowid))!;
  }

  getProject(projectId: number): FounderProject | null {
    const row = this.db
      .prepare('SELECT * FROM founder_projects WHERE id = ?')
      .get(projectId);
    return row ? rowToProject(row) : null;
  }

  getProjects(userId: string): FounderProject[] {
    return this.db
      .prepare(
        'SELECT * FROM founder_projects WHERE user_id = ? ORDER BY is_primary DESC, created_at DESC',
      )
      .all(userId)
      .map(rowToProject);
  }

  getProjectByName(userId: string, name: string): FounderProject | null {
    const row = this.db
      .prepare(
        'SELECT * FROM founder_projects WHERE user_id = ? AND LOWER(name) = LOWER(?)',
      )
      .get(userId, name);
    return row ? rowToProject(row) : null;
  }

  updateProject(
    projectId: number,
    fields: {
      name?: string | null;
      description?: string | null;
      stage?: string | null;
      techStack?: string | null;
      industry?: string | null;
      websiteUrl?: string | null;
      repoUrl?: string | null;
      lookingForRoles?: string | null;
    },
  ): void {
    const mapping: [string, any][] = [
      ['name', fields.name],
      ['description', fields.description],
      ['stage', fields.stage],
      ['tech_stack', fields.techStack],
      ['industry', fields.industry],
      ['website_url', fields.websiteUrl],
      ['repo_url', fields.repoUrl],
      ['looking_for_roles', fields.lookingForRoles],
    ];
    const sets: string[] = [];
    const vals: any[] = [];
    for (const [col, val] of mapping) {
      if (val !== undefined) {
        sets.push(`${col} = ?`);
        vals.push(val);
      }
    }
    if (sets.length === 0) return;
    sets.push('updated_at = ?');
    vals.push(nowIso());
    vals.push(projectId);
    this.db
      .prepare(`UPDATE founder_projects SET ${sets.join(', ')} WHERE id = ?`)
      .run(...vals);
  }

  projectNames(userId: string): string[] {
    return this.db
      .prepare(
        'SELECT name FROM founder_projects WHERE user_id = ? ORDER BY is_primary DESC, name',
      )
      .all(userId)
      .map((r: any) => r.name);
  }

  setPrimaryProject(userId: string, projectId: number): boolean {
    const row = this.db
      .prepare('SELECT 1 FROM founder_projects WHERE id = ? AND user_id = ?')
      .get(projectId, userId);
    if (!row) return false;
    const now = nowIso();
    this.db
      .prepare(
        'UPDATE founder_projects SET is_primary = 0, updated_at = ? WHERE user_id = ?',
      )
      .run(now, userId);
    this.db
      .prepare(
        'UPDATE founder_projects SET is_primary = 1, updated_at = ? WHERE id = ?',
      )
      .run(now, projectId);
    return true;
  }

  // ── XP & Level ─────────────────────────────────────────────────────────

  addXp(userId: string, amount: number): number {
    this.db
      .prepare(
        'UPDATE founders SET xp = xp + ?, updated_at = ? WHERE user_id = ?',
      )
      .run(amount, nowIso(), userId);
    const row = this.db
      .prepare('SELECT xp FROM founders WHERE user_id = ?')
      .get(userId) as any;
    return row?.xp ?? 0;
  }

  setLevel(userId: string, level: number): void {
    this.db
      .prepare(
        'UPDATE founders SET level = ?, updated_at = ? WHERE user_id = ?',
      )
      .run(level, nowIso(), userId);
  }

  logXp(
    userId: string,
    amount: number,
    reason: string,
    details?: string | null,
  ): void {
    this.db
      .prepare(
        'INSERT INTO founder_xp_log (user_id, amount, reason, details, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(userId, amount, reason, details ?? null, nowIso());
  }

  /**
   * Award XP, log it, check for level-up.
   * Returns [newXp, newLevel, leveledUp].
   */
  awardXp(
    userId: string,
    amount: number,
    reason: string,
    details?: string | null,
  ): [number, number, boolean] {
    const newXp = this.addXp(userId, amount);
    this.logXp(userId, amount, reason, details);
    const newLevel = levelForXp(newXp);
    const founder = this.getFounder(userId);
    const oldLevel = founder?.level ?? 1;
    const leveledUp = newLevel > oldLevel;
    if (leveledUp) {
      this.setLevel(userId, newLevel);
    }
    return [newXp, newLevel, leveledUp];
  }

  // ── Check-ins ──────────────────────────────────────────────────────────

  /**
   * Record a daily check-in.
   * Returns [checkin, xpAwarded, leveledUp, errorMsg].
   */
  recordDailyCheckin(
    userId: string,
    content: string,
    blockers: string | null,
    feedbackUrl: string | null,
    todayIso: string,
    messageId?: string | null,
  ): [FounderCheckin | null, number, boolean, string] {
    const founder = this.getFounder(userId);
    if (!founder) return [null, 0, false, 'Not a founder. Use /join_founders first.'];

    const [newStreak, already] = calculateDailyStreak(
      founder.lastDailyCheckin,
      todayIso,
    );
    if (already)
      return [null, 0, false, 'You already checked in today. Come back tomorrow!'];

    if ((content || '').trim().length < MIN_CHECKIN_LENGTH)
      return [
        null,
        0,
        false,
        `Check-in must be at least ${MIN_CHECKIN_LENGTH} characters.`,
      ];

    const streak = newStreak === -1 ? founder.streakDaily + 1 : newStreak;
    const xp = XP_DAILY_CHECKIN + dailyStreakBonus(streak);

    const now = nowIso();
    const result = this.db
      .prepare(
        `INSERT INTO founder_checkins (user_id, type, content, blockers, feedback_url, xp_earned, message_id, created_at)
         VALUES (?, 'daily', ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        userId,
        content,
        blockers,
        feedbackUrl,
        xp,
        messageId ?? null,
        now,
      );
    this.db
      .prepare(
        'UPDATE founders SET streak_daily = ?, last_daily_checkin = ?, updated_at = ? WHERE user_id = ?',
      )
      .run(streak, todayIso, now, userId);

    const [, , leveledUp] = this.awardXp(userId, xp, 'daily_checkin');

    const checkin: FounderCheckin = {
      id: Number(result.lastInsertRowid),
      userId,
      type: 'daily',
      content,
      blockers,
      milestonesText: null,
      lessons: null,
      metrics: null,
      feedbackUrl,
      xpEarned: xp,
      messageId: messageId ?? null,
      createdAt: now,
    };
    return [checkin, xp, leveledUp, ''];
  }

  /**
   * Record a weekly update.
   * Returns [checkin, xpAwarded, leveledUp, errorMsg].
   */
  recordWeeklyCheckin(
    userId: string,
    content: string,
    milestonesText: string | null,
    lessons: string | null,
    metrics: string | null,
    feedbackUrl: string | null,
    todayIso: string,
    messageId?: string | null,
  ): [FounderCheckin | null, number, boolean, string] {
    const founder = this.getFounder(userId);
    if (!founder)
      return [null, 0, false, 'Not a founder. Use /join_founders first.'];

    const [newStreak, already] = calculateWeeklyStreak(
      founder.lastWeeklyCheckin,
      todayIso,
    );
    if (already)
      return [null, 0, false, 'You already posted a weekly update this week.'];

    if ((content || '').trim().length < MIN_CHECKIN_LENGTH)
      return [
        null,
        0,
        false,
        `Update must be at least ${MIN_CHECKIN_LENGTH} characters.`,
      ];

    const streak = newStreak === -1 ? founder.streakWeekly + 1 : newStreak;
    const xp = XP_WEEKLY_UPDATE + weeklyStreakBonus(streak);

    const now = nowIso();
    const result = this.db
      .prepare(
        `INSERT INTO founder_checkins
           (user_id, type, content, milestones_text, lessons, metrics, feedback_url, xp_earned, message_id, created_at)
         VALUES (?, 'weekly', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        userId,
        content,
        milestonesText,
        lessons,
        metrics,
        feedbackUrl,
        xp,
        messageId ?? null,
        now,
      );
    this.db
      .prepare(
        'UPDATE founders SET streak_weekly = ?, last_weekly_checkin = ?, updated_at = ? WHERE user_id = ?',
      )
      .run(streak, todayIso, now, userId);

    const [, , leveledUp] = this.awardXp(userId, xp, 'weekly_update');

    const checkin: FounderCheckin = {
      id: Number(result.lastInsertRowid),
      userId,
      type: 'weekly',
      content,
      blockers: null,
      milestonesText,
      lessons,
      metrics,
      feedbackUrl,
      xpEarned: xp,
      messageId: messageId ?? null,
      createdAt: now,
    };
    return [checkin, xp, leveledUp, ''];
  }

  // ── Milestones ─────────────────────────────────────────────────────────

  /**
   * Record a milestone.
   * Returns [xpAwarded, newLevel, leveledUp, errorMsg].
   */
  recordMilestone(
    userId: string,
    milestoneType: string,
    title: string,
    description?: string | null,
    projectId?: number | null,
  ): [number, number, boolean, string] {
    const founder = this.getFounder(userId);
    if (!founder) return [0, 0, false, 'Not a founder.'];

    const mt = milestoneType.trim().toLowerCase();
    const xp = MILESTONE_XP[mt] ?? MILESTONE_XP.custom;

    // Check uniqueness for one-per-project types.
    if (UNIQUE_MILESTONE_TYPES.has(mt) && projectId) {
      const exists = this.db
        .prepare(
          'SELECT 1 FROM founder_milestones WHERE user_id = ? AND project_id = ? AND type = ?',
        )
        .get(userId, projectId, mt);
      if (exists)
        return [
          0,
          0,
          false,
          `You already recorded a '${mt}' milestone for this project.`,
        ];
    }

    this.db
      .prepare(
        `INSERT INTO founder_milestones (user_id, project_id, type, title, description, xp_earned, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        userId,
        projectId ?? null,
        mt,
        title,
        description ?? null,
        xp,
        nowIso(),
      );

    const [, newLevel, leveledUp] = this.awardXp(userId, xp, 'milestone', mt);
    return [xp, newLevel, leveledUp, ''];
  }

  // ── Feedback ───────────────────────────────────────────────────────────

  /**
   * Record feedback given. Returns [xpAwarded, leveledUp, errorMsg].
   */
  recordFeedback(
    giverUserId: string,
    receiverUserId: string,
    dayKey: string,
    messageId?: string | null,
    channelId?: string | null,
  ): [number, boolean, string] {
    if (giverUserId === receiverUserId)
      return [0, false, "You can't give feedback to yourself."];

    const giver = this.getFounder(giverUserId);
    if (!giver) return [0, false, 'Not a founder.'];

    let dk = (dayKey || '').trim().slice(0, 10);
    if (!dk) dk = nowIso().slice(0, 10);

    const count = (
      this.db
        .prepare(
          'SELECT COUNT(*) as cnt FROM founder_feedback WHERE giver_user_id = ? AND day_key = ?',
        )
        .get(giverUserId, dk) as any
    )?.cnt ?? 0;
    if (count >= FEEDBACK_DAILY_CAP)
      return [
        0,
        false,
        `Daily feedback cap reached (${FEEDBACK_DAILY_CAP}/day).`,
      ];

    this.db
      .prepare(
        `INSERT INTO founder_feedback (giver_user_id, receiver_user_id, day_key, message_id, channel_id, xp_earned, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        giverUserId,
        receiverUserId,
        dk,
        messageId ?? null,
        channelId ?? null,
        XP_FEEDBACK_GIVEN,
        nowIso(),
      );

    const [, , leveledUp] = this.awardXp(
      giverUserId,
      XP_FEEDBACK_GIVEN,
      'feedback_given',
    );
    return [XP_FEEDBACK_GIVEN, leveledUp, ''];
  }

  // ── Showcase ───────────────────────────────────────────────────────────

  canShowcase(userId: string, todayIso: string): [boolean, string] {
    const founder = this.getFounder(userId);
    if (!founder) return [false, 'Not a founder.'];
    if (founder.level < 3)
      return [false, 'Showcase requires Cheshire Cat (Level 3) or higher.'];
    if (founder.lastShowcasePost) {
      try {
        const lastParts = founder.lastShowcasePost.split('-').map(Number);
        const todayParts = todayIso.split('-').map(Number);
        if (
          lastParts[0] === todayParts[0] &&
          lastParts[1] === todayParts[1]
        ) {
          return [false, 'You can only showcase once per month.'];
        }
      } catch {
        // ignore parse errors
      }
    }
    return [true, ''];
  }

  /**
   * Record a showcase post. Returns [xpAwarded, leveledUp].
   */
  recordShowcase(userId: string, todayIso: string): [number, boolean] {
    this.db
      .prepare(
        'UPDATE founders SET last_showcase_post = ?, updated_at = ? WHERE user_id = ?',
      )
      .run(todayIso, nowIso(), userId);
    const [, , leveledUp] = this.awardXp(
      userId,
      XP_SHOWCASE_POST,
      'showcase_post',
    );
    return [XP_SHOWCASE_POST, leveledUp];
  }
}
