/**
 * Unit tests for LinearApprovalBridge
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LinearApprovalBridge } from '@/services/linear-approval-bridge.js';
import type { ApprovalContext } from '@/services/linear-approval-handler.js';
import type { EventEmitter } from '@/lib/events.js';
import type { FeatureLoader } from '@/services/feature-loader.js';

// Mock the feature classifier
vi.mock('@/services/feature-classifier.js', () => ({
  classifyFeature: vi.fn(),
}));

import { classifyFeature } from '@/services/feature-classifier.js';

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
    findByLinearIssueId: vi.fn().mockResolvedValue(null),
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

  describe('changes-requested handling', () => {
    it('blocks board feature when linear:changes-requested:detected fires', async () => {
      vi.mocked(featureLoader.findByLinearIssueId).mockResolvedValueOnce({
        id: 'feature-existing-456',
        title: 'Existing feature',
        status: 'in_progress',
      } as any);

      bridge.start();

      events.emit('linear:changes-requested:detected', {
        issueId: 'issue-cr-001',
        identifier: 'ENG-100',
        title: 'Feature needing changes',
        approvalState: 'Changes Requested',
        detectedAt: new Date().toISOString(),
      } as ApprovalContext);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(featureLoader.findByLinearIssueId).toHaveBeenCalledWith(
        expect.any(String),
        'issue-cr-001'
      );

      expect(featureLoader.update).toHaveBeenCalledWith(
        expect.any(String),
        'feature-existing-456',
        expect.objectContaining({
          status: 'blocked',
          statusChangeReason: 'Linear: Changes Requested',
        })
      );

      expect(events.emit).toHaveBeenCalledWith(
        'feature:blocked',
        expect.objectContaining({
          featureId: 'feature-existing-456',
          reason: 'Linear: Changes Requested',
          issueId: 'issue-cr-001',
          identifier: 'ENG-100',
          blockedAt: expect.any(String),
        })
      );
    });

    it('skips block when no board feature exists for Linear issue', async () => {
      vi.mocked(featureLoader.findByLinearIssueId).mockResolvedValueOnce(null);

      bridge.start();

      events.emit('linear:changes-requested:detected', {
        issueId: 'issue-no-feature',
        title: 'Unknown issue',
        approvalState: 'Changes Requested',
        detectedAt: new Date().toISOString(),
      } as ApprovalContext);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(featureLoader.update).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalledWith('feature:blocked', expect.anything());
    });

    it('does not process changes-requested when stopped', async () => {
      bridge.start();
      bridge.stop();

      events.emit('linear:changes-requested:detected', {
        issueId: 'issue-stopped',
        title: 'Should not process',
        approvalState: 'Changes Requested',
        detectedAt: new Date().toISOString(),
      } as ApprovalContext);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(featureLoader.findByLinearIssueId).not.toHaveBeenCalled();
    });
  });

  describe('agent classification and assignment', () => {
    const mockClassify = vi.mocked(classifyFeature);

    beforeEach(() => {
      mockClassify.mockReset();
    });

    it('auto-assigns role on high confidence (>=0.8)', async () => {
      mockClassify.mockResolvedValueOnce({
        role: 'frontend-engineer',
        confidence: 0.9,
        reasoning: 'React component work',
      });

      bridge.start();

      events.emit('linear:approval:detected', {
        issueId: 'issue-123',
        title: 'Add dashboard component',
        description: 'React dashboard',
        approvalState: 'Approved',
        priority: 3,
        detectedAt: '2026-02-13T12:00:00Z',
      } as ApprovalContext);

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(featureLoader.update).toHaveBeenCalledWith(
        expect.any(String),
        'feature-created-123',
        expect.objectContaining({
          assignedRole: 'frontend-engineer',
          routingSuggestion: expect.objectContaining({
            role: 'frontend-engineer',
            confidence: 0.9,
            autoAssigned: true,
          }),
        })
      );

      expect(events.emit).toHaveBeenCalledWith(
        'feature:agent-suggested',
        expect.objectContaining({
          featureId: 'feature-created-123',
          role: 'frontend-engineer',
          confidence: 0.9,
          autoAssigned: true,
        })
      );
    });

    it('suggests role on medium confidence (0.6-0.8)', async () => {
      mockClassify.mockResolvedValueOnce({
        role: 'devops-engineer',
        confidence: 0.7,
        reasoning: 'Possibly infrastructure related',
      });

      bridge.start();

      events.emit('linear:approval:detected', {
        issueId: 'issue-456',
        title: 'Update deployment config',
        approvalState: 'Approved',
        priority: 3,
        detectedAt: '2026-02-13T12:00:00Z',
      } as ApprovalContext);

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(featureLoader.update).toHaveBeenCalledWith(
        expect.any(String),
        'feature-created-123',
        expect.objectContaining({
          assignedRole: 'devops-engineer',
          routingSuggestion: expect.objectContaining({
            role: 'devops-engineer',
            confidence: 0.7,
            autoAssigned: false,
          }),
        })
      );

      expect(events.emit).toHaveBeenCalledWith(
        'feature:agent-suggested',
        expect.objectContaining({
          featureId: 'feature-created-123',
          role: 'devops-engineer',
          confidence: 0.7,
          autoAssigned: false,
        })
      );
    });

    it('skips assignment on low confidence (<0.6)', async () => {
      mockClassify.mockResolvedValueOnce({
        role: 'backend-engineer',
        confidence: 0.4,
        reasoning: 'Unclear scope',
      });

      bridge.start();

      events.emit('linear:approval:detected', {
        issueId: 'issue-789',
        title: 'Misc task',
        approvalState: 'Approved',
        priority: 3,
        detectedAt: '2026-02-13T12:00:00Z',
      } as ApprovalContext);

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(featureLoader.update).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalledWith('feature:agent-suggested', expect.anything());
    });

    it('does not block approval flow when classifier fails', async () => {
      mockClassify.mockRejectedValueOnce(new Error('API timeout'));

      bridge.start();

      events.emit('linear:approval:detected', {
        issueId: 'issue-err',
        title: 'Feature with classifier error',
        approvalState: 'Approved',
        priority: 3,
        detectedAt: '2026-02-13T12:00:00Z',
      } as ApprovalContext);

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Feature creation and ProjM event should still fire
      expect(featureLoader.create).toHaveBeenCalled();
      expect(events.emit).toHaveBeenCalledWith(
        'authority:pm-review-approved',
        expect.objectContaining({ featureId: 'feature-created-123' })
      );
    });

    it('emits feature:agent-suggested with correct payload at boundary (0.8)', async () => {
      mockClassify.mockResolvedValueOnce({
        role: 'backend-engineer',
        confidence: 0.8,
        reasoning: 'Exactly at threshold',
      });

      bridge.start();

      events.emit('linear:approval:detected', {
        issueId: 'issue-boundary',
        title: 'API endpoint',
        approvalState: 'Approved',
        priority: 3,
        detectedAt: '2026-02-13T12:00:00Z',
      } as ApprovalContext);

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(events.emit).toHaveBeenCalledWith(
        'feature:agent-suggested',
        expect.objectContaining({
          featureId: 'feature-created-123',
          role: 'backend-engineer',
          confidence: 0.8,
          reasoning: 'Exactly at threshold',
          autoAssigned: true,
          suggestedAt: expect.any(String),
        })
      );
    });
  });
});
