import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockExecAsync } = vi.hoisted(() => ({
  mockExecAsync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('node:util', () => ({
  promisify: () => mockExecAsync,
}));

import { resolveMergeStrategy } from '@/lib/merge-strategy.js';

describe('resolveMergeStrategy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns --merge for PRs targeting staging', async () => {
    mockExecAsync.mockResolvedValue({ stdout: 'staging\n', stderr: '' });
    const result = await resolveMergeStrategy(42, '/test/project');
    expect(result).toBe('--merge');
  });

  it('returns --merge for PRs targeting main', async () => {
    mockExecAsync.mockResolvedValue({ stdout: 'main\n', stderr: '' });
    const result = await resolveMergeStrategy(42, '/test/project');
    expect(result).toBe('--merge');
  });

  it('returns --merge for PRs targeting epic/* branches', async () => {
    mockExecAsync.mockResolvedValue({ stdout: 'epic/auth-overhaul\n', stderr: '' });
    const result = await resolveMergeStrategy(42, '/test/project');
    expect(result).toBe('--merge');
  });

  it('returns --squash for PRs targeting dev', async () => {
    mockExecAsync.mockResolvedValue({ stdout: 'dev\n', stderr: '' });
    const result = await resolveMergeStrategy(42, '/test/project');
    expect(result).toBe('--squash');
  });

  it('returns --squash for PRs targeting feature branches', async () => {
    mockExecAsync.mockResolvedValue({ stdout: 'feature/my-branch\n', stderr: '' });
    const result = await resolveMergeStrategy(42, '/test/project');
    expect(result).toBe('--squash');
  });

  it('returns --squash when gh CLI fails', async () => {
    mockExecAsync.mockRejectedValue(new Error('gh not found'));
    const result = await resolveMergeStrategy(42, '/test/project');
    expect(result).toBe('--squash');
  });
});
