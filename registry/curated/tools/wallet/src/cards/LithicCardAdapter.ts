// @ts-nocheck
/**
 * @fileoverview Pure REST client for the Lithic card issuance API.
 *
 * No SDK dependency — uses fetch() directly. Supports sandbox and production
 * environments via configurable base URL.
 *
 * @see https://docs.lithic.com/reference
 * @module wallet/cards/LithicCardAdapter
 */

import type {
  AuthRuleParams,
  CreateCardParams,
  ICardAdapter,
  LithicCardResponse,
  LithicTransaction,
  ListTxOpts,
  UpdateCardParams,
} from './types.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface LithicCardAdapterOptions {
  apiKey: string;
  /** Use sandbox environment. Defaults to true. */
  sandbox?: boolean;
  /** Override base URL (for testing). */
  baseUrl?: string;
}

const SANDBOX_URL = 'https://sandbox.lithic.com/v1';
const PRODUCTION_URL = 'https://api.lithic.com/v1';

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class LithicCardAdapter implements ICardAdapter {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(opts: LithicCardAdapterOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl || (opts.sandbox !== false ? SANDBOX_URL : PRODUCTION_URL);
  }

  // -----------------------------------------------------------------------
  // Card CRUD
  // -----------------------------------------------------------------------

  async createCard(params: CreateCardParams): Promise<LithicCardResponse> {
    return this.post<LithicCardResponse>('/cards', params);
  }

  async getCard(cardToken: string): Promise<LithicCardResponse> {
    return this.get<LithicCardResponse>(`/cards/${cardToken}`);
  }

  async updateCard(cardToken: string, updates: UpdateCardParams): Promise<LithicCardResponse> {
    return this.patch<LithicCardResponse>(`/cards/${cardToken}`, updates);
  }

  async pauseCard(cardToken: string): Promise<void> {
    await this.patch(`/cards/${cardToken}`, { state: 'PAUSED' });
  }

  async resumeCard(cardToken: string): Promise<void> {
    await this.patch(`/cards/${cardToken}`, { state: 'OPEN' });
  }

  async closeCard(cardToken: string): Promise<void> {
    await this.patch(`/cards/${cardToken}`, { state: 'CLOSED' });
  }

  // -----------------------------------------------------------------------
  // Transactions
  // -----------------------------------------------------------------------

  async listTransactions(cardToken: string, opts?: ListTxOpts): Promise<LithicTransaction[]> {
    const params = new URLSearchParams();
    params.set('card_token', cardToken);
    if (opts?.begin) params.set('begin', opts.begin);
    if (opts?.end) params.set('end', opts.end);
    if (opts?.page_size) params.set('page_size', String(opts.page_size));

    const result = await this.get<{ data: LithicTransaction[] }>(`/transactions?${params.toString()}`);
    return result.data;
  }

  // -----------------------------------------------------------------------
  // Auth rules (MCC-based spending controls)
  // -----------------------------------------------------------------------

  async createAuthRule(cardToken: string, rule: AuthRuleParams): Promise<void> {
    await this.post('/auth_rules', {
      card_tokens: [cardToken],
      ...rule,
    });
  }

  // -----------------------------------------------------------------------
  // HTTP helpers
  // -----------------------------------------------------------------------

  private async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  private async patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Authorization': this.apiKey,
      'Accept': 'application/json',
    };
    if (body) headers['Content-Type'] = 'application/json';

    const resp = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new LithicApiError(resp.status, `Lithic API error ${resp.status}: ${text}`, path);
    }

    // Some endpoints return no body (204)
    if (resp.status === 204) return undefined as T;

    return resp.json() as Promise<T>;
  }
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class LithicApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly path: string,
  ) {
    super(message);
    this.name = 'LithicApiError';
  }
}
