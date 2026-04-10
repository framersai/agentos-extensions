// @ts-nocheck
/**
 * @fileoverview Tests for PR tools: diff, review, merge, comment list, comment create.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubPrDiffTool } from '../tools/prDiff.js';
import { GitHubPrReviewTool } from '../tools/prReview.js';
import { GitHubPrMergeTool } from '../tools/prMerge.js';
import { GitHubPrCommentListTool } from '../tools/prCommentList.js';
import { GitHubPrCommentCreateTool } from '../tools/prCommentCreate.js';
import type { GitHubService } from '../GitHubService.js';

/** Creates a mock GitHubService with all octokit stubs needed by PR tools. */
function createMockService(overrides: Record<string, any> = {}): GitHubService {
  const octokit = {
    rest: {
      pulls: {
        listFiles: vi.fn(),
        createReview: vi.fn(),
        merge: vi.fn(),
        listReviewComments: vi.fn(),
        ...overrides.pulls,
      },
      issues: {
        createComment: vi.fn(),
        ...overrides.issues,
      },
    },
  };
  return { getOctokit: () => octokit as any } as unknown as GitHubService;
}

/* -------------------------------------------------------------------------- */
/*  GitHubPrDiffTool                                                          */
/* -------------------------------------------------------------------------- */

describe('GitHubPrDiffTool', () => {
  let service: GitHubService;
  let tool: GitHubPrDiffTool;

  beforeEach(() => {
    service = createMockService();
    tool = new GitHubPrDiffTool(service);
  });

  it('has correct metadata', () => {
    expect(tool.name).toBe('github_pr_diff');
    expect(tool.hasSideEffects).toBe(false);
  });

  it('returns file summary without patches by default', async () => {
    const octokit = service.getOctokit();
    (octokit.rest.pulls.listFiles as any).mockResolvedValue({
      data: [
        { filename: 'a.ts', status: 'modified', additions: 5, deletions: 2, changes: 7, patch: '@@ -1 +1 @@' },
        { filename: 'b.ts', status: 'added', additions: 10, deletions: 0, changes: 10, patch: '+new' },
      ],
    });

    const result = await tool.execute({ owner: 'o', repo: 'r', pull_number: 1 });

    expect(result.success).toBe(true);
    const data = result.data as any;
    expect(data.totalFiles).toBe(2);
    expect(data.totalAdditions).toBe(15);
    expect(data.totalDeletions).toBe(2);
    expect(data.files[0]).not.toHaveProperty('patch');
    expect(data.files[1]).not.toHaveProperty('patch');
  });

  it('includes patches when include_patch is true', async () => {
    const octokit = service.getOctokit();
    (octokit.rest.pulls.listFiles as any).mockResolvedValue({
      data: [
        { filename: 'c.ts', status: 'modified', additions: 1, deletions: 1, changes: 2, patch: 'short patch' },
      ],
    });

    const result = await tool.execute({ owner: 'o', repo: 'r', pull_number: 2, include_patch: true });
    const data = result.data as any;
    expect(data.files[0].patch).toBe('short patch');
  });

  it('truncates long patches to 3000 chars', async () => {
    const octokit = service.getOctokit();
    const longPatch = 'x'.repeat(5000);
    (octokit.rest.pulls.listFiles as any).mockResolvedValue({
      data: [
        { filename: 'd.ts', status: 'modified', additions: 1, deletions: 1, changes: 2, patch: longPatch },
      ],
    });

    const result = await tool.execute({ owner: 'o', repo: 'r', pull_number: 3, include_patch: true });
    const data = result.data as any;
    expect(data.files[0].patch.length).toBeLessThan(5000);
    expect(data.files[0].patch).toContain('... (truncated)');
  });

  it('returns error on API failure', async () => {
    const octokit = service.getOctokit();
    (octokit.rest.pulls.listFiles as any).mockRejectedValue(new Error('Not Found'));

    const result = await tool.execute({ owner: 'o', repo: 'r', pull_number: 999 });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Not Found');
  });
});

