/**
 * Contract tests for EventBus interface conformance.
 * Verifies that createEventEmitter() returns an object satisfying EventBus.
 */

import { describe, it, expect, vi } from 'vitest';
import { createEventEmitter } from '../../../src/lib/events.js';
import type { EventBus } from '@protolabs-ai/types';

describe('EventBus Interface Contract', () => {
  it('createEventEmitter() satisfies EventBus interface at type level', () => {
    const emitter = createEventEmitter();
    // Compile-time check — TypeScript errors if emitter doesn't satisfy EventBus
    const bus: EventBus = emitter;
    expect(bus).toBeDefined();
  });

  it('has all required EventBus methods', () => {
    const emitter = createEventEmitter();
    expect(typeof emitter.emit).toBe('function');
    expect(typeof emitter.subscribe).toBe('function');
    expect(typeof emitter.broadcast).toBe('function');
  });

  describe('broadcast', () => {
    it('should emit to all subscribers', () => {
      const emitter = createEventEmitter();
      const callback = vi.fn();

      emitter.subscribe(callback);
      emitter.broadcast('feature:created', { featureId: 'test-123' });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith('feature:created', { featureId: 'test-123' });
    });

    it('should reach multiple subscribers', () => {
      const emitter = createEventEmitter();
      const cb1 = vi.fn();
      const cb2 = vi.fn();

      emitter.subscribe(cb1);
      emitter.subscribe(cb2);
      emitter.broadcast('feature:completed', { id: 'test' });

      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledTimes(1);
    });
  });

  describe('subscribe returns EventSubscription', () => {
    it('returned function has unsubscribe method', () => {
      const emitter = createEventEmitter();
      const unsub = emitter.subscribe(vi.fn());

      // Legacy pattern: callable as function
      expect(typeof unsub).toBe('function');
      // New pattern: has .unsubscribe() method
      expect(typeof (unsub as any).unsubscribe).toBe('function');
    });

    it('unsubscribe() stops receiving events', () => {
      const emitter = createEventEmitter();
      const callback = vi.fn();
      const sub = emitter.subscribe(callback);

      emitter.emit('feature:created', {});
      expect(callback).toHaveBeenCalledTimes(1);

      // Use .unsubscribe() method
      (sub as any).unsubscribe();

      emitter.emit('feature:created', {});
      expect(callback).toHaveBeenCalledTimes(1); // Still 1, not called again
    });

    it('legacy cleanup function pattern still works', () => {
      const emitter = createEventEmitter();
      const callback = vi.fn();
      const unsub = emitter.subscribe(callback);

      emitter.emit('feature:created', {});
      expect(callback).toHaveBeenCalledTimes(1);

      // Legacy pattern: call as function
      unsub();

      emitter.emit('feature:created', {});
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('error isolation', () => {
    it('should not crash on subscriber errors', () => {
      const emitter = createEventEmitter();
      const badCallback = vi.fn(() => {
        throw new Error('subscriber error');
      });
      const goodCallback = vi.fn();

      emitter.subscribe(badCallback);
      emitter.subscribe(goodCallback);

      // Should not throw
      expect(() => emitter.emit('feature:created', {})).not.toThrow();
      expect(goodCallback).toHaveBeenCalledTimes(1);
    });
  });
});
