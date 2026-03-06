/**
 * @fileoverview Unit tests for LithicCardAdapter.
 *
 * Tests cover: all API methods, error handling, sandbox vs production URLs,
 * and fetch mock interactions.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { LithicCardAdapter, LithicApiError } from '../src/cards/LithicCardAdapter.js';

/* ------------------------------------------------------------------ */
/*  Mock fetch                                                         */
/* ------------------------------------------------------------------ */

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockResponse(data: any, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('LithicCardAdapter', () => {
  let adapter: LithicCardAdapter;

  beforeEach(() => {
    adapter = new LithicCardAdapter({ apiKey: 'test-api-key', sandbox: true });
  });

  /* ── URL configuration ────────────────────────────────────────────── */

  describe('URL configuration', () => {
    it('should use sandbox URL by default', async () => {
      mockFetch.mockResolvedValue(mockResponse({ token: 'card-1', last_four: '1234' }));
      await adapter.getCard('card-1');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('sandbox.lithic.com'),
        expect.any(Object),
      );
    });

    it('should use production URL when sandbox=false', async () => {
      const prodAdapter = new LithicCardAdapter({ apiKey: 'key', sandbox: false });
      mockFetch.mockResolvedValue(mockResponse({ token: 'card-1' }));
      await prodAdapter.getCard('card-1');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('api.lithic.com'),
        expect.any(Object),
      );
    });

    it('should use custom baseUrl when provided', async () => {
      const custom = new LithicCardAdapter({ apiKey: 'key', baseUrl: 'https://custom.api.com/v1' });
      mockFetch.mockResolvedValue(mockResponse({ token: 'card-1' }));
      await custom.getCard('card-1');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://custom.api.com/v1/cards/card-1',
        expect.any(Object),
      );
    });
  });

  /* ── Card CRUD ────────────────────────────────────────────────────── */

  describe('createCard', () => {
    it('should POST to /cards with correct body', async () => {
      mockFetch.mockResolvedValue(mockResponse({
        token: 'card-new',
        last_four: '5678',
        type: 'VIRTUAL',
        state: 'OPEN',
        spend_limit: 50000,
        spend_limit_duration: 'MONTHLY',
      }));

      const result = await adapter.createCard({
        type: 'VIRTUAL',
        spend_limit: 50000,
        spend_limit_duration: 'MONTHLY',
        memo: 'test card',
      });

      expect(result.token).toBe('card-new');
      expect(result.last_four).toBe('5678');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/cards'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('getCard', () => {
    it('should GET /cards/:token', async () => {
      mockFetch.mockResolvedValue(mockResponse({ token: 'card-1', state: 'OPEN' }));
      const result = await adapter.getCard('card-1');
      expect(result.token).toBe('card-1');
    });
  });

  describe('updateCard', () => {
    it('should PATCH /cards/:token', async () => {
      mockFetch.mockResolvedValue(mockResponse({ token: 'card-1', spend_limit: 100000 }));
      await adapter.updateCard('card-1', { spend_limit: 100000 });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/cards/card-1'),
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
  });

  describe('pauseCard', () => {
    it('should PATCH with state PAUSED', async () => {
      mockFetch.mockResolvedValue(mockResponse({ token: 'card-1', state: 'PAUSED' }));
      await adapter.pauseCard('card-1');
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.state).toBe('PAUSED');
    });
  });

  describe('resumeCard', () => {
    it('should PATCH with state OPEN', async () => {
      mockFetch.mockResolvedValue(mockResponse({ token: 'card-1', state: 'OPEN' }));
      await adapter.resumeCard('card-1');
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.state).toBe('OPEN');
    });
  });

  describe('closeCard', () => {
    it('should PATCH with state CLOSED', async () => {
      mockFetch.mockResolvedValue(mockResponse({ token: 'card-1', state: 'CLOSED' }));
      await adapter.closeCard('card-1');
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.state).toBe('CLOSED');
    });
  });

  /* ── Transactions ──────────────────────────────────────────────────── */

  describe('listTransactions', () => {
    it('should GET /transactions with card_token param', async () => {
      mockFetch.mockResolvedValue(mockResponse({ data: [{ token: 'tx-1', amount: 1500 }] }));
      const txs = await adapter.listTransactions('card-1');
      expect(txs.length).toBe(1);
      expect(txs[0].token).toBe('tx-1');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('card_token=card-1'),
        expect.any(Object),
      );
    });

    it('should pass optional params', async () => {
      mockFetch.mockResolvedValue(mockResponse({ data: [] }));
      await adapter.listTransactions('card-1', { begin: '2026-01-01', page_size: 5 });
      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('begin=2026-01-01');
      expect(url).toContain('page_size=5');
    });
  });

  /* ── Auth rules ────────────────────────────────────────────────────── */

  describe('createAuthRule', () => {
    it('should POST to /auth_rules with card token', async () => {
      mockFetch.mockResolvedValue(mockResponse({}, 200));
      await adapter.createAuthRule('card-1', { blocked_mcc: ['5812', '5813'] });
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.card_tokens).toEqual(['card-1']);
      expect(body.blocked_mcc).toEqual(['5812', '5813']);
    });
  });

  /* ── Error handling ────────────────────────────────────────────────── */

  describe('error handling', () => {
    it('should throw LithicApiError on non-ok response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => 'Card not found',
      });

      await expect(adapter.getCard('bad-token')).rejects.toThrow(LithicApiError);
    });

    it('should include status code in error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => 'Forbidden',
      });

      try {
        await adapter.getCard('bad-token');
      } catch (err: any) {
        expect(err.statusCode).toBe(403);
        expect(err.name).toBe('LithicApiError');
      }
    });

    it('should include Authorization header in requests', async () => {
      mockFetch.mockResolvedValue(mockResponse({ token: 'card-1' }));
      await adapter.getCard('card-1');
      expect(mockFetch.mock.calls[0][1].headers['Authorization']).toBe('test-api-key');
    });
  });
});
