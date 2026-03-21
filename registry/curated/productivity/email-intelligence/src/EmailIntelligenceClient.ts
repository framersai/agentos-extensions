/**
 * @fileoverview HTTP client for the Email Intelligence backend REST API.
 *
 * Authenticates with X-Internal-Secret and X-Seed-Id headers.
 */

export class EmailIntelligenceClient {
  constructor(
    private readonly backendUrl: string,
    private readonly seedId: string,
    private readonly secret: string,
  ) {}

  async request<T = any>(
    path: string,
    opts?: { method?: string; body?: any; query?: Record<string, string> },
  ): Promise<T> {
    const url = new URL(`${this.backendUrl}/wunderland/email-intelligence/${path}`);
    url.searchParams.set('seedId', this.seedId);
    if (opts?.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        url.searchParams.set(k, v);
      }
    }

    const res = await fetch(url.toString(), {
      method: opts?.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': this.secret,
        'X-Seed-Id': this.seedId,
      },
      body: opts?.body ? JSON.stringify(opts.body) : undefined,
    });

    if (!res.ok) {
      throw new Error(`Email API ${res.status}: ${await res.text().catch(() => '')}`);
    }

    return res.headers.get('content-type')?.includes('json')
      ? res.json()
      : (res.text() as any);
  }
}
