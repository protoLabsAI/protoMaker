import { describe, it, expect, beforeEach } from 'vitest';
import { EventStore } from '@/lib/event-store.js';
import type { CorrelatedEvent } from '@protolabsai/types';

function makeEvent(overrides: Partial<CorrelatedEvent> = {}): CorrelatedEvent {
  return {
    eventId: overrides.eventId ?? `evt-${Math.random().toString(36).slice(2)}`,
    correlationId: overrides.correlationId ?? 'corr-default',
    causationId: overrides.causationId,
    topic: overrides.topic ?? 'test:event',
    payload: overrides.payload ?? {},
    timestamp: overrides.timestamp ?? Date.now(),
    source: overrides.source ?? 'test',
  };
}

describe('EventStore', () => {
  let store: EventStore;

  beforeEach(() => {
    store = new EventStore();
  });

  describe('store and retrieve', () => {
    it('should store and retrieve an event by correlationId', () => {
      const event = makeEvent({ correlationId: 'chain-1' });
      store.store(event);

      const results = store.queryByCorrelationId('chain-1');
      expect(results).toHaveLength(1);
      expect(results[0].eventId).toBe(event.eventId);
    });

    it('should return empty array for unknown correlationId', () => {
      const results = store.queryByCorrelationId('nonexistent');
      expect(results).toHaveLength(0);
    });

    it('should report correct size', () => {
      expect(store.size()).toBe(0);

      store.store(makeEvent());
      expect(store.size()).toBe(1);

      store.store(makeEvent());
      expect(store.size()).toBe(2);
    });
  });

  describe('ring buffer capacity and eviction', () => {
    it('should evict oldest events when capacity is reached', () => {
      const smallStore = new EventStore(5);

      // Fill the buffer
      for (let i = 0; i < 5; i++) {
        smallStore.store(
          makeEvent({
            eventId: `evt-${i}`,
            correlationId: 'chain-fill',
            timestamp: 1000 + i,
          })
        );
      }
      expect(smallStore.size()).toBe(5);

      // Add one more — should evict evt-0
      smallStore.store(
        makeEvent({
          eventId: 'evt-new',
          correlationId: 'chain-fill',
          timestamp: 2000,
        })
      );

      // Size should still be 5 (capacity)
      expect(smallStore.size()).toBe(5);

      // evt-0 should be gone, evt-new should be present
      const allEvents = smallStore.queryByCorrelationId('chain-fill');
      const eventIds = allEvents.map((e) => e.eventId);
      expect(eventIds).not.toContain('evt-0');
      expect(eventIds).toContain('evt-new');
      expect(eventIds).toContain('evt-1');
    });

    it('should handle 10,000 events at default capacity', () => {
      const defaultStore = new EventStore();
      for (let i = 0; i < 10_000; i++) {
        defaultStore.store(makeEvent({ eventId: `evt-${i}`, timestamp: i }));
      }
      expect(defaultStore.size()).toBe(10_000);

      // Adding one more should evict the oldest
      defaultStore.store(makeEvent({ eventId: 'evt-overflow', timestamp: 10_001 }));
      expect(defaultStore.size()).toBe(10_000);
    });
  });

  describe('queryByFeatureId', () => {
    it('should find events with featureId in payload', () => {
      store.store(makeEvent({ payload: { featureId: 'feat-1', data: 'hello' } }));
      store.store(makeEvent({ payload: { featureId: 'feat-2', data: 'world' } }));
      store.store(makeEvent({ payload: { other: 'data' } }));

      const results = store.queryByFeatureId('feat-1');
      expect(results).toHaveLength(1);
      expect((results[0].payload as Record<string, unknown>).featureId).toBe('feat-1');
    });

    it('should find events with featureId in nested payload', () => {
      store.store(
        makeEvent({
          payload: { payload: { featureId: 'feat-nested' } },
        })
      );

      const results = store.queryByFeatureId('feat-nested');
      expect(results).toHaveLength(1);
    });

    it('should find events with featureId in context object', () => {
      store.store(
        makeEvent({
          payload: { context: { featureId: 'feat-ctx' } },
        })
      );

      const results = store.queryByFeatureId('feat-ctx');
      expect(results).toHaveLength(1);
    });

    it('should respect since parameter', () => {
      store.store(makeEvent({ payload: { featureId: 'feat-ts' }, timestamp: 100 }));
      store.store(makeEvent({ payload: { featureId: 'feat-ts' }, timestamp: 200 }));
      store.store(makeEvent({ payload: { featureId: 'feat-ts' }, timestamp: 300 }));

      const results = store.queryByFeatureId('feat-ts', 200);
      expect(results).toHaveLength(2);
    });
  });

  describe('queryByTopic', () => {
    it('should filter events by topic', () => {
      store.store(makeEvent({ topic: 'feature:started' }));
      store.store(makeEvent({ topic: 'feature:completed' }));
      store.store(makeEvent({ topic: 'feature:started' }));

      const results = store.queryByTopic('feature:started');
      expect(results).toHaveLength(2);
    });
  });

  describe('getChain', () => {
    it('should reconstruct a causal chain', () => {
      const corrId = 'chain-test';
      store.store(makeEvent({ correlationId: corrId, eventId: 'e1', timestamp: 100, topic: 'start' }));
      store.store(makeEvent({ correlationId: corrId, eventId: 'e2', timestamp: 200, causationId: 'e1', topic: 'middle' }));
      store.store(makeEvent({ correlationId: corrId, eventId: 'e3', timestamp: 300, causationId: 'e2', topic: 'end' }));

      const chain = store.getChain(corrId);
      expect(chain.correlationId).toBe(corrId);
      expect(chain.events).toHaveLength(3);
      expect(chain.startTime).toBe(100);
      expect(chain.endTime).toBe(300);
      expect(chain.duration).toBe(200);
      expect(chain.events[0].eventId).toBe('e1');
      expect(chain.events[1].causationId).toBe('e1');
      expect(chain.events[2].causationId).toBe('e2');
    });

    it('should return empty chain for unknown correlationId', () => {
      const chain = store.getChain('nonexistent');
      expect(chain.events).toHaveLength(0);
      expect(chain.startTime).toBe(0);
      expect(chain.endTime).toBe(0);
      expect(chain.duration).toBe(0);
    });
  });

  describe('query (general purpose)', () => {
    beforeEach(() => {
      store.store(makeEvent({ correlationId: 'c1', topic: 'a', timestamp: 100, payload: { featureId: 'f1' } }));
      store.store(makeEvent({ correlationId: 'c1', topic: 'b', timestamp: 200, payload: { featureId: 'f1' } }));
      store.store(makeEvent({ correlationId: 'c2', topic: 'a', timestamp: 300, payload: { featureId: 'f2' } }));
      store.store(makeEvent({ correlationId: 'c2', topic: 'b', timestamp: 400, payload: { featureId: 'f2' } }));
      store.store(makeEvent({ correlationId: 'c3', topic: 'c', timestamp: 500, payload: {} }));
    });

    it('should filter by correlationId', () => {
      const result = store.query({ correlationId: 'c1' });
      expect(result.events).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should filter by featureId', () => {
      const result = store.query({ featureId: 'f2' });
      expect(result.events).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should filter by topic', () => {
      const result = store.query({ topic: 'a' });
      expect(result.events).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should filter by since/until', () => {
      const result = store.query({ since: 200, until: 400 });
      expect(result.events).toHaveLength(3);
      expect(result.total).toBe(3);
    });

    it('should support pagination with limit and offset', () => {
      const page1 = store.query({ limit: 2, offset: 0 });
      expect(page1.events).toHaveLength(2);
      expect(page1.total).toBe(5);

      const page2 = store.query({ limit: 2, offset: 2 });
      expect(page2.events).toHaveLength(2);
      expect(page2.total).toBe(5);

      const page3 = store.query({ limit: 2, offset: 4 });
      expect(page3.events).toHaveLength(1);
      expect(page3.total).toBe(5);
    });

    it('should combine multiple filters', () => {
      const result = store.query({ correlationId: 'c1', topic: 'a' });
      expect(result.events).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('createEvent', () => {
    it('should auto-generate eventId and timestamp', () => {
      const event = store.createEvent('test:topic', { data: 'hello' }, 'test-service');
      expect(event.eventId).toBeDefined();
      expect(event.correlationId).toBeDefined();
      expect(event.timestamp).toBeGreaterThan(0);
      expect(event.topic).toBe('test:topic');
      expect(event.source).toBe('test-service');
    });

    it('should use provided metadata for correlationId and causationId', () => {
      const event = store.createEvent('test:topic', {}, 'test-service', {
        correlationId: 'provided-corr',
        causationId: 'parent-evt',
        source: 'override-source',
      });
      expect(event.correlationId).toBe('provided-corr');
      expect(event.causationId).toBe('parent-evt');
      expect(event.source).toBe('override-source');
    });

    it('should generate new correlationId when not provided in metadata', () => {
      const event = store.createEvent('test:topic', {}, 'test-service');
      expect(event.correlationId).toBeDefined();
      expect(event.correlationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });
  });

  describe('clear', () => {
    it('should remove all events', () => {
      store.store(makeEvent());
      store.store(makeEvent());
      expect(store.size()).toBe(2);

      store.clear();
      expect(store.size()).toBe(0);
    });
  });
});
