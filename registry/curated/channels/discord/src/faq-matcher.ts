/**
 * @fileoverview Fuzzy FAQ matcher using tokenization, stemming, normalization,
 * and TF-IDF cosine similarity.
 *
 * TypeScript port of discord-bots/core/kb/faq_matcher.py — same synonyms,
 * stop words, and stemming rules so the two implementations produce
 * equivalent results.
 */

import type { FaqEntry } from './LocalState';

// ── Text normalization ──────────────────────────────────────────────────────

const PUNCT_RE = /[^\w\s]/gu;
const MULTI_SPACE = /\s+/g;

/** Common English contractions → expanded forms. */
const CONTRACTIONS: Record<string, string> = {
  "what's": 'what is',
  "where's": 'where is',
  "who's": 'who is',
  "how's": 'how is',
  "it's": 'it is',
  "that's": 'that is',
  "there's": 'there is',
  "here's": 'here is',
  "let's": 'let us',
  "i'm": 'i am',
  "you're": 'you are',
  "we're": 'we are',
  "they're": 'they are',
  "i've": 'i have',
  "you've": 'you have',
  "we've": 'we have',
  "they've": 'they have',
  "i'll": 'i will',
  "you'll": 'you will',
  "we'll": 'we will',
  "they'll": 'they will',
  "i'd": 'i would',
  "you'd": 'you would',
  "we'd": 'we would',
  "they'd": 'they would',
  "isn't": 'is not',
  "aren't": 'are not',
  "wasn't": 'was not',
  "weren't": 'were not',
  "hasn't": 'has not',
  "haven't": 'have not',
  "hadn't": 'had not',
  "doesn't": 'does not',
  "don't": 'do not',
  "didn't": 'did not',
  "won't": 'will not',
  "wouldn't": 'would not',
  "shouldn't": 'should not',
  "couldn't": 'could not',
  "can't": 'cannot',
  cannot: 'can not',
};

/** Domain-specific synonym mapping (mirrors Python _SYNONYMS exactly). */
const SYNONYMS: Record<string, string> = {
  bot: 'agent',
  bots: 'agents',
  chatbot: 'agent',
  chatbots: 'agents',
  ai: 'agent',
  assistant: 'agent',
  assistants: 'agents',
  concierge: 'agent',
  sub: 'subscription',
  subs: 'subscriptions',
  plan: 'subscription',
  plans: 'subscriptions',
  tier: 'subscription',
  tiers: 'subscriptions',
  price: 'cost',
  prices: 'cost',
  pricing: 'cost',
  fee: 'cost',
  fees: 'cost',
  charge: 'cost',
  charges: 'cost',
  pay: 'cost',
  payment: 'cost',
  billing: 'cost',
  money: 'cost',
  dollars: 'cost',
  usd: 'cost',
  buck: 'cost',
  bucks: 'cost',
  cheap: 'cost',
  expensive: 'cost',
  affordable: 'cost',
  discord: 'discord',
  server: 'discord',
  guild: 'discord',
  channel: 'channel',
  channels: 'channel',
  room: 'channel',
  rooms: 'channel',
  llm: 'model',
  llms: 'model',
  gpt: 'model',
  claude: 'model',
  gemini: 'model',
  ollama: 'model',
  openai: 'model',
  anthropic: 'model',
  wunderland: 'wunderland',
  wunderbot: 'wunderland',
  wunderbots: 'wunderland',
  wunderland: 'wunderland',
  wunder: 'wunderland',
  wl: 'wunderland',
  deploy: 'deployment',
  deploying: 'deployment',
  deployed: 'deployment',
  host: 'deployment',
  hosting: 'deployment',
  selfhost: 'deployment',
  'self-host': 'deployment',
  'self-hosted': 'deployment',
  selfhosted: 'deployment',
  vps: 'deployment',
  docker: 'deployment',
  verify: 'verify',
  verification: 'verify',
  verified: 'verify',
  verifying: 'verify',
  link: 'verify',
  linking: 'verify',
  connect: 'verify',
  connecting: 'verify',
  role: 'role',
  roles: 'role',
  perm: 'permission',
  perms: 'permission',
  permissions: 'permission',
  privacy: 'privacy',
  private: 'privacy',
  pii: 'privacy',
  redact: 'privacy',
  redaction: 'privacy',
  secure: 'security',
  security: 'security',
  safe: 'security',
  safety: 'security',
  nda: 'security',
  encrypt: 'security',
  encryption: 'security',
  founder: 'founders',
  founders: 'founders',
  xp: 'founders',
  level: 'founders',
  levels: 'founders',
  streak: 'founders',
  daily: 'founders',
  leaderboard: 'founders',
  'social-club': 'socialclub',
  socialclub: 'socialclub',
  'social club': 'socialclub',
  lifetime: 'socialclub',
  membership: 'socialclub',
  card: 'socialclub',
  cards: 'socialclub',
  'white rabbit': 'socialclub',
  'mad hatter': 'socialclub',
  royal: 'socialclub',
};

