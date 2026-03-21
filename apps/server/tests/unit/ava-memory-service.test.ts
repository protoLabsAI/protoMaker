/**
 * Unit tests for AvaMemoryService
 *
 * Covers:
 *   - CRUD: remember (create/update), forget, recall
 *   - Search ranking: exact key > tag > substring
 *   - Recency sort within each tier
 *   - Atomic file persistence (written to .automaker/ava-memory.json)
 *   - Access count incremented on recall
 *   - Edge cases: duplicates, empty results, missing keys
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import * as fsSync from 'fs';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@protolabsai/utils', async () => {
  const actual = await vi.importActual<typeof import('@protolabsai/utils')>('@protolabsai/utils');
  return {
    ...actual,
    createLogger: () => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    }),
  };
});

vi.mock('@protolabsai/platform', async () => {
  const actual =
    await vi.importActual<typeof import('@protolabsai/platform')>('@protolabsai/platform');
  return {
    ...actual,
    getAutomakerDir: (p: string) => path.join(p, '.automaker'),
    ensureAutomakerDir: async (p: string) => {
      fsSync.mkdirSync(path.join(p, '.automaker'), { recursive: true });
    },
  };
});

import { AvaMemoryService } from '../../src/services/ava-memory-service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('AvaMemoryService', () => {
  let tempDir: string;
  let service: AvaMemoryService;

  beforeEach(() => {
    tempDir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'ava-memory-test-'));
    fsSync.mkdirSync(path.join(tempDir, '.automaker'), { recursive: true });
    service = new AvaMemoryService(tempDir);
  });

  afterEach(() => {
    fsSync.rmSync(tempDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // remember – create
  // -------------------------------------------------------------------------

  describe('remember (create)', () => {
    it('creates a new entry with correct fields', async () => {
      const entry = await service.remember('deploy-process', 'Use npm run deploy', ['ops']);

      expect(entry.key).toBe('deploy-process');
      expect(entry.content).toBe('Use npm run deploy');
      expect(entry.tags).toEqual(['ops']);
      expect(entry.accessCount).toBe(0);
      expect(entry.createdAt).toBeTruthy();
      expect(entry.updatedAt).toBeTruthy();
    });

    it('persists entry to .automaker/ava-memory.json', async () => {
      await service.remember('test-key', 'test content');

      const filePath = path.join(tempDir, '.automaker', 'ava-memory.json');
      expect(fsSync.existsSync(filePath)).toBe(true);

      const raw = JSON.parse(fsSync.readFileSync(filePath, 'utf-8')) as {
        version: number;
        entries: Record<string, unknown>;
      };
      expect(raw.version).toBe(1);
      expect(raw.entries['test-key']).toBeTruthy();
    });

    it('stores empty tags when none provided', async () => {
      const entry = await service.remember('no-tags', 'content without tags');
      expect(entry.tags).toEqual([]);
    });

    it('creates multiple independent entries', async () => {
      await service.remember('key-a', 'content a');
      await service.remember('key-b', 'content b');

      const filePath = path.join(tempDir, '.automaker', 'ava-memory.json');
      const raw = JSON.parse(fsSync.readFileSync(filePath, 'utf-8')) as {
        entries: Record<string, unknown>;
      };
      expect(Object.keys(raw.entries)).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // remember – update (duplicate key)
  // -------------------------------------------------------------------------

  describe('remember (update duplicate)', () => {
    it('updates content and tags when key already exists', async () => {
      await service.remember('my-key', 'original content', ['old-tag']);
      const updated = await service.remember('my-key', 'updated content', ['new-tag']);

      expect(updated.content).toBe('updated content');
      expect(updated.tags).toEqual(['new-tag']);
    });

    it('preserves createdAt when updating an existing entry', async () => {
      const original = await service.remember('stable-key', 'v1');
      await sleep(5);
      const updated = await service.remember('stable-key', 'v2');

      expect(updated.createdAt).toBe(original.createdAt);
    });

    it('refreshes updatedAt when updating an existing entry', async () => {
      const original = await service.remember('ts-key', 'v1');
      await sleep(5);
      const updated = await service.remember('ts-key', 'v2');

      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(original.updatedAt).getTime()
      );
    });

    it('does not duplicate entries in the store on update', async () => {
      await service.remember('dup-key', 'v1');
      await service.remember('dup-key', 'v2');

      const filePath = path.join(tempDir, '.automaker', 'ava-memory.json');
      const raw = JSON.parse(fsSync.readFileSync(filePath, 'utf-8')) as {
        entries: Record<string, unknown>;
      };
      expect(Object.keys(raw.entries)).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // forget
  // -------------------------------------------------------------------------

  describe('forget', () => {
    it('returns true and removes entry when key exists', async () => {
      await service.remember('to-remove', 'going away');
      const removed = await service.forget('to-remove');

      expect(removed).toBe(true);

      const filePath = path.join(tempDir, '.automaker', 'ava-memory.json');
      const raw = JSON.parse(fsSync.readFileSync(filePath, 'utf-8')) as {
        entries: Record<string, unknown>;
      };
      expect(raw.entries['to-remove']).toBeUndefined();
    });

    it('returns false when key does not exist', async () => {
      const removed = await service.forget('nonexistent-key');
      expect(removed).toBe(false);
    });

    it('only removes the targeted key, leaves others intact', async () => {
      await service.remember('keep-a', 'keep this');
      await service.remember('keep-b', 'keep this too');
      await service.remember('remove-me', 'goodbye');

      await service.forget('remove-me');

      const filePath = path.join(tempDir, '.automaker', 'ava-memory.json');
      const raw = JSON.parse(fsSync.readFileSync(filePath, 'utf-8')) as {
        entries: Record<string, unknown>;
      };
      expect(Object.keys(raw.entries)).toHaveLength(2);
      expect(raw.entries['keep-a']).toBeTruthy();
      expect(raw.entries['keep-b']).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // recall – empty results
  // -------------------------------------------------------------------------

  describe('recall (empty results)', () => {
    it('returns empty array when store has no entries', async () => {
      const results = await service.recall('anything');
      expect(results).toEqual([]);
    });

    it('returns empty array when query matches nothing', async () => {
      await service.remember('unrelated', 'some content', ['tag1']);
      const results = await service.recall('zzz-no-match-xyz');
      expect(results).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // recall – search ranking
  // -------------------------------------------------------------------------

  describe('recall (search ranking)', () => {
    it('ranks exact key match highest', async () => {
      await service.remember('exact-key', 'content with exact-key inside', ['exact-key']);
      const results = await service.recall('exact-key');

      expect(results).toHaveLength(1);
      expect(results[0]?.matchType).toBe('exact');
    });

    it('ranks tag match above substring match', async () => {
      // This entry matches via tag
      await service.remember('entry-a', 'unrelated content', ['myquery']);
      // This entry matches via substring in content
      await service.remember('entry-b', 'content containing myquery here', []);

      const results = await service.recall('myquery');

      const tagIdx = results.findIndex((r) => r.matchType === 'tag');
      const subIdx = results.findIndex((r) => r.matchType === 'substring');

      expect(tagIdx).toBeGreaterThanOrEqual(0);
      expect(subIdx).toBeGreaterThanOrEqual(0);
      expect(tagIdx).toBeLessThan(subIdx);
    });

    it('matches substring in key case-insensitively', async () => {
      await service.remember('UserTimezone', 'UTC+5', []);
      const results = await service.recall('usertimezone');

      expect(results).toHaveLength(1);
      expect(results[0]?.matchType).toBe('substring');
    });

    it('matches substring in content case-insensitively', async () => {
      await service.remember('config', 'Deploy to PRODUCTION every Friday', []);
      const results = await service.recall('production');

      expect(results).toHaveLength(1);
      expect(results[0]?.matchType).toBe('substring');
    });

    it('matches tag case-insensitively', async () => {
      await service.remember('ops-note', 'some ops info', ['OPS']);
      const results = await service.recall('ops');

      expect(results).toHaveLength(1);
      expect(results[0]?.matchType).toBe('tag');
    });

    it('orders exact > tag > substring in combined results', async () => {
      await service.remember('query', 'unrelated', []);
      await service.remember('tag-match', 'unrelated', ['query']);
      await service.remember('sub-match', 'content has query inside', []);

      const results = await service.recall('query');

      expect(results[0]?.matchType).toBe('exact');
      expect(results[1]?.matchType).toBe('tag');
      expect(results[2]?.matchType).toBe('substring');
    });

    it('an entry only appears in one tier (highest priority wins)', async () => {
      // This entry matches both exact key AND has query in content
      await service.remember('query', 'content mentioning query', ['query']);

      const results = await service.recall('query');

      expect(results).toHaveLength(1);
      expect(results[0]?.matchType).toBe('exact');
    });
  });

  // -------------------------------------------------------------------------
  // recall – recency sort within tier
  // -------------------------------------------------------------------------

  describe('recall (recency sort within tier)', () => {
    it('sorts by updatedAt descending within the same tier', async () => {
      await service.remember('old-match', 'content has target word inside', []);
      await sleep(5);
      await service.remember('new-match', 'content has target word inside too', []);

      const results = await service.recall('target');

      expect(results[0]?.entry.key).toBe('new-match');
      expect(results[1]?.entry.key).toBe('old-match');
    });
  });

  // -------------------------------------------------------------------------
  // recall – access count
  // -------------------------------------------------------------------------

  describe('recall (access count)', () => {
    it('increments accessCount for all matched entries on recall', async () => {
      await service.remember('counted', 'content matches recall', []);

      const first = await service.recall('counted');
      expect(first[0]?.entry.accessCount).toBe(1);

      const second = await service.recall('counted');
      expect(second[0]?.entry.accessCount).toBe(2);
    });

    it('does not increment accessCount when no results match', async () => {
      await service.remember('unrelated', 'no match here', []);
      await service.recall('zzz-no-match');

      // Verify file still has accessCount 0
      const filePath = path.join(tempDir, '.automaker', 'ava-memory.json');
      const raw = JSON.parse(fsSync.readFileSync(filePath, 'utf-8')) as {
        entries: Record<string, { accessCount: number }>;
      };
      expect(raw.entries['unrelated']?.accessCount).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Persistence — atomic write round-trip
  // -------------------------------------------------------------------------

  describe('persistence', () => {
    it('data survives across separate service instances (round-trip)', async () => {
      await service.remember('persistent-key', 'persisted value', ['saved']);

      // Create a new service instance pointing to the same directory
      const service2 = new AvaMemoryService(tempDir);
      const results = await service2.recall('persistent-key');

      expect(results).toHaveLength(1);
      expect(results[0]?.entry.content).toBe('persisted value');
    });

    it('handles missing file gracefully (returns empty store)', async () => {
      // No file written — recall should return empty without throwing
      const results = await service.recall('anything');
      expect(results).toEqual([]);
    });

    it('handles corrupted/missing file on forget without throwing', async () => {
      // Should return false gracefully
      const removed = await service.forget('ghost-key');
      expect(removed).toBe(false);
    });
  });
});
