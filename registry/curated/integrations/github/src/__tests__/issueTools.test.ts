/**
 * @fileoverview Tests for GitHubIssueUpdateTool and GitHubCommentListTool.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubIssueUpdateTool } from '../tools/issueUpdate.js';
import { GitHubCommentListTool } from '../tools/commentList.js';
import type { GitHubService } from '../GitHubService.js';

/** Creates a mock GitHubService whose octokit methods can be spied on. */
function createMockService(overrides: Record<string, any> = {}): GitHubService {
  const octokit = {
    rest: {
      issues: {
        update: vi.fn(),
        listComments: vi.fn(),
        ...overrides,
      },
    },
  };
  return { getOctokit: () => octokit as any } as unknown as GitHubService;
}

/* -------------------------------------------------------------------------- */
/*  GitHubIssueUpdateTool                                                     */
/* -------------------------------------------------------------------------- */

describe('GitHubIssueUpdateTool', () => {
  let service: GitHubService;
  let tool: GitHubIssueUpdateTool;

  beforeEach(() => {
    service = createMockService();
    tool = new GitHubIssueUpdateTool(service);
  });

  it('has correct metadata', () => {
    expect(tool.name).toBe('github_issue_update');
    expect(tool.category).toBe('developer');
    expect(tool.hasSideEffects).toBe(true);
  });

  it('updates issue with all provided fields', async () => {
    const octokit = service.getOctokit();
    (octokit.rest.issues.update as any).mockResolvedValue({
      data: {
        number: 42,
        title: 'Updated Title',
        state: 'closed',
        labels: [{ name: 'bug' }, { name: 'urgent' }],
        assignees: [{ login: 'alice' }],
        html_url: 'https://github.com/owner/repo/issues/42',
      },
    });

    const result = await tool.execute({
      owner: 'owner',
      repo: 'repo',
      issue_number: 42,
      title: 'Updated Title',
      body: 'New body',
      state: 'closed',
      labels: ['bug', 'urgent'],
      assignees: ['alice'],
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      number: 42,
      title: 'Updated Title',
      state: 'closed',
      labels: ['bug', 'urgent'],
      assignees: ['alice'],
      url: 'https://github.com/owner/repo/issues/42',
    });

    // Verify all fields were passed through
    const callArgs = (octokit.rest.issues.update as any).mock.calls[0][0];
    expect(callArgs.title).toBe('Updated Title');
    expect(callArgs.body).toBe('New body');
    expect(callArgs.state).toBe('closed');
    expect(callArgs.labels).toEqual(['bug', 'urgent']);
    expect(callArgs.assignees).toEqual(['alice']);
  });

  it('only passes provided fields (partial update)', async () => {
    const octokit = service.getOctokit();
    (octokit.rest.issues.update as any).mockResolvedValue({
      data: {
        number: 7,
        title: 'Same Title',
        state: 'open',
        labels: [],
        assignees: [],
        html_url: 'https://github.com/o/r/issues/7',
      },
    });

    await tool.execute({
      owner: 'o',
      repo: 'r',
      issue_number: 7,
      state: 'open',
    });

    const callArgs = (octokit.rest.issues.update as any).mock.calls[0][0];
    expect(callArgs).toHaveProperty('state', 'open');
    expect(callArgs).not.toHaveProperty('title');
    expect(callArgs).not.toHaveProperty('body');
    expect(callArgs).not.toHaveProperty('labels');
    expect(callArgs).not.toHaveProperty('assignees');
  });

  it('returns error on API failure', async () => {
    const octokit = service.getOctokit();
    (octokit.rest.issues.update as any).mockRejectedValue(new Error('Not Found'));

    const result = await tool.execute({
      owner: 'x',
      repo: 'y',
      issue_number: 999,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Not Found');
  });
});

/* -------------------------------------------------------------------------- */
/*  GitHubCommentListTool                                                     */
/* -------------------------------------------------------------------------- */

describe('GitHubCommentListTool', () => {
  let service: GitHubService;
  let tool: GitHubCommentListTool;

  beforeEach(() => {
    service = createMockService();
    tool = new GitHubCommentListTool(service);
  });

  it('has correct metadata', () => {
    expect(tool.name).toBe('github_comment_list');
    expect(tool.category).toBe('developer');
    expect(tool.hasSideEffects).toBe(false);
  });

  it('lists comments with default per_page', async () => {
    const octokit = service.getOctokit();
    (octokit.rest.issues.listComments as any).mockResolvedValue({
      data: [
        {
          id: 100,
          user: { login: 'bob' },
          body: 'Looks good!',
          created_at: '2024-01-01T00:00:00Z',
          html_url: 'https://github.com/owner/repo/issues/1#issuecomment-100',
        },
        {
          id: 101,
          user: { login: 'alice' },
          body: 'Merging now.',
          created_at: '2024-01-02T00:00:00Z',
          html_url: 'https://github.com/owner/repo/issues/1#issuecomment-101',
        },
      ],
    });

    const result = await tool.execute({ owner: 'owner', repo: 'repo', issue_number: 1 });

    expect(result.success).toBe(true);
    expect(result.data).toEqual([
      {
        id: 100,
        author: 'bob',
        body: 'Looks good!',
        createdAt: '2024-01-01T00:00:00Z',
        url: 'https://github.com/owner/repo/issues/1#issuecomment-100',
      },
      {
        id: 101,
        author: 'alice',
        body: 'Merging now.',
        createdAt: '2024-01-02T00:00:00Z',
        url: 'https://github.com/owner/repo/issues/1#issuecomment-101',
      },
    ]);

    const callArgs = (octokit.rest.issues.listComments as any).mock.calls[0][0];
    expect(callArgs.per_page).toBe(10);
  });

  it('clamps per_page to 30', async () => {
    const octokit = service.getOctokit();
    (octokit.rest.issues.listComments as any).mockResolvedValue({ data: [] });

    await tool.execute({ owner: 'o', repo: 'r', issue_number: 5, per_page: 100 });

    const callArgs = (octokit.rest.issues.listComments as any).mock.calls[0][0];
    expect(callArgs.per_page).toBe(30);
  });

  it('returns error on API failure', async () => {
    const octokit = service.getOctokit();
    (octokit.rest.issues.listComments as any).mockRejectedValue(new Error('Forbidden'));

    const result = await tool.execute({ owner: 'x', repo: 'y', issue_number: 1 });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Forbidden');
  });
});