/** English stop words. */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
  'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
  'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each',
  'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
  'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
  'about', 'up', 'if', 'or', 'and', 'but', 'nor', 'because', 'until',
  'while', 'that', 'this', 'these', 'those', 'am', 'it', 'its', 'my',
  'your', 'his', 'her', 'our', 'their', 'which', 'who', 'whom', 'what',
  'me', 'him', 'them', 'us', 'i', 'you', 'he', 'she', 'we', 'they',
]);

// ── Normalization ───────────────────────────────────────────────────────────

/** Lowercase, expand contractions, strip accents and punctuation. */
function normalize(text: string): string {
  let t = text.toLowerCase().trim();

  // Expand contractions
  for (const [contraction, expansion] of Object.entries(CONTRACTIONS)) {
    // Replace all occurrences (contractions can appear multiple times)
    while (t.includes(contraction)) {
      t = t.replace(contraction, expansion);
    }
  }

  // Strip accents (NFD decomposition then drop combining chars)
  t = t.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

  // Remove punctuation
  t = t.replace(PUNCT_RE, ' ');
  t = t.replace(MULTI_SPACE, ' ').trim();

  return t;
}

// ── Stemmer (simplified suffix-stripping, mirrors Python _stem) ─────────────

function stem(word: string): string {
  if (word.length <= 3) return word;

  if (word.endsWith('ies') && word.length > 4) {
    word = word.slice(0, -3) + 'i';
  } else if (word.endsWith('sses')) {
    word = word.slice(0, -2);
  } else if (word.endsWith('ness')) {
    word = word.slice(0, -4);
  } else if (word.endsWith('ment')) {
    word = word.slice(0, -4);
    if (word.length < 3) word = word + 'ment';
  } else if (word.endsWith('ing') && word.length > 5) {
    word = word.slice(0, -3);
    if (word.endsWith('tt') || word.endsWith('ss') || word.endsWith('zz')) {
      word = word.slice(0, -1);
    }
  } else if (word.endsWith('tion')) {
    word = word.slice(0, -4) + 't';
  } else if (word.endsWith('sion')) {
    word = word.slice(0, -4) + 's';
  } else if (word.endsWith('ation')) {
    word = word.slice(0, -5) + 'at';
  } else if (word.endsWith('ful')) {
    word = word.slice(0, -3);
  } else if (word.endsWith('ous')) {
    word = word.slice(0, -3);
  } else if (word.endsWith('ive')) {
    word = word.slice(0, -3);
  } else if (word.endsWith('able') && word.length > 5) {
    word = word.slice(0, -4);
  } else if (word.endsWith('ible') && word.length > 5) {
    word = word.slice(0, -4);
  } else if (word.endsWith('ly') && word.length > 4) {
    word = word.slice(0, -2);
  } else if (word.endsWith('ed') && word.length > 4) {
    word = word.slice(0, -2);
    if (word.endsWith('tt') || word.endsWith('ss') || word.endsWith('zz')) {
      word = word.slice(0, -1);
    }
  } else if (word.endsWith('er') && word.length > 4) {
    word = word.slice(0, -2);
  } else if (word.endsWith('es') && word.length > 4) {
    word = word.slice(0, -2);
  } else if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) {
    word = word.slice(0, -1);
  }

  return word;
}

// ── Tokenization ────────────────────────────────────────────────────────────

/** Normalize, tokenize, apply synonyms, stem, and remove stop words. */
function tokenize(text: string): string[] {
  const normalized = normalize(text);
  const words = normalized.split(/\s+/).filter(Boolean);
  const tokens: string[] = [];

  for (let w of words) {
    // Apply synonym mapping
    w = SYNONYMS[w] ?? w;
    // Skip stop words
    if (STOP_WORDS.has(w)) continue;
    // Stem
    tokens.push(stem(w));
  }

  return tokens;
}

// ── TF-IDF + Cosine similarity ──────────────────────────────────────────────

type SparseVec = Record<string, number>;

