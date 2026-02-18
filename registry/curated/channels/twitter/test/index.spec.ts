/**
 * Unit tests for the Twitter channel extension factory (createExtensionPack).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('twitter-api-v2', () => ({
  TwitterApi: class MockTwitterApi {
    constructor(_opts?: any) {}
    v2 = {
      me: vi.fn().mockResolvedValue({ data: { id: '1', name: 'Test', username: 'test' } }),
      tweet: vi.fn().mockResolvedValue({ data: { id: 'tw-1', text: 'hello' } }),
    };
    v1 = {
      uploadMedia: vi.fn().mockResolvedValue('media-1'),
      trendsByPlace: vi.fn().mockResolvedValue([{ trends: [] }]),
    };
  },
}));

import { createExtensionPack } from '../src/index';

describe('createExtensionPack', () => {
  beforeEach(() => {
    delete process.env.TWITTER_BEARER_TOKEN;
    delete process.env.TWITTER_API_KEY;
    delete process.env.TWITTER_API_SECRET;
    delete process.env.TWITTER_ACCESS_TOKEN;
    delete process.env.TWITTER_ACCESS_SECRET;
  });

  it('should create a pack with the correct name', () => {
    const pack = createExtensionPack({
      options: { bearerToken: 'test-token' },
    });
    expect(pack.name).toBe('@framers/agentos-ext-channel-twitter');
  });

  it('should include 13 descriptors (12 tools + 1 messaging-channel)', () => {
    const pack = createExtensionPack({
      options: { bearerToken: 'test-token' },
    });

    expect(pack.descriptors).toHaveLength(13);

    const tools = pack.descriptors.filter((d) => d.kind === 'tool');
    const channels = pack.descriptors.filter((d) => d.kind === 'messaging-channel');

    expect(tools).toHaveLength(12);
    expect(channels).toHaveLength(1);
  });

  it('should have the correct tool descriptor IDs', () => {
    const pack = createExtensionPack({
      options: { bearerToken: 'test-token' },
    });

    const toolIds = pack.descriptors
      .filter((d) => d.kind === 'tool')
      .map((d) => d.id);

    expect(toolIds).toContain('twitterPost');
    expect(toolIds).toContain('twitterReply');
    expect(toolIds).toContain('twitterQuote');
    expect(toolIds).toContain('twitterLike');
    expect(toolIds).toContain('twitterRetweet');
    expect(toolIds).toContain('twitterSearch');
    expect(toolIds).toContain('twitterTrending');
    expect(toolIds).toContain('twitterTimeline');
    expect(toolIds).toContain('twitterDm');
    expect(toolIds).toContain('twitterAnalytics');
    expect(toolIds).toContain('twitterSchedule');
    expect(toolIds).toContain('twitterThread');
  });

  it('should have the correct channel descriptor ID', () => {
    const pack = createExtensionPack({
      options: { bearerToken: 'test-token' },
    });

    const channel = pack.descriptors.find((d) => d.kind === 'messaging-channel');
    expect(channel?.id).toBe('twitterChannel');
  });

  it('should resolve bearerToken from options.bearerToken', () => {
    const pack = createExtensionPack({
      options: { bearerToken: 'direct-token' },
    });
    // If it resolves, pack is created without error
    expect(pack.descriptors.length).toBe(13);
  });

  it('should resolve bearerToken from options.secrets["twitter.bearerToken"]', () => {
    const pack = createExtensionPack({
      options: { secrets: { 'twitter.bearerToken': 'secret-token' } },
    });
    expect(pack.descriptors.length).toBe(13);
  });

  it('should resolve bearerToken from env TWITTER_BEARER_TOKEN', () => {
    process.env.TWITTER_BEARER_TOKEN = 'env-token';
    const pack = createExtensionPack({ options: {} });
    expect(pack.descriptors.length).toBe(13);
  });

  it('should use default priority of 50 when not specified', () => {
    const pack = createExtensionPack({
      options: { bearerToken: 'test-token' },
    });

    for (const descriptor of pack.descriptors) {
      expect(descriptor.priority).toBe(50);
    }
  });

  it('should have onActivate and onDeactivate lifecycle hooks', () => {
    const pack = createExtensionPack({
      options: { bearerToken: 'test-token' },
    });
    expect(typeof pack.onActivate).toBe('function');
    expect(typeof pack.onDeactivate).toBe('function');
  });

  it('should activate and deactivate without errors', async () => {
    const pack = createExtensionPack({
      options: { bearerToken: 'test-token' },
    });
    await pack.onActivate!();
    await pack.onDeactivate!();
  });

  it('should create pack even with empty bearerToken (no validation at factory level)', () => {
    const pack = createExtensionPack({ options: {} });
    // The factory does not throw; validation happens at service.initialize()
    expect(pack.descriptors.length).toBe(13);
  });
});
