import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __testing } from '../src/index';

describe('wunderbot-feeds judge guardrails', () => {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  let tempDir: string;

  beforeEach(() => {
    vi.restoreAllMocks();
    tempDir = mkdtempSync(join(tmpdir(), 'wunderbot-feeds-'));
    process.env.WUNDERBOT_FEEDS_STATE_FILE = join(tempDir, 'post-history.json');
    __testing.resetRecentPosts();
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENAI_API_KEY;
    delete process.env.WUNDERBOT_FEEDS_STATE_FILE;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('skips judging when the per-category daily cap is already exhausted', async () => {
    __testing.addPostRecord('first', 'tech');
    __testing.addPostRecord('second', 'tech');

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const decisions = await __testing.judgeArticles(
      [{ title: 'third story' }],
      'tech',
      logger,
    );

    expect(decisions).toEqual([false]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('caps model approvals to the remaining daily slots', async () => {
    __testing.addPostRecord('already posted', 'tech');
    process.env.OPENAI_API_KEY = 'test-key';

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '{"approved_indexes":[2,0,1]}',
            },
          },
        ],
      }),
    }));

    const decisions = await __testing.judgeArticles(
      [{ title: 'a' }, { title: 'b' }, { title: 'c' }],
      'tech',
      logger,
    );

    expect(decisions).toEqual([false, false, true]);
  });

  it('falls back to at most one article when no OpenAI key is available', async () => {
    const decisions = await __testing.judgeArticles(
      [{ title: 'a' }, { title: 'b' }, { title: 'c' }],
      'science',
      logger,
    );

    expect(decisions).toEqual([true, false, false]);
  });

  it('persists recent post history across in-memory resets', () => {
    __testing.addPostRecord('persistent story', 'world', Date.now());
    expect(__testing.getRecentCategoryPostCount('world', Number.MAX_SAFE_INTEGER)).toBe(1);

    __testing.resetRecentPosts();
    expect(__testing.getRecentCategoryPostCount('world', Number.MAX_SAFE_INTEGER)).toBe(1);
  });
});
