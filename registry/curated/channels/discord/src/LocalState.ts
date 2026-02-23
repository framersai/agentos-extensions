import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type Tier = 'starter' | 'pro' | 'team';

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
  updatedAt: string;
  updatedBy: string;
};

export type TriviaStats = {
  plays: number;
  wins: number;
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

  recordTriviaPlay(userId: string, won: boolean): TriviaStats {
    const cur = this.state.trivia.statsByUser[userId] ?? { plays: 0, wins: 0 };
    const next: TriviaStats = {
      plays: Math.max(0, (Number(cur.plays) || 0) + 1),
      wins: Math.max(0, (Number(cur.wins) || 0) + (won ? 1 : 0)),
    };
    this.state.trivia.statsByUser[userId] = next;
    this.persist();
    return next;
  }

  triviaLeaderboard(limit = 10): Array<{ userId: string; wins: number; plays: number }> {
    const rows = Object.entries(this.state.trivia.statsByUser || {}).map(([userId, s]) => ({
      userId,
      wins: Number((s as any)?.wins) || 0,
      plays: Number((s as any)?.plays) || 0,
    }));
    rows.sort((a, b) => (b.wins - a.wins) || (b.plays - a.plays));
    return rows.slice(0, Math.max(1, Math.min(25, limit)));
  }
}

