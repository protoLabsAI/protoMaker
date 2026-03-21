import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  GatewayActionExecutor,
  type GatewayActionRecommendation,
  type GatewayActionResult,
} from '@/services/ava-gateway-service.js';
import { createEventEmitter } from '@/lib/events.js';

describe('GatewayActionExecutor', () => {
  let events: ReturnType<typeof createEventEmitter>;
  let auditLog: GatewayActionResult[];
  let executor: GatewayActionExecutor;

  beforeEach(() => {
    events = createEventEmitter();
    auditLog = [];
    executor = new GatewayActionExecutor(events, auditLog);
  });

  describe('budget enforcement', () => {
    it('executes at most 3 recommendations per cycle', async () => {
      const recommendations: GatewayActionRecommendation[] = [
        { type: 'unblock_feature', featureId: 'f1', reason: 'blocked', priority: 5 },
        { type: 'unblock_feature', featureId: 'f2', reason: 'blocked', priority: 4 },
        { type: 'unblock_feature', featureId: 'f3', reason: 'blocked', priority: 3 },
        { type: 'unblock_feature', featureId: 'f4', reason: 'blocked', priority: 2 },
        { type: 'unblock_feature', featureId: 'f5', reason: 'blocked', priority: 1 },
      ];

      const results = await executor.execute(recommendations);

      expect(results).toHaveLength(3);
    });

    it('selects highest priority recommendations when over budget', async () => {
      const recommendations: GatewayActionRecommendation[] = [
        { type: 'unblock_feature', featureId: 'low', reason: 'blocked', priority: 1 },
        { type: 'unblock_feature', featureId: 'high', reason: 'blocked', priority: 10 },
        { type: 'unblock_feature', featureId: 'mid', reason: 'blocked', priority: 5 },
        { type: 'unblock_feature', featureId: 'also-low', reason: 'blocked', priority: 2 },
      ];

      const results = await executor.execute(recommendations);

      expect(results).toHaveLength(3);
      const executedIds = results.map((r) => r.featureId);
      expect(executedIds).toContain('high');
      expect(executedIds).toContain('mid');
      expect(executedIds).toContain('also-low');
      expect(executedIds).not.toContain('low');
    });

    it('executes all recommendations when under budget', async () => {
      const recommendations: GatewayActionRecommendation[] = [
        { type: 'unblock_feature', featureId: 'f1', reason: 'blocked', priority: 5 },
        { type: 'retry_agent', featureId: 'f2', reason: 'stale', priority: 3 },
      ];

      const results = await executor.execute(recommendations);

      expect(results).toHaveLength(2);
    });

    it('returns empty array for empty recommendations', async () => {
      const results = await executor.execute([]);

      expect(results).toHaveLength(0);
    });
  });

  describe('action types', () => {
    it('emits gateway:action:unblock-feature for unblock_feature type', async () => {
      const emitSpy = vi.spyOn(events, 'emit');
      const rec: GatewayActionRecommendation = {
        type: 'unblock_feature',
        featureId: 'feat-123',
        reason: 'Feature is blocked',
        priority: 8,
      };

      await executor.execute([rec]);

      expect(emitSpy).toHaveBeenCalledWith('gateway:action:unblock-feature', {
        featureId: 'feat-123',
      });
    });

    it('emits gateway:action:retry-agent for retry_agent type', async () => {
      const emitSpy = vi.spyOn(events, 'emit');
      const rec: GatewayActionRecommendation = {
        type: 'retry_agent',
        featureId: 'feat-456',
        reason: 'Agent stalled',
        priority: 6,
      };

      await executor.execute([rec]);

      expect(emitSpy).toHaveBeenCalledWith('gateway:action:retry-agent', {
        featureId: 'feat-456',
      });
    });

    it('emits gateway:action:merge-pr for merge_ready_pr type', async () => {
      const emitSpy = vi.spyOn(events, 'emit');
      const rec: GatewayActionRecommendation = {
        type: 'merge_ready_pr',
        featureId: 'feat-789',
        reason: 'PR ready to merge',
        priority: 7,
      };

      await executor.execute([rec]);

      expect(emitSpy).toHaveBeenCalledWith('gateway:action:merge-pr', {
        featureId: 'feat-789',
      });
    });

    it('returns success result for each action type', async () => {
      const recommendations: GatewayActionRecommendation[] = [
        { type: 'unblock_feature', featureId: 'f1', reason: 'blocked', priority: 8 },
        { type: 'retry_agent', featureId: 'f2', reason: 'stale', priority: 6 },
        { type: 'merge_ready_pr', featureId: 'f3', reason: 'ready', priority: 7 },
      ];

      const results = await executor.execute(recommendations);

      expect(results).toHaveLength(3);
      for (const result of results) {
        expect(result.success).toBe(true);
      }
    });
  });

  describe('audit logging', () => {
    it('appends each executed action to the audit log', async () => {
      const recommendations: GatewayActionRecommendation[] = [
        { type: 'unblock_feature', featureId: 'f1', reason: 'blocked', priority: 8 },
        { type: 'retry_agent', featureId: 'f2', reason: 'stale', priority: 6 },
      ];

      await executor.execute(recommendations);

      expect(auditLog).toHaveLength(2);
    });

    it('audit log entries contain correct fields', async () => {
      const rec: GatewayActionRecommendation = {
        type: 'unblock_feature',
        featureId: 'feat-123',
        reason: 'Feature blocked for 3 days',
        priority: 8,
      };

      await executor.execute([rec]);

      expect(auditLog).toHaveLength(1);
      const entry = auditLog[0];
      expect(entry.type).toBe('unblock_feature');
      expect(entry.featureId).toBe('feat-123');
      expect(entry.success).toBe(true);
      expect(entry.reason).toBe('Feature blocked for 3 days');
      expect(entry.timestamp).toBeDefined();
      expect(() => new Date(entry.timestamp)).not.toThrow();
    });

    it('audit log is append-only across multiple execute calls', async () => {
      const rec1: GatewayActionRecommendation = {
        type: 'unblock_feature',
        featureId: 'f1',
        reason: 'blocked',
        priority: 8,
      };
      const rec2: GatewayActionRecommendation = {
        type: 'retry_agent',
        featureId: 'f2',
        reason: 'stale',
        priority: 6,
      };

      await executor.execute([rec1]);
      await executor.execute([rec2]);

      expect(auditLog).toHaveLength(2);
      expect(auditLog[0].featureId).toBe('f1');
      expect(auditLog[1].featureId).toBe('f2');
    });
  });

  describe('event emission', () => {
    it('emits gateway:action-executed for each action', async () => {
      const emitSpy = vi.spyOn(events, 'emit');
      const recommendations: GatewayActionRecommendation[] = [
        { type: 'unblock_feature', featureId: 'f1', reason: 'blocked', priority: 8 },
        { type: 'retry_agent', featureId: 'f2', reason: 'stale', priority: 6 },
      ];

      await executor.execute(recommendations);

      const actionExecutedCalls = emitSpy.mock.calls.filter(
        ([type]) => type === 'gateway:action-executed'
      );
      expect(actionExecutedCalls).toHaveLength(2);
    });

    it('gateway:action-executed payload matches result', async () => {
      const emitSpy = vi.spyOn(events, 'emit');
      const rec: GatewayActionRecommendation = {
        type: 'merge_ready_pr',
        featureId: 'feat-merge',
        reason: 'PR is ready',
        priority: 7,
      };

      await executor.execute([rec]);

      const actionExecutedCall = emitSpy.mock.calls.find(
        ([type]) => type === 'gateway:action-executed'
      );
      expect(actionExecutedCall).toBeDefined();
      const payload = actionExecutedCall![1] as GatewayActionResult;
      expect(payload.type).toBe('merge_ready_pr');
      expect(payload.featureId).toBe('feat-merge');
      expect(payload.success).toBe(true);
      expect(payload.reason).toBe('PR is ready');
      expect(payload.timestamp).toBeDefined();
    });

    it('emits both type-specific and gateway:action-executed events per action', async () => {
      const emitSpy = vi.spyOn(events, 'emit');
      const rec: GatewayActionRecommendation = {
        type: 'unblock_feature',
        featureId: 'f1',
        reason: 'blocked',
        priority: 8,
      };

      await executor.execute([rec]);

      const types = emitSpy.mock.calls.map(([type]) => type);
      expect(types).toContain('gateway:action:unblock-feature');
      expect(types).toContain('gateway:action-executed');
    });
  });

  describe('end-to-end heartbeat flow', () => {
    it('processes mixed action types within budget in priority order', async () => {
      const emitSpy = vi.spyOn(events, 'emit');
      const recommendations: GatewayActionRecommendation[] = [
        { type: 'unblock_feature', featureId: 'blocked-1', reason: 'blocked 10 days', priority: 8 },
        { type: 'merge_ready_pr', featureId: 'pr-1', reason: 'PR #42 ready', priority: 7 },
        { type: 'retry_agent', featureId: 'stale-1', reason: 'stale 8 days', priority: 6 },
        { type: 'unblock_feature', featureId: 'blocked-2', reason: 'blocked 7 days', priority: 5 },
      ];

      const results = await executor.execute(recommendations);

      // Budget enforced: max 3
      expect(results).toHaveLength(3);

      // Correct priority selection
      const ids = results.map((r) => r.featureId);
      expect(ids).toContain('blocked-1');
      expect(ids).toContain('pr-1');
      expect(ids).toContain('stale-1');
      expect(ids).not.toContain('blocked-2');

      // All succeeded
      expect(results.every((r) => r.success)).toBe(true);

      // Audit log populated
      expect(auditLog).toHaveLength(3);

      // Events emitted for each action (type-specific + gateway:action-executed)
      const actionExecutedCalls = emitSpy.mock.calls.filter(
        ([type]) => type === 'gateway:action-executed'
      );
      expect(actionExecutedCalls).toHaveLength(3);
    });
  });
});
