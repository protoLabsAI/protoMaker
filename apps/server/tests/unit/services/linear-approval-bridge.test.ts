/**
 * Unit tests for LinearApprovalBridge
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LinearApprovalBridge } from '@/services/linear-approval-bridge.js';
import type { ApprovalContext } from '@/services/linear-approval-handler.js';
import type { EventEmitter } from '@/lib/events.js';
import type { FeatureLoader } from '@/services/feature-loader.js';

function createMockEventEmitter(): EventEmitter {
  const subscribers: Array<(type: string, payload: unknown) => void> = [];
  return {
    emit: vi.fn((type: string, payload: unknown) => {
      for (const sub of subscribers) {
        sub(type, payload);
      }
    }),
    subscribe: vi.fn((callback: (type: string, payload: unknown) => void) => {
      subscribers.push(callback);
      return () => {
        const idx = subscribers.indexOf(callback);
        if (idx >= 0) subscribers.splice(idx, 1);
      };
    }),
  } as any;
}

function createMockFeatureLoader(): Partial<FeatureLoader> {
  return {
    create: vi.fn().mockResolvedValue({ id: 'feature-created-123' }),
    getAll: vi.fn(),
    load: vi.fn(),
    update: vi.fn(),
  };
}

describe('LinearApprovalBridge', () => {
  let events: EventEmitter;
  let featureLoader: Partial<FeatureLoader>;
  let bridge: LinearApprovalBridge;

  beforeEach(() => {
    vi.clearAllMocks();
    events = createMockEventEmitter();
    featureLoader = createMockFeatureLoader();
    bridge = new LinearApprovalBridge(events, featureLoader as FeatureLoader);
  });

  it('registers event listener on start', () => {
    bridge.start();
    expect(events.subscribe).toHaveBeenCalledWith(expect.any(Function));
  });

  it('creates epic feature from approval context', async () => {
    bridge.start();

    const approval: ApprovalContext = {
      issueId: 'issue-123',
      identifier: 'ENG-456',
      title: 'Add user dashboard',
      description: 'Build a dashboard for users to view their stats',
      approvalState: 'Approved',
      priority: 2,
      team: { id: 'team-1', name: 'Engineering' },
      detectedAt: '2026-02-13T12:00:00Z',
    };

    // Trigger the event
    events.emit('linear:approval:detected', approval);

    // Wait for async processing
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(featureLoader.create).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        title: 'Add user dashboard',
        status: 'backlog',
        workItemState: 'approved',
        isEpic: true,
        epicColor: '#6366f1',
        category: 'Linear Approvals',
        complexity: 'large', // priority 2 (high) → large
        linearIssueId: 'issue-123',
      })
    );
  });

  it('emits authority:pm-review-approved for ProjM', async () => {
    bridge.start();

    const approval: ApprovalContext = {
      issueId: 'issue-123',
      title: 'Test feature',
      approvalState: 'Approved',
      priority: 3,
      detectedAt: '2026-02-13T12:00:00Z',
    };

    events.emit('linear:approval:detected', approval);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(events.emit).toHaveBeenCalledWith('authority:pm-review-approved', {
      projectPath: expect.any(String),
      featureId: 'feature-created-123',
      complexity: 'medium', // priority 3 → medium
      milestones: [],
    });
  });

  it('emits linear:approval:bridged tracking event', async () => {
    bridge.start();

    const approval: ApprovalContext = {
      issueId: 'issue-123',
      identifier: 'ENG-456',
      title: 'Test feature',
      approvalState: 'Ready for Planning',
      detectedAt: '2026-02-13T12:00:00Z',
    };

    events.emit('linear:approval:detected', approval);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(events.emit).toHaveBeenCalledWith('linear:approval:bridged', {
      issueId: 'issue-123',
      identifier: 'ENG-456',
      featureId: 'feature-created-123',
      title: 'Test feature',
      complexity: 'medium',
      bridgedAt: expect.any(String),
    });
  });

  it('maps priority to complexity correctly', async () => {
    bridge.start();

    const testCases = [
      { priority: 1, expected: 'large' }, // urgent
      { priority: 2, expected: 'large' }, // high
      { priority: 3, expected: 'medium' }, // normal
      { priority: 4, expected: 'small' }, // low
      { priority: 0, expected: 'medium' }, // none
      { priority: undefined, expected: 'medium' }, // missing
    ];

    for (const { priority, expected } of testCases) {
      vi.mocked(featureLoader.create).mockResolvedValueOnce({ id: `feat-${priority}` } as any);

      events.emit('linear:approval:detected', {
        issueId: `issue-${priority}`,
        title: 'Test',
        approvalState: 'Approved',
        priority,
        detectedAt: new Date().toISOString(),
      } as ApprovalContext);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(featureLoader.create).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.objectContaining({ complexity: expected })
      );
    }
  });

  it('does not process events when stopped', async () => {
    bridge.start();
    bridge.stop();

    events.emit('linear:approval:detected', {
      issueId: 'issue-123',
      title: 'Should not process',
      approvalState: 'Approved',
      detectedAt: new Date().toISOString(),
    } as ApprovalContext);

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(featureLoader.create).not.toHaveBeenCalled();
  });

  it('handles feature creation failure gracefully', async () => {
    vi.mocked(featureLoader.create).mockRejectedValueOnce(new Error('DB error'));

    bridge.start();

    events.emit('linear:approval:detected', {
      issueId: 'issue-123',
      title: 'Will fail',
      approvalState: 'Approved',
      detectedAt: new Date().toISOString(),
    } as ApprovalContext);

    await new Promise((resolve) => setTimeout(resolve, 10));

    // Should not throw — error is caught and logged
    expect(featureLoader.create).toHaveBeenCalled();
    // No authority event should be emitted
    expect(events.emit).not.toHaveBeenCalledWith('authority:pm-review-approved', expect.anything());
  });

  it('includes Linear source info in epic description', async () => {
    bridge.start();

    events.emit('linear:approval:detected', {
      issueId: 'issue-123',
      identifier: 'ENG-789',
      title: 'Feature with context',
      description: 'Original description from Linear',
      approvalState: 'Approved',
      team: { id: 'team-1', name: 'Backend' },
      detectedAt: '2026-02-13T12:00:00Z',
    } as ApprovalContext);

    await new Promise((resolve) => setTimeout(resolve, 10));

    const createdDescription = vi.mocked(featureLoader.create).mock.calls[0][1].description;
    expect(createdDescription).toContain('Original description from Linear');
    expect(createdDescription).toContain('Linear issue ENG-789');
    expect(createdDescription).toContain('Backend');
  });
});
