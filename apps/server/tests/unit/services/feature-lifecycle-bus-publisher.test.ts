import { describe, it, expect, vi } from 'vitest';
import {
  FeatureLifecycleBusPublisher,
  deriveBlockedKind,
  mapFailureCategoryToKind,
} from '@/services/feature-lifecycle-bus-publisher.js';

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

  it('publishes kinded feature.blocked (not feature.failed) on transition to blocked', async () => {
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
    // Greenfield: blocked emits ONLY feature.blocked, never feature.failed.
    expect(arg.event).toBe('feature.blocked');
    expect(arg.data.featureId).toBe('f2');
    expect(arg.data.prNumber).toBe(42);
    expect(arg.data.projectPath).toBe('/p');
    // feature.blocked carries `reason` + `kind`, not the `error` field.
    expect(arg.data.reason).toBe('CI checks failed after 3 retries');
    expect(arg.data.error).toBeUndefined();
    // "CI checks failed after 3 retries" → ci_failure (the dominant signal;
    // "3 retries" is not a retries-exhausted phrasing). Router dispatches Roxy.
    expect(arg.data.kind).toBe('ci_failure');
    expect(arg.data.blockedAt).toBeDefined();
    expect(arg.data.failedAt).toBeUndefined();
    expect(arg.data.previousStatus).toBe('in_progress');
  });

  it('derives the kind discriminator from the block reason', async () => {
    const cases: Array<[string, string | undefined]> = [
      ['Worktree has uncommitted changes — manual review needed', 'worktree_safety'],
      ['Refusing to fall back to main working tree', 'worktree_safety'],
      ['Cost budget exceeded for this feature', 'cost_exceeded'],
      ['API rate limit reached (429)', 'rate_limit'],
      ['Usage quota exhausted', 'quota'],
      ['Max PR iterations exceeded (5)', 'retries_exhausted'],
      ['Execution deadline exceeded — timed out', 'runtime_exceeded'],
      ['Reviewer requested changes on the PR', 'changes_requested'],
      ['Worktree has unresolved merge conflicts', 'merge_conflict'],
      ['Fresh-eyes review BLOCK: blocked by automated review', 'ci_failure'],
      ['Blocked by its upstream dependency', 'dependency_unsatisfied'],
      ['Some entirely novel failure nobody mapped', undefined],
    ];

    for (const [reason, expectedKind] of cases) {
      const publishFn = vi.fn().mockResolvedValue({ ok: true });
      const { pub } = makePublisher({
        feature: { id: 'fk', title: 'k', projectSlug: 'proj', statusChangeReason: reason },
        publishFn,
      });
      await pub.handleStatusChange({
        featureId: 'fk',
        projectPath: '/p',
        oldStatus: 'in_progress',
        newStatus: 'blocked',
      });
      const arg = publishFn.mock.calls[0][0];
      expect(arg.event).toBe('feature.blocked');
      expect(arg.data.kind, `reason="${reason}"`).toBe(expectedKind);
    }
  });

  it('publishes feature.unblocked on recovery (blocked -> in_progress)', async () => {
    const feature = { id: 'fu', title: 'Recovered', projectSlug: 'proj', projectPath: '/p' };
    const { pub, publishFn } = makePublisher({ feature });

    await pub.handleStatusChange({
      featureId: 'fu',
      projectPath: '/p',
      oldStatus: 'blocked',
      newStatus: 'in_progress',
    });

    expect(publishFn).toHaveBeenCalledTimes(1);
    const arg = publishFn.mock.calls[0][0];
    expect(arg.event).toBe('feature.unblocked');
    expect(arg.data.featureId).toBe('fu');
    expect(arg.data.projectSlug).toBe('proj');
    expect(arg.data.previousStatus).toBe('blocked');
    expect(arg.data.newStatus).toBe('in_progress');
    expect(arg.data.unblockedAt).toBeDefined();
    // recovery is not a failure/terminal — carries no error/kind/reason
    expect(arg.data.error).toBeUndefined();
    expect(arg.data.kind).toBeUndefined();
  });

  it('publishes feature.unblocked for blocked -> backlog and blocked -> review', async () => {
    for (const newStatus of ['backlog', 'review']) {
      const publishFn = vi.fn().mockResolvedValue({ ok: true });
      const { pub } = makePublisher({
        feature: { id: 'fu', title: 'r', projectSlug: 'proj' },
        publishFn,
      });
      await pub.handleStatusChange({
        featureId: 'fu',
        projectPath: '/p',
        oldStatus: 'blocked',
        newStatus,
      });
      expect(publishFn.mock.calls[0][0].event, `newStatus=${newStatus}`).toBe('feature.unblocked');
    }
  });

  it('does NOT emit feature.unblocked for blocked -> done (that is feature.completed)', async () => {
    const { pub, publishFn } = makePublisher({
      feature: { id: 'fd', title: 'd', projectSlug: 'p' },
    });
    await pub.handleStatusChange({
      featureId: 'fd',
      projectPath: '/p',
      oldStatus: 'blocked',
      newStatus: 'done',
    });
    expect(publishFn).toHaveBeenCalledTimes(1);
    expect(publishFn.mock.calls[0][0].event).toBe('feature.completed');
  });

  it('does NOT emit feature.unblocked for an active->active transition (only from blocked)', async () => {
    const { pub, publishFn } = makePublisher({
      feature: { id: 'fa', title: 'a', projectSlug: 'p' },
    });
    await pub.handleStatusChange({
      featureId: 'fa',
      projectPath: '/p',
      oldStatus: 'backlog',
      newStatus: 'in_progress',
    });
    expect(publishFn).not.toHaveBeenCalled();
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

  it('falls back to payload reason on feature.blocked when feature has none', async () => {
    const feature = { id: 'f5', title: 'No reason on feature', projectSlug: 'proj' };
    const { pub, publishFn } = makePublisher({ feature });

    await pub.handleStatusChange({
      featureId: 'f5',
      projectPath: '/p',
      oldStatus: 'in_progress',
      newStatus: 'blocked',
      reason: 'from payload',
    });

    const arg = publishFn.mock.calls[0][0];
    expect(arg.event).toBe('feature.blocked');
    expect(arg.data.reason).toBe('from payload');
  });

  it('falls back to payload reason for the error on feature.failed (escalated)', async () => {
    const feature = { id: 'f6', title: 'No reason on feature', projectSlug: 'proj' };
    const { pub, publishFn } = makePublisher({ feature });

    await pub.handleStatusChange({
      featureId: 'f6',
      projectPath: '/p',
      oldStatus: 'review',
      newStatus: 'escalated',
      reason: 'from payload',
    });

    const arg = publishFn.mock.calls[0][0];
    expect(arg.event).toBe('feature.failed');
    expect(arg.data.error).toBe('from payload');
  });

  // ---- mapFailureCategoryToKind exhaustiveness ----

  describe('mapFailureCategoryToKind', () => {
    it('maps every FailureCategory value correctly', () => {
      // Direct mappings
      expect(mapFailureCategoryToKind('rate_limit')).toBe('rate_limit');
      expect(mapFailureCategoryToKind('quota')).toBe('quota');
      expect(mapFailureCategoryToKind('test_failure')).toBe('ci_failure');
      expect(mapFailureCategoryToKind('merge_conflict')).toBe('merge_conflict');
      expect(mapFailureCategoryToKind('retry_exhausted')).toBe('retries_exhausted');

      // Must return undefined — these do NOT have direct workstacean equivalents
      expect(mapFailureCategoryToKind('transient')).toBeUndefined();
      expect(mapFailureCategoryToKind('validation')).toBeUndefined();
      expect(mapFailureCategoryToKind('tool_error')).toBeUndefined();
      expect(mapFailureCategoryToKind('authentication')).toBeUndefined();
      expect(mapFailureCategoryToKind('unknown')).toBeUndefined();

      // CRITICAL: 'dependency' must NOT map to 'dependency_unsatisfied'
      // protoMaker 'dependency' = npm/package missing (Roxy CAN fix)
      // workstacean 'dependency_unsatisfied' = feature-DAG dep (self-heals, ignored)
      expect(mapFailureCategoryToKind('dependency')).not.toBe('dependency_unsatisfied');
      expect(mapFailureCategoryToKind('dependency')).toBeUndefined();
    });

    it('returns undefined for unknown future categories (safe fail-open)', () => {
      expect(mapFailureCategoryToKind('some_future_category')).toBeUndefined();
    });
  });

  // ---- Structured category preference chain ----

  describe('structured failureClassification preference', () => {
    it('prefers structured category over keyword fallback when category maps', async () => {
      const feature = {
        id: 'f1',
        title: 'Test',
        projectSlug: 'proj',
        statusChangeReason: 'Something about rate limits that would match keyword',
        failureClassification: {
          category: 'test_failure',
          confidence: 0.9,
          recoveryStrategy: { type: 'retry' },
          retryable: true,
          timestamp: new Date().toISOString(),
        },
      };
      const { pub, publishFn } = makePublisher({ feature });

      await pub.handleStatusChange({
        featureId: 'f1',
        projectPath: '/p',
        oldStatus: 'in_progress',
        newStatus: 'blocked',
      });

      const arg = publishFn.mock.calls[0][0];
      // Structured 'test_failure' → 'ci_failure', NOT keyword-derived 'rate_limit'
      expect(arg.event).toBe('feature.blocked');
      expect(arg.data.kind).toBe('ci_failure');
    });

    it('falls back to keyword when structured category is absent', async () => {
      const feature = {
        id: 'f1',
        title: 'Test',
        projectSlug: 'proj',
        statusChangeReason: 'CI checks failed after 3 retries',
        // No failureClassification
      };
      const { pub, publishFn } = makePublisher({ feature });

      await pub.handleStatusChange({
        featureId: 'f1',
        projectPath: '/p',
        oldStatus: 'in_progress',
        newStatus: 'blocked',
      });

      const arg = publishFn.mock.calls[0][0];
      expect(arg.event).toBe('feature.blocked');
      expect(arg.data.kind).toBe('ci_failure');
    });

    it('falls back to keyword when structured category maps to undefined', async () => {
      const feature = {
        id: 'f1',
        title: 'Test',
        projectSlug: 'proj',
        statusChangeReason: 'CI checks failed after 3 retries',
        failureClassification: {
          category: 'unknown', // maps to undefined → should fall back to keyword
          confidence: 0.1,
          recoveryStrategy: { type: 'escalate_to_user' },
          retryable: false,
          timestamp: new Date().toISOString(),
        },
      };
      const { pub, publishFn } = makePublisher({ feature });

      await pub.handleStatusChange({
        featureId: 'f1',
        projectPath: '/p',
        oldStatus: 'in_progress',
        newStatus: 'blocked',
      });

      const arg = publishFn.mock.calls[0][0];
      expect(arg.event).toBe('feature.blocked');
      // 'unknown' → undefined from mapFailureCategoryToKind → falls back to keyword → 'ci_failure'
      expect(arg.data.kind).toBe('ci_failure');
    });

    it('end-to-end: failureClassification.category test_failure results in kind ci_failure', async () => {
      const feature = {
        id: 'f1',
        title: 'Test',
        projectSlug: 'proj',
        statusChangeReason: 'Tests failed for some reason',
        failureClassification: {
          category: 'test_failure',
          confidence: 0.95,
          recoveryStrategy: { type: 'retry_with_context' },
          retryable: true,
          timestamp: new Date().toISOString(),
        },
      };
      const { pub, publishFn } = makePublisher({ feature });

      await pub.handleStatusChange({
        featureId: 'f1',
        projectPath: '/p',
        oldStatus: 'in_progress',
        newStatus: 'blocked',
      });

      const arg = publishFn.mock.calls[0][0];
      expect(arg.event).toBe('feature.blocked');
      expect(arg.data.kind).toBe('ci_failure');
    });

    it('dependency category does NOT produce dependency_unsatisfied even with matching reason text', async () => {
      const feature = {
        id: 'f1',
        title: 'Test',
        projectSlug: 'proj',
        statusChangeReason: 'Missing npm dependency',
        failureClassification: {
          category: 'dependency',
          confidence: 0.9,
          recoveryStrategy: { type: 'retry' },
          retryable: true,
          timestamp: new Date().toISOString(),
        },
      };
      const { pub, publishFn } = makePublisher({ feature });

      await pub.handleStatusChange({
        featureId: 'f1',
        projectPath: '/p',
        oldStatus: 'in_progress',
        newStatus: 'blocked',
      });

      const arg = publishFn.mock.calls[0][0];
      expect(arg.event).toBe('feature.blocked');
      // 'dependency' → undefined from map, keyword fallback for "Missing npm dependency"
      // does NOT match the narrow feature-DAG pattern → kind is undefined
      expect(arg.data.kind).not.toBe('dependency_unsatisfied');
    });
  });
});
