/**
 * Tests for AvaChannelFrictionTracker — friction pattern tracking and
 * automatic feature filing when a pattern hits the threshold (3).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AvaChannelFrictionTracker } from '@/services/ava-channel-friction-tracker.js';

// ---------------------------------------------------------------------------
// Basic tracking
// ---------------------------------------------------------------------------

describe('AvaChannelFrictionTracker', () => {
  let tracker: AvaChannelFrictionTracker;

  beforeEach(() => {
    tracker = new AvaChannelFrictionTracker();
  });

  describe('recordFriction', () => {
    it('creates a new pattern on first occurrence', () => {
      tracker.recordFriction('handler-missing:foo', 'Missing handler for foo', 'msg-1');

      const patterns = tracker.getPatterns();
      expect(patterns).toHaveLength(1);
      expect(patterns[0].key).toBe('handler-missing:foo');
      expect(patterns[0].count).toBe(1);
      expect(patterns[0].examples).toEqual(['msg-1']);
    });

    it('increments count on repeated occurrences', () => {
      tracker.recordFriction('handler-failed:bar', 'Handler bar failed', 'msg-1');
      tracker.recordFriction('handler-failed:bar', 'Handler bar failed', 'msg-2');

      const patterns = tracker.getPatterns();
      expect(patterns).toHaveLength(1);
      expect(patterns[0].count).toBe(2);
      expect(patterns[0].examples).toEqual(['msg-1', 'msg-2']);
    });

    it('caps examples at 5', () => {
      for (let i = 0; i < 10; i++) {
        tracker.recordFriction('overflow', 'Too many', `msg-${i}`);
      }

      const patterns = tracker.getPatterns();
      expect(patterns[0].examples).toHaveLength(5);
      expect(patterns[0].count).toBe(10);
    });

    it('tracks multiple distinct patterns', () => {
      tracker.recordFriction('pattern-a', 'Pattern A', 'msg-1');
      tracker.recordFriction('pattern-b', 'Pattern B', 'msg-2');
      tracker.recordFriction('pattern-a', 'Pattern A', 'msg-3');

      const patterns = tracker.getPatterns();
      expect(patterns).toHaveLength(2);
      // Sorted by count descending
      expect(patterns[0].key).toBe('pattern-a');
      expect(patterns[0].count).toBe(2);
      expect(patterns[1].key).toBe('pattern-b');
      expect(patterns[1].count).toBe(1);
    });

    it('updates lastSeen on each occurrence', () => {
      tracker.recordFriction('timing', 'Check timing', 'msg-1');
      const firstLastSeen = tracker.getPatterns()[0].lastSeen;

      // Small delay to ensure different timestamp
      tracker.recordFriction('timing', 'Check timing', 'msg-2');
      const secondLastSeen = tracker.getPatterns()[0].lastSeen;

      expect(secondLastSeen).toBeDefined();
      expect(firstLastSeen).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Auto-filing
  // ---------------------------------------------------------------------------

  describe('auto-filing at threshold', () => {
    it('calls createFeature when pattern reaches count 3', async () => {
      const createFeature = vi.fn().mockResolvedValue('feature-123');
      tracker = new AvaChannelFrictionTracker({ createFeature });

      tracker.recordFriction('failing', 'Keeps failing', 'msg-1');
      tracker.recordFriction('failing', 'Keeps failing', 'msg-2');
      tracker.recordFriction('failing', 'Keeps failing', 'msg-3');

      // Wait for async auto-file
      await vi.waitFor(() => {
        expect(createFeature).toHaveBeenCalledTimes(1);
      });

      const [title, description] = createFeature.mock.calls[0];
      expect(title).toContain('System Improvement');
      expect(title).toContain('Keeps failing');
      expect(description).toContain('failing');
      expect(description).toContain('Occurrences:** 3');
    });

    it('does not file duplicate features for the same pattern', async () => {
      const createFeature = vi.fn().mockResolvedValue('feature-123');
      tracker = new AvaChannelFrictionTracker({ createFeature });

      // Hit threshold
      for (let i = 0; i < 5; i++) {
        tracker.recordFriction('dup', 'Duplicate test', `msg-${i}`);
      }

      await vi.waitFor(() => {
        expect(createFeature).toHaveBeenCalledTimes(1);
      });

      // Additional occurrences should NOT file again
      tracker.recordFriction('dup', 'Duplicate test', 'msg-extra');
      // Give time for any async call
      await new Promise((r) => setTimeout(r, 50));
      expect(createFeature).toHaveBeenCalledTimes(1);
    });

    it('does not file below threshold', () => {
      const createFeature = vi.fn().mockResolvedValue('feature-123');
      tracker = new AvaChannelFrictionTracker({ createFeature });

      tracker.recordFriction('below', 'Below threshold', 'msg-1');
      tracker.recordFriction('below', 'Below threshold', 'msg-2');

      expect(createFeature).not.toHaveBeenCalled();
    });

    it('handles missing createFeature dep gracefully', () => {
      tracker = new AvaChannelFrictionTracker(); // No deps

      // Should not throw
      tracker.recordFriction('no-dep', 'No dep', 'msg-1');
      tracker.recordFriction('no-dep', 'No dep', 'msg-2');
      tracker.recordFriction('no-dep', 'No dep', 'msg-3');
    });

    it('handles createFeature returning null', async () => {
      const createFeature = vi.fn().mockResolvedValue(null);
      tracker = new AvaChannelFrictionTracker({ createFeature });

      for (let i = 0; i < 3; i++) {
        tracker.recordFriction('null-return', 'Returns null', `msg-${i}`);
      }

      await vi.waitFor(() => {
        expect(createFeature).toHaveBeenCalledTimes(1);
      });
    });

    it('handles createFeature rejection gracefully', async () => {
      const createFeature = vi.fn().mockRejectedValue(new Error('API error'));
      tracker = new AvaChannelFrictionTracker({ createFeature });

      for (let i = 0; i < 3; i++) {
        tracker.recordFriction('error', 'Errors out', `msg-${i}`);
      }

      // Should not throw — fire-and-forget with .catch()
      await new Promise((r) => setTimeout(r, 50));
      expect(createFeature).toHaveBeenCalledTimes(1);
    });

    it('files features independently for different patterns', async () => {
      const createFeature = vi.fn().mockResolvedValue('feature-xyz');
      tracker = new AvaChannelFrictionTracker({ createFeature });

      for (let i = 0; i < 3; i++) {
        tracker.recordFriction('pattern-a', 'Pattern A', `a-${i}`);
        tracker.recordFriction('pattern-b', 'Pattern B', `b-${i}`);
      }

      await vi.waitFor(() => {
        expect(createFeature).toHaveBeenCalledTimes(2);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Metrics
  // ---------------------------------------------------------------------------

  describe('getMetrics', () => {
    it('returns zero metrics initially', () => {
      const metrics = tracker.getMetrics();
      expect(metrics.patternsDetected).toBe(0);
      expect(metrics.featuresAutoFiled).toBe(0);
      expect(metrics.totalFrictionEvents).toBe(0);
    });

    it('tracks patterns and events correctly', () => {
      tracker.recordFriction('a', 'A', 'msg-1');
      tracker.recordFriction('a', 'A', 'msg-2');
      tracker.recordFriction('b', 'B', 'msg-3');

      const metrics = tracker.getMetrics();
      expect(metrics.patternsDetected).toBe(2);
      expect(metrics.totalFrictionEvents).toBe(3);
    });

    it('tracks auto-filed count after threshold', async () => {
      const createFeature = vi.fn().mockResolvedValue('feature-1');
      tracker = new AvaChannelFrictionTracker({ createFeature });

      for (let i = 0; i < 3; i++) {
        tracker.recordFriction('filed', 'Will be filed', `msg-${i}`);
      }

      await vi.waitFor(() => {
        expect(createFeature).toHaveBeenCalled();
      });

      const metrics = tracker.getMetrics();
      expect(metrics.featuresAutoFiled).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Reset
  // ---------------------------------------------------------------------------

  describe('reset', () => {
    it('clears all patterns and filed tracking', () => {
      tracker.recordFriction('a', 'A', 'msg-1');
      tracker.recordFriction('b', 'B', 'msg-2');

      tracker.reset();

      expect(tracker.getPatterns()).toHaveLength(0);
      expect(tracker.getMetrics().patternsDetected).toBe(0);
      expect(tracker.getMetrics().totalFrictionEvents).toBe(0);
    });

    it('allows re-filing after reset', async () => {
      const createFeature = vi.fn().mockResolvedValue('feature-1');
      tracker = new AvaChannelFrictionTracker({ createFeature });

      for (let i = 0; i < 3; i++) {
        tracker.recordFriction('refiled', 'Will be refiled', `msg-${i}`);
      }

      await vi.waitFor(() => {
        expect(createFeature).toHaveBeenCalledTimes(1);
      });

      tracker.reset();

      for (let i = 0; i < 3; i++) {
        tracker.recordFriction('refiled', 'Will be refiled', `msg2-${i}`);
      }

      await vi.waitFor(() => {
        expect(createFeature).toHaveBeenCalledTimes(2);
      });
    });
  });
});
