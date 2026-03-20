import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type Tier = 'starter' | 'explorer' | 'pioneer' | 'team';

export type QuotaCommand = 'ask' | 'summarize' | 'paper' | 'deepdive';

export type Note = {
  id: number;
  title: string;
  body: string;
  createdAt: string;
};

export type FaqEntry = {
  key: string;
  question: string;
  answer: string;
  category?: string;
  updatedAt: string;
  updatedBy: string;
};

export type TriviaStats = {
  plays: number;
  wins: number;
  /** Cumulative points (base + streak + speed bonuses). */
  points: number;
  /** Current consecutive correct answer streak. */
  streak: number;
  /** Best ever streak. */
  bestStreak: number;
  /** Per-period points: { "2026-03-19": 120, ... } */
  dailyPoints: Record<string, number>;
  /** Per-week points: { "2026-W12": 80, ... } */
  weeklyPoints: Record<string, number>;
  /** Per-month points: { "2026-03": 340, ... } */
  monthlyPoints: Record<string, number>;
  /** Category breakdown: { "Science & Nature": { plays: 5, wins: 3 }, ... } */
  categories: Record<string, { plays: number; wins: number }>;
  /** Daily challenge completion keys: ["2026-03-19", ...] */
  dailyChallenges: string[];
};

export type LocalStateData = {
  version: 1;
  usage: Record<string, Record<string, Record<string, number>>>;
  notes: Record<string, Note[]>;
  faq: Record<string, FaqEntry>;
  trivia: {
    statsByUser: Record<string, TriviaStats>;
  };
};

const DEFAULT_STATE: LocalStateData = {
  version: 1,
  usage: {},
  notes: {},
  faq: {},
  trivia: { statsByUser: {} },
};

