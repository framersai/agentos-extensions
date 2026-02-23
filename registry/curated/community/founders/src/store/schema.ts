/**
 * SQLite schema for The Founders gamification system.
 */

import type Database from 'better-sqlite3';

export function initFoundersSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS founders (
      user_id INTEGER PRIMARY KEY,
      display_name TEXT NOT NULL,
      tagline TEXT,
      skills TEXT,
      looking_for TEXT,
      bio TEXT,
      website_url TEXT,
      twitter_url TEXT,
      github_url TEXT,
      linkedin_url TEXT,
      opt_in_matching INTEGER NOT NULL DEFAULT 0,
      xp INTEGER NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 1,
      streak_daily INTEGER NOT NULL DEFAULT 0,
      streak_weekly INTEGER NOT NULL DEFAULT 0,
      last_daily_checkin TEXT,
      last_weekly_checkin TEXT,
      last_showcase_post TEXT,
      joined_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS founder_projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES founders(user_id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      stage TEXT,
      tech_stack TEXT,
      industry TEXT,
      website_url TEXT,
      repo_url TEXT,
      looking_for_roles TEXT,
      is_primary INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_founder_projects_user ON founder_projects(user_id);

    CREATE TABLE IF NOT EXISTS founder_checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES founders(user_id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      blockers TEXT,
      milestones_text TEXT,
      lessons TEXT,
      metrics TEXT,
      feedback_url TEXT,
      xp_earned INTEGER NOT NULL DEFAULT 0,
      message_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_founder_checkins_user ON founder_checkins(user_id);

    CREATE TABLE IF NOT EXISTS founder_xp_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES founders(user_id) ON DELETE CASCADE,
      amount INTEGER NOT NULL,
      reason TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_founder_xp_log_user ON founder_xp_log(user_id);

    CREATE TABLE IF NOT EXISTS founder_milestones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES founders(user_id) ON DELETE CASCADE,
      project_id INTEGER REFERENCES founder_projects(id) ON DELETE SET NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      xp_earned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_founder_milestones_user ON founder_milestones(user_id);

    CREATE TABLE IF NOT EXISTS founder_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      giver_user_id INTEGER NOT NULL,
      receiver_user_id INTEGER NOT NULL,
      day_key TEXT NOT NULL DEFAULT '',
      message_id TEXT,
      channel_id TEXT,
      xp_earned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_founder_feedback_giver_day ON founder_feedback(giver_user_id, day_key);
    CREATE INDEX IF NOT EXISTS idx_founder_feedback_giver_date ON founder_feedback(giver_user_id, created_at);

    CREATE TABLE IF NOT EXISTS founder_settings (
      user_id INTEGER PRIMARY KEY REFERENCES founders(user_id) ON DELETE CASCADE,
      dm_reminders INTEGER NOT NULL DEFAULT 1,
      public_profile INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );
  `);
}