/** Term frequency normalized by document length. */
function termFreq(tokens: string[]): SparseVec {
  const counts: Record<string, number> = {};
  for (const t of tokens) {
    counts[t] = (counts[t] ?? 0) + 1;
  }
  const total = tokens.length || 1;
  const tf: SparseVec = {};
  for (const [term, count] of Object.entries(counts)) {
    tf[term] = count / total;
  }
  return tf;
}

/** Inverse document frequency across a corpus. */
function idf(corpusTokens: string[][]): SparseVec {
  const nDocs = corpusTokens.length;
  const df: Record<string, number> = {};
  for (const docTokens of corpusTokens) {
    const seen = new Set(docTokens);
    for (const term of seen) {
      df[term] = (df[term] ?? 0) + 1;
    }
  }
  const result: SparseVec = {};
  for (const [term, count] of Object.entries(df)) {
    result[term] = Math.log((nDocs + 1) / (count + 1)) + 1;
  }
  return result;
}

/** TF-IDF weighted vector. */
function tfidfVector(tf: SparseVec, idfMap: SparseVec): SparseVec {
  const vec: SparseVec = {};
  for (const [term, freq] of Object.entries(tf)) {
    vec[term] = freq * (idfMap[term] ?? 1.0);
  }
  return vec;
}

/** Cosine similarity between two sparse vectors. */
function cosineSimilarity(a: SparseVec, b: SparseVec): number {
  // Dot product over shared keys
  let dot = 0;
  const aKeys = Object.keys(a);
  for (const k of aKeys) {
    if (k in b) dot += a[k]! * b[k]!;
  }
  if (dot === 0) return 0;

  let magA = 0;
  for (const v of Object.values(a)) magA += v * v;
  let magB = 0;
  for (const v of Object.values(b)) magB += v * v;

  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);

  if (magA === 0 || magB === 0) return 0;
  return dot / (magA * magB);
}

// ── FAQ Matcher ─────────────────────────────────────────────────────────────

export type FAQMatchResult = FaqEntry & { score: number };

/**
 * Builds a TF-IDF index over FAQ entries and matches free-text queries
 * using cosine similarity.
 */
export class FAQMatcher {
  private readonly entries: FaqEntry[];
  private readonly corpusTokens: string[][];
  private readonly idfMap: SparseVec;
  private readonly vectors: SparseVec[];

  constructor(entries: FaqEntry[]) {
    this.entries = entries;

    // Build token corpus from question + slug + answer-preview for each entry
    this.corpusTokens = entries.map((entry) => {
      const qTokens = tokenize(entry.question ?? '');
      const slugTokens = tokenize((entry.key ?? '').replace(/-/g, ' '));
      // Include first ~40 words of answer for richer matching
      const answerPreview = (entry.answer ?? '').split(/\s+/).slice(0, 40).join(' ');
      const aTokens = tokenize(answerPreview);
      // Weight question tokens more heavily by repeating them
      return [...qTokens, ...qTokens, ...qTokens, ...slugTokens, ...slugTokens, ...aTokens];
    });

    // Compute IDF across corpus
    this.idfMap = idf(this.corpusTokens);

    // Pre-compute TF-IDF vectors for all entries
    this.vectors = this.corpusTokens.map((docTokens) => {
      const tf = termFreq(docTokens);
      return tfidfVector(tf, this.idfMap);
    });
  }

  /**
   * Find the best-matching FAQ entries for a query.
   * Returns up to `topK` entries with similarity >= `threshold`,
   * each augmented with a `score` field.
   */
  match(query: string, topK = 5, threshold = 0.08): FAQMatchResult[] {
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    const queryTf = termFreq(queryTokens);
    const queryVec = tfidfVector(queryTf, this.idfMap);

    const scored: Array<{ score: number; idx: number }> = [];
    for (let idx = 0; idx < this.vectors.length; idx++) {
      const sim = cosineSimilarity(queryVec, this.vectors[idx]!);
      if (sim >= threshold) {
        scored.push({ score: sim, idx });
      }
    }

    // Sort by similarity descending
    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, topK).map(({ score, idx }) => ({
      ...this.entries[idx]!,
      score: Math.round(score * 10000) / 10000,
    }));
  }

  /**
   * Return the single best-matching FAQ entry, or null if below threshold.
   */
  bestMatch(query: string, threshold = 0.08): FAQMatchResult | null {
    const results = this.match(query, 1, threshold);
    return results.length > 0 ? results[0]! : null;
  }
}
