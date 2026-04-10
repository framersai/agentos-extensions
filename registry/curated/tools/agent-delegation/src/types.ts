// @ts-nocheck
/**
 * Shared types for the agent-delegation extension.
 */

// ---------------------------------------------------------------------------
// Agent endpoint descriptor
// ---------------------------------------------------------------------------

export interface AgentEndpoint {
  /** Full URL of the agent (e.g. "http://localhost:3777" or "https://agent.example.com"). */
  url: string;
  /** Optional chat secret for authentication. */
  secret?: string;
  /** Optional human-readable label for logging. */
  label?: string;
}

// ---------------------------------------------------------------------------
// /health response shape (subset — only fields we consume)
// ---------------------------------------------------------------------------

export interface AgentHealthResponse {
  ok: boolean;
  seedId: string;
  name: string;
  uptime: number;
  version?: string;
  port?: number;
  tools?: number;
  channels?: number;
  personasAvailable?: number;
  persona?: { id: string; name: string } | null;
  memory?: { rss: number; heap: number };
}

// ---------------------------------------------------------------------------
// /chat request/response
// ---------------------------------------------------------------------------

export interface ChatRequest {
  message: string;
  sessionId?: string;
  personaId?: string;
  reset?: boolean;
}

export interface ChatResponse {
  reply: string;
  personaId?: string;
}

// ---------------------------------------------------------------------------
// /api/agentos/personas response
// ---------------------------------------------------------------------------

export interface PersonaListResponse {
  selectedPersonaId?: string;
  personas: Array<{
    id: string;
    name: string;
    description?: string;
  }>;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

/** Normalized fetch result so tools don't throw on HTTP errors. */
export interface FetchResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

const DEFAULT_TIMEOUT_MS = 15_000;

export async function safeFetch<T>(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<FetchResult<T>> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchInit } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { ...fetchInit, signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, status: res.status, error: text || `HTTP ${res.status}` };
    }

    const data = (await res.json()) as T;
    return { ok: true, status: res.status, data };
  } catch (err: any) {
    clearTimeout(timer);
    if (err?.name === 'AbortError') {
      return { ok: false, status: 0, error: `Request timed out after ${timeoutMs}ms` };
    }
    return { ok: false, status: 0, error: err?.message || String(err) };
  }
}

/** Build headers for authenticated requests. */
export function authHeaders(secret?: string): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (secret) h['X-Wunderland-Chat-Secret'] = secret;
  return h;
}

/** Normalize a base URL — strip trailing slash. */
export function normalizeUrl(raw: string): string {
  return raw.replace(/\/+$/, '');
}
