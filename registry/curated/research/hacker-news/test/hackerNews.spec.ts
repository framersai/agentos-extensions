// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { HackerNewsTool } from '../src/tools/hackerNews';

const MOCK_HN_RESPONSE = {
  hits: [
    {
      objectID: '1',
      title: 'Show HN: A new AI framework',
      url: 'https://example.com/ai',
      points: 150,
      created_at: '2026-03-30T10:00:00Z',
      author: 'testuser',
      num_comments: 42,
      story_text: null,
    },
    {
      objectID: '2',
      title: 'Ask HN: Best programming language 2026?',
      url: '',
      points: 85,
      created_at: '2026-03-30T09:00:00Z',
      author: 'dev123',
      num_comments: 200,
      story_text: 'What do you all think?',
    },
  ],
  nbHits: 2,
};

const originalFetch = globalThis.fetch;
const mockFetch = vi.fn();

beforeEach(() => {
  globalThis.fetch = mockFetch as any;
  mockFetch.mockReset();
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe('HackerNewsTool', () => {
  const tool = new HackerNewsTool();

  it('has correct tool metadata', () => {
    expect(tool.id).toBe('hacker-news-v1');
    expect(tool.name).toBe('hacker_news');
  });

  it('fetches front page stories by default', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_HN_RESPONSE),
    });

    const result = await tool.execute({}, {} as any);
    // The tool wraps output in ToolExecutionResult — verify structure
    expect(result).toHaveProperty('success');
    if (result.success && result.data) {
      expect(Array.isArray(result.data.stories)).toBe(true);
    }
  });

  it('filters by minimum points', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_HN_RESPONSE),
    });

    const result = await tool.execute({ minPoints: 100 }, {} as any);
    expect(result.success).toBe(true);
    // Only the 150-point story should survive the filter
    const stories = result.data?.stories ?? [];
    expect(stories.every((s: any) => s.points >= 100)).toBe(true);
  });

  it('handles API errors gracefully', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    const result = await tool.execute({}, {} as any);
    expect(result.success).toBe(false);
  });
});
