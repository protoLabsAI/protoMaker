/**
 * Unit tests for AutomergeFeatureStore.
 *
 * Tests are split into two suites:
 *  - CRDT disabled (no proto.config.yaml): all operations delegate to FeatureLoader
 *  - CRDT enabled (proto.config.yaml present): reads from Automerge doc, writes go to
 *    disk then update in-memory CRDT doc; applyRemoteChanges merges peer changes.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as Automerge from '@automerge/automerge';

import { AutomergeFeatureStore } from '../../../src/services/automerge-feature-store.js';
import { createEventEmitter } from '../../../src/lib/events.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

async function makeProjectDir(withProtoConfig: boolean): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'amfs-test-'));
  await fs.mkdir(path.join(dir, '.automaker', 'features'), { recursive: true });
  if (withProtoConfig) {
    await fs.writeFile(path.join(dir, 'proto.config.yaml'), 'name: test-project\n', 'utf-8');
  }
  return dir;
}

// ─── Suite: CRDT disabled (no proto.config.yaml) ────────────────────────────

describe('AutomergeFeatureStore — CRDT disabled (no proto.config.yaml)', () => {
  let store: AutomergeFeatureStore;
  let tempDir: string;

  beforeEach(async () => {
    store = new AutomergeFeatureStore(createEventEmitter());
    tempDir = await makeProjectDir(false);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('satisfies FeatureStore interface at type level', () => {
    // compile-time check
    const _: import('@protolabsai/types').FeatureStore = store;
    expect(_).toBeDefined();
  });

  it('getAll delegates to FeatureLoader', async () => {
    const features = await store.getAll(tempDir);
    expect(Array.isArray(features)).toBe(true);
    expect(features).toHaveLength(0);
  });

  it('create/get/delete delegate to FeatureLoader', async () => {
    const created = await store.create(tempDir, { title: 'Fallback Feature' });
    expect(created.id).toBeDefined();
    expect(created.title).toBe('Fallback Feature');

    const fetched = await store.get(tempDir, created.id);
    expect(fetched?.id).toBe(created.id);

    const deleted = await store.delete(tempDir, created.id);
    expect(deleted).toBe(true);

    const gone = await store.get(tempDir, created.id);
    expect(gone).toBeNull();
  });

  it('claim/release delegate to FeatureLoader', async () => {
    const feature = await store.create(tempDir, { title: 'Claim Test' });

    const claimed = await store.claim(tempDir, feature.id, 'instance-a');
    expect(claimed).toBe(true);

    const blocked = await store.claim(tempDir, feature.id, 'instance-b');
    expect(blocked).toBe(false);

    await store.release(tempDir, feature.id);
    const reclaimed = await store.claim(tempDir, feature.id, 'instance-b');
    expect(reclaimed).toBe(true);
  });
});

// ─── Suite: CRDT enabled (proto.config.yaml present) ────────────────────────

describe('AutomergeFeatureStore — CRDT enabled (proto.config.yaml present)', () => {
  let store: AutomergeFeatureStore;
  let tempDir: string;
  let emittedEvents: Array<{ event: string; data: unknown }>;

  beforeEach(async () => {
    emittedEvents = [];
    const events = createEventEmitter();
    events.on('feature:updated', (data) => emittedEvents.push({ event: 'feature:updated', data }));
    store = new AutomergeFeatureStore(events);
    tempDir = await makeProjectDir(true);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('getAll returns empty array for new project', async () => {
    const features = await store.getAll(tempDir);
    expect(features).toHaveLength(0);
  });

  it('create adds feature to in-memory doc and emits feature:updated', async () => {
    const feature = await store.create(tempDir, { title: 'CRDT Feature', description: 'desc' });

    // Reads come from in-memory doc
    const all = await store.getAll(tempDir);
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe('CRDT Feature');

    // Event emitted
    expect(emittedEvents).toHaveLength(1);
    expect(emittedEvents[0].event).toBe('feature:updated');
    expect((emittedEvents[0].data as { featureId: string }).featureId).toBe(feature.id);
  });

  it('get reads from in-memory doc', async () => {
    const created = await store.create(tempDir, { title: 'Get Test' });

    const fetched = await store.get(tempDir, created.id);
    expect(fetched?.id).toBe(created.id);
    expect(fetched?.title).toBe('Get Test');
  });

  it('get returns null for unknown featureId', async () => {
    await store.create(tempDir, { title: 'Existing' });
    const missing = await store.get(tempDir, 'nonexistent-id');
    expect(missing).toBeNull();
  });

  it('update mutates in-memory doc and emits feature:updated', async () => {
    const feature = await store.create(tempDir, { title: 'To Update' });
    emittedEvents.length = 0; // clear create event

    await store.update(tempDir, feature.id, { title: 'Updated Title' });

    const fetched = await store.get(tempDir, feature.id);
    expect(fetched?.title).toBe('Updated Title');

    expect(emittedEvents).toHaveLength(1);
    expect(emittedEvents[0].event).toBe('feature:updated');
  });

  it('delete removes feature from in-memory doc and emits feature:updated', async () => {
    const feature = await store.create(tempDir, { title: 'To Delete' });
    emittedEvents.length = 0;

    const result = await store.delete(tempDir, feature.id);
    expect(result).toBe(true);

    const all = await store.getAll(tempDir);
    expect(all).toHaveLength(0);

    expect(emittedEvents).toHaveLength(1);
    const ev = emittedEvents[0].data as { feature: null };
    expect(ev.feature).toBeNull();
  });

  it('getAll returns features sorted by creation time', async () => {
    const a = await store.create(tempDir, { title: 'Alpha' });
    const b = await store.create(tempDir, { title: 'Beta' });
    const c = await store.create(tempDir, { title: 'Gamma' });

    const all = await store.getAll(tempDir);
    expect(all.map((f) => f.id)).toEqual([a.id, b.id, c.id]);
  });

  describe('claim / release', () => {
    it('claims an unclaimed feature', async () => {
      const feature = await store.create(tempDir, { title: 'Claim' });

      const ok = await store.claim(tempDir, feature.id, 'instance-a');
      expect(ok).toBe(true);

      const fetched = await store.get(tempDir, feature.id);
      expect(fetched?.claimedBy).toBe('instance-a');
    });

    it('allows same instance to re-claim', async () => {
      const feature = await store.create(tempDir, { title: 'Re-claim' });
      await store.claim(tempDir, feature.id, 'instance-a');

      const ok = await store.claim(tempDir, feature.id, 'instance-a');
      expect(ok).toBe(true);
    });

    it('rejects claim from different instance', async () => {
      const feature = await store.create(tempDir, { title: 'Block' });
      await store.claim(tempDir, feature.id, 'instance-a');

      const blocked = await store.claim(tempDir, feature.id, 'instance-b');
      expect(blocked).toBe(false);

      const fetched = await store.get(tempDir, feature.id);
      expect(fetched?.claimedBy).toBe('instance-a');
    });

    it('returns false for non-existent feature', async () => {
      const result = await store.claim(tempDir, 'ghost-id', 'instance-a');
      expect(result).toBe(false);
    });

    it('release clears claimedBy', async () => {
      const feature = await store.create(tempDir, { title: 'Release' });
      await store.claim(tempDir, feature.id, 'instance-a');
      await store.release(tempDir, feature.id);

      const fetched = await store.get(tempDir, feature.id);
      expect(fetched?.claimedBy).toBeUndefined();
    });

    it('allows claim after release', async () => {
      const feature = await store.create(tempDir, { title: 'After Release' });
      await store.claim(tempDir, feature.id, 'instance-a');
      await store.release(tempDir, feature.id);

      const ok = await store.claim(tempDir, feature.id, 'instance-b');
      expect(ok).toBe(true);
    });
  });

  describe('applyRemoteChanges — integration', () => {
    it('feature created on instance A appears on instance B', async () => {
      // Instance A creates a feature
      const eventsB = createEventEmitter();
      const receivedOnB: string[] = [];
      eventsB.on('feature:updated', (d: { featureId: string }) => receivedOnB.push(d.featureId));
      const storeB = new AutomergeFeatureStore(eventsB);

      // A creates a feature
      const featureA = await store.create(tempDir, { title: 'Cross-Instance Feature' });

      // Get A's Automerge binary
      const binaryA = await store.getDocBinary(tempDir);

      // Derive changes from A's full doc
      const docA = Automerge.load<{ features: Record<string, unknown> }>(binaryA);
      const changes = Automerge.getAllChanges(docA);

      // Apply to B
      storeB.applyRemoteChanges(tempDir, changes);

      // B can see the feature (from CRDT doc, not disk)
      const allB = await storeB.getAll(tempDir);
      expect(allB.some((f) => f.id === featureA.id)).toBe(true);
      expect(allB.find((f) => f.id === featureA.id)?.title).toBe('Cross-Instance Feature');

      // B emitted a feature:updated event
      expect(receivedOnB).toContain(featureA.id);
    });

    it('merges concurrent changes from two instances', async () => {
      const eventsB = createEventEmitter();
      const storeB = new AutomergeFeatureStore(eventsB);

      // Both start with the same base
      const base = await store.getDocBinary(tempDir);
      storeB.applyRemoteChanges(tempDir, Automerge.getAllChanges(Automerge.load(base)));

      // A creates feature-1, B creates feature-2
      const f1 = await store.create(tempDir, { title: 'From A' });
      const f2 = await storeB.create(tempDir, { title: 'From B' });

      // Exchange changes
      const binaryA = await store.getDocBinary(tempDir);
      const binaryB = await storeB.getDocBinary(tempDir);

      const docA = Automerge.load<{ features: Record<string, unknown> }>(binaryA);
      const docB = Automerge.load<{ features: Record<string, unknown> }>(binaryB);

      // A applies B's changes, B applies A's changes
      store.applyRemoteChanges(tempDir, Automerge.getAllChanges(docB));
      storeB.applyRemoteChanges(tempDir, Automerge.getAllChanges(docA));

      const allA = await store.getAll(tempDir);
      const allB = await storeB.getAll(tempDir);

      // Both instances should have both features
      expect(allA.some((f) => f.id === f1.id)).toBe(true);
      expect(allA.some((f) => f.id === f2.id)).toBe(true);
      expect(allB.some((f) => f.id === f1.id)).toBe(true);
      expect(allB.some((f) => f.id === f2.id)).toBe(true);
    });
  });
});
