import { describe, it, expect } from 'vitest';
import { createWorktreeWriteGuard } from '../../../src/lib/sdk-options.js';
import type { PreToolUseHookInput } from '@anthropic-ai/claude-agent-sdk';

function makeInput(toolName: string, toolInput: Record<string, unknown>): PreToolUseHookInput {
  return {
    hook_event_name: 'PreToolUse',
    session_id: 'test-session',
    transcript_path: '/tmp/transcript',
    cwd: '/project/.worktrees/feature-branch',
    tool_name: toolName,
    tool_input: toolInput,
    tool_use_id: 'test-tool-use',
  };
}

describe('createWorktreeWriteGuard', () => {
  const projectPath = '/Users/kj/dev/protoMaker';
  const workDir = '/Users/kj/dev/protoMaker/.worktrees/feature-branch';

  it('returns undefined when workDir === projectPath (no worktree)', () => {
    const guard = createWorktreeWriteGuard(projectPath, projectPath);
    expect(guard).toBeUndefined();
  });

  it('returns a hook when workDir differs from projectPath', () => {
    const guard = createWorktreeWriteGuard(workDir, projectPath);
    expect(guard).toBeTypeOf('function');
  });

  describe('Write/Edit tool blocking', () => {
    it('blocks Write to main repo path', async () => {
      const guard = createWorktreeWriteGuard(workDir, projectPath)!;
      const result = await guard(
        makeInput('Write', {
          file_path: '/Users/kj/dev/protoMaker/apps/server/src/services/foo.ts',
        }),
        'test-tool-use',
        { signal: new AbortController().signal }
      );
      expect(result.decision).toBe('block');
      expect(result.reason).toContain('worktree path');
    });

    it('blocks Edit to main repo path', async () => {
      const guard = createWorktreeWriteGuard(workDir, projectPath)!;
      const result = await guard(
        makeInput('Edit', {
          file_path: '/Users/kj/dev/protoMaker/apps/server/src/services/foo.ts',
          old_string: 'old',
          new_string: 'new',
        }),
        'test-tool-use',
        { signal: new AbortController().signal }
      );
      expect(result.decision).toBe('block');
      expect(result.reason).toContain('.worktrees/feature-branch');
    });

    it('allows Write to worktree path', async () => {
      const guard = createWorktreeWriteGuard(workDir, projectPath)!;
      const result = await guard(
        makeInput('Write', {
          file_path: '/Users/kj/dev/protoMaker/.worktrees/feature-branch/apps/server/src/foo.ts',
        }),
        'test-tool-use',
        { signal: new AbortController().signal }
      );
      expect(result.decision).toBeUndefined();
    });

    it('allows Write to .automaker/features/ (agent output)', async () => {
      const guard = createWorktreeWriteGuard(workDir, projectPath)!;
      const result = await guard(
        makeInput('Write', {
          file_path: '/Users/kj/dev/protoMaker/.automaker/features/feat-123/agent-output.md',
        }),
        'test-tool-use',
        { signal: new AbortController().signal }
      );
      expect(result.decision).toBeUndefined();
    });

    it('allows Write to paths outside both project and worktree', async () => {
      const guard = createWorktreeWriteGuard(workDir, projectPath)!;
      const result = await guard(
        makeInput('Write', { file_path: '/tmp/some-temp-file.txt' }),
        'test-tool-use',
        { signal: new AbortController().signal }
      );
      expect(result.decision).toBeUndefined();
    });
  });

  describe('Bash command blocking', () => {
    it('blocks redirection to main repo', async () => {
      const guard = createWorktreeWriteGuard(workDir, projectPath)!;
      const result = await guard(
        makeInput('Bash', {
          command: `echo "hello" > /Users/kj/dev/protoMaker/apps/server/src/foo.ts`,
        }),
        'test-tool-use',
        { signal: new AbortController().signal }
      );
      expect(result.decision).toBe('block');
    });

    it('blocks git -C targeting main repo', async () => {
      const guard = createWorktreeWriteGuard(workDir, projectPath)!;
      const result = await guard(
        makeInput('Bash', {
          command: `git -C /Users/kj/dev/protoMaker commit -m "test"`,
        }),
        'test-tool-use',
        { signal: new AbortController().signal }
      );
      expect(result.decision).toBe('block');
    });

    it('allows bash commands not targeting main repo', async () => {
      const guard = createWorktreeWriteGuard(workDir, projectPath)!;
      const result = await guard(
        makeInput('Bash', { command: 'npm run test:server' }),
        'test-tool-use',
        { signal: new AbortController().signal }
      );
      expect(result.decision).toBeUndefined();
    });

    it('allows bash commands targeting worktree', async () => {
      const guard = createWorktreeWriteGuard(workDir, projectPath)!;
      const result = await guard(
        makeInput('Bash', {
          command: `git -C /Users/kj/dev/protoMaker/.worktrees/feature-branch add -A`,
        }),
        'test-tool-use',
        { signal: new AbortController().signal }
      );
      expect(result.decision).toBeUndefined();
    });
  });

  describe('Read tools are not blocked', () => {
    it('allows Read from main repo', async () => {
      const guard = createWorktreeWriteGuard(workDir, projectPath)!;
      const result = await guard(
        makeInput('Read', {
          file_path: '/Users/kj/dev/protoMaker/apps/server/src/services/foo.ts',
        }),
        'test-tool-use',
        { signal: new AbortController().signal }
      );
      expect(result.decision).toBeUndefined();
    });

    it('allows Grep from main repo', async () => {
      const guard = createWorktreeWriteGuard(workDir, projectPath)!;
      const result = await guard(
        makeInput('Grep', { pattern: 'foo', path: '/Users/kj/dev/protoMaker' }),
        'test-tool-use',
        { signal: new AbortController().signal }
      );
      expect(result.decision).toBeUndefined();
    });
  });
});
