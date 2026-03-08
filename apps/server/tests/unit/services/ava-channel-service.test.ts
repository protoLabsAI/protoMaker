/**
 * AvaChannelService tests — Verifies append-only message posting, retrieval,
 * cross-shard queries, and archival behavior.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AvaChannelService } from '@/services/ava-channel-service.js';
import type { AvaChannelDocument } from '@protolabsai/crdt';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ava-channel-test-'));
}

/** Build a minimal mock CRDTStore that holds shard documents in-memory */
function makeMockStore() {
  const docs = new Map<
    string,
    { messages: Array<Record<string, unknown>>; docSync: () => unknown }
  >();

  const registry = new Map<string, string>();

  function getKey(domain: string, id: string): string {
    return `${domain}:${id}`;
  }

  function ensureDoc(domain: string, id: string) {
    const key = getKey(domain, id);
    if (!docs.has(key)) {
      const messages: Array<Record<string, unknown>> = [];
      docs.set(key, {
        messages,
        docSync: () => ({ schemaVersion: 1, _meta: {}, messages }),
      });
      registry.set(`${domain}/${id}`, key);
    }
    return docs.get(key)!;
  }

  return {
    // Expose internal docs for assertions
    _docs: docs,

    getDocumentUrl: vi.fn((domain: string, id: string) => {
      return registry.get(`${domain}/${id}`) ?? undefined;
    }),

    getOrCreate: vi.fn(async (domain: string, id: string) => {
      const doc = ensureDoc(domain, id);
      // Register the doc URL
      registry.set(`${domain}/${id}`, getKey(domain, id));
      return {
        docSync: doc.docSync,
      };
    }),

    change: vi.fn(async (domain: string, id: string, fn: (doc: AvaChannelDocument) => void) => {
      const doc = ensureDoc(domain, id);
      // Create a proxy-like object that mutates our internal messages array
      const proxy = {
        schemaVersion: 1 as const,
        _meta: {
          instanceId: 'test',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        messages: doc.messages as unknown as AvaChannelDocument['messages'],
        push: (msg: unknown) => doc.messages.push(msg as Record<string, unknown>),
      };
      fn(proxy as unknown as AvaChannelDocument);
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AvaChannelService', () => {
  let store: ReturnType<typeof makeMockStore>;
  let archiveDir: string;
  let service: AvaChannelService;

  beforeEach(() => {
    store = makeMockStore();
    archiveDir = makeTempDir();
    service = new AvaChannelService(archiveDir, {
      store: store as unknown as import('@protolabsai/crdt').CRDTStore,
      instanceId: 'test-instance',
      instanceName: 'Test Instance',
    });
  });

  afterEach(() => {
    service.stop();
    fs.rmSync(archiveDir, { recursive: true, force: true });
  });

  // ─── postMessage ──────────────────────────────────────────────────────────

  describe('postMessage()', () => {
    it('appends a message to the CRDT document', async () => {
      const msg = await service.postMessage('Hello from Ava', 'ava');

      expect(msg.id).toBeTruthy();
      expect(msg.instanceId).toBe('test-instance');
      expect(msg.instanceName).toBe('Test Instance');
      expect(msg.content).toBe('Hello from Ava');
      expect(msg.source).toBe('ava');
      expect(msg.timestamp).toBeTruthy();

      // CRDTStore.change() should have been called once
      expect(store.change).toHaveBeenCalledOnce();
    });

    it('appends a system message from an operator', async () => {
      const msg = await service.postMessage('Server restarted', 'system');
      expect(msg.source).toBe('system');
    });

    it('includes optional context when provided', async () => {
      const ctx = { featureId: 'feat-123', boardSummary: 'All green' };
      const msg = await service.postMessage('Board update', 'ava', { context: ctx });
      expect(msg.context).toEqual(ctx);
    });

    it('overrides instanceName when specified', async () => {
      const msg = await service.postMessage('Alert', 'operator', { instanceName: 'discord-bot' });
      expect(msg.instanceName).toBe('discord-bot');
    });
  });

  // ─── getMessages ──────────────────────────────────────────────────────────

  describe('getMessages()', () => {
    it('returns empty array when no messages exist', async () => {
      const msgs = await service.getMessages();
      expect(msgs).toEqual([]);
    });

    it('returns posted messages sorted by timestamp', async () => {
      await service.postMessage('First', 'ava');
      await service.postMessage('Second', 'operator');
      await service.postMessage('Third', 'system');

      const msgs = await service.getMessages();
      expect(msgs).toHaveLength(3);
      // Results should be sorted ascending by timestamp
      for (let i = 1; i < msgs.length; i++) {
        expect(msgs[i].timestamp >= msgs[i - 1].timestamp).toBe(true);
      }
    });

    it('filters by instanceId', async () => {
      await service.postMessage('From A', 'ava');
      // Directly push a message with a different instanceId
      const today = new Date().toUTCString().slice(0, 10); // rough date
      const key = [...store._docs.keys()][0];
      const doc = store._docs.get(key)!;
      doc.messages.push({
        id: 'other-id',
        instanceId: 'other-instance',
        instanceName: 'Other',
        content: 'From B',
        source: 'ava',
        timestamp: new Date().toISOString(),
      });

      const msgs = await service.getMessages({ instanceId: 'test-instance' });
      expect(msgs.every((m) => m.instanceId === 'test-instance')).toBe(true);
    });

    it('filters by source', async () => {
      await service.postMessage('Ava says', 'ava');
      await service.postMessage('System event', 'system');

      const avaMsgs = await service.getMessages({ source: 'ava' });
      expect(avaMsgs.every((m) => m.source === 'ava')).toBe(true);

      const systemMsgs = await service.getMessages({ source: 'system' });
      expect(systemMsgs.every((m) => m.source === 'system')).toBe(true);
    });

    it('filters by time range', async () => {
      const before = new Date(Date.now() - 5000);
      await service.postMessage('In range', 'ava');
      const after = new Date(Date.now() + 5000);

      const msgs = await service.getMessages({ from: before, to: after });
      expect(msgs).toHaveLength(1);
      expect(msgs[0].content).toBe('In range');
    });
  });

  // ─── getRecentMessages ────────────────────────────────────────────────────

  describe('getRecentMessages()', () => {
    it('returns messages within the last N hours', async () => {
      await service.postMessage('Recent message', 'ava');
      const msgs = await service.getRecentMessages(1);
      expect(msgs).toHaveLength(1);
    });

    it('filters by instanceId when provided', async () => {
      await service.postMessage('Mine', 'ava');
      const msgs = await service.getRecentMessages(24, 'test-instance');
      expect(msgs.every((m) => m.instanceId === 'test-instance')).toBe(true);
    });
  });

  // ─── postBugReport ────────────────────────────────────────────────────────

  describe('postBugReport()', () => {
    it('posts a system message with [BugReport] prefix', async () => {
      const msg = await service.postBugReport('App crashes on login');
      expect(msg.source).toBe('system');
      expect(msg.content).toContain('[BugReport]');
      expect(msg.content).toContain('App crashes on login');
    });

    it('includes featureId in context when provided', async () => {
      const msg = await service.postBugReport('Slow response', { featureId: 'feat-456' });
      expect(msg.context?.featureId).toBe('feat-456');
    });
  });

  // ─── cross-shard queries ──────────────────────────────────────────────────

  describe('cross-shard queries', () => {
    it('reads from archived shards on disk', async () => {
      const date = '2025-01-01';
      const archiveMessages = [
        {
          id: 'archived-1',
          instanceId: 'old-instance',
          instanceName: 'Old',
          content: 'Historical message',
          source: 'ava',
          timestamp: '2025-01-01T10:00:00.000Z',
        },
      ];

      // Write archive file
      fs.writeFileSync(
        path.join(archiveDir, `${date}.json`),
        JSON.stringify(archiveMessages),
        'utf-8'
      );

      // Query spanning that archived date
      const msgs = await service.getMessages({
        from: new Date('2025-01-01T00:00:00Z'),
        to: new Date('2025-01-01T23:59:59Z'),
      });

      expect(msgs).toHaveLength(1);
      expect(msgs[0].id).toBe('archived-1');
    });

    it('returns empty array for a date with no shard and no archive', async () => {
      // Mock getOrCreate to return an empty doc
      store.getOrCreate.mockImplementation(async () => ({
        docSync: () => ({ schemaVersion: 1, _meta: {}, messages: [] }),
      }));

      const msgs = await service.getMessages({
        from: new Date('2024-06-01T00:00:00Z'),
        to: new Date('2024-06-01T23:59:59Z'),
      });
      expect(msgs).toEqual([]);
    });
  });

  // ─── archival ─────────────────────────────────────────────────────────────

  describe('runArchiveCycle()', () => {
    it('creates archive directory if missing', async () => {
      const newArchiveDir = path.join(archiveDir, 'subdir');
      const archiveService = new AvaChannelService(newArchiveDir, {
        store: store as unknown as import('@protolabsai/crdt').CRDTStore,
        instanceId: 'test-instance',
        instanceName: 'Test Instance',
      });

      await archiveService.runArchiveCycle();

      expect(fs.existsSync(newArchiveDir)).toBe(true);
      archiveService.stop();
    });

    it('skips shards that are not old enough', async () => {
      // The cycle only archives shards older than 30 days
      // Today's shard should never be archived
      await service.postMessage('Today message', 'ava');
      await service.runArchiveCycle();

      // No archive files should be created for today
      const files = fs.readdirSync(archiveDir);
      expect(files).toHaveLength(0);
    });
  });
});
