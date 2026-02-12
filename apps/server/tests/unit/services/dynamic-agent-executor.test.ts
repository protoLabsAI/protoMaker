import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DynamicAgentExecutor } from '../../../src/services/dynamic-agent-executor.js';
import type { AgentConfig } from '../../../src/services/agent-factory-service.js';

// Mock simpleQuery and streamingQuery
vi.mock('../../../src/providers/simple-query-service.js', () => ({
  simpleQuery: vi.fn(),
  streamingQuery: vi.fn(),
}));

import { simpleQuery, streamingQuery } from '../../../src/providers/simple-query-service.js';

const mockedSimpleQuery = vi.mocked(simpleQuery);
const mockedStreamingQuery = vi.mocked(streamingQuery);

function makeConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    templateName: 'test-agent',
    resolvedModel: 'claude-sonnet-4-5-20250929',
    modelAlias: 'sonnet',
    tools: ['Read', 'Write', 'Bash'],
    disallowedTools: [],
    maxTurns: 50,
    role: 'backend-engineer',
    displayName: 'Test Agent',
    trustLevel: 1,
    capabilities: {
      canUseBash: true,
      canModifyFiles: true,
      canCommit: true,
      canCreatePRs: false,
      canSpawnAgents: false,
    },
    allowedSubagentRoles: [],
    projectPath: '/test/project',
    ...overrides,
  };
}

describe('DynamicAgentExecutor', () => {
  let executor: DynamicAgentExecutor;

  beforeEach(() => {
    vi.clearAllMocks();
    executor = new DynamicAgentExecutor();
  });

  describe('execute', () => {
    it('uses simpleQuery when no streaming callbacks', async () => {
      mockedSimpleQuery.mockResolvedValue({ text: 'Agent output here' });

      const result = await executor.execute(makeConfig(), {
        prompt: 'Do the thing',
      });

      expect(result.success).toBe(true);
      expect(result.output).toBe('Agent output here');
      expect(result.templateName).toBe('test-agent');
      expect(result.model).toBe('sonnet');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);

      expect(mockedSimpleQuery).toHaveBeenCalledOnce();
      expect(mockedStreamingQuery).not.toHaveBeenCalled();
    });

    it('uses streamingQuery when onText callback provided', async () => {
      mockedStreamingQuery.mockResolvedValue({ text: 'Streamed output' });

      const onText = vi.fn();
      const result = await executor.execute(makeConfig(), {
        prompt: 'Do the thing',
        onText,
      });

      expect(result.success).toBe(true);
      expect(result.output).toBe('Streamed output');
      expect(mockedStreamingQuery).toHaveBeenCalledOnce();
      expect(mockedSimpleQuery).not.toHaveBeenCalled();
    });

    it('passes model and maxTurns to query', async () => {
      mockedSimpleQuery.mockResolvedValue({ text: 'ok' });

      await executor.execute(
        makeConfig({ resolvedModel: 'claude-opus-4-5-20251101', maxTurns: 200 }),
        { prompt: 'task' }
      );

      const callArgs = mockedSimpleQuery.mock.calls[0][0];
      expect(callArgs.model).toBe('claude-opus-4-5-20251101');
      expect(callArgs.maxTurns).toBe(200);
    });

    it('filters disallowed tools', async () => {
      mockedSimpleQuery.mockResolvedValue({ text: 'ok' });

      await executor.execute(
        makeConfig({
          tools: ['Read', 'Write', 'Bash', 'Grep'],
          disallowedTools: ['Bash', 'Write'],
        }),
        { prompt: 'task' }
      );

      const callArgs = mockedSimpleQuery.mock.calls[0][0];
      expect(callArgs.allowedTools).toEqual(['Read', 'Grep']);
    });

    it('returns error info on failure', async () => {
      mockedSimpleQuery.mockRejectedValue(new Error('Something went wrong'));

      const result = await executor.execute(makeConfig(), {
        prompt: 'task',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Something went wrong');
      expect(result.errorType).toBe('execution');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('includes capability restrictions in system prompt', async () => {
      mockedSimpleQuery.mockResolvedValue({ text: 'ok' });

      await executor.execute(
        makeConfig({
          capabilities: {
            canUseBash: false,
            canModifyFiles: false,
            canCommit: true,
            canCreatePRs: true,
            canSpawnAgents: false,
          },
        }),
        { prompt: 'task' }
      );

      const callArgs = mockedSimpleQuery.mock.calls[0][0];
      expect(callArgs.systemPrompt).toContain('MUST NOT execute bash');
      expect(callArgs.systemPrompt).toContain('MUST NOT modify any files');
      expect(callArgs.systemPrompt).not.toContain('MUST NOT create git commits');
    });

    it('merges additional system prompt', async () => {
      mockedSimpleQuery.mockResolvedValue({ text: 'ok' });

      await executor.execute(makeConfig({ systemPrompt: 'You are a helpful assistant.' }), {
        prompt: 'task',
        additionalSystemPrompt: 'Focus on TypeScript only.',
      });

      const callArgs = mockedSimpleQuery.mock.calls[0][0];
      expect(callArgs.systemPrompt).toContain('You are a helpful assistant.');
      expect(callArgs.systemPrompt).toContain('Focus on TypeScript only.');
    });

    it('passes abort controller', async () => {
      mockedSimpleQuery.mockResolvedValue({ text: 'ok' });
      const ac = new AbortController();

      await executor.execute(makeConfig(), {
        prompt: 'task',
        abortController: ac,
      });

      const callArgs = mockedSimpleQuery.mock.calls[0][0];
      expect(callArgs.abortController).toBe(ac);
    });
  });
});
