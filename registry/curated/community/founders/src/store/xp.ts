/**
 * XP amounts, level thresholds, streak logic, and constants for The Founders.
 */

// ── XP amounts ─────────────────────────────────────────────────────────────

export const XP_DAILY_CHECKIN = 10;
export const XP_DAILY_STREAK_BONUS = 2; // per consecutive day
export const XP_DAILY_STREAK_CAP = 20; // max streak bonus

export const XP_WEEKLY_UPDATE = 50;
export const XP_WEEKLY_STREAK_BONUS = 10; // per consecutive week
export const XP_WEEKLY_STREAK_CAP = 50; // max streak bonus

export const XP_FEEDBACK_GIVEN = 15;
export const FEEDBACK_DAILY_CAP = 5; // max feedback XP awards per day

export const XP_QUESTION_ANSWERED = 10;
export const XP_RESOURCE_SHARED = 5;

export const XP_MILESTONE_MVP_LAUNCH = 200;
export const XP_MILESTONE_FIRST_USER = 100;
export const XP_MILESTONE_REVENUE = 300;
export const XP_MILESTONE_CUSTOM = 50;

export const XP_SHOWCASE_POST = 25;

export const MILESTONE_XP: Record<string, number> = {
  mvp_launch: XP_MILESTONE_MVP_LAUNCH,
  first_user: XP_MILESTONE_FIRST_USER,
  revenue: XP_MILESTONE_REVENUE,
  funding: XP_MILESTONE_REVENUE,
  custom: XP_MILESTONE_CUSTOM,
};

/** Milestone types that are one-per-project. */
export const UNIQUE_MILESTONE_TYPES = new Set([
  'mvp_launch',
  'first_user',
  'revenue',
  'funding',
]);

export const MIN_CHECKIN_LENGTH = 10;

// ── Level thresholds ───────────────────────────────────────────────────────

export interface LevelInfo {
  level: number;
  name: string;
  xp: number;
  color: number;
}

export const LEVELS: LevelInfo[] = [
  { level: 1, name: 'White Rabbit', xp: 0, color: 0xffffff },
  { level: 2, name: 'Mad Hatter', xp: 500, color: 0x9b59b6 },
  { level: 3, name: 'Cheshire Cat', xp: 1_500, color: 0xe91e63 },
  { level: 4, name: 'Queen of Hearts', xp: 4_000, color: 0xe74c3c },
  { level: 5, name: 'Wonderland Founder', xp: 10_000, color: 0xf1c40f },
];

export const LEVEL_ROLE_NAMES = LEVELS.map((l) => l.name);

/** /ask quota bonuses by founder level. */
export const ASK_QUOTA_BONUS: Record<number, number> = {
  3: 5,
  4: 10,
  5: 10_000_000,
};

export function levelForXp(xp: number): number {
  let result = 1;
  for (const lvl of LEVELS) {
    if (xp >= lvl.xp) result = lvl.level;
  }
  return result;
}

export function levelInfo(level: number): LevelInfo {
  return LEVELS.find((l) => l.level === level) ?? LEVELS[0];
}

export function xpToNextLevel(xp: number): number | null {
  const current = levelForXp(xp);
  const next = LEVELS.find((l) => l.level === current + 1);
  return next ? next.xp - xp : null;
}

export function xpProgressBar(xp: number, barLength = 10): string {
  const current = levelForXp(xp);
  let currentThreshold = 0;
  let nextThreshold: number | null = null;
  for (const lvl of LEVELS) {
    if (lvl.level === current) currentThreshold = lvl.xp;
    if (lvl.level === current + 1) nextThreshold = lvl.xp;
  }
  if (nextThreshold === null) return '\u2588'.repeat(barLength); // max level
  const progress = xp - currentThreshold;
  const total = nextThreshold - currentThreshold;
  let filled = total > 0 ? Math.floor((progress / total) * barLength) : 0;
  filled = Math.min(filled, barLength);
  return '\u2588'.repeat(filled) + '\u2591'.repeat(barLength - filled);
}

// ── Streak helpers ─────────────────────────────────────────────────────────

/**
 * Calculate the new daily streak.
 * Returns [newStreak, alreadyCheckedInToday].
 * newStreak = -1 means streak continues (caller adds 1 to current streak).
 */
export function calculateDailyStreak(
  lastCheckinDate: string | null,
  today: string,
): [number, boolean] {
  if (!lastCheckinDate) return [1, false];
  const last = parseDate(lastCheckinDate);
  const todayD = parseDate(today);
  if (!last || !todayD) return [1, false];
  if (sameDay(last, todayD)) return [0, true];
  if (sameDay(last, addDays(todayD, -1))) return [-1, false];
  return [1, false]; // streak resets
}

/**
 * Calculate the new weekly streak based on ISO week numbers.
 * Returns [newStreak, alreadyCheckedInThisWeek].
 */
export function calculateWeeklyStreak(
  lastCheckinDate: string | null,
  today: string,
): [number, boolean] {
  if (!lastCheckinDate) return [1, false];
  const last = parseDate(lastCheckinDate);
  const todayD = parseDate(today);
  if (!last || !todayD) return [1, false];
  const [lastYear, lastWeek] = isoWeek(last);
  const [curYear, curWeek] = isoWeek(todayD);
  if (lastYear === curYear && lastWeek === curWeek) return [0, true];
  // Check if last week was the previous ISO week.
  const dow = todayD.getUTCDay();
  const prevMonday = addDays(todayD, -(dow === 0 ? 6 : dow - 1) - 7);
  const [prevYear, prevWeek] = isoWeek(prevMonday);
  if (lastYear === prevYear && lastWeek === prevWeek) return [-1, false];
  return [1, false]; // streak resets
}

export function dailyStreakBonus(streak: number): number {
  return Math.min(streak * XP_DAILY_STREAK_BONUS, XP_DAILY_STREAK_CAP);
}

export function weeklyStreakBonus(streak: number): number {
  return Math.min(streak * XP_WEEKLY_STREAK_BONUS, XP_WEEKLY_STREAK_CAP);
}

// ── Date helpers ───────────────────────────────────────────────────────────

function parseDate(iso: string): Date | null {
  const d = new Date(iso + 'T00:00:00Z');
  return isNaN(d.getTime()) ? null : d;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

/** Return [year, isoWeekNumber] for a date. */
function isoWeek(d: Date): [number, number] {
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return [tmp.getUTCFullYear(), week];
}
