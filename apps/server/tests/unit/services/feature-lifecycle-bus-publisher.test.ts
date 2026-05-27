import { describe, it, expect, vi } from 'vitest';
import { FeatureLifecycleBusPublisher } from '@/services/feature-lifecycle-bus-publisher.js';

function makePublisher(opts?: { feature?: unknown; publishFn?: ReturnType<typeof vi.fn> }) {
  const publishFn = opts?.publishFn ?? vi.fn().mockResolvedValue({ ok: true });
  const featureLoader = { get: vi.fn().mockResolvedValue(opts?.feature ?? null) };
  // enabled=true bypasses the WORKSTACEAN_URL env gate for these tests.
  const pub = new FeatureLifecycleBusPublisher(
    { on: vi.fn() } as never,
    featureLoader as never,
    publishFn,
    true
  );
  return { pub, publishFn, featureLoader };
}

describe('FeatureLifecycleBusPublisher', () => {
  it('publishes feature.completed (dotted, unprefixed) on transition to done', async () => {
    const feature = {
      id: 'f1',
      title: 'Ship it',
      projectSlug: 'proj',
      branchName: 'feature/ship-it',
      sourceChannel: 'github',
      signalMetadata: { sourceLinearIssueId: 'LIN-1' },
    };
    const { pub, publishFn } = makePublisher({ feature });

    await pub.handleStatusChange({
      featureId: 'f1',
      projectPath: '/p',
      oldStatus: 'review',
      newStatus: 'done',
    });

    expect(publishFn).toHaveBeenCalledTimes(1);
    const arg = publishFn.mock.calls[0][0];
    // The topic must match what workstacean's consumers subscribe to.
    expect(arg.event).toBe('feature.completed');
    expect(arg.data.featureId).toBe('f1');
    expect(arg.data.featureTitle).toBe('Ship it');
    expect(arg.data.projectSlug).toBe('proj');
    expect(arg.data.branchName).toBe('feature/ship-it');
    expect(arg.data.previousStatus).toBe('review');
    expect(arg.data.completedAt).toBeDefined();
    expect(arg.data.sourceMeta.signalMetadata).toEqual({ sourceLinearIssueId: 'LIN-1' });
    expect(arg.data.sourceMeta.sourceChannel).toBe('github');
  });

  it('echoes feature.sourceMeta when present (manage_feature meta)', async () => {
    const feature = {
      id: 'f1',
      title: 'X',
      projectSlug: 'proj',
      sourceMeta: { sourceLinearIssueId: 'LIN-9', custom: true },
    };
    const { pub, publishFn } = makePublisher({ feature });
    await pub.handleStatusChange({ featureId: 'f1', projectPath: '/p', newStatus: 'done' });
    expect(publishFn.mock.calls[0][0].data.sourceMeta).toEqual({
      sourceLinearIssueId: 'LIN-9',
      custom: true,
    });
  });

  it('defaults projectSlug so the event is never dropped for lacking it', async () => {
    const { pub, publishFn } = makePublisher({ feature: { id: 'f1', title: 'X' } });
    await pub.handleStatusChange({ featureId: 'f1', projectPath: '/p', newStatus: 'done' });
    expect(publishFn.mock.calls[0][0].data.projectSlug).toBe('protomaker');
  });

  it('ignores non-terminal transitions', async () => {
    const { pub, publishFn } = makePublisher();
    await pub.handleStatusChange({
      featureId: 'f1',
      projectPath: '/p',
      oldStatus: 'backlog',
      newStatus: 'in_progress',
    });
    expect(publishFn).not.toHaveBeenCalled();
  });

  it('ignores transitions missing featureId or projectPath', async () => {
    const { pub, publishFn } = makePublisher();
    await pub.handleStatusChange({ featureId: '', projectPath: '/p', newStatus: 'done' });
    await pub.handleStatusChange({ featureId: 'f1', newStatus: 'done' });
    expect(publishFn).not.toHaveBeenCalled();
  });

  it('still publishes when the feature cannot be loaded', async () => {
    const featureLoader = { get: vi.fn().mockRejectedValue(new Error('gone')) };
    const publishFn = vi.fn().mockResolvedValue({ ok: true });
    const pub = new FeatureLifecycleBusPublisher(
      { on: vi.fn() } as never,
      featureLoader as never,
      publishFn,
      true
    );

    await pub.handleStatusChange({ featureId: 'f1', projectPath: '/p', newStatus: 'done' });

    expect(publishFn).toHaveBeenCalledTimes(1);
    expect(publishFn.mock.calls[0][0].data.featureTitle).toBeUndefined();
    expect(publishFn.mock.calls[0][0].data.featureId).toBe('f1');
  });

  it('does not throw when the publish fails', async () => {
    const publishFn = vi.fn().mockResolvedValue({ ok: false, error: 'unreachable' });
    const { pub } = makePublisher({ publishFn });
    await expect(
      pub.handleStatusChange({ featureId: 'f1', projectPath: '/p', newStatus: 'done' })
    ).resolves.toBeUndefined();
  });

  it('does not subscribe when disabled (WORKSTACEAN_URL unset)', () => {
    const onSpy = vi.fn();
    const pub = new FeatureLifecycleBusPublisher(
      { on: onSpy } as never,
      { get: vi.fn() } as never,
      vi.fn(),
      false
    );
    pub.start();
    expect(onSpy).not.toHaveBeenCalled();
  });

  it('publishes feature.failed with error on transition to blocked', async () => {
    const feature = {
      id: 'f2',
      title: 'Blocked feature',
      projectSlug: 'proj',
      prNumber: 42,
      statusChangeReason: 'CI checks failed after 3 retries',
    };
    const { pub, publishFn } = makePublisher({ feature });

    await pub.handleStatusChange({
      featureId: 'f2',
      projectPath: '/p',
      oldStatus: 'in_progress',
      newStatus: 'blocked',
      reason: 'CI checks failed after 3 retries',
    });

    expect(publishFn).toHaveBeenCalledTimes(1);
    const arg = publishFn.mock.calls[0][0];
    expect(arg.event).toBe('feature.failed');
    expect(arg.data.featureId).toBe('f2');
    expect(arg.data.prNumber).toBe(42);
    expect(arg.data.error).toBe('CI checks failed after 3 retries');
    expect(arg.data.failedAt).toBeDefined();
    expect(arg.data.previousStatus).toBe('in_progress');
  });

  it('publishes feature.failed on transition to escalated', async () => {
    const feature = { id: 'f3', title: 'Escalated feature', projectSlug: 'proj' };
    const { pub, publishFn } = makePublisher({ feature });

    await pub.handleStatusChange({
      featureId: 'f3',
      projectPath: '/p',
      oldStatus: 'review',
      newStatus: 'escalated',
    });

    expect(publishFn).toHaveBeenCalledTimes(1);
    expect(publishFn.mock.calls[0][0].event).toBe('feature.failed');
    expect(publishFn.mock.calls[0][0].data.featureId).toBe('f3');
  });

  it('includes prNumber in completed payload (no status/reason fields)', async () => {
    const feature = { id: 'f4', title: 'Completed with PR', projectSlug: 'proj', prNumber: 99 };
    const { pub, publishFn } = makePublisher({ feature });

    await pub.handleStatusChange({
      featureId: 'f4',
      projectPath: '/p',
      oldStatus: 'review',
      newStatus: 'done',
    });

    const arg = publishFn.mock.calls[0][0];
    expect(arg.event).toBe('feature.completed');
    expect(arg.data.prNumber).toBe(99);
    // completed carries no `error` field
    expect(arg.data.error).toBeUndefined();
  });

  it('falls back to payload reason for the error when feature has none', async () => {
    const feature = { id: 'f5', title: 'No reason on feature', projectSlug: 'proj' };
    const { pub, publishFn } = makePublisher({ feature });

    await pub.handleStatusChange({
      featureId: 'f5',
      projectPath: '/p',
      oldStatus: 'in_progress',
      newStatus: 'blocked',
      reason: 'from payload',
    });

    expect(publishFn.mock.calls[0][0].data.error).toBe('from payload');
  });
});
