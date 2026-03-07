/**
 * CRDTStore integration tests.
 *
 * Covers:
 * - Document creation, change, and subscribe
 * - Two-node sync: change on node A appears on node B within 200ms
 * - Conflict test: concurrent field updates on same document merge correctly
 * - Schema-on-read normalization
 * - instanceId and timestamp attribution
 * - Compaction checkpoint generation
 * - One-time hydration from filesystem
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WebSocketServer } from 'ws';
import { WebSocketServerAdapter } from '@automerge/automerge-repo-network-websocket';
import { CRDTStore } from '../crdt-store.js';
import type { FeatureDocument } from '../documents.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'crdt-test-'));
}

async function makeStore(
  storageDir: string,
  instanceId: string,
  peers?: { url: string }[]
): Promise<CRDTStore> {
  const store = new CRDTStore({ storageDir, instanceId, peers });
  await store.init();
  return store;
}

/**
 * Poll until predicate returns true or timeout expires.
 */
async function pollUntil(
  predicate: () => boolean,
  timeoutMs: number,
  intervalMs = 10
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return predicate();
}

// ---------------------------------------------------------------------------
// Unit-level tests (single-node)
// ---------------------------------------------------------------------------

describe('CRDTStore — single node', () => {
  let storageDir: string;
  let store: CRDTStore;

  beforeEach(async () => {
    storageDir = makeTempDir();
    store = await makeStore(storageDir, 'node-A');
  });

  afterEach(async () => {
    await store.close();
    fs.rmSync(storageDir, { recursive: true, force: true });
  });

  it('creates a document with schemaVersion=1 and _meta', async () => {
    const handle = await store.getOrCreate<FeatureDocument>('features', 'feat-1', {
      id: 'feat-1',
      title: 'Hello',
      description: '',
      status: 'backlog',
      createdAt: new Date().toISOString(),
    });

    const doc = handle.docSync()!;
    expect(doc.schemaVersion).toBe(1);
    expect(doc._meta.instanceId).toBe('node-A');
    expect(typeof doc._meta.createdAt).toBe('string');
    expect(typeof doc._meta.updatedAt).toBe('string');
  });

  it('change() mutates the document and updates attribution', async () => {
    await store.getOrCreate<FeatureDocument>('features', 'feat-2', {
      id: 'feat-2',
      title: 'Original',
      description: '',
      status: 'backlog',
      createdAt: new Date().toISOString(),
    });

    await store.change<FeatureDocument>('features', 'feat-2', (doc) => {
      doc.title = 'Updated';
    });

    const handle = await store.getOrCreate<FeatureDocument>('features', 'feat-2');
    const doc = handle.docSync()!;

    expect(doc.title).toBe('Updated');
    expect(doc._meta.instanceId).toBe('node-A');
    expect(typeof doc._meta.updatedAt).toBe('string');
  });

  it('subscribe() fires callback on change', async () => {
    await store.getOrCreate<FeatureDocument>('features', 'feat-sub', {
      id: 'feat-sub',
      title: 'Watch',
      description: '',
      status: 'backlog',
      createdAt: new Date().toISOString(),
    });

    const received: string[] = [];
    const unsub = store.subscribe<FeatureDocument>('features', 'feat-sub', (doc) => {
      received.push(doc.title);
    });

    // Wait briefly for subscribe setup to complete
    await new Promise((r) => setTimeout(r, 20));

    await store.change<FeatureDocument>('features', 'feat-sub', (doc) => {
      doc.title = 'Changed';
    });

    const ok = await pollUntil(() => received.length > 0, 500);
    expect(ok).toBe(true);
    expect(received[received.length - 1]).toBe('Changed');

    unsub();
  });

  it('getOrCreate() returns same handle on subsequent calls', async () => {
    const h1 = await store.getOrCreate<FeatureDocument>('features', 'feat-same', {
      id: 'feat-same',
      title: 'X',
      description: '',
      status: 'backlog',
      createdAt: new Date().toISOString(),
    });
    const h2 = await store.getOrCreate<FeatureDocument>('features', 'feat-same');
    expect(h1).toBe(h2);
  });

  it('persists registry.json to storageDir', async () => {
    await store.getOrCreate<FeatureDocument>('features', 'feat-reg', {
      id: 'feat-reg',
      title: 'Persist',
      description: '',
      status: 'backlog',
      createdAt: new Date().toISOString(),
    });

    const registryPath = path.join(storageDir, 'registry.json');
    expect(fs.existsSync(registryPath)).toBe(true);

    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
    expect(registry['features:feat-reg']).toMatch(/^automerge:/);
  });

  it('compact() creates checkpoint files in storageDir/checkpoints/', async () => {
    await store.getOrCreate<FeatureDocument>('features', 'feat-compact', {
      id: 'feat-compact',
      title: 'Compaction test',
      description: '',
      status: 'backlog',
      createdAt: new Date().toISOString(),
    });

    await store.compact();

    const checkpointDir = path.join(storageDir, 'checkpoints');
    expect(fs.existsSync(checkpointDir)).toBe(true);

    const files = fs.readdirSync(checkpointDir);
    expect(files.length).toBeGreaterThan(0);
    expect(files[0]).toMatch(/\.bin$/);
  });

  it('hydration function is called once when storage is empty', async () => {
    const hydrationDir = makeTempDir();
    const hydratedStore = new CRDTStore({ storageDir: hydrationDir, instanceId: 'hydrator' });

    let hydrationCalled = false;
    await hydratedStore.init(async (ctx) => {
      hydrationCalled = true;
      await ctx.createDocument<FeatureDocument>('features', 'hydrated-1', {
        id: 'hydrated-1',
        title: 'From filesystem',
        description: '',
        status: 'backlog',
        createdAt: new Date().toISOString(),
      });
    });

    expect(hydrationCalled).toBe(true);

    const handle = await hydratedStore.getOrCreate<FeatureDocument>('features', 'hydrated-1');
    expect(handle.docSync()!.title).toBe('From filesystem');

    await hydratedStore.close();
    fs.rmSync(hydrationDir, { recursive: true, force: true });
  });

  it('hydration is NOT called on second startup (marker file present)', async () => {
    const dir = makeTempDir();
    let callCount = 0;
    const hydrationFn = async () => {
      callCount++;
    };

    const s1 = new CRDTStore({ storageDir: dir, instanceId: 'node-1' });
    await s1.init(hydrationFn);
    await s1.close();

    const s2 = new CRDTStore({ storageDir: dir, instanceId: 'node-1' });
    await s2.init(hydrationFn);
    await s2.close();

    // Hydration marker exists after first init, so second init skips hydration
    expect(callCount).toBe(1);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// Schema-on-read normalization tests
// ---------------------------------------------------------------------------

describe('Schema-on-read normalization', () => {
  it('normalizeFeatureDocument converts legacy statuses', async () => {
    const { normalizeFeatureDocument } = await import('../documents.js');

    const legacyDoc = {
      schemaVersion: 1 as const,
      _meta: { instanceId: 'x', createdAt: 'now', updatedAt: 'now' },
      id: 'f1',
      title: 'Test',
      description: '',
      status: 'running', // legacy
      createdAt: 'now',
    };

    const normalized = normalizeFeatureDocument(legacyDoc);
    expect(normalized.status).toBe('in_progress');
  });

  it('normalizeFeatureDocument normalizes "completed" to "done"', async () => {
    const { normalizeFeatureDocument } = await import('../documents.js');

    const doc = {
      schemaVersion: 1 as const,
      _meta: { instanceId: 'x', createdAt: 'now', updatedAt: 'now' },
      id: 'f2',
      title: 'Test',
      description: '',
      status: 'completed',
      createdAt: 'now',
    };

    expect(normalizeFeatureDocument(doc).status).toBe('done');
  });

  it('normalizeDocument dispatches by domain', async () => {
    const { normalizeDocument } = await import('../documents.js');

    const raw = {
      schemaVersion: 1 as const,
      _meta: { instanceId: 'x', createdAt: 'now', updatedAt: 'now' },
      id: 'f3',
      title: '',
      description: '',
      status: 'failed', // legacy
      createdAt: 'now',
    };

    const result = normalizeDocument<FeatureDocument>('features', raw);
    expect(result.status).toBe('blocked');
  });

  it('normalizeDocument fills in missing schemaVersion', async () => {
    const { normalizeFeatureDocument } = await import('../documents.js');

    const raw = {
      _meta: { instanceId: 'x', createdAt: 'now', updatedAt: 'now' },
      id: 'f4',
      title: '',
      description: '',
      status: 'backlog',
      createdAt: 'now',
    };

    const result = normalizeFeatureDocument(raw as Parameters<typeof normalizeFeatureDocument>[0]);
    expect(result.schemaVersion).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Two-node integration tests (WebSocket sync)
// ---------------------------------------------------------------------------

describe('CRDTStore — two-node sync', () => {
  let wss: WebSocketServer;
  let port: number;
  let dirA: string;
  let dirB: string;
  let storeA: CRDTStore;
  let storeB: CRDTStore;

  beforeEach(
    async () => {
      dirA = makeTempDir();
      dirB = makeTempDir();

      // Start WebSocket server on a random port
      wss = new WebSocketServer({ port: 0 });
      await new Promise<void>((resolve) => wss.once('listening', resolve));
      port = (wss.address() as { port: number }).port;

      // Node A acts as server (directly attaches server adapter after init)
      storeA = new CRDTStore({ storageDir: dirA, instanceId: 'node-A' });
      await storeA.init();
      storeA.attachServerAdapter(new WebSocketServerAdapter(wss));

      // Node B connects to Node A as client
      storeB = await makeStore(dirB, 'node-B', [{ url: `ws://localhost:${port}` }]);
    },
    15000
  );

  afterEach(
    async () => {
      await storeA.close();
      await storeB.close();
      // Terminate any remaining clients before closing the server
      wss.clients.forEach((client) => client.terminate());
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      fs.rmSync(dirA, { recursive: true, force: true });
      fs.rmSync(dirB, { recursive: true, force: true });
    },
    15000
  );

  it('change on node A appears on node B within 200ms', async () => {
    // Wait for WebSocket connection to establish between the two nodes
    await new Promise((r) => setTimeout(r, 100));

    // Create and populate doc on A
    await storeA.getOrCreate<FeatureDocument>('features', 'sync-feat', {
      id: 'sync-feat',
      title: 'Initial',
      description: '',
      status: 'backlog',
      createdAt: new Date().toISOString(),
    });

    await storeA.change<FeatureDocument>('features', 'sync-feat', (doc) => {
      doc.title = 'From A';
    });

    const url = storeA.getDocumentUrl('features', 'sync-feat')!;
    expect(url).toBeTruthy();

    // Node B requests the doc from Node A by URL and records the request time
    storeB.registerDocumentUrl('features', 'sync-feat', url);
    const syncStart = Date.now();
    const handleB = await storeB.findByUrl<FeatureDocument>(url);

    // findByUrl resolves when the doc is available from the peer
    const syncMs = Date.now() - syncStart;

    expect(handleB.docSync()?.title).toBe('From A');
    // Verify sync completed within 200ms (allowing generous tolerance for CI)
    expect(syncMs).toBeLessThan(200);
  });

  it('conflict: concurrent field updates on same document merge correctly', async () => {
    // Wait for WebSocket connection to establish
    await new Promise((r) => setTimeout(r, 100));

    // Create initial doc on A
    await storeA.getOrCreate<FeatureDocument>('features', 'conflict-feat', {
      id: 'conflict-feat',
      title: 'Base',
      description: 'base desc',
      status: 'backlog',
      createdAt: new Date().toISOString(),
    });

    const url = storeA.getDocumentUrl('features', 'conflict-feat')!;
    storeB.registerDocumentUrl('features', 'conflict-feat', url);

    // Wait for B to sync the initial doc
    const handleB = await storeB.findByUrl<FeatureDocument>(url);
    await pollUntil(() => handleB.docSync()?.title === 'Base', 1000);

    // Concurrent updates: A changes title, B changes description
    await Promise.all([
      storeA.change<FeatureDocument>('features', 'conflict-feat', (doc) => {
        doc.title = 'Title from A';
      }),
      storeB.change<FeatureDocument>('features', 'conflict-feat', (doc) => {
        doc.description = 'Desc from B';
      }),
    ]);

    // Wait for both changes to propagate to both nodes
    const handleA = await storeA.getOrCreate<FeatureDocument>('features', 'conflict-feat');

    const merged = await pollUntil(
      () =>
        handleA.docSync()?.title === 'Title from A' &&
        handleA.docSync()?.description === 'Desc from B' &&
        handleB.docSync()?.title === 'Title from A' &&
        handleB.docSync()?.description === 'Desc from B',
      2000
    );

    expect(merged).toBe(true);

    const docA = handleA.docSync()!;
    const docB = handleB.docSync()!;

    // Both nodes see both changes merged (no data lost)
    expect(docA.title).toBe('Title from A');
    expect(docA.description).toBe('Desc from B');
    expect(docB.title).toBe('Title from A');
    expect(docB.description).toBe('Desc from B');
  });
});
