/**
 * Unit tests for Ava memory tools (remember, recall, forget)
 *
 * Tests the tool definitions in buildAvaTools() when config.memory is true
 * and an AvaMemoryService is provided.
 *
 * Verifies:
 *   - Tools are present when memory config + service provided
 *   - Tools are absent when config.memory is false or service is missing
 *   - remember tool delegates to memoryService.remember and returns expected shape
 *   - recall tool returns found/not-found shapes correctly
 *   - forget tool returns removed/not-found shapes correctly
 *   - Error propagation when service throws
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any imports that use them
// ---------------------------------------------------------------------------

vi.mock('@protolabsai/platform', () => ({
  getNotesWorkspacePath: vi.fn().mockReturnValue('/tmp/notes'),
  ensureNotesDir: vi.fn().mockResolvedValue(undefined),
  getAutomakerDir: vi.fn().mockReturnValue('/tmp/.automaker'),
  secureFs: {
    readFile: vi.fn().mockRejectedValue(new Error('not found')),
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
    access: vi.fn().mockRejectedValue(new Error('not found')),
    exists: vi.fn().mockResolvedValue(false),
    listFiles: vi.fn().mockResolvedValue([]),
    stat: vi.fn().mockRejectedValue(new Error('not found')),
    unlink: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@protolabsai/utils', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@protolabsai/git-utils', () => ({}));

vi.mock('../../src/services/github-merge-service.js', () => ({
  githubMergeService: { merge: vi.fn(), getPRStatus: vi.fn() },
}));

vi.mock('../../src/services/pr-watcher-service.js', () => ({
  getPRWatcherService: vi.fn().mockReturnValue(null),
}));

vi.mock('../../src/services/event-history-service.js', () => ({
  getEventHistoryService: vi.fn().mockReturnValue(null),
}));

vi.mock('../../src/services/briefing-cursor-service.js', () => ({
  getBriefingCursorService: vi.fn().mockReturnValue(null),
}));

vi.mock('../../src/routes/project-pm/pm-agent.js', () => ({
  queryPm: vi.fn().mockResolvedValue({ text: '' }),
}));

vi.mock('../../src/providers/simple-query-service.js', () => ({
  simpleQuery: vi.fn().mockResolvedValue({ text: '' }),
}));

import { buildAvaTools } from '../../src/routes/chat/ava-tools.js';
import type {
  AvaMemoryService,
  MemoryEntry,
  RecallResult,
} from '../../src/services/ava-memory-service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROJECT_PATH = '/tmp/test-project';

type ExecutableTool = {
  execute: (input: unknown, opts: { toolCallId: string }) => Promise<unknown>;
};

function getExecute(tools: Record<string, unknown>, name: string) {
  const tool = tools[name] as ExecutableTool | undefined;
  if (!tool) throw new Error(`Tool "${name}" not found`);
  return (input: unknown) => tool.execute(input, { toolCallId: `test-${name}` });
}

function makeEntry(overrides?: Partial<MemoryEntry>): MemoryEntry {
  return {
    key: 'test-key',
    content: 'test content',
    tags: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    accessCount: 0,
    ...overrides,
  };
}

function createMockMemoryService(overrides?: Partial<AvaMemoryService>): AvaMemoryService {
  return {
    remember: vi.fn().mockResolvedValue(makeEntry()),
    recall: vi.fn().mockResolvedValue([]),
    forget: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as unknown as AvaMemoryService;
}

function buildMemoryTools(avaMemoryService: AvaMemoryService) {
  return buildAvaTools(PROJECT_PATH, { avaMemoryService }, { memory: true });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Ava memory tools', () => {
  let memoryService: AvaMemoryService;

  beforeEach(() => {
    memoryService = createMockMemoryService();
  });

  // -------------------------------------------------------------------------
  // Tool presence
  // -------------------------------------------------------------------------

  describe('tool presence', () => {
    it('includes remember, recall, forget when memory=true and service provided', () => {
      const tools = buildMemoryTools(memoryService);
      expect(tools['remember']).toBeDefined();
      expect(tools['recall']).toBeDefined();
      expect(tools['forget']).toBeDefined();
    });

    it('excludes memory tools when config.memory is false', () => {
      const tools = buildAvaTools(
        PROJECT_PATH,
        { avaMemoryService: memoryService },
        { memory: false }
      );
      expect(tools['remember']).toBeUndefined();
      expect(tools['recall']).toBeUndefined();
      expect(tools['forget']).toBeUndefined();
    });

    it('excludes memory tools when avaMemoryService is not provided', () => {
      const tools = buildAvaTools(PROJECT_PATH, {}, { memory: true });
      expect(tools['remember']).toBeUndefined();
      expect(tools['recall']).toBeUndefined();
      expect(tools['forget']).toBeUndefined();
    });

    it('excludes memory tools when neither memory config nor service provided', () => {
      const tools = buildAvaTools(PROJECT_PATH, {}, {});
      expect(tools['remember']).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // remember tool
  // -------------------------------------------------------------------------

  describe('remember tool', () => {
    it('calls memoryService.remember with key, content, and tags', async () => {
      const tools = buildMemoryTools(memoryService);
      const exec = getExecute(tools, 'remember');

      await exec({ key: 'deploy-key', content: 'deploy content', tags: ['ops', 'deploy'] });

      expect(memoryService.remember).toHaveBeenCalledWith('deploy-key', 'deploy content', [
        'ops',
        'deploy',
      ]);
    });

    it('calls memoryService.remember with empty tags when tags not provided', async () => {
      const tools = buildMemoryTools(memoryService);
      const exec = getExecute(tools, 'remember');

      await exec({ key: 'no-tags', content: 'some content' });

      expect(memoryService.remember).toHaveBeenCalledWith('no-tags', 'some content', []);
    });

    it('returns stored=true with key, updatedAt, and tags on success', async () => {
      const entry = makeEntry({
        key: 'my-key',
        tags: ['a'],
        updatedAt: '2026-03-21T10:00:00.000Z',
      });
      vi.mocked(memoryService.remember).mockResolvedValue(entry);

      const tools = buildMemoryTools(memoryService);
      const exec = getExecute(tools, 'remember');

      const result = (await exec({ key: 'my-key', content: 'stuff' })) as Record<string, unknown>;

      expect(result.stored).toBe(true);
      expect(result.key).toBe('my-key');
      expect(result.updatedAt).toBe('2026-03-21T10:00:00.000Z');
      expect(result.tags).toEqual(['a']);
    });

    it('propagates errors thrown by memoryService.remember', async () => {
      vi.mocked(memoryService.remember).mockRejectedValueOnce(new Error('disk full'));

      const tools = buildMemoryTools(memoryService);
      const exec = getExecute(tools, 'remember');

      await expect(exec({ key: 'k', content: 'v' })).rejects.toThrow('disk full');
    });
  });

  // -------------------------------------------------------------------------
  // recall tool
  // -------------------------------------------------------------------------

  describe('recall tool', () => {
    it('calls memoryService.recall with the query', async () => {
      const tools = buildMemoryTools(memoryService);
      const exec = getExecute(tools, 'recall');

      await exec({ query: 'deploy process' });

      expect(memoryService.recall).toHaveBeenCalledWith('deploy process');
    });

    it('returns found=false with message when no results', async () => {
      vi.mocked(memoryService.recall).mockResolvedValue([]);

      const tools = buildMemoryTools(memoryService);
      const exec = getExecute(tools, 'recall');

      const result = (await exec({ query: 'nothing' })) as Record<string, unknown>;

      expect(result.found).toBe(false);
      expect(result.message).toContain('nothing');
    });

    it('returns found=true with count and results array on match', async () => {
      const recallResults: RecallResult[] = [
        {
          entry: makeEntry({ key: 'k1', content: 'c1', tags: ['t1'], accessCount: 2 }),
          matchType: 'exact',
        },
        {
          entry: makeEntry({ key: 'k2', content: 'c2', tags: [], accessCount: 0 }),
          matchType: 'substring',
        },
      ];
      vi.mocked(memoryService.recall).mockResolvedValue(recallResults);

      const tools = buildMemoryTools(memoryService);
      const exec = getExecute(tools, 'recall');

      const result = (await exec({ query: 'k1' })) as Record<string, unknown>;

      expect(result.found).toBe(true);
      expect(result.count).toBe(2);
      const results = result.results as Array<Record<string, unknown>>;
      expect(results).toHaveLength(2);
      expect(results[0]?.key).toBe('k1');
      expect(results[0]?.matchType).toBe('exact');
      expect(results[0]?.accessCount).toBe(2);
      expect(results[1]?.key).toBe('k2');
      expect(results[1]?.matchType).toBe('substring');
    });

    it('exposes key, content, tags, matchType, updatedAt, accessCount per result', async () => {
      const entry = makeEntry({
        key: 'expose-key',
        content: 'expose content',
        tags: ['x'],
        updatedAt: '2026-03-15T00:00:00.000Z',
        accessCount: 3,
      });
      vi.mocked(memoryService.recall).mockResolvedValue([{ entry, matchType: 'tag' }]);

      const tools = buildMemoryTools(memoryService);
      const exec = getExecute(tools, 'recall');

      const result = (await exec({ query: 'x' })) as Record<string, unknown>;
      const r = (result.results as Array<Record<string, unknown>>)[0]!;

      expect(r.key).toBe('expose-key');
      expect(r.content).toBe('expose content');
      expect(r.tags).toEqual(['x']);
      expect(r.matchType).toBe('tag');
      expect(r.updatedAt).toBe('2026-03-15T00:00:00.000Z');
      expect(r.accessCount).toBe(3);
    });

    it('propagates errors thrown by memoryService.recall', async () => {
      vi.mocked(memoryService.recall).mockRejectedValueOnce(new Error('read error'));

      const tools = buildMemoryTools(memoryService);
      const exec = getExecute(tools, 'recall');

      await expect(exec({ query: 'q' })).rejects.toThrow('read error');
    });
  });

  // -------------------------------------------------------------------------
  // forget tool
  // -------------------------------------------------------------------------

  describe('forget tool', () => {
    it('calls memoryService.forget with the key', async () => {
      const tools = buildMemoryTools(memoryService);
      const exec = getExecute(tools, 'forget');

      await exec({ key: 'to-delete' });

      expect(memoryService.forget).toHaveBeenCalledWith('to-delete');
    });

    it('returns removed=true with key when entry was found and deleted', async () => {
      vi.mocked(memoryService.forget).mockResolvedValue(true);

      const tools = buildMemoryTools(memoryService);
      const exec = getExecute(tools, 'forget');

      const result = (await exec({ key: 'gone' })) as Record<string, unknown>;

      expect(result.removed).toBe(true);
      expect(result.key).toBe('gone');
    });

    it('returns removed=false with message when key not found', async () => {
      vi.mocked(memoryService.forget).mockResolvedValue(false);

      const tools = buildMemoryTools(memoryService);
      const exec = getExecute(tools, 'forget');

      const result = (await exec({ key: 'ghost' })) as Record<string, unknown>;

      expect(result.removed).toBe(false);
      expect(result.message).toContain('ghost');
    });

    it('propagates errors thrown by memoryService.forget', async () => {
      vi.mocked(memoryService.forget).mockRejectedValueOnce(new Error('write error'));

      const tools = buildMemoryTools(memoryService);
      const exec = getExecute(tools, 'forget');

      await expect(exec({ key: 'k' })).rejects.toThrow('write error');
    });
  });
});
