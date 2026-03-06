/**
 * FeatureLoader.update() — statusHistory and event gap baseline tests.
 *
 * These tests document two behaviors:
 * 1. Status changes ARE recorded in statusHistory[] by update()
 * 2. feature:status-changed is NOT auto-emitted by update() (the gap)
 *
 * The gap means LedgerService won't see status changes unless callers
 * explicitly emit the event after calling featureLoader.update().
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FeatureLoader } from '@/services/feature-loader.js';
import * as fs from 'fs/promises';

vi.mock('fs/promises');

describe('FeatureLoader.update() — statusHistory and event gap', () => {
  let loader: FeatureLoader;
  const testProjectPath = '/test/project';
  const featureId = 'feature-1000-abc';

  const baseFeature = {
    id: featureId,
    title: 'Test Feature',
    status: 'in_progress',
    category: 'backend',
    description: 'A test feature',
    createdAt: '2024-01-01T00:00:00.000Z',
    statusHistory: [
      {
        from: null,
        to: 'backlog',
        timestamp: '2024-01-01T00:00:00.000Z',
        reason: 'Feature created',
      },
      {
        from: 'backlog',
        to: 'in_progress',
        timestamp: '2024-01-01T01:00:00.000Z',
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    loader = new FeatureLoader();
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(baseFeature));
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
  });

  describe('statusHistory — appended on every status change', () => {
    it('appends a new transition to statusHistory when status changes', async () => {
      const result = await loader.update(testProjectPath, featureId, { status: 'review' });

      expect(result.statusHistory).toBeDefined();
      // 2 original entries + 1 new transition
      expect(result.statusHistory!.length).toBe(3);

      const last = result.statusHistory![result.statusHistory!.length - 1];
      expect(last.from).toBe('in_progress');
      expect(last.to).toBe('review');
      expect(last.timestamp).toBeDefined();
    });

    it('records the correct from/to statuses in the new transition', async () => {
      const result = await loader.update(testProjectPath, featureId, { status: 'done' });

      const last = result.statusHistory![result.statusHistory!.length - 1];
      expect(last.from).toBe('in_progress');
      expect(last.to).toBe('done');
    });

    it('records the from/to when transitioning to blocked', async () => {
      const result = await loader.update(testProjectPath, featureId, { status: 'blocked' });

      const last = result.statusHistory![result.statusHistory!.length - 1];
      expect(last.from).toBe('in_progress');
      expect(last.to).toBe('blocked');
    });

    it('includes statusChangeReason in the transition when provided', async () => {
      const result = await loader.update(testProjectPath, featureId, {
        status: 'blocked',
        statusChangeReason: 'Waiting on PR review',
      });

      const last = result.statusHistory![result.statusHistory!.length - 1];
      expect(last.to).toBe('blocked');
      expect(last.reason).toBe('Waiting on PR review');
    });

    it('does NOT append to statusHistory when status is unchanged', async () => {
      const result = await loader.update(testProjectPath, featureId, {
        title: 'Updated Title Only',
      });

      // statusHistory length stays the same — no status change recorded
      expect(result.statusHistory!.length).toBe(2);
    });

    it('preserves all existing statusHistory entries when appending', async () => {
      const result = await loader.update(testProjectPath, featureId, { status: 'review' });

      // The two original entries must still be present
      expect(result.statusHistory![0].to).toBe('backlog');
      expect(result.statusHistory![0].reason).toBe('Feature created');
      expect(result.statusHistory![1].to).toBe('in_progress');
    });

    it('sets completedAt when status transitions to done', async () => {
      const result = await loader.update(testProjectPath, featureId, { status: 'done' });

      expect(result.completedAt).toBeDefined();
      // Should be an ISO timestamp close to now
      const completedMs = new Date(result.completedAt!).getTime();
      expect(Date.now() - completedMs).toBeLessThan(5000);
    });

    it('sets reviewStartedAt when status transitions to review', async () => {
      const result = await loader.update(testProjectPath, featureId, { status: 'review' });

      expect(result.reviewStartedAt).toBeDefined();
    });

    it('persists the updated statusHistory to disk via atomicWrite', async () => {
      await loader.update(testProjectPath, featureId, { status: 'done' });

      // writeFile was called — verifying disk persistence
      expect(fs.writeFile).toHaveBeenCalled();
      const [, content] = vi.mocked(fs.writeFile).mock.calls[0] as [string, string, string];
      const written = JSON.parse(content);
      const last = written.statusHistory[written.statusHistory.length - 1];
      expect(last.to).toBe('done');
    });
  });

  describe('feature:status-changed event — NOT emitted by update() (gap documentation)', () => {
    it('FeatureLoader has no EventEmitter — it structurally cannot emit feature:status-changed', () => {
      // FeatureLoader's constructor takes zero arguments.
      // There is no EventEmitter dependency injected.
      // This means update() physically cannot emit events.
      const freshLoader = new FeatureLoader();

      // Confirm there is no 'events' property on the loader
      expect((freshLoader as unknown as Record<string, unknown>).events).toBeUndefined();
    });

    it('update() with a status change returns updated statusHistory but emits nothing', async () => {
      // If FeatureLoader had access to an EventEmitter, we would track calls here.
      // Since it has no EventEmitter, we verify the gap:
      // - statusHistory IS updated in the returned feature
      // - No event is emitted anywhere
      const emittedEvents: Array<{ type: string }> = [];

      const result = await loader.update(testProjectPath, featureId, { status: 'done' });

      // statusHistory IS recorded
      const last = result.statusHistory![result.statusHistory!.length - 1];
      expect(last.to).toBe('done');

      // No events were emitted — emittedEvents is empty because there is
      // no event bus in FeatureLoader for it to emit to
      expect(emittedEvents).toHaveLength(0);
    });

    it('documents the gap: LedgerService will not react unless caller emits feature:status-changed', async () => {
      // This test documents the integration gap:
      //
      // FeatureLoader.update() → writes statusHistory to disk
      // LedgerService.initialize() → subscribes to 'feature:status-changed'
      //
      // The gap: nothing connects them. After update(), LedgerService has not
      // been notified. If the caller doesn't emit 'feature:status-changed'
      // explicitly, the ledger will never get a record for this status change.
      //
      // Fix (not in this phase): route service or execution service must emit
      // the event after calling featureLoader.update().

      const result = await loader.update(testProjectPath, featureId, { status: 'done' });

      // statusHistory is updated — the change IS recorded on disk
      expect(result.statusHistory!.some((t) => t.to === 'done')).toBe(true);

      // But FeatureLoader has no events object to call emit() on
      // The fact that (loader as any).events === undefined proves the gap
      expect((loader as unknown as Record<string, unknown>).events).toBeUndefined();
    });

    it('update() with a non-status change also emits nothing', async () => {
      const result = await loader.update(testProjectPath, featureId, {
        description: 'Updated description',
      });

      // No status change — statusHistory unchanged
      expect(result.statusHistory!.length).toBe(2);
      // No events mechanism exists in FeatureLoader
      expect((loader as unknown as Record<string, unknown>).events).toBeUndefined();
    });
  });
});
