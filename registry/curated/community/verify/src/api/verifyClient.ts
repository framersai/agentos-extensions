/**
 * HTTP client for RabbitHole Discord Verification API.
 *
 * Endpoints:
 *   POST /api/discord/verify/token   — create a verification link
 *   GET  /api/discord/verify/status/:id — check link status
 */

export interface VerifyTokenResult {
  token: string;
  expires_at: number;
  message: string;
}

export interface VerifyStatusResult {
  verified: boolean;
  subscription_status?: string;
  subscription_plan_id?: string;
  display_name?: string;
}

export class VerifyClient {
  private readonly baseUrl: string;
  private readonly secret: string;

  constructor(baseUrl: string, secret: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.secret = secret;
  }

  isConfigured(): boolean {
    return Boolean(this.baseUrl && this.secret);
  }

  async createToken(discordUserId: string): Promise<VerifyTokenResult> {
    const res = await fetch(`${this.baseUrl}/api/discord/verify/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': this.secret,
      },
      body: JSON.stringify({ discord_user_id: discordUserId }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Verify API ${res.status}: ${text}`);
    }
    return (await res.json()) as VerifyTokenResult;
  }

  async checkStatus(discordUserId: string): Promise<VerifyStatusResult> {
    const res = await fetch(
      `${this.baseUrl}/api/discord/verify/status/${discordUserId}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': this.secret,
        },
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Verify API ${res.status}: ${text}`);
    }
    return (await res.json()) as VerifyStatusResult;
  }
}
