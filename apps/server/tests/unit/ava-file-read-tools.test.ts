/**
 * Unit tests for Ava's filesystem-read tools (#3791) — registered in
 * buildAvaTools() when config.fileRead is true:
 *
 *   read_file       – return a file's verbatim contents (size-capped)
 *   list_directory  – list directory entries (name + file/directory)
 *
 * Verifies: content round-trip, large-file truncation, read-error handling,
 * relative-path resolution against the project root, and that reads go through
 * secureFs (ALLOWED_ROOT sandbox).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import * as fsSync from 'fs';

// Controllable secureFs.readFile + pass-through validatePath.
const { readFileMock } = vi.hoisted(() => ({ readFileMock: vi.fn() }));
vi.mock('@protolabsai/platform', () => ({
  getNotesWorkspacePath: vi.fn().mockReturnValue('/tmp/notes'),
  ensureNotesDir: vi.fn().mockResolvedValue(undefined),
  getAutomakerDir: vi.fn().mockReturnValue('/tmp/.automaker'),
  secureFs: { readFile: readFileMock, writeFile: vi.fn(), mkdir: vi.fn() },
  validatePath: vi.fn((p: string) => p),
}));

vi.mock('@protolabsai/utils', () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@protolabsai/git-utils', () => ({}));
vi.mock('../../src/services/github-merge-service.js', () => ({
  githubMergeService: { merge: vi.fn(), getPRStatus: vi.fn() },
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

type ExecutableTool = {
  execute: (input: unknown, opts: { toolCallId: string }) => Promise<unknown>;
};
function getExecute(tools: Record<string, unknown>, name: string) {
  const tool = tools[name] as ExecutableTool | undefined;
  if (!tool) throw new Error(`Tool "${name}" not found`);
  return (input: unknown) => tool.execute(input, { toolCallId: `test-${name}` });
}

describe('Ava file-read tools', () => {
  let tempDir: string;
  let tools: Record<string, unknown>;

  beforeEach(() => {
    readFileMock.mockReset();
    tempDir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'ava-fileread-'));
    tools = buildAvaTools(tempDir, {}, { fileRead: true }) as Record<string, unknown>;
  });

  afterEach(() => {
    fsSync.rmSync(tempDir, { recursive: true, force: true });
  });

  it('registers read_file and list_directory only when fileRead is enabled', () => {
    expect(tools['read_file']).toBeDefined();
    expect(tools['list_directory']).toBeDefined();
    const without = buildAvaTools(tempDir, {}, {}) as Record<string, unknown>;
    expect(without['read_file']).toBeUndefined();
    expect(without['list_directory']).toBeUndefined();
  });

  it('read_file returns verbatim contents and resolves relative paths against the project', async () => {
    readFileMock.mockResolvedValue(Buffer.from('hello world', 'utf-8'));
    const res = (await getExecute(tools, 'read_file')({ path: 'src/x.ts' })) as {
      content: string;
      truncated: boolean;
      path: string;
    };
    expect(res.content).toBe('hello world');
    expect(res.truncated).toBe(false);
    // relative path resolved against tempDir before hitting secureFs
    expect(readFileMock).toHaveBeenCalledWith(path.join(tempDir, 'src/x.ts'));
  });

  it('read_file truncates files larger than the cap', async () => {
    const big = Buffer.alloc(256 * 1024 + 100, 0x61); // 'a'
    readFileMock.mockResolvedValue(big);
    const res = (await getExecute(tools, 'read_file')({ path: 'big.txt' })) as {
      truncated: boolean;
      bytes: number;
      content: string;
    };
    expect(res.truncated).toBe(true);
    expect(res.bytes).toBe(256 * 1024 + 100);
    expect(res.content.length).toBe(256 * 1024);
  });

  it('read_file returns an error object when the read fails (e.g. sandbox violation)', async () => {
    readFileMock.mockRejectedValue(new Error('path escapes ALLOWED_ROOT'));
    const res = (await getExecute(tools, 'read_file')({ path: '../../etc/passwd' })) as {
      error: string;
    };
    expect(res.error).toMatch(/ALLOWED_ROOT/);
  });

  it('list_directory lists entries with their type', async () => {
    fsSync.writeFileSync(path.join(tempDir, 'a.txt'), 'x');
    fsSync.mkdirSync(path.join(tempDir, 'sub'));
    const res = (await getExecute(tools, 'list_directory')({ path: '.' })) as {
      entries: Array<{ name: string; type: string }>;
    };
    const byName = Object.fromEntries(res.entries.map((e) => [e.name, e.type]));
    expect(byName['a.txt']).toBe('file');
    expect(byName['sub']).toBe('directory');
  });
});
