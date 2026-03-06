/**
 * EventLedgerService tests — verifies that all 13 lifecycle event types
 * produce correctly-shaped ledger entries with proper correlation IDs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventLedgerService } from '@/services/event-ledger-service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type SubscribeCallback = (type: string, payload: unknown) => void;

function makeMockEvents() {
  let listener: SubscribeCallback | null = null;

  const subscribe = vi.fn((cb: SubscribeCallback) => {
    listener = cb;
    return () => {
      listener = null;
    };
  });

  const emit = (type: string, payload: unknown) => {
    listener?.(type, payload);
  };

  return { subscribe, emit };
}

function makeService() {
  // Use an in-memory stub — we spy on append() so no real FS writes happen
  const service = new EventLedgerService('/tmp/test-ledger');
  const appendSpy = vi.spyOn(service, 'append');
  return { service, appendSpy };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EventLedgerService.subscribeToLifecycleEvents', () => {
  let mockEvents: ReturnType<typeof makeMockEvents>;
  let service: EventLedgerService;
  let appendSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockEvents = makeMockEvents();
    ({ service, appendSpy } = makeService());
    service.subscribeToLifecycleEvents(mockEvents as never);
  });

  // -------------------------------------------------------------------------
  // feature:status-changed
  // -------------------------------------------------------------------------

  it('feature:status-changed — produces ledger entry with featureId and from/to/reason', () => {
    mockEvents.emit('feature:status-changed', {
      featureId: 'feat-123',
      projectPath: '/some/path',
      previousStatus: 'backlog',
      newStatus: 'in_progress',
      statusChangeReason: 'Agent started',
    });

    expect(appendSpy).toHaveBeenCalledOnce();
    const call = appendSpy.mock.calls[0][0];
    expect(call.eventType).toBe('feature:status-changed');
    expect(call.correlationIds.featureId).toBe('feat-123');
    expect(call.payload).toMatchObject({
      from: 'backlog',
      to: 'in_progress',
      reason: 'Agent started',
    });
  });

  it('feature:status-changed — reason is undefined when not present', () => {
    mockEvents.emit('feature:status-changed', {
      featureId: 'feat-abc',
      previousStatus: 'backlog',
      newStatus: 'in_progress',
    });

    const call = appendSpy.mock.calls[0][0];
    expect(call.payload).toMatchObject({ from: 'backlog', to: 'in_progress' });
    expect((call.payload as Record<string, unknown>).reason).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // feature:started
  // -------------------------------------------------------------------------

  it('feature:started — produces ledger entry with featureId', () => {
    mockEvents.emit('feature:started', { featureId: 'feat-start', projectPath: '/path' });

    expect(appendSpy).toHaveBeenCalledOnce();
    const call = appendSpy.mock.calls[0][0];
    expect(call.eventType).toBe('feature:started');
    expect(call.correlationIds.featureId).toBe('feat-start');
  });

  // -------------------------------------------------------------------------
  // feature:completed
  // -------------------------------------------------------------------------

  it('feature:completed — produces ledger entry with featureId', () => {
    mockEvents.emit('feature:completed', {
      featureId: 'feat-done',
      featureTitle: 'My Feature',
      status: 'done',
    });

    expect(appendSpy).toHaveBeenCalledOnce();
    const call = appendSpy.mock.calls[0][0];
    expect(call.eventType).toBe('feature:completed');
    expect(call.correlationIds.featureId).toBe('feat-done');
  });

  // -------------------------------------------------------------------------
  // feature:error
  // -------------------------------------------------------------------------

  it('feature:error — produces ledger entry with featureId', () => {
    mockEvents.emit('feature:error', { featureId: 'feat-err', error: 'Timeout' });

    expect(appendSpy).toHaveBeenCalledOnce();
    const call = appendSpy.mock.calls[0][0];
    expect(call.eventType).toBe('feature:error');
    expect(call.correlationIds.featureId).toBe('feat-err');
  });

  // -------------------------------------------------------------------------
  // feature:pr-merged
  // -------------------------------------------------------------------------

  it('feature:pr-merged — produces ledger entry with featureId', () => {
    mockEvents.emit('feature:pr-merged', {
      featureId: 'feat-pr',
      prNumber: 42,
      branchName: 'feature/foo',
    });

    expect(appendSpy).toHaveBeenCalledOnce();
    const call = appendSpy.mock.calls[0][0];
    expect(call.eventType).toBe('feature:pr-merged');
    expect(call.correlationIds.featureId).toBe('feat-pr');
  });

  // -------------------------------------------------------------------------
  // lead-engineer:feature-processed
  // -------------------------------------------------------------------------

  it('lead-engineer:feature-processed — produces ledger entry with featureId', () => {
    mockEvents.emit('lead-engineer:feature-processed', {
      featureId: 'feat-le',
      finalState: 'REVIEW',
      outcome: 'success',
    });

    expect(appendSpy).toHaveBeenCalledOnce();
    const call = appendSpy.mock.calls[0][0];
    expect(call.eventType).toBe('lead-engineer:feature-processed');
    expect(call.correlationIds.featureId).toBe('feat-le');
  });

  // -------------------------------------------------------------------------
  // pipeline:state-entered
  // -------------------------------------------------------------------------

  it('pipeline:state-entered — produces ledger entry with featureId and fromState/toState', () => {
    mockEvents.emit('pipeline:state-entered', {
      featureId: 'feat-pipe',
      state: 'REVIEW',
      fromState: 'EXECUTE',
      timestamp: new Date().toISOString(),
    });

    expect(appendSpy).toHaveBeenCalledOnce();
    const call = appendSpy.mock.calls[0][0];
    expect(call.eventType).toBe('pipeline:state-entered');
    expect(call.correlationIds.featureId).toBe('feat-pipe');
    expect(call.payload).toMatchObject({ fromState: 'EXECUTE', toState: 'REVIEW' });
  });

  // -------------------------------------------------------------------------
  // milestone:completed
  // -------------------------------------------------------------------------

  it('milestone:completed — produces ledger entry with projectSlug and milestoneSlug', () => {
    mockEvents.emit('milestone:completed', {
      projectSlug: 'my-project',
      milestoneSlug: 'v1.0',
      milestoneTitle: 'Version 1.0',
      featureCount: 5,
    });

    expect(appendSpy).toHaveBeenCalledOnce();
    const call = appendSpy.mock.calls[0][0];
    expect(call.eventType).toBe('milestone:completed');
    expect(call.correlationIds.projectSlug).toBe('my-project');
    expect(call.correlationIds.milestoneSlug).toBe('v1.0');
  });

  // -------------------------------------------------------------------------
  // project:completed
  // -------------------------------------------------------------------------

  it('project:completed — produces ledger entry with projectSlug', () => {
    mockEvents.emit('project:completed', {
      projectSlug: 'proj-done',
      totalMilestones: 3,
      totalFeatures: 12,
    });

    expect(appendSpy).toHaveBeenCalledOnce();
    const call = appendSpy.mock.calls[0][0];
    expect(call.eventType).toBe('project:completed');
    expect(call.correlationIds.projectSlug).toBe('proj-done');
  });

  // -------------------------------------------------------------------------
  // project:lifecycle:launched
  // -------------------------------------------------------------------------

  it('project:lifecycle:launched — produces ledger entry with projectSlug', () => {
    mockEvents.emit('project:lifecycle:launched', {
      projectSlug: 'proj-launch',
      projectPath: '/path',
      featuresInBacklog: 8,
    });

    expect(appendSpy).toHaveBeenCalledOnce();
    const call = appendSpy.mock.calls[0][0];
    expect(call.eventType).toBe('project:lifecycle:launched');
    expect(call.correlationIds.projectSlug).toBe('proj-launch');
  });

  // -------------------------------------------------------------------------
  // ceremony:fired
  // -------------------------------------------------------------------------

  it('ceremony:fired — produces ledger entry with ceremonyType and projectSlug', () => {
    mockEvents.emit('ceremony:fired', {
      type: 'standup',
      projectSlug: 'proj-ceremony',
      milestoneSlug: 'ms-1',
      projectPath: '/path',
    });

    expect(appendSpy).toHaveBeenCalledOnce();
    const call = appendSpy.mock.calls[0][0];
    expect(call.eventType).toBe('ceremony:fired');
    expect(call.correlationIds.projectSlug).toBe('proj-ceremony');
    expect(call.correlationIds.milestoneSlug).toBe('ms-1');
    expect((call.payload as Record<string, unknown>).ceremonyType).toBe('standup');
  });

  it('ceremony:fired — milestoneSlug is optional', () => {
    mockEvents.emit('ceremony:fired', {
      type: 'project_retro',
      projectSlug: 'proj-retro',
      projectPath: '/path',
    });

    const call = appendSpy.mock.calls[0][0];
    expect(call.correlationIds.milestoneSlug).toBeUndefined();
    expect((call.payload as Record<string, unknown>).ceremonyType).toBe('project_retro');
  });

  // -------------------------------------------------------------------------
  // escalation:signal-received
  // -------------------------------------------------------------------------

  it('escalation:signal-received — produces ledger entry with featureId when present', () => {
    mockEvents.emit('escalation:signal-received', {
      featureId: 'feat-esc',
      signal: 'MAX_RETRIES_EXCEEDED',
    });

    expect(appendSpy).toHaveBeenCalledOnce();
    const call = appendSpy.mock.calls[0][0];
    expect(call.eventType).toBe('escalation:signal-received');
    expect(call.correlationIds.featureId).toBe('feat-esc');
  });

  it('escalation:signal-received — produces ledger entry without featureId when absent', () => {
    mockEvents.emit('escalation:signal-received', { signal: 'INFRA_ALERT' });

    expect(appendSpy).toHaveBeenCalledOnce();
    const call = appendSpy.mock.calls[0][0];
    expect(call.eventType).toBe('escalation:signal-received');
    expect(call.correlationIds.featureId).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // auto-mode:event (feature types only)
  // -------------------------------------------------------------------------

  it('auto-mode:event with feature_started type — produces ledger entry', () => {
    mockEvents.emit('auto-mode:event', {
      type: 'feature_started',
      featureId: 'feat-am',
      projectPath: '/path',
    });

    expect(appendSpy).toHaveBeenCalledOnce();
    const call = appendSpy.mock.calls[0][0];
    expect(call.eventType).toBe('auto-mode:event');
    expect(call.correlationIds.featureId).toBe('feat-am');
  });

  it('auto-mode:event with feature_completed type — produces ledger entry', () => {
    mockEvents.emit('auto-mode:event', {
      type: 'feature_completed',
      featureId: 'feat-am-done',
    });

    expect(appendSpy).toHaveBeenCalledOnce();
    const call = appendSpy.mock.calls[0][0];
    expect(call.correlationIds.featureId).toBe('feat-am-done');
  });

  it('auto-mode:event with non-feature type — is ignored', () => {
    mockEvents.emit('auto-mode:event', {
      type: 'auto_mode_progress',
      featureId: 'feat-x',
      message: 'Working...',
    });

    expect(appendSpy).not.toHaveBeenCalled();
  });

  it('auto-mode:event with no type — is ignored', () => {
    mockEvents.emit('auto-mode:event', { featureId: 'feat-x' });

    expect(appendSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Unrelated events are not persisted
  // -------------------------------------------------------------------------

  it('unrelated event types do not produce ledger entries', () => {
    mockEvents.emit('feature:deleted', { featureId: 'feat-del' });
    mockEvents.emit('board:reconciled', {});
    mockEvents.emit('ledger:record-written', { featureId: 'feat-x' });

    expect(appendSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Unsubscribe works
  // -------------------------------------------------------------------------

  it('unsubscribe stops ledger writes', () => {
    const events2 = makeMockEvents();
    const { service: svc2, appendSpy: spy2 } = makeService();
    const unsub = svc2.subscribeToLifecycleEvents(events2 as never);

    events2.emit('feature:completed', { featureId: 'before-unsub' });
    expect(spy2).toHaveBeenCalledOnce();

    unsub();
    spy2.mockClear();

    events2.emit('feature:completed', { featureId: 'after-unsub' });
    expect(spy2).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // All 13 event types are handled
  // -------------------------------------------------------------------------

  it('all 13 lifecycle event types produce at least one ledger entry', () => {
    const allEvents: Array<[string, Record<string, unknown>]> = [
      [
        'feature:status-changed',
        { featureId: 'f1', previousStatus: 'backlog', newStatus: 'in_progress' },
      ],
      ['feature:started', { featureId: 'f2' }],
      ['feature:completed', { featureId: 'f3' }],
      ['feature:error', { featureId: 'f4' }],
      ['feature:pr-merged', { featureId: 'f5' }],
      ['lead-engineer:feature-processed', { featureId: 'f6' }],
      ['pipeline:state-entered', { featureId: 'f7', state: 'REVIEW', fromState: 'EXECUTE' }],
      ['milestone:completed', { projectSlug: 'proj', milestoneSlug: 'ms-1' }],
      ['project:completed', { projectSlug: 'proj' }],
      ['project:lifecycle:launched', { projectSlug: 'proj' }],
      ['ceremony:fired', { type: 'standup', projectSlug: 'proj' }],
      ['escalation:signal-received', { featureId: 'f11' }],
      ['auto-mode:event', { type: 'feature_started', featureId: 'f12' }],
    ];

    const newEvents = makeMockEvents();
    const { service: svc, appendSpy: spy } = makeService();
    svc.subscribeToLifecycleEvents(newEvents as never);

    for (const [eventType, payload] of allEvents) {
      newEvents.emit(eventType, payload);
    }

    expect(spy).toHaveBeenCalledTimes(13);
  });
});
