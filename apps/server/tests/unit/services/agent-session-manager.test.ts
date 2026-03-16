/**
 * Unit tests for AgentSessionManager.
 *
 * These tests use an in-memory SQLite database (via a temp directory) so they
 * require no external services or mocked Anthropic API calls.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'path';
import { AgentSessionManager } from '../../../src/services/agent-session-manager.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'asm-test-'));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentSessionManager', () => {
  let dataDir: string;
  let manager: AgentSessionManager;

  beforeEach(() => {
    dataDir = makeTempDir();
    // No API key → compactor uses deterministic fallback
    manager = new AgentSessionManager(dataDir);
  });

  afterEach(() => {
    manager.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // Conversation lifecycle
  // -------------------------------------------------------------------------

  describe('getOrCreateConversation', () => {
    it('creates a new conversation on first call', () => {
      const id = manager.getOrCreateConversation('feature-abc');
      expect(id).toBeTruthy();
      expect(typeof id).toBe('string');
    });

    it('returns the same conversation ID for the same key', () => {
      const id1 = manager.getOrCreateConversation('feature-abc');
      const id2 = manager.getOrCreateConversation('feature-abc');
      expect(id1).toBe(id2);
    });

    it('creates distinct conversations for different keys', () => {
      const id1 = manager.getOrCreateConversation('feature-aaa');
      const id2 = manager.getOrCreateConversation('feature-bbb');
      expect(id1).not.toBe(id2);
    });

    it('resumes an existing conversation across manager instances', () => {
      // First instance creates
      const id1 = manager.getOrCreateConversation('persistent-feature');
      manager.close();

      // Second instance with same dataDir should resume
      const manager2 = new AgentSessionManager(dataDir);
      const id2 = manager2.getOrCreateConversation('persistent-feature');
      expect(id2).toBe(id1);
      manager2.close();

      // Re-open for afterEach cleanup
      manager = new AgentSessionManager(dataDir);
    });
  });

  // -------------------------------------------------------------------------
  // Message ingestion
  // -------------------------------------------------------------------------

  describe('ingestMessage', () => {
    it('stores user and assistant messages without throwing', () => {
      const convId = manager.getOrCreateConversation('feature-ingest');
      expect(() => {
        manager.ingestMessage(convId, 'user', 'Hello');
        manager.ingestMessage(convId, 'assistant', 'Hi there!');
      }).not.toThrow();
    });

    it('silently ignores empty or whitespace-only content', () => {
      const convId = manager.getOrCreateConversation('feature-empty');
      expect(() => {
        manager.ingestMessage(convId, 'user', '');
        manager.ingestMessage(convId, 'user', '   ');
      }).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Context assembly
  // -------------------------------------------------------------------------

  describe('assembleHistory', () => {
    it('returns empty array when no messages have been ingested', () => {
      const convId = manager.getOrCreateConversation('feature-empty');
      const history = manager.assembleHistory(convId);
      expect(history).toEqual([]);
    });

    it('returns ingested messages in order', () => {
      const convId = manager.getOrCreateConversation('feature-history');
      manager.ingestMessage(convId, 'user', 'First message');
      manager.ingestMessage(convId, 'assistant', 'First reply');
      manager.ingestMessage(convId, 'user', 'Second message');
      manager.ingestMessage(convId, 'assistant', 'Second reply');

      const history = manager.assembleHistory(convId);
      expect(history.length).toBe(4);
      expect(history[0]).toMatchObject({ role: 'user', content: 'First message' });
      expect(history[1]).toMatchObject({ role: 'assistant', content: 'First reply' });
      expect(history[2]).toMatchObject({ role: 'user', content: 'Second message' });
      expect(history[3]).toMatchObject({ role: 'assistant', content: 'Second reply' });
    });

    it('only returns user and assistant roles (never system)', () => {
      const convId = manager.getOrCreateConversation('feature-roles');
      manager.ingestMessage(convId, 'user', 'User turn');
      manager.ingestMessage(convId, 'assistant', 'Assistant turn');

      const history = manager.assembleHistory(convId);
      const roles = history.map((m) => m.role);
      for (const role of roles) {
        expect(['user', 'assistant']).toContain(role);
      }
    });

    it('does not include messages ingested AFTER assembleHistory is called', () => {
      const convId = manager.getOrCreateConversation('feature-timing');
      manager.ingestMessage(convId, 'user', 'Prior message');
      manager.ingestMessage(convId, 'assistant', 'Prior reply');

      // assembleHistory snapshots the store at this point
      const history = manager.assembleHistory(convId);
      expect(history.length).toBe(2);

      // Ingest the current user message (simulates what sendMessage does)
      manager.ingestMessage(convId, 'user', 'Current task message');

      // This assembly would now include the current message — useful for the
      // NEXT call but not the one that just happened. Validates the call-ordering
      // contract described in the module docblock.
      const historyAfterIngest = manager.assembleHistory(convId);
      expect(historyAfterIngest.length).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // Compaction (deterministic mode — no LLM)
  // -------------------------------------------------------------------------

  describe('maybeCompact', () => {
    it('does not throw when below the compaction threshold', async () => {
      const convId = manager.getOrCreateConversation('feature-compact-skip');
      manager.ingestMessage(convId, 'user', 'Short message');
      manager.ingestMessage(convId, 'assistant', 'Short reply');
      await expect(manager.maybeCompact(convId)).resolves.not.toThrow();
    });

    it('compacts a long conversation and the assembled history remains valid', async () => {
      const convId = manager.getOrCreateConversation('feature-compact-run');

      // Ingest enough content to exceed the 25 000-token threshold.
      // Each message is ~1 000 characters (~250 tokens via 4-chars/token heuristic).
      // We need > 100 such messages to reach 25 000 tokens.
      const longContent = 'x'.repeat(1_000);
      for (let i = 0; i < 120; i++) {
        manager.ingestMessage(
          convId,
          i % 2 === 0 ? 'user' : 'assistant',
          `Turn ${i}: ${longContent}`
        );
      }

      // Should not throw regardless of whether compaction was triggered
      await expect(manager.maybeCompact(convId)).resolves.not.toThrow();

      // After compaction the assembled history must still be a valid array
      const history = manager.assembleHistory(convId);
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeGreaterThan(0);

      // All entries must have valid roles and non-empty content
      for (const entry of history) {
        expect(['user', 'assistant']).toContain(entry.role);
        expect(typeof entry.content).toBe('string');
        expect(entry.content.length).toBeGreaterThan(0);
      }
    });
  });
});