/* -------------------------------------------------------------------------- */
/*  GitHubPrReviewTool                                                        */
/* -------------------------------------------------------------------------- */

describe('GitHubPrReviewTool', () => {
  let service: GitHubService;
  let tool: GitHubPrReviewTool;

  beforeEach(() => {
    service = createMockService();
    tool = new GitHubPrReviewTool(service);
  });

  it('has correct metadata', () => {
    expect(tool.name).toBe('github_pr_review');
    expect(tool.hasSideEffects).toBe(true);
  });

  it('creates a review with event and body', async () => {
    const octokit = service.getOctokit();
    (octokit.rest.pulls.createReview as any).mockResolvedValue({
      data: {
        id: 500,
        state: 'APPROVED',
        html_url: 'https://github.com/o/r/pull/1#pullrequestreview-500',
      },
    });

    const result = await tool.execute({
      owner: 'o',
      repo: 'r',
      pull_number: 1,
      event: 'APPROVE',
      body: 'Ship it!',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      id: 500,
      state: 'APPROVED',
      url: 'https://github.com/o/r/pull/1#pullrequestreview-500',
    });
  });

  it('passes inline comments through', async () => {
    const octokit = service.getOctokit();
    (octokit.rest.pulls.createReview as any).mockResolvedValue({
      data: { id: 501, state: 'COMMENTED', html_url: 'https://example.com' },
    });

    const comments = [{ path: 'src/index.ts', line: 42, body: 'Nit: typo' }];
    await tool.execute({
      owner: 'o',
      repo: 'r',
      pull_number: 2,
      event: 'COMMENT',
      comments,
    });

    const callArgs = (octokit.rest.pulls.createReview as any).mock.calls[0][0];
    expect(callArgs.comments).toEqual(comments);
  });

  it('returns error on API failure', async () => {
    const octokit = service.getOctokit();
    (octokit.rest.pulls.createReview as any).mockRejectedValue(new Error('Validation Failed'));

    const result = await tool.execute({
      owner: 'o',
      repo: 'r',
      pull_number: 1,
      event: 'REQUEST_CHANGES',
      body: 'Please fix',
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Validation Failed');
  });
});

/* -------------------------------------------------------------------------- */
/*  GitHubPrMergeTool                                                         */
/* -------------------------------------------------------------------------- */

describe('GitHubPrMergeTool', () => {
  let service: GitHubService;
  let tool: GitHubPrMergeTool;

  beforeEach(() => {
    service = createMockService();
    tool = new GitHubPrMergeTool(service);
  });

  it('has correct metadata', () => {
    expect(tool.name).toBe('github_pr_merge');
    expect(tool.hasSideEffects).toBe(true);
  });

  it('merges with default method', async () => {
    const octokit = service.getOctokit();
    (octokit.rest.pulls.merge as any).mockResolvedValue({
      data: { merged: true, sha: 'abc123', message: 'Pull Request successfully merged' },
    });

    const result = await tool.execute({ owner: 'o', repo: 'r', pull_number: 10 });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      merged: true,
      sha: 'abc123',
      message: 'Pull Request successfully merged',
    });

    const callArgs = (octokit.rest.pulls.merge as any).mock.calls[0][0];
    expect(callArgs.merge_method).toBe('merge');
  });

  it('uses squash method with custom title', async () => {
    const octokit = service.getOctokit();
    (octokit.rest.pulls.merge as any).mockResolvedValue({
      data: { merged: true, sha: 'def456', message: 'Merged' },
    });

    await tool.execute({
      owner: 'o',
      repo: 'r',
      pull_number: 11,
      merge_method: 'squash',
      commit_title: 'feat: big feature',
      commit_message: 'All changes squashed',
    });

    const callArgs = (octokit.rest.pulls.merge as any).mock.calls[0][0];
    expect(callArgs.merge_method).toBe('squash');
    expect(callArgs.commit_title).toBe('feat: big feature');
    expect(callArgs.commit_message).toBe('All changes squashed');
  });

  it('returns error on merge conflict', async () => {
    const octokit = service.getOctokit();
    (octokit.rest.pulls.merge as any).mockRejectedValue(new Error('Pull Request is not mergeable'));

    const result = await tool.execute({ owner: 'o', repo: 'r', pull_number: 12 });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Pull Request is not mergeable');
  });
});

