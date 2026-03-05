/**
 * Tool Family Tests
 *
 * Unit tests for the 3 DynamicStructuredTool factory families:
 * board, discord, and github.
 */

import { describe, it, expect, vi } from 'vitest';
import { createBoardTools } from '../src/board-tools.js';
import { createDiscordTools } from '../src/discord-tools.js';
import { createGitHubTools } from '../src/github-tools.js';
import { ToolRegistry } from '../src/registry.js';
import type { Feature } from '@protolabsai/types';

// ─── Board Tools ─────────────────────────────────────────────────────────────

describe('createBoardTools()', () => {
  const mockFeature: Feature = {
    id: 'feat-1',
    title: 'Test Feature',
    status: 'backlog',
    branchName: 'feature/test',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  } as unknown as Feature;

  const mockFeatureLoader = {
    getAll: vi.fn().mockResolvedValue([mockFeature]),
    get: vi.fn().mockResolvedValue(mockFeature),
    create: vi.fn().mockResolvedValue(mockFeature),
    update: vi.fn().mockResolvedValue(mockFeature),
  };

  const tools = createBoardTools({ featureLoader: mockFeatureLoader });
  const registry = new ToolRegistry();
  registry.registerMany(tools as never[]);

  it('returns 3 tools', () => {
    expect(tools).toHaveLength(3);
    expect(registry.has('list_features')).toBe(true);
    expect(registry.has('update_feature')).toBe(true);
    expect(registry.has('create_feature')).toBe(true);
  });

  it('list_features calls featureLoader.getAll', async () => {
    const result = await registry.execute('list_features', {
      projectPath: '/test',
    });
    expect(result.success).toBe(true);
    expect(mockFeatureLoader.getAll).toHaveBeenCalledWith('/test');
    expect((result.data as { count: number }).count).toBe(1);
  });

  it('list_features filters by status', async () => {
    mockFeatureLoader.getAll.mockResolvedValueOnce([
      { ...mockFeature, status: 'backlog' },
      { ...mockFeature, id: 'feat-2', status: 'done' },
    ]);
    const result = await registry.execute('list_features', {
      projectPath: '/test',
      status: 'backlog',
    });
    expect(result.success).toBe(true);
    expect((result.data as { count: number }).count).toBe(1);
  });

  it('update_feature calls featureLoader.update', async () => {
    const result = await registry.execute('update_feature', {
      projectPath: '/test',
      featureId: 'feat-1',
      status: 'in_progress',
    });
    expect(result.success).toBe(true);
    expect(mockFeatureLoader.update).toHaveBeenCalledWith(
      '/test',
      'feat-1',
      expect.objectContaining({ status: 'in_progress' })
    );
  });

  it('update_feature returns error when feature not found', async () => {
    mockFeatureLoader.update.mockResolvedValueOnce(null);
    const result = await registry.execute('update_feature', {
      projectPath: '/test',
      featureId: 'missing',
      title: 'New Title',
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it('create_feature calls featureLoader.create', async () => {
    const result = await registry.execute('create_feature', {
      projectPath: '/test',
      title: 'New Feature',
      description: 'A description',
    });
    expect(result.success).toBe(true);
    expect(mockFeatureLoader.create).toHaveBeenCalledWith(
      '/test',
      expect.objectContaining({ title: 'New Feature' })
    );
  });
});

// ─── Discord Tools ────────────────────────────────────────────────────────────

describe('createDiscordTools()', () => {
  const mockDiscordBot = {
    sendMessage: vi.fn().mockResolvedValue({ id: 'msg-123' }),
    readMessages: vi.fn().mockResolvedValue([
      {
        id: 'msg-1',
        content: 'Hello world',
        author: { id: 'user-1', username: 'Alice' },
        timestamp: '2026-01-01T00:00:00Z',
      },
    ]),
  };

  const tools = createDiscordTools({ discordBot: mockDiscordBot });
  const registry = new ToolRegistry();
  registry.registerMany(tools as never[]);

  it('returns 2 tools', () => {
    expect(tools).toHaveLength(2);
    expect(registry.has('discord_send_message')).toBe(true);
    expect(registry.has('discord_read_channel')).toBe(true);
  });

  it('discord_send_message returns messageId', async () => {
    const result = await registry.execute('discord_send_message', {
      channelId: '1234567890',
      content: 'Hello',
    });
    expect(result.success).toBe(true);
    expect((result.data as { messageId: string }).messageId).toBe('msg-123');
    expect(mockDiscordBot.sendMessage).toHaveBeenCalledWith('1234567890', 'Hello');
  });

  it('discord_read_channel returns messages with author usernames', async () => {
    const result = await registry.execute('discord_read_channel', { channelId: '1234567890' });
    expect(result.success).toBe(true);
    const data = result.data as { messages: { author: string }[]; count: number };
    expect(data.count).toBe(1);
    expect(data.messages[0].author).toBe('Alice');
  });
});

// ─── GitHub Tools ─────────────────────────────────────────────────────────────

describe('createGitHubTools()', () => {
  const mockPR = {
    number: 42,
    title: 'feat: add tool registry',
    state: 'open',
    html_url: 'https://github.com/org/repo/pull/42',
    head: { ref: 'feature/tool-registry' },
    base: { ref: 'dev' },
  };

  const mockGitHubClient = {
    listPRs: vi.fn().mockResolvedValue([mockPR]),
    mergePR: vi.fn().mockResolvedValue({ merged: true, sha: 'abc123' }),
    checkPRStatus: vi.fn().mockResolvedValue({
      number: 42,
      title: 'feat: add tool registry',
      state: 'open',
      mergeable: true,
      checksState: 'success',
      url: 'https://github.com/org/repo/pull/42',
    }),
  };

  const tools = createGitHubTools({ githubClient: mockGitHubClient });
  const registry = new ToolRegistry();
  registry.registerMany(tools as never[]);

  it('returns 3 tools', () => {
    expect(tools).toHaveLength(3);
    expect(registry.has('github_list_prs')).toBe(true);
    expect(registry.has('github_merge_pr')).toBe(true);
    expect(registry.has('github_check_pr_status')).toBe(true);
  });

  it('github_list_prs returns PR list with branch names', async () => {
    const result = await registry.execute('github_list_prs', { state: 'open' });
    expect(result.success).toBe(true);
    const data = result.data as {
      pullRequests: { number: number; headBranch: string }[];
      count: number;
    };
    expect(data.count).toBe(1);
    expect(data.pullRequests[0].number).toBe(42);
    expect(data.pullRequests[0].headBranch).toBe('feature/tool-registry');
  });

  it('github_merge_pr merges the specified PR', async () => {
    const result = await registry.execute('github_merge_pr', { prNumber: 42 });
    expect(result.success).toBe(true);
    expect((result.data as { merged: boolean }).merged).toBe(true);
    expect(mockGitHubClient.mergePR).toHaveBeenCalledWith(42, { method: 'squash' });
  });

  it('github_check_pr_status returns checks state', async () => {
    const result = await registry.execute('github_check_pr_status', { prNumber: 42 });
    expect(result.success).toBe(true);
    expect((result.data as { checksState: string }).checksState).toBe('success');
    expect((result.data as { mergeable: boolean }).mergeable).toBe(true);
  });
});
