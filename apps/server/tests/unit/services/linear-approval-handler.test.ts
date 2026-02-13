import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LinearApprovalHandler } from '../../../src/services/linear-approval-handler.js';
import type { EventEmitter } from '../../../src/lib/events.js';
import type { SettingsService } from '../../../src/services/settings-service.js';

describe('LinearApprovalHandler', () => {
  let handler: LinearApprovalHandler;
  let mockEmitter: EventEmitter;
  let mockSettingsService: SettingsService;
  let emitSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    handler = new LinearApprovalHandler();
    emitSpy = vi.fn();
    mockEmitter = { emit: emitSpy, on: vi.fn(), off: vi.fn() } as any;
    mockSettingsService = {
      getProjectSettings: vi.fn().mockResolvedValue({
        integrations: {
          linear: {
            approvalStates: ['Approved', 'Ready for Planning'],
          },
        },
      }),
    } as any;

    handler.initialize(mockSettingsService, mockEmitter);
  });

  afterEach(() => {
    handler.stop();
  });

  describe('isApprovalState', () => {
    it('should detect configured approval states', async () => {
      expect(await handler.isApprovalState('Approved', '/test')).toBe(true);
      expect(await handler.isApprovalState('Ready for Planning', '/test')).toBe(true);
    });

    it('should be case-insensitive', async () => {
      expect(await handler.isApprovalState('approved', '/test')).toBe(true);
      expect(await handler.isApprovalState('APPROVED', '/test')).toBe(true);
    });

    it('should reject non-approval states', async () => {
      expect(await handler.isApprovalState('In Progress', '/test')).toBe(false);
      expect(await handler.isApprovalState('Done', '/test')).toBe(false);
      expect(await handler.isApprovalState('Backlog', '/test')).toBe(false);
    });

    it('should use default states when settings unavailable', async () => {
      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue(null as any);
      expect(await handler.isApprovalState('Approved', '/test')).toBe(true);
      expect(await handler.isApprovalState('Ready for Planning', '/test')).toBe(true);
    });
  });

  describe('onIssueStateChange', () => {
    it('should emit linear:approval:detected for approval states', async () => {
      await handler.onIssueStateChange('issue-123', 'Approved', '/test', {
        title: 'Feature Request',
        description: 'Build this feature',
        priority: 2,
        team: { id: 'team-1', name: 'Engineering' },
      });

      expect(emitSpy).toHaveBeenCalledWith(
        'linear:approval:detected',
        expect.objectContaining({
          issueId: 'issue-123',
          title: 'Feature Request',
          description: 'Build this feature',
          approvalState: 'Approved',
          priority: 2,
          team: { id: 'team-1', name: 'Engineering' },
        })
      );
    });

    it('should not emit for non-approval states', async () => {
      await handler.onIssueStateChange('issue-456', 'In Progress', '/test', {
        title: 'Some Issue',
      });

      expect(emitSpy).not.toHaveBeenCalled();
    });

    it('should not emit when handler is stopped', async () => {
      handler.stop();

      await handler.onIssueStateChange('issue-789', 'Approved', '/test', {
        title: 'Feature',
      });

      expect(emitSpy).not.toHaveBeenCalled();
    });

    it('should include detectedAt timestamp', async () => {
      const before = new Date().toISOString();

      await handler.onIssueStateChange('issue-abc', 'Approved', '/test', {
        title: 'Feature',
      });

      const call = emitSpy.mock.calls[0];
      expect(call[1].detectedAt).toBeDefined();
      expect(new Date(call[1].detectedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(before).getTime()
      );
    });

    it('should use custom approval states from settings', async () => {
      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue({
        integrations: {
          linear: {
            approvalStates: ['Verified', 'Ship It'],
          },
        },
      } as any);

      await handler.onIssueStateChange('issue-custom', 'Ship It', '/test', {
        title: 'Custom Approval',
      });

      expect(emitSpy).toHaveBeenCalledWith(
        'linear:approval:detected',
        expect.objectContaining({
          issueId: 'issue-custom',
          approvalState: 'Ship It',
        })
      );

      // Default states should no longer match
      emitSpy.mockClear();
      await handler.onIssueStateChange('issue-default', 'Approved', '/test', {
        title: 'Default State',
      });

      expect(emitSpy).not.toHaveBeenCalled();
    });
  });
});
