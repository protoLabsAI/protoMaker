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
  it('publishes protomaker.feature.completed on transition to done', async () => {
    const feature = {
      id: 'f1',
      title: 'Ship it',
      projectSlug: 'proj',
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
    expect(arg.event).toBe('protomaker.feature.completed');
    expect(arg.data.featureId).toBe('f1');
    expect(arg.data.title).toBe('Ship it');
    expect(arg.data.projectSlug).toBe('proj');
    expect(arg.data.previousStatus).toBe('review');
    expect(arg.data.sourceMeta.signalMetadata).toEqual({ sourceLinearIssueId: 'LIN-1' });
    expect(arg.data.sourceMeta.sourceChannel).toBe('github');
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

  it('still publishes (with empty sourceMeta) when the feature cannot be loaded', async () => {
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
    expect(publishFn.mock.calls[0][0].data.title).toBeUndefined();
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

  it('publishes protomaker.feature.failed on transition to blocked', async () => {
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
    expect(arg.event).toBe('protomaker.feature.failed');
    expect(arg.data.featureId).toBe('f2');
    expect(arg.data.status).toBe('blocked');
    expect(arg.data.prNumber).toBe(42);
    expect(arg.data.reason).toBe('CI checks failed after 3 retries');
    expect(arg.data.previousStatus).toBe('in_progress');
  });

  it('publishes protomaker.feature.failed on transition to escalated', async () => {
    const feature = {
      id: 'f3',
      title: 'Escalated feature',
      projectSlug: 'proj',
    };
    const { pub, publishFn } = makePublisher({ feature });

    await pub.handleStatusChange({
      featureId: 'f3',
      projectPath: '/p',
      oldStatus: 'review',
      newStatus: 'escalated',
    });

    expect(publishFn).toHaveBeenCalledTimes(1);
    const arg = publishFn.mock.calls[0][0];
    expect(arg.event).toBe('protomaker.feature.failed');
    expect(arg.data.featureId).toBe('f3');
    expect(arg.data.status).toBe('escalated');
  });

  it('includes prNumber and reason in completed event payload', async () => {
    const feature = {
      id: 'f4',
      title: 'Completed with PR',
      projectSlug: 'proj',
      prNumber: 99,
      statusChangeReason: 'Workflow completed',
    };
    const { pub, publishFn } = makePublisher({ feature });

    await pub.handleStatusChange({
      featureId: 'f4',
      projectPath: '/p',
      oldStatus: 'review',
      newStatus: 'done',
    });

    expect(publishFn).toHaveBeenCalledTimes(1);
    const arg = publishFn.mock.calls[0][0];
    expect(arg.event).toBe('protomaker.feature.completed');
    expect(arg.data.prNumber).toBe(99);
    expect(arg.data.reason).toBe('Workflow completed');
    expect(arg.data.status).toBe('done');
  });

  it('falls back to payload reason when feature has no statusChangeReason', async () => {
    const feature = {
      id: 'f5',
      title: 'No reason on feature',
      projectSlug: 'proj',
    };
    const { pub, publishFn } = makePublisher({ feature });

    await pub.handleStatusChange({
      featureId: 'f5',
      projectPath: '/p',
      oldStatus: 'in_progress',
      newStatus: 'blocked',
      reason: 'from payload',
    });

    expect(publishFn).toHaveBeenCalledTimes(1);
    const arg = publishFn.mock.calls[0][0];
    expect(arg.data.reason).toBe('from payload');
  });

  it('still publishes feature.failed when the feature cannot be loaded', async () => {
    const featureLoader = { get: vi.fn().mockRejectedValue(new Error('gone')) };
    const publishFn = vi.fn().mockResolvedValue({ ok: true });
    const pub = new FeatureLifecycleBusPublisher(
      { on: vi.fn() } as never,
      featureLoader as never,
      publishFn,
      true
    );

    await pub.handleStatusChange({
      featureId: 'f6',
      projectPath: '/p',
      oldStatus: 'in_progress',
      newStatus: 'blocked',
      reason: 'max retries exceeded',
    });

    expect(publishFn).toHaveBeenCalledTimes(1);
    const arg = publishFn.mock.calls[0][0];
    expect(arg.event).toBe('protomaker.feature.failed');
    expect(arg.data.featureId).toBe('f6');
    expect(arg.data.reason).toBe('max retries exceeded');
    expect(arg.data.prNumber).toBeUndefined();
  });
});
