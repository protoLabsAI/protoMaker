/**
 * FeatureLoader.update() — auto-emission of feature:status-changed
 *
 * Verifies:
 * 1. Status changes ARE recorded in statusHistory[] by update()
 * 2. feature:status-changed IS auto-emitted by update() when EventEmitter is injected
 * 3. Event fires exactly once per status change (no double-fires)
 * 4. skipEventEmission option suppresses emission when needed
 * 5. No event emitted when status does not change
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FeatureLoader } from '@/services/feature-loader.js';
import * as fs from 'fs/promises';

vi.mock('fs/promises');

// Minimal EventEmitter mock
function createMockEmitter() {
  const emitted: Array<{ type: string; payload: unknown }> = [];
  return {
    emit: vi.fn((type: string, payload: unknown) => {
      emitted.push({ type, payload });
    }),
    subscribe: vi.fn(),
    on: vi.fn(),
    broadcast: vi.fn(),
    _emitted: emitted,
  };
}

describe('FeatureLoader.update() — statusHistory and event auto-emission', () => {
  let loader: FeatureLoader;
  let mockEmitter: ReturnType<typeof createMockEmitter>;

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
    mockEmitter = createMockEmitter();
    loader.setEventEmitter(mockEmitter as unknown as import('@/lib/events.js').EventEmitter);
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

  describe('feature:status-changed auto-emission', () => {
    it('emits feature:status-changed exactly once when status changes', async () => {
      await loader.update(testProjectPath, featureId, { status: 'done' });

      const statusChangedEvents = mockEmitter._emitted.filter(
        (e) => e.type === 'feature:status-changed'
      );
      expect(statusChangedEvents).toHaveLength(1);
    });

    it('emits with correct featureId, projectPath, oldStatus, newStatus', async () => {
      await loader.update(testProjectPath, featureId, { status: 'review' });

      const event = mockEmitter._emitted.find((e) => e.type === 'feature:status-changed');
      expect(event).toBeDefined();
      const payload = event!.payload as Record<string, unknown>;
      expect(payload.featureId).toBe(featureId);
      expect(payload.projectPath).toBe(testProjectPath);
      expect(payload.oldStatus).toBe('in_progress');
      expect(payload.newStatus).toBe('review');
    });

    it('emits with reason from statusChangeReason when provided', async () => {
      await loader.update(testProjectPath, featureId, {
        status: 'blocked',
        statusChangeReason: 'Dependency not ready',
      });

      const event = mockEmitter._emitted.find((e) => e.type === 'feature:status-changed');
      const payload = event!.payload as Record<string, unknown>;
      expect(payload.reason).toBe('Dependency not ready');
    });

    it('emits with default reason "status updated" when no statusChangeReason', async () => {
      await loader.update(testProjectPath, featureId, { status: 'done' });

      const event = mockEmitter._emitted.find((e) => e.type === 'feature:status-changed');
      const payload = event!.payload as Record<string, unknown>;
      expect(payload.reason).toBe('status updated');
    });

    it('emits previousStatus as backward-compat alias for oldStatus', async () => {
      await loader.update(testProjectPath, featureId, { status: 'done' });

      const event = mockEmitter._emitted.find((e) => e.type === 'feature:status-changed');
      const payload = event!.payload as Record<string, unknown>;
      expect(payload.previousStatus).toBe('in_progress');
      expect(payload.oldStatus).toBe('in_progress');
    });

    it('does NOT emit feature:status-changed when status is unchanged', async () => {
      await loader.update(testProjectPath, featureId, { title: 'New Title Only' });

      const statusChangedEvents = mockEmitter._emitted.filter(
        (e) => e.type === 'feature:status-changed'
      );
      expect(statusChangedEvents).toHaveLength(0);
    });

    it('does NOT emit when no EventEmitter is injected', async () => {
      const bareLoader = new FeatureLoader();
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(baseFeature));

      // Should not throw — just silently skips emission
      await expect(
        bareLoader.update(testProjectPath, featureId, { status: 'done' })
      ).resolves.toBeDefined();

      // Our mock emitter never called — bare loader has no emitter
      expect(mockEmitter.emit).not.toHaveBeenCalled();
    });

    it('fires exactly once per status change — not twice', async () => {
      await loader.update(testProjectPath, featureId, { status: 'review' });

      // Ensure there is only 1 emission even if callers previously added manual emissions
      expect(mockEmitter.emit).toHaveBeenCalledTimes(1);
      expect(mockEmitter.emit).toHaveBeenCalledWith(
        'feature:status-changed',
        expect.objectContaining({ newStatus: 'review' })
      );
    });

    it('suppressess emission when skipEventEmission is true', async () => {
      await loader.update(
        testProjectPath,
        featureId,
        { status: 'done' },
        undefined,
        undefined,
        undefined,
        { skipEventEmission: true }
      );

      const statusChangedEvents = mockEmitter._emitted.filter(
        (e) => e.type === 'feature:status-changed'
      );
      expect(statusChangedEvents).toHaveLength(0);
    });

    it('emits normally when skipEventEmission is false (explicit)', async () => {
      await loader.update(
        testProjectPath,
        featureId,
        { status: 'done' },
        undefined,
        undefined,
        undefined,
        { skipEventEmission: false }
      );

      const statusChangedEvents = mockEmitter._emitted.filter(
        (e) => e.type === 'feature:status-changed'
      );
      expect(statusChangedEvents).toHaveLength(1);
    });

    it('persists to disk BEFORE emitting (persist-before-emit guarantee)', async () => {
      const callOrder: string[] = [];

      vi.mocked(fs.writeFile).mockImplementation(async () => {
        callOrder.push('disk-write');
        return undefined;
      });
      mockEmitter.emit.mockImplementation((type: string) => {
        if (type === 'feature:status-changed') {
          callOrder.push('event-emit');
        }
      });

      await loader.update(testProjectPath, featureId, { status: 'done' });

      // disk write must happen before event emission
      const writeIdx = callOrder.indexOf('disk-write');
      const emitIdx = callOrder.indexOf('event-emit');
      expect(writeIdx).toBeGreaterThanOrEqual(0);
      expect(emitIdx).toBeGreaterThan(writeIdx);
    });
  });
});
