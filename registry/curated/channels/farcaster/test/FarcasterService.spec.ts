/**
 * @fileoverview Unit tests for FarcasterService.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock axios before importing the service
// ---------------------------------------------------------------------------

const { mockAxiosInstance, mockAxios } = vi.hoisted(() => {
  const mockAxiosInstance = {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  };

  const mockAxios = {
    get: vi.fn(),
    post: vi.fn(),
    create: vi.fn().mockReturnValue(mockAxiosInstance),
  };

  return { mockAxiosInstance, mockAxios };
});

vi.mock('axios', () => ({
  default: mockAxios,
}));

import { FarcasterService } from '../src/FarcasterService.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createService(overrides: Partial<{ signerUuid: string; neynarApiKey: string; fid: number }> = {}) {
  return new FarcasterService({
    signerUuid: overrides.signerUuid ?? 'test-signer-uuid',
    neynarApiKey: overrides.neynarApiKey ?? 'test-api-key',
    fid: overrides.fid,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FarcasterService', () => {
  let service: FarcasterService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = createService({ fid: 12345 });
  });

  // ── Lifecycle ──

  describe('lifecycle', () => {
    it('should initialize successfully with valid credentials', async () => {
      await service.initialize();
      expect(service.isRunning).toBe(true);
      expect(mockAxios.create).toHaveBeenCalledWith({
        baseURL: 'https://api.neynar.com/v2',
        headers: {
          api_key: 'test-api-key',
          'Content-Type': 'application/json',
        },
      });
    });

    it('should throw if neynarApiKey is empty', async () => {
      const svc = createService({ neynarApiKey: '' });
      await expect(svc.initialize()).rejects.toThrow('no Neynar API key');
    });

    it('should throw if signerUuid is empty', async () => {
      const svc = createService({ signerUuid: '' });
      await expect(svc.initialize()).rejects.toThrow('no signer UUID');
    });

    it('should set isRunning to false after shutdown', async () => {
      await service.initialize();
      expect(service.isRunning).toBe(true);
      await service.shutdown();
      expect(service.isRunning).toBe(false);
    });

    it('should report isRunning as false before initialization', () => {
      expect(service.isRunning).toBe(false);
    });
  });

  // ── publishCast ──

  describe('publishCast', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should publish a simple text cast', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: {
          cast: {
            hash: '0xabc123',
            author: { fid: 12345 },
            text: 'Hello Farcaster!',
            timestamp: '2026-03-04T12:00:00Z',
          },
        },
      });

      const result = await service.publishCast('Hello Farcaster!');

      expect(result).toEqual({
        hash: '0xabc123',
        authorFid: 12345,
        text: 'Hello Farcaster!',
        timestamp: '2026-03-04T12:00:00Z',
      });
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/farcaster/cast', {
        signer_uuid: 'test-signer-uuid',
        text: 'Hello Farcaster!',
      });
    });

    it('should include embeds as url objects', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: {
          cast: { hash: '0xdef', text: 'with embeds', author: { fid: 12345 } },
        },
      });

      await service.publishCast('with embeds', {
        embeds: ['https://example.com/img.png', 'https://youtube.com/watch?v=123'],
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/farcaster/cast', {
        signer_uuid: 'test-signer-uuid',
        text: 'with embeds',
        embeds: [
          { url: 'https://example.com/img.png' },
          { url: 'https://youtube.com/watch?v=123' },
        ],
      });
    });

    it('should set parent when replyTo is provided', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: { cast: { hash: '0xreply', text: 'reply', author: { fid: 1 } } },
      });

      await service.publishCast('reply', { replyTo: '0xparent' });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/farcaster/cast',
        expect.objectContaining({ parent: '0xparent' }),
      );
    });

    it('should set channel_id when channelId is provided', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: { cast: { hash: '0xchan', text: 'channel cast', author: { fid: 1 } } },
      });

      await service.publishCast('channel cast', { channelId: 'farcaster' });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/farcaster/cast',
        expect.objectContaining({ channel_id: 'farcaster' }),
      );
    });

    it('should fall back to config fid when author fid is missing', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: { cast: { hash: '0xno-author', text: 'hi' } },
      });

      const result = await service.publishCast('hi');
      expect(result.authorFid).toBe(12345);
    });

    it('should fall back to 0 when no author fid and no config fid', async () => {
      const svc = createService({ fid: undefined });
      await svc.initialize();

      mockAxiosInstance.post.mockResolvedValue({
        data: { cast: { hash: '0xno-fid', text: 'anon' } },
      });

      const result = await svc.publishCast('anon');
      expect(result.authorFid).toBe(0);
    });

    it('should use response.data directly when cast wrapper is missing', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: { hash: '0xflat', text: 'flat response', author: { fid: 42 } },
      });

      const result = await service.publishCast('flat response');
      expect(result.hash).toBe('0xflat');
      expect(result.authorFid).toBe(42);
    });
  });

  // ── reply ──

  describe('reply', () => {
    it('should delegate to publishCast with replyTo', async () => {
      await service.initialize();
      mockAxiosInstance.post.mockResolvedValue({
        data: { cast: { hash: '0xrep', text: 'replying', author: { fid: 1 } } },
      });

      const result = await service.reply('0xparent-hash', 'replying');

      expect(result.hash).toBe('0xrep');
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/farcaster/cast',
        expect.objectContaining({
          text: 'replying',
          parent: '0xparent-hash',
        }),
      );
    });
  });

  // ── Engagement ──

  describe('likeCast', () => {
    it('should send a like reaction', async () => {
      await service.initialize();
      mockAxiosInstance.post.mockResolvedValue({ data: {} });

      await service.likeCast('0xtarget');

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/farcaster/reaction', {
        signer_uuid: 'test-signer-uuid',
        reaction_type: 'like',
        target: '0xtarget',
      });
    });
  });

  describe('recast', () => {
    it('should send a recast reaction', async () => {
      await service.initialize();
      mockAxiosInstance.post.mockResolvedValue({ data: {} });

      await service.recast('0xtarget-recast');

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/farcaster/reaction', {
        signer_uuid: 'test-signer-uuid',
        reaction_type: 'recast',
        target: '0xtarget-recast',
      });
    });
  });

  // ── Search ──

  describe('searchCasts', () => {
    it('should search casts and map results to CastResult[]', async () => {
      await service.initialize();
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          result: {
            casts: [
              {
                hash: '0xs1',
                author: { fid: 10 },
                text: 'found it',
                timestamp: '2026-01-01',
                reactions: { likes_count: 5, recasts_count: 2 },
              },
            ],
          },
        },
      });

      const results = await service.searchCasts('test');

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        hash: '0xs1',
        authorFid: 10,
        text: 'found it',
        timestamp: '2026-01-01',
        reactions: { likes: 5, recasts: 2 },
      });
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/farcaster/cast/search', {
        params: { q: 'test', limit: 10 },
      });
    });

    it('should respect custom limit', async () => {
      await service.initialize();
      mockAxiosInstance.get.mockResolvedValue({ data: { result: { casts: [] } } });

      await service.searchCasts('query', 3);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/farcaster/cast/search', {
        params: { q: 'query', limit: 3 },
      });
    });

    it('should handle response without result wrapper', async () => {
      await service.initialize();
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          casts: [
            { hash: '0xalt', author: { fid: 7 }, text: 'alt format' },
          ],
        },
      });

      const results = await service.searchCasts('alt');
      expect(results).toHaveLength(1);
      expect(results[0].hash).toBe('0xalt');
    });

    it('should handle missing reactions gracefully', async () => {
      await service.initialize();
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          result: {
            casts: [
              { hash: '0xnr', author: { fid: 1 }, text: 'no reactions' },
            ],
          },
        },
      });

      const results = await service.searchCasts('no reactions');
      expect(results[0].reactions).toBeUndefined();
    });
  });

  // ── Feed ──

  describe('getFeed', () => {
    it('should fetch following feed by default', async () => {
      await service.initialize();
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          casts: [
            {
              hash: '0xf1',
              author: { fid: 20 },
              text: 'feed item',
              reactions: { likes_count: 3, recasts_count: 1 },
            },
          ],
        },
      });

      const results = await service.getFeed();

      expect(results).toHaveLength(1);
      expect(results[0].hash).toBe('0xf1');
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/farcaster/feed', {
        params: { feed_type: 'following', limit: 20 },
      });
    });

    it('should fetch trending feed', async () => {
      await service.initialize();
      mockAxiosInstance.get.mockResolvedValue({ data: { casts: [] } });

      await service.getFeed('trending', 5);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/farcaster/feed', {
        params: { feed_type: 'trending', limit: 5 },
      });
    });

    it('should handle empty casts array', async () => {
      await service.initialize();
      mockAxiosInstance.get.mockResolvedValue({ data: { casts: [] } });

      const results = await service.getFeed();
      expect(results).toEqual([]);
    });
  });

  // ── getCast ──

  describe('getCast', () => {
    it('should fetch a single cast by hash', async () => {
      await service.initialize();
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          cast: {
            hash: '0xsingle',
            author: { fid: 100 },
            text: 'single cast',
            reactions: { likes_count: 10, recasts_count: 5 },
          },
        },
      });

      const result = await service.getCast('0xsingle');

      expect(result).toEqual({
        hash: '0xsingle',
        authorFid: 100,
        text: 'single cast',
        timestamp: undefined,
        reactions: { likes: 10, recasts: 5 },
      });
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/farcaster/cast', {
        params: { identifier: '0xsingle', type: 'hash' },
      });
    });

    it('should return null on API error', async () => {
      await service.initialize();
      mockAxiosInstance.get.mockRejectedValue(new Error('404 Not Found'));

      const result = await service.getCast('0xbad-hash');
      expect(result).toBeNull();
    });

    it('should return null when API rejects with an error', async () => {
      await service.initialize();
      mockAxiosInstance.get.mockRejectedValue(new Error('404 Not Found'));

      const result = await service.getCast('0xbad');
      expect(result).toBeNull();
    });

    it('should use flat response when cast wrapper is missing', async () => {
      await service.initialize();
      mockAxiosInstance.get.mockResolvedValue({
        data: { hash: '0xflat', author: { fid: 55 }, text: 'flat' },
      });

      const result = await service.getCast('0xflat');
      expect(result!.hash).toBe('0xflat');
      expect(result!.authorFid).toBe(55);
    });
  });

  // ── deleteCast ──

  describe('deleteCast', () => {
    it('should delete a cast by hash', async () => {
      await service.initialize();
      mockAxiosInstance.delete.mockResolvedValue({ data: {} });

      await service.deleteCast('0xdel');

      expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/farcaster/cast', {
        data: {
          signer_uuid: 'test-signer-uuid',
          target_hash: '0xdel',
        },
      });
    });
  });

  // ── Users ──

  describe('getUserByFid', () => {
    it('should fetch user info by fid', async () => {
      await service.initialize();
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          user: {
            fid: 42,
            username: 'alice',
            display_name: 'Alice',
          },
        },
      });

      const result = await service.getUserByFid(42);

      expect(result).toEqual({
        fid: 42,
        username: 'alice',
        displayName: 'Alice',
      });
    });

    it('should return null on API error', async () => {
      await service.initialize();
      mockAxiosInstance.get.mockRejectedValue(new Error('User not found'));

      const result = await service.getUserByFid(999);
      expect(result).toBeNull();
    });

    it('should handle response with empty user object (falls back to data itself)', async () => {
      await service.initialize();
      mockAxiosInstance.get.mockResolvedValue({ data: {} });

      const result = await service.getUserByFid(0);
      // The code does `response.data?.user ?? response.data`, so {} is truthy
      // It returns an object with undefined/empty fields rather than null
      expect(result).toBeDefined();
      expect(result!.username).toBe('');
    });

    it('should use flat response data when user wrapper is missing', async () => {
      await service.initialize();
      mockAxiosInstance.get.mockResolvedValue({
        data: { fid: 77, username: 'bob', display_name: 'Bob' },
      });

      const result = await service.getUserByFid(77);
      expect(result!.fid).toBe(77);
      expect(result!.displayName).toBe('Bob');
    });
  });

  describe('getMe', () => {
    it('should delegate to getUserByFid when fid is configured', async () => {
      await service.initialize();
      mockAxiosInstance.get.mockResolvedValue({
        data: { user: { fid: 12345, username: 'me', display_name: 'Me' } },
      });

      const result = await service.getMe();

      expect(result).toEqual({ fid: 12345, username: 'me', displayName: 'Me' });
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/farcaster/user', {
        params: { fid: 12345 },
      });
    });

    it('should return null when fid is not configured', async () => {
      const svc = createService({ fid: undefined });
      await svc.initialize();

      const result = await svc.getMe();
      expect(result).toBeNull();
    });
  });

  // ── requireClient guard ──

  describe('requireClient guard', () => {
    it('should throw for every method when not initialized', async () => {
      await expect(service.publishCast('hi')).rejects.toThrow('not initialized');
      await expect(service.reply('x', 'y')).rejects.toThrow('not initialized');
      await expect(service.likeCast('x')).rejects.toThrow('not initialized');
      await expect(service.recast('x')).rejects.toThrow('not initialized');
      await expect(service.searchCasts('x')).rejects.toThrow('not initialized');
      await expect(service.getFeed()).rejects.toThrow('not initialized');
      await expect(service.getCast('x')).rejects.toThrow('not initialized');
      await expect(service.deleteCast('x')).rejects.toThrow('not initialized');
      await expect(service.getUserByFid(1)).rejects.toThrow('not initialized');
    });

    it('should throw after shutdown', async () => {
      await service.initialize();
      await service.shutdown();
      await expect(service.publishCast('hi')).rejects.toThrow('not initialized');
    });
  });
});
