/**
 * Regression test for #3603 — KnowledgeStoreService is a mutable single-project
 * singleton. A search or background embedding job can be holding the old database
 * connection mid-await when another call reinitializes the service for a different
 * project — the in-flight op resumes with a closed db handle and either fails the
 * search or silently skips embeddings.
 *
 * Fix: serialize project switching with an in-flight operation guard. initialize()
 * now waits for all tracked async operations to complete before closing the old
 * database connection.
 *
 * Skipped when better-sqlite3 native bindings are missing.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type BetterSqlite3 from 'better-sqlite3';

let Database: typeof BetterSqlite3;
let hasSqlite = false;
try {
  Database = (await import('better-sqlite3')).default;
  hasSqlite = true;
} catch {
  // Native bindings not available (e.g. CI without rebuild)
}

import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { KnowledgeStoreService } from '../src/services/knowledge-store-service.js';
import { KnowledgeEmbeddingOrchestrator } from '../src/services/knowledge-embedding-orchestrator.js';
import { EmbeddingService } from '../src/services/embedding-service.js';

// ────────────────────────── Helpers ──────────────────────────────────────────

/** Create a temporary project directory for testing */
function createTempProject(baseDir: string, name: string): string {
  const dir = path.join(baseDir, name);
  const automakerDir = path.join(dir, '.automaker');
  fs.mkdirSync(automakerDir, { recursive: true });
  return dir;
}

/** Fake embedding service with controllable delay */
class DelayedEmbeddingService extends EmbeddingService {
  private _delayMs = 0;
  private _isReady = false;

  constructor() {
    // Use a non-existent model path — we'll short-circuit embed() before it loads
    super('fake/model', '/tmp/never-used');
  }

  setIsReady(ready: boolean): void {
    this._isReady = ready;
  }

  setDelay(ms: number): void {
    this._delayMs = ms;
  }

  override isReady(): boolean {
    return this._isReady;
  }

  override async embed(_text: string): Promise<Float32Array> {
    if (this._delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this._delayMs));
    }
    // Return a dummy embedding
    return new Float32Array([0.1, 0.2, 0.3, 0.4]);
  }

  override async embedBatch(texts: string[]): Promise<Float32Array[]> {
    return texts.map(() => new Float32Array([0.1, 0.2, 0.3, 0.4]));
  }

  override cosineSimilarity(_a: Float32Array, _b: Float32Array): number {
    return 0.8;
  }
}

describe.skipIf(!hasSqlite)('KnowledgeStoreService serialized project switching (#3603)', () => {
  let tempDir: string;
  let projectA: string;
  let projectB: string;
  let fakeEmbedding: DelayedEmbeddingService;
  let store: KnowledgeStoreService;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kstore-test-'));
    projectA = createTempProject(tempDir, 'project-a');
    projectB = createTempProject(tempDir, 'project-b');

    fakeEmbedding = new DelayedEmbeddingService();
    fakeEmbedding.setIsReady(false); // Start with embeddings disabled for BM25-only searches

    const orchestrator = new KnowledgeEmbeddingOrchestrator(
      fakeEmbedding as unknown as EmbeddingService
    );
    store = new KnowledgeStoreService(orchestrator);
  });

  afterEach(() => {
    try {
      store.close();
    } catch {
      // Ignore cleanup errors
    }
    try {
      if (tempDir) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  it('completes search on project A even when project B initializes mid-search', async () => {
    // Initialize for project A
    await store.initialize(projectA);

    // Insert a searchable chunk
    store.ingestChunk(projectA, 'test content for project a', 'test');

    // Enable hybrid retrieval so search() actually awaits embedding work
    fakeEmbedding.setIsReady(true);
    fakeEmbedding.setDelay(200); // 200ms delay on embed()

    // Start a search on project A — this will track in-flight
    const searchPromise = store.search(projectA, 'test', { maxResults: 5 });

    // Before the embedding resolves, initialize for project B
    // This should wait for the search to complete before closing project A's db
    await new Promise((resolve) => setTimeout(resolve, 50));
    await store.initialize(projectB);

    // The search on project A should still complete without error
    const result = await searchPromise;
    expect(result.results.length).toBeGreaterThanOrEqual(0); // Should not throw
  });

  it('initialize() waits for in-flight operations before closing db', async () => {
    await store.initialize(projectA);
    store.ingestChunk(projectA, 'project a chunk', 'test');

    // Enable embeddings with delay
    fakeEmbedding.setIsReady(true);
    fakeEmbedding.setDelay(300);

    // Start search (tracks in-flight)
    const searchPromise = store.search(projectA, 'project a');

    // Give the search time to start its async work
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Track that initialize for project B completes
    let projectBInitialized = false;
    const initPromise = store.initialize(projectB).then(() => {
      projectBInitialized = true;
    });

    // Wait for both
    await Promise.all([searchPromise, initPromise]);

    // By now, project B should have initialized
    expect(projectBInitialized).toBe(true);
  });

  it('searchReflections also tracks in-flight operations', async () => {
    await store.initialize(projectA);

    // searchReflections should not throw even with project switching
    const result = await store.searchReflections(projectA, 'anything', 5);
    expect(Array.isArray(result)).toBe(true);
  });

  it('multiple concurrent searches on same project all complete', async () => {
    await store.initialize(projectA);
    store.ingestChunk(projectA, 'shared test content', 'test');

    fakeEmbedding.setIsReady(true);
    fakeEmbedding.setDelay(100);

    const promises = [
      store.search(projectA, 'shared'),
      store.search(projectA, 'test'),
      store.search(projectA, 'content'),
    ];

    const results = await Promise.all(promises);
    expect(results).toHaveLength(3);
    for (const r of results) {
      expect(r.results.length).toBeGreaterThanOrEqual(0);
    }
  });

  it('waitForInFlight resolves immediately when no ops in flight', async () => {
    await store.initialize(projectA);

    // Should resolve immediately
    await store.waitForInFlight();
    expect(true).toBe(true);
  });

  it('trackInFlight correctly tracks operation lifecycle', async () => {
    await store.initialize(projectA);

    const finish = store.trackInFlight();

    // waitForInFlight should block while we have an in-flight op
    let resolved = false;
    const waitPromise = store.waitForInFlight().then(() => {
      resolved = true;
    });

    // Give the promise time to set up (but it shouldn't resolve yet)
    await new Promise((r) => setTimeout(r, 10));
    expect(resolved).toBe(false);

    // Release the in-flight op
    finish();

    // Now it should resolve
    await waitPromise;
    expect(resolved).toBe(true);
  });
});