export function dayKeyForTz(timeZone: string, now: Date = new Date()): string {
  try {
    // en-CA yields YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

function safeParseJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function atomicWriteJson(path: string, data: unknown): void {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, `.${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`);
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  renameSync(tmp, path);
}

export class LocalStateStore {
  private state: LocalStateData;

  constructor(private readonly path: string) {
    this.state = this.load();
  }

  getPath(): string {
    return this.path;
  }

  private load(): LocalStateData {
    if (!existsSync(this.path)) return { ...DEFAULT_STATE };
    const raw = safeParseJson(readFileSync(this.path, 'utf8'));
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_STATE };
    const version = (raw as any).version;
    if (version !== 1) return { ...DEFAULT_STATE };
    return {
      version: 1,
      usage: (raw as any).usage && typeof (raw as any).usage === 'object' ? (raw as any).usage : {},
      notes: (raw as any).notes && typeof (raw as any).notes === 'object' ? (raw as any).notes : {},
      faq: (raw as any).faq && typeof (raw as any).faq === 'object' ? (raw as any).faq : {},
      trivia:
        (raw as any).trivia && typeof (raw as any).trivia === 'object'
          ? {
              statsByUser:
                (raw as any).trivia.statsByUser && typeof (raw as any).trivia.statsByUser === 'object'
                  ? (raw as any).trivia.statsByUser
                  : {},
            }
          : { statsByUser: {} },
    };
  }

  private persist(): void {
    atomicWriteJson(this.path, this.state);
  }

  pruneUsage(keepDays = 35): void {
    const keys = Object.keys(this.state.usage || {});
    if (keys.length <= keepDays) return;
    keys.sort();
    const drop = keys.slice(0, Math.max(0, keys.length - keepDays));
    for (const k of drop) delete this.state.usage[k];
    this.persist();
  }

  getUsage(dayKey: string, userId: string, command: QuotaCommand): number {
    const v = this.state.usage?.[dayKey]?.[userId]?.[command];
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
  }

  incrementUsage(dayKey: string, userId: string, command: QuotaCommand, amount = 1): number {
    const a = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 1;
    if (!this.state.usage[dayKey]) this.state.usage[dayKey] = {};
    if (!this.state.usage[dayKey]![userId]) this.state.usage[dayKey]![userId] = {};
    const cur = this.getUsage(dayKey, userId, command);
    const next = cur + (a || 1);
    this.state.usage[dayKey]![userId]![command] = next;
    this.persist();
    return next;
  }

  addNote(userId: string, title: string, body: string): Note {
    const list = this.listNotes(userId);
    const nextId = (list.reduce((m, n) => Math.max(m, Number(n.id) || 0), 0) || 0) + 1;
    const note: Note = {
      id: nextId,
      title: String(title || '').trim() || `Note ${nextId}`,
      body: String(body || '').trim(),
      createdAt: new Date().toISOString(),
    };
    if (!this.state.notes[userId]) this.state.notes[userId] = [];
    this.state.notes[userId]!.push(note);
    this.persist();
    return note;
  }

  listNotes(userId: string): Note[] {
    const raw = this.state.notes?.[userId];
    return Array.isArray(raw) ? raw.slice() : [];
  }

  deleteNote(userId: string, noteId: number): boolean {
    const list = this.listNotes(userId);
    const id = Number(noteId);
    if (!Number.isFinite(id)) return false;
    const next = list.filter((n) => Number(n.id) !== id);
    if (next.length === list.length) return false;
    this.state.notes[userId] = next;
    this.persist();
    return true;
  }

  setFaq(key: string, question: string, answer: string, updatedBy: string): FaqEntry {
    const k = String(key || '').trim();
    const entry: FaqEntry = {
      key: k,
      question: String(question || '').trim(),
      answer: String(answer || '').trim(),
      updatedAt: new Date().toISOString(),
      updatedBy: String(updatedBy || '').trim(),
    };
    this.state.faq[k] = entry;
    this.persist();
    return entry;
  }

  getFaq(key: string): FaqEntry | null {
    const k = String(key || '').trim();
    const e = this.state.faq?.[k];
    if (!e || typeof e !== 'object') return null;
    return e as FaqEntry;
  }

  listFaq(): FaqEntry[] {
    return Object.values(this.state.faq || {}).filter(Boolean) as FaqEntry[];
  }

  recordTriviaPlay(
    userId: string,
    won: boolean,
    earnedPoints: number = 0,
    category: string = '',
  ): TriviaStats {
    const cur: TriviaStats = this.state.trivia.statsByUser[userId] ?? {
      plays: 0,
      wins: 0,
      points: 0,
      streak: 0,
      bestStreak: 0,
      dailyPoints: {},
      weeklyPoints: {},
      monthlyPoints: {},
      categories: {},
      dailyChallenges: [],
    };

    const plays = Math.max(0, (Number(cur.plays) || 0) + 1);
    const wins = Math.max(0, (Number(cur.wins) || 0) + (won ? 1 : 0));
    const points = Math.max(0, (Number(cur.points) || 0) + earnedPoints);
    const streak = won ? (Number(cur.streak) || 0) + 1 : 0;
    const bestStreak = Math.max(Number(cur.bestStreak) || 0, streak);

    // Time period keys
    const now = new Date();
    const dayKey = now.toISOString().slice(0, 10);
    const weekNum = getISOWeek(now);
    const weekKey = `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
    const monthKey = now.toISOString().slice(0, 7);

    const dailyPoints = { ...(cur.dailyPoints || {}) };
    dailyPoints[dayKey] = (dailyPoints[dayKey] || 0) + earnedPoints;

    const weeklyPoints = { ...(cur.weeklyPoints || {}) };
    weeklyPoints[weekKey] = (weeklyPoints[weekKey] || 0) + earnedPoints;

    const monthlyPoints = { ...(cur.monthlyPoints || {}) };
    monthlyPoints[monthKey] = (monthlyPoints[monthKey] || 0) + earnedPoints;

    // Category breakdown
    const categories = { ...(cur.categories || {}) };
    if (category) {
      const catStats = categories[category] ?? { plays: 0, wins: 0 };
      categories[category] = {
        plays: catStats.plays + 1,
        wins: catStats.wins + (won ? 1 : 0),
      };
    }

    const next: TriviaStats = {
      plays,
      wins,
      points,
      streak,
      bestStreak,
      dailyPoints,
      weeklyPoints,
      monthlyPoints,
      categories,
      dailyChallenges: cur.dailyChallenges || [],
    };

    this.state.trivia.statsByUser[userId] = next;
    this.persist();
    return next;
  }

  recordDailyChallenge(userId: string, dateKey: string): void {
    const cur = this.state.trivia.statsByUser[userId];
    if (!cur) return;
    if (!cur.dailyChallenges) cur.dailyChallenges = [];
    if (!cur.dailyChallenges.includes(dateKey)) {
      cur.dailyChallenges.push(dateKey);
      this.persist();
    }
  }

  hasDoneDaily(userId: string, dateKey: string): boolean {
    const cur = this.state.trivia.statsByUser[userId];
    return cur?.dailyChallenges?.includes(dateKey) ?? false;
  }

  triviaLeaderboard(
    limit = 10,
    period?: 'daily' | 'weekly' | 'monthly',
  ): Array<{ userId: string; wins: number; plays: number; points: number }> {
    const now = new Date();
    const dayKey = now.toISOString().slice(0, 10);
    const weekNum = getISOWeek(now);
    const weekKey = `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
    const monthKey = now.toISOString().slice(0, 7);

    const rows = Object.entries(this.state.trivia.statsByUser || {}).map(([userId, s]) => {
      const stats = s as TriviaStats;
      let periodPoints: number;
      if (period === 'daily') {
        periodPoints = stats.dailyPoints?.[dayKey] ?? 0;
      } else if (period === 'weekly') {
        periodPoints = stats.weeklyPoints?.[weekKey] ?? 0;
      } else if (period === 'monthly') {
        periodPoints = stats.monthlyPoints?.[monthKey] ?? 0;
      } else {
        periodPoints = Number(stats.points) || 0;
      }
      return {
        userId,
        wins: Number(stats.wins) || 0,
        plays: Number(stats.plays) || 0,
        points: periodPoints,
      };
    });

    // Filter out zero-point entries for period leaderboards
    const filtered = period ? rows.filter((r) => r.points > 0) : rows;
    filtered.sort((a, b) => b.points - a.points || b.wins - a.wins);
    return filtered.slice(0, Math.max(1, Math.min(25, limit)));
  }

  getTriviaStats(userId: string): TriviaStats | null {
    return (this.state.trivia.statsByUser[userId] as TriviaStats) ?? null;
  }
}

/** ISO 8601 week number. */
function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