/* -------------------------------------------------------------------------- */
/*  GitHubPrCommentListTool                                                   */
/* -------------------------------------------------------------------------- */

describe('GitHubPrCommentListTool', () => {
  let service: GitHubService;
  let tool: GitHubPrCommentListTool;

  beforeEach(() => {
    service = createMockService();
    tool = new GitHubPrCommentListTool(service);
  });

  it('has correct metadata', () => {
    expect(tool.name).toBe('github_pr_comment_list');
    expect(tool.hasSideEffects).toBe(false);
  });

  it('lists review comments', async () => {
    const octokit = service.getOctokit();
    (octokit.rest.pulls.listReviewComments as any).mockResolvedValue({
      data: [
        {
          id: 200,
          user: { login: 'reviewer' },
          body: 'This looks wrong',
          path: 'src/foo.ts',
          line: 15,
          created_at: '2024-03-01T00:00:00Z',
        },
      ],
    });

    const result = await tool.execute({ owner: 'o', repo: 'r', pull_number: 5 });
    expect(result.success).toBe(true);
    expect(result.data).toEqual([
      {
        id: 200,
        author: 'reviewer',
        body: 'This looks wrong',
        path: 'src/foo.ts',
        line: 15,
        createdAt: '2024-03-01T00:00:00Z',
      },
    ]);
  });

  it('clamps per_page to 30', async () => {
    const octokit = service.getOctokit();
    (octokit.rest.pulls.listReviewComments as any).mockResolvedValue({ data: [] });

    await tool.execute({ owner: 'o', repo: 'r', pull_number: 5, per_page: 100 });
    const callArgs = (octokit.rest.pulls.listReviewComments as any).mock.calls[0][0];
    expect(callArgs.per_page).toBe(30);
  });

  it('returns error on API failure', async () => {
    const octokit = service.getOctokit();
    (octokit.rest.pulls.listReviewComments as any).mockRejectedValue(new Error('Forbidden'));

    const result = await tool.execute({ owner: 'o', repo: 'r', pull_number: 5 });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Forbidden');
  });
});

/* -------------------------------------------------------------------------- */
/*  GitHubPrCommentCreateTool                                                 */
/* -------------------------------------------------------------------------- */

describe('GitHubPrCommentCreateTool', () => {
  let service: GitHubService;
  let tool: GitHubPrCommentCreateTool;

  beforeEach(() => {
    service = createMockService();
    tool = new GitHubPrCommentCreateTool(service);
  });

  it('has correct metadata', () => {
    expect(tool.name).toBe('github_pr_comment_create');
    expect(tool.hasSideEffects).toBe(true);
  });

  it('creates a top-level PR comment via issues API', async () => {
    const octokit = service.getOctokit();
    (octokit.rest.issues.createComment as any).mockResolvedValue({
      data: {
        id: 300,
        html_url: 'https://github.com/o/r/pull/3#issuecomment-300',
        body: 'Nice work!',
      },
    });

    const result = await tool.execute({
      owner: 'o',
      repo: 'r',
      pull_number: 3,
      body: 'Nice work!',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      id: 300,
      url: 'https://github.com/o/r/pull/3#issuecomment-300',
      body: 'Nice work!',
    });

    // Verify it uses issue_number (PRs are issues)
    const callArgs = (octokit.rest.issues.createComment as any).mock.calls[0][0];
    expect(callArgs.issue_number).toBe(3);
  });

  it('returns error on API failure', async () => {
    const octokit = service.getOctokit();
    (octokit.rest.issues.createComment as any).mockRejectedValue(new Error('Resource not accessible'));

    const result = await tool.execute({ owner: 'o', repo: 'r', pull_number: 99, body: 'test' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Resource not accessible');
  });
});
