// @ts-nocheck
/**
 * @fileoverview Tests for release and actions tools:
 * releaseList, releaseCreate, actionsList, actionsTrigger.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubReleaseListTool } from '../tools/releaseList.js';
import { GitHubReleaseCreateTool } from '../tools/releaseCreate.js';
import { GitHubActionsListTool } from '../tools/actionsList.js';
import { GitHubActionsTriggerTool } from '../tools/actionsTrigger.js';
import type { GitHubService } from '../GitHubService.js';

/** Creates a mock GitHubService with stubs for repos and actions API. */
function createMockService(): GitHubService {
  const octokit = {
    rest: {
      repos: {
        listReleases: vi.fn(),
        createRelease: vi.fn(),
      },
      actions: {
        listWorkflowRunsForRepo: vi.fn(),
        listWorkflowRuns: vi.fn(),
        createWorkflowDispatch: vi.fn(),
      },
    },
  };
  return { getOctokit: () => octokit as any } as unknown as GitHubService;
}

/* -------------------------------------------------------------------------- */
/*  GitHubReleaseListTool                                                     */
/* -------------------------------------------------------------------------- */

describe('GitHubReleaseListTool', () => {
  let service: GitHubService;
  let tool: GitHubReleaseListTool;

  beforeEach(() => {
    service = createMockService();
    tool = new GitHubReleaseListTool(service);
  });

  it('has correct metadata', () => {
    expect(tool.name).toBe('github_release_list');
    expect(tool.hasSideEffects).toBe(false);
  });

  it('lists releases', async () => {
    const octokit = service.getOctokit();
    (octokit.rest.repos.listReleases as any).mockResolvedValue({
      data: [
        {
          tag_name: 'v1.0.0',
          name: 'Release 1.0',
          draft: false,
          prerelease: false,
          published_at: '2024-06-01T00:00:00Z',
          html_url: 'https://github.com/o/r/releases/tag/v1.0.0',
        },
        {
          tag_name: 'v0.9.0-beta',
          name: 'Beta',
          draft: false,
          prerelease: true,
          published_at: '2024-05-01T00:00:00Z',
          html_url: 'https://github.com/o/r/releases/tag/v0.9.0-beta',
        },
      ],
    });

    const result = await tool.execute({ owner: 'o', repo: 'r' });

    expect(result.success).toBe(true);
    expect(result.data).toEqual([
      {
        tag: 'v1.0.0',
        name: 'Release 1.0',
        draft: false,
        prerelease: false,
        publishedAt: '2024-06-01T00:00:00Z',
        url: 'https://github.com/o/r/releases/tag/v1.0.0',
      },
      {
        tag: 'v0.9.0-beta',
        name: 'Beta',
        draft: false,
        prerelease: true,
        publishedAt: '2024-05-01T00:00:00Z',
        url: 'https://github.com/o/r/releases/tag/v0.9.0-beta',
      },
    ]);
  });

  it('clamps per_page to 30', async () => {
    const octokit = service.getOctokit();
    (octokit.rest.repos.listReleases as any).mockResolvedValue({ data: [] });

    await tool.execute({ owner: 'o', repo: 'r', per_page: 50 });
    const callArgs = (octokit.rest.repos.listReleases as any).mock.calls[0][0];
    expect(callArgs.per_page).toBe(30);
  });

  it('returns error on API failure', async () => {
    const octokit = service.getOctokit();
    (octokit.rest.repos.listReleases as any).mockRejectedValue(new Error('Not Found'));

    const result = await tool.execute({ owner: 'o', repo: 'r' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Not Found');
  });
});

/* -------------------------------------------------------------------------- */
/*  GitHubReleaseCreateTool                                                   */
/* -------------------------------------------------------------------------- */

describe('GitHubReleaseCreateTool', () => {
  let service: GitHubService;
  let tool: GitHubReleaseCreateTool;

  beforeEach(() => {
    service = createMockService();
    tool = new GitHubReleaseCreateTool(service);
  });

  it('has correct metadata', () => {
    expect(tool.name).toBe('github_release_create');
    expect(tool.hasSideEffects).toBe(true);
  });

  it('creates a release with minimal args', async () => {
    const octokit = service.getOctokit();
    (octokit.rest.repos.createRelease as any).mockResolvedValue({
      data: {
        id: 1001,
        tag_name: 'v2.0.0',
        name: null,
        draft: false,
        prerelease: false,
        html_url: 'https://github.com/o/r/releases/tag/v2.0.0',
      },
    });

    const result = await tool.execute({ owner: 'o', repo: 'r', tag_name: 'v2.0.0' });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      id: 1001,
      tag: 'v2.0.0',
      name: null,
      draft: false,
      prerelease: false,
      url: 'https://github.com/o/r/releases/tag/v2.0.0',
    });
  });

  it('creates a draft prerelease with all options', async () => {
    const octokit = service.getOctokit();
    (octokit.rest.repos.createRelease as any).mockResolvedValue({
      data: {
        id: 1002,
        tag_name: 'v3.0.0-rc1',
        name: 'RC1',
        draft: true,
        prerelease: true,
        html_url: 'https://github.com/o/r/releases/tag/v3.0.0-rc1',
      },
    });

    await tool.execute({
      owner: 'o',
      repo: 'r',
      tag_name: 'v3.0.0-rc1',
      name: 'RC1',
      body: 'Release candidate',
      draft: true,
      prerelease: true,
      target_commitish: 'release/3.0',
      generate_release_notes: true,
    });

    const callArgs = (octokit.rest.repos.createRelease as any).mock.calls[0][0];
    expect(callArgs.tag_name).toBe('v3.0.0-rc1');
    expect(callArgs.draft).toBe(true);
    expect(callArgs.prerelease).toBe(true);
    expect(callArgs.target_commitish).toBe('release/3.0');
    expect(callArgs.generate_release_notes).toBe(true);
  });

  it('returns error on API failure', async () => {
    const octokit = service.getOctokit();
    (octokit.rest.repos.createRelease as any).mockRejectedValue(new Error('Validation Failed'));

    const result = await tool.execute({ owner: 'o', repo: 'r', tag_name: 'bad' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Validation Failed');
  });
});

/* -------------------------------------------------------------------------- */
/*  GitHubActionsListTool                                                     */
/* -------------------------------------------------------------------------- */

describe('GitHubActionsListTool', () => {
  let service: GitHubService;
  let tool: GitHubActionsListTool;

  beforeEach(() => {
    service = createMockService();
    tool = new GitHubActionsListTool(service);
  });

  it('has correct metadata', () => {
    expect(tool.name).toBe('github_actions_list');
    expect(tool.hasSideEffects).toBe(false);
  });

  it('lists runs for repo when no workflow_id given', async () => {
    const octokit = service.getOctokit();
    (octokit.rest.actions.listWorkflowRunsForRepo as any).mockResolvedValue({
      data: {
        workflow_runs: [
          {
            id: 9001,
            name: 'CI',
            status: 'completed',
            conclusion: 'success',
            head_branch: 'master',
            event: 'push',
            created_at: '2024-07-01T00:00:00Z',
            html_url: 'https://github.com/o/r/actions/runs/9001',
          },
        ],
      },
    });

    const result = await tool.execute({ owner: 'o', repo: 'r' });

    expect(result.success).toBe(true);
    expect(result.data).toEqual([
      {
        id: 9001,
        name: 'CI',
        status: 'completed',
        conclusion: 'success',
        branch: 'master',
        event: 'push',
        createdAt: '2024-07-01T00:00:00Z',
        url: 'https://github.com/o/r/actions/runs/9001',
      },
    ]);

    expect(octokit.rest.actions.listWorkflowRunsForRepo).toHaveBeenCalled();
    expect(octokit.rest.actions.listWorkflowRuns).not.toHaveBeenCalled();
  });

  it('lists runs for specific workflow when workflow_id given', async () => {
    const octokit = service.getOctokit();
    (octokit.rest.actions.listWorkflowRuns as any).mockResolvedValue({
      data: {
        workflow_runs: [
          {
            id: 9002,
            name: 'Deploy',
            status: 'in_progress',
            conclusion: null,
            head_branch: 'release',
            event: 'workflow_dispatch',
            created_at: '2024-07-02T00:00:00Z',
            html_url: 'https://github.com/o/r/actions/runs/9002',
          },
        ],
      },
    });

    const result = await tool.execute({ owner: 'o', repo: 'r', workflow_id: 'deploy.yml' });
    expect(result.success).toBe(true);

    expect(octokit.rest.actions.listWorkflowRuns).toHaveBeenCalled();
    const callArgs = (octokit.rest.actions.listWorkflowRuns as any).mock.calls[0][0];
    expect(callArgs.workflow_id).toBe('deploy.yml');
    expect(octokit.rest.actions.listWorkflowRunsForRepo).not.toHaveBeenCalled();
  });

  it('clamps per_page to 30', async () => {
    const octokit = service.getOctokit();
    (octokit.rest.actions.listWorkflowRunsForRepo as any).mockResolvedValue({
      data: { workflow_runs: [] },
    });

    await tool.execute({ owner: 'o', repo: 'r', per_page: 100 });
    const callArgs = (octokit.rest.actions.listWorkflowRunsForRepo as any).mock.calls[0][0];
    expect(callArgs.per_page).toBe(30);
  });

  it('returns error on API failure', async () => {
    const octokit = service.getOctokit();
    (octokit.rest.actions.listWorkflowRunsForRepo as any).mockRejectedValue(new Error('Forbidden'));

    const result = await tool.execute({ owner: 'o', repo: 'r' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Forbidden');
  });
});

/* -------------------------------------------------------------------------- */
/*  GitHubActionsTriggerTool                                                  */
/* -------------------------------------------------------------------------- */

describe('GitHubActionsTriggerTool', () => {
  let service: GitHubService;
  let tool: GitHubActionsTriggerTool;

  beforeEach(() => {
    service = createMockService();
    tool = new GitHubActionsTriggerTool(service);
  });

  it('has correct metadata', () => {
    expect(tool.name).toBe('github_actions_trigger');
    expect(tool.hasSideEffects).toBe(true);
  });

  it('triggers workflow with default ref', async () => {
    const octokit = service.getOctokit();
    (octokit.rest.actions.createWorkflowDispatch as any).mockResolvedValue({});

    const result = await tool.execute({ owner: 'o', repo: 'r', workflow_id: 'deploy.yml' });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      workflow_id: 'deploy.yml',
      ref: 'master',
      message: 'Workflow dispatch event triggered successfully',
    });

    const callArgs = (octokit.rest.actions.createWorkflowDispatch as any).mock.calls[0][0];
    expect(callArgs.ref).toBe('master');
  });

  it('triggers workflow with custom ref and inputs', async () => {
    const octokit = service.getOctokit();
    (octokit.rest.actions.createWorkflowDispatch as any).mockResolvedValue({});

    await tool.execute({
      owner: 'o',
      repo: 'r',
      workflow_id: 'build.yml',
      ref: 'release/2.0',
      inputs: { environment: 'staging', debug: 'true' },
    });

    const callArgs = (octokit.rest.actions.createWorkflowDispatch as any).mock.calls[0][0];
    expect(callArgs.ref).toBe('release/2.0');
    expect(callArgs.inputs).toEqual({ environment: 'staging', debug: 'true' });
  });

  it('returns error on API failure', async () => {
    const octokit = service.getOctokit();
    (octokit.rest.actions.createWorkflowDispatch as any).mockRejectedValue(
      new Error('Workflow does not have workflow_dispatch trigger'),
    );

    const result = await tool.execute({ owner: 'o', repo: 'r', workflow_id: 'ci.yml' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Workflow does not have workflow_dispatch trigger');
  });
});
