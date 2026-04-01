/**
 * Integration tests for TopicBus event flows.
 *
 * Verifies that TopicBus and EventEmitter coexist without conflicts
 * and that migrated flows (feature status, PR events, maintenance sweeps)
 * publish to the expected topics.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TopicBus } from '@/lib/topic-bus.js';
import { createEventEmitter } from '@/lib/events.js';
import type { TopicMessage } from '@protolabsai/types';

describe('TopicBus integration flows', () => {
  let bus: TopicBus;

  beforeEach(() => {
    bus = new TopicBus();
  });

  describe('feature status change flow', () => {
    it('subscribers receive feature.status.{featureId} messages', () => {
      const received: TopicMessage[] = [];
      bus.subscribe('feature.status.*', (msg) => received.push(msg));

      bus.publish('feature.status.feat-123', {
        featureId: 'feat-123',
        oldStatus: 'backlog',
        newStatus: 'in_progress',
      });

      expect(received).toHaveLength(1);
      expect(received[0].topic).toBe('feature.status.feat-123');
      expect(received[0].payload).toEqual({
        featureId: 'feat-123',
        oldStatus: 'backlog',
        newStatus: 'in_progress',
      });
    });

    it('feature.# catches all feature events', () => {
      const received: TopicMessage[] = [];
      bus.subscribe('feature.#', (msg) => received.push(msg));

      bus.publish('feature.status.abc', { newStatus: 'done' });
      bus.publish('feature.agent.abc', { action: 'started' });

      expect(received).toHaveLength(2);
    });
  });

  describe('PR event flow', () => {
    it('pr.merged.{prNumber} reaches pr.# subscriber', () => {
      const received: TopicMessage[] = [];
      bus.subscribe('pr.#', (msg) => received.push(msg));

      bus.publish('pr.merged.42', { prNumber: 42, title: 'feat: add thing' });
      bus.publish('pr.checks.42.ci-failure', { prNumber: 42 });

      expect(received).toHaveLength(2);
      expect(received[0].topic).toBe('pr.merged.42');
      expect(received[1].topic).toBe('pr.checks.42.ci-failure');
    });

    it('pr.merged.* matches all PR merged events', () => {
      const handler = vi.fn();
      bus.subscribe('pr.merged.*', handler);

      bus.publish('pr.merged.1', {});
      bus.publish('pr.merged.2', {});
      bus.publish('pr.created.3', {}); // should not match

      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  describe('maintenance sweep flow', () => {
    it('maintenance.sweep.{checkName} reaches maintenance.sweep.# subscriber', () => {
      const received: TopicMessage[] = [];
      bus.subscribe('maintenance.sweep.#', (msg) => received.push(msg));

      bus.publish('maintenance.sweep.board-health', { passed: true, durationMs: 42 });
      bus.publish('maintenance.sweep.resource-usage', { passed: false, durationMs: 100 });

      expect(received).toHaveLength(2);
      expect(received[0].topic).toBe('maintenance.sweep.board-health');
      expect(received[1].topic).toBe('maintenance.sweep.resource-usage');
    });

    it('maintenance.sweep.* matches single-level check names', () => {
      const handler = vi.fn();
      bus.subscribe('maintenance.sweep.*', handler);

      bus.publish('maintenance.sweep.board-health', {});
      bus.publish('maintenance.sweep.webhook-health', {});

      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  describe('coexistence with EventEmitter', () => {
    it('both systems work independently without interference', () => {
      const emitter = createEventEmitter();
      const emitterCallback = vi.fn();
      const topicHandler = vi.fn();

      emitter.subscribe(emitterCallback);
      bus.subscribe('feature.status.*', topicHandler);

      // EventEmitter event
      emitter.emit('feature:status-changed', { featureId: 'abc' });

      // TopicBus event
      bus.publish('feature.status.abc', { featureId: 'abc' });

      expect(emitterCallback).toHaveBeenCalledOnce();
      expect(topicHandler).toHaveBeenCalledOnce();
    });

    it('EventEmitter errors do not affect TopicBus', () => {
      const emitter = createEventEmitter();
      emitter.subscribe(() => {
        throw new Error('emitter boom');
      });

      const topicHandler = vi.fn();
      bus.subscribe('test', topicHandler);

      // EventEmitter throws but is caught internally
      emitter.emit('test-event', {});

      // TopicBus still works
      bus.publish('test', { ok: true });
      expect(topicHandler).toHaveBeenCalledOnce();
    });
  });
});
