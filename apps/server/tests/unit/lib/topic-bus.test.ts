import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TopicBus, topicMatchesPattern } from '@/lib/topic-bus.js';

describe('topicMatchesPattern', () => {
  describe('exact match', () => {
    it('matches identical topics', () => {
      expect(topicMatchesPattern('feature.status.abc', 'feature.status.abc')).toBe(true);
    });

    it('rejects different topics', () => {
      expect(topicMatchesPattern('feature.status.abc', 'feature.status.xyz')).toBe(false);
    });

    it('rejects partial matches (extra levels in topic)', () => {
      expect(topicMatchesPattern('feature.status.abc.deep', 'feature.status.abc')).toBe(false);
    });

    it('rejects partial matches (extra levels in pattern)', () => {
      expect(topicMatchesPattern('feature.status', 'feature.status.abc')).toBe(false);
    });

    it('matches single-level topic', () => {
      expect(topicMatchesPattern('feature', 'feature')).toBe(true);
    });
  });

  describe('single-level wildcard (*)', () => {
    it('matches any single level at end', () => {
      expect(topicMatchesPattern('feature.status.abc', 'feature.status.*')).toBe(true);
      expect(topicMatchesPattern('feature.status.xyz', 'feature.status.*')).toBe(true);
    });

    it('matches any single level in middle', () => {
      expect(topicMatchesPattern('feature.status.abc', 'feature.*.abc')).toBe(true);
    });

    it('does not match zero levels', () => {
      expect(topicMatchesPattern('feature.status', 'feature.status.*')).toBe(false);
    });

    it('does not match multiple levels', () => {
      expect(topicMatchesPattern('feature.status.abc.deep', 'feature.status.*')).toBe(false);
    });

    it('matches with multiple single wildcards', () => {
      expect(topicMatchesPattern('a.b.c', '*.*.*')).toBe(true);
      expect(topicMatchesPattern('a.b', '*.*.*')).toBe(false);
    });
  });

  describe('multi-level wildcard (#)', () => {
    it('matches one level after prefix', () => {
      expect(topicMatchesPattern('pr.created', 'pr.#')).toBe(true);
    });

    it('matches multiple levels after prefix', () => {
      expect(topicMatchesPattern('pr.checks.123.eslint', 'pr.#')).toBe(true);
    });

    it('matches with # as entire pattern', () => {
      expect(topicMatchesPattern('anything.at.all', '#')).toBe(true);
      expect(topicMatchesPattern('single', '#')).toBe(true);
    });

    it('matches zero trailing levels (# consumes nothing)', () => {
      // topic: ["pr"], pattern: ["pr", "#"]
      // After matching "pr", '#' matches zero remaining levels
      expect(topicMatchesPattern('pr', 'pr.#')).toBe(true);
    });

    it('does not match when prefix does not match', () => {
      expect(topicMatchesPattern('feature.status.abc', 'pr.#')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('handles empty topic', () => {
      expect(topicMatchesPattern('', 'feature')).toBe(false);
    });

    it('handles empty pattern', () => {
      expect(topicMatchesPattern('feature', '')).toBe(false);
    });

    it('both empty matches (single empty level)', () => {
      expect(topicMatchesPattern('', '')).toBe(true);
    });

    it('mixed wildcards: * before #', () => {
      expect(topicMatchesPattern('pr.created.123', '*.#')).toBe(true);
      expect(topicMatchesPattern('single', '*.#')).toBe(true);
    });
  });
});

describe('TopicBus', () => {
  let bus: TopicBus;

  beforeEach(() => {
    bus = new TopicBus();
  });

  describe('publish and subscribe', () => {
    it('delivers to exact match subscriber', () => {
      const handler = vi.fn();
      bus.subscribe('feature.status.abc', handler);
      bus.publish('feature.status.abc', { status: 'done' });

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: 'feature.status.abc',
          payload: { status: 'done' },
          timestamp: expect.any(String),
        })
      );
    });

    it('delivers to wildcard subscribers', () => {
      const handler = vi.fn();
      bus.subscribe('feature.status.*', handler);
      bus.publish('feature.status.abc', { status: 'in_progress' });
      bus.publish('feature.status.xyz', { status: 'done' });

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('delivers to multi-level wildcard subscribers', () => {
      const handler = vi.fn();
      bus.subscribe('pr.#', handler);
      bus.publish('pr.created.42', {});
      bus.publish('pr.merged.42', {});
      bus.publish('pr.checks.42.eslint', {});

      expect(handler).toHaveBeenCalledTimes(3);
    });

    it('does not deliver to non-matching subscribers', () => {
      const handler = vi.fn();
      bus.subscribe('feature.status.*', handler);
      bus.publish('pr.created.42', {});

      expect(handler).not.toHaveBeenCalled();
    });

    it('delivers to multiple matching subscribers', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      bus.subscribe('feature.status.*', handler1);
      bus.subscribe('feature.#', handler2);
      bus.publish('feature.status.abc', {});

      expect(handler1).toHaveBeenCalledOnce();
      expect(handler2).toHaveBeenCalledOnce();
    });
  });

  describe('unsubscribe', () => {
    it('stops delivering after unsubscribe', () => {
      const handler = vi.fn();
      const unsub = bus.subscribe('feature.status.*', handler);
      bus.publish('feature.status.abc', {});
      expect(handler).toHaveBeenCalledOnce();

      unsub();
      bus.publish('feature.status.xyz', {});
      expect(handler).toHaveBeenCalledOnce(); // still 1, not 2
    });
  });

  describe('error handling', () => {
    it('continues delivering to other subscribers if one throws', () => {
      const badHandler = vi.fn().mockImplementation(() => {
        throw new Error('boom');
      });
      const goodHandler = vi.fn();

      bus.subscribe('test.topic', badHandler);
      bus.subscribe('test.topic', goodHandler);
      bus.publish('test.topic', {});

      expect(badHandler).toHaveBeenCalledOnce();
      expect(goodHandler).toHaveBeenCalledOnce();
    });

    it('ignores publish with empty topic', () => {
      const handler = vi.fn();
      bus.subscribe('#', handler);
      bus.publish('', {});

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('message envelope', () => {
    it('includes topic, payload, and timestamp', () => {
      const handler = vi.fn();
      bus.subscribe('test.msg', handler);
      bus.publish('test.msg', { key: 'value' });

      const msg = handler.mock.calls[0][0];
      expect(msg.topic).toBe('test.msg');
      expect(msg.payload).toEqual({ key: 'value' });
      expect(new Date(msg.timestamp).toISOString()).toBe(msg.timestamp);
    });
  });
});
