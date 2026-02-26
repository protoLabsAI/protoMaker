/**
 * Feature Status Normalization Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { normalizeFeatureStatus, type FeatureStatus } from '@protolabs-ai/types';

describe('normalizeFeatureStatus', () => {
  describe('canonical statuses (passthrough)', () => {
    it('should return backlog unchanged', () => {
      expect(normalizeFeatureStatus('backlog')).toBe('backlog');
    });

    it('should return in_progress unchanged', () => {
      expect(normalizeFeatureStatus('in_progress')).toBe('in_progress');
    });

    it('should return review unchanged', () => {
      expect(normalizeFeatureStatus('review')).toBe('review');
    });

    it('should return blocked unchanged', () => {
      expect(normalizeFeatureStatus('blocked')).toBe('blocked');
    });

    it('should return done unchanged', () => {
      expect(normalizeFeatureStatus('done')).toBe('done');
    });
  });

  describe('legacy status migrations', () => {
    it('should migrate pending to backlog', () => {
      expect(normalizeFeatureStatus('pending')).toBe('backlog');
    });

    it('should migrate ready to backlog', () => {
      expect(normalizeFeatureStatus('ready')).toBe('backlog');
    });

    it('should migrate running to in_progress', () => {
      expect(normalizeFeatureStatus('running')).toBe('in_progress');
    });

    it('should migrate completed to done', () => {
      expect(normalizeFeatureStatus('completed')).toBe('done');
    });

    it('should migrate waiting_approval to done', () => {
      expect(normalizeFeatureStatus('waiting_approval')).toBe('done');
    });

    it('should migrate verified to done', () => {
      expect(normalizeFeatureStatus('verified')).toBe('done');
    });

    it('should migrate failed to blocked', () => {
      expect(normalizeFeatureStatus('failed')).toBe('blocked');
    });
  });

  describe('edge cases', () => {
    it('should default to backlog for undefined status', () => {
      expect(normalizeFeatureStatus(undefined)).toBe('backlog');
    });

    it('should default to backlog for empty string', () => {
      expect(normalizeFeatureStatus('')).toBe('backlog');
    });

    it('should default to backlog for unknown status', () => {
      expect(normalizeFeatureStatus('unknown')).toBe('backlog');
    });
  });

  describe('telemetry callback', () => {
    it('should not call telemetry for canonical status', () => {
      const telemetry = vi.fn();
      normalizeFeatureStatus('backlog', telemetry);
      expect(telemetry).not.toHaveBeenCalled();
    });

    it('should call telemetry for legacy status', () => {
      const telemetry = vi.fn();
      normalizeFeatureStatus('pending', telemetry);
      expect(telemetry).toHaveBeenCalledOnce();
      expect(telemetry).toHaveBeenCalledWith('pending', 'backlog');
    });

    it('should call telemetry for unknown status', () => {
      const telemetry = vi.fn();
      normalizeFeatureStatus('unknown', telemetry);
      expect(telemetry).toHaveBeenCalledOnce();
      expect(telemetry).toHaveBeenCalledWith('unknown', 'backlog');
    });

    it('should track multiple migrations', () => {
      const telemetry = vi.fn();
      normalizeFeatureStatus('pending', telemetry);
      normalizeFeatureStatus('running', telemetry);
      normalizeFeatureStatus('completed', telemetry);
      expect(telemetry).toHaveBeenCalledTimes(3);
      expect(telemetry).toHaveBeenNthCalledWith(1, 'pending', 'backlog');
      expect(telemetry).toHaveBeenNthCalledWith(2, 'running', 'in_progress');
      expect(telemetry).toHaveBeenNthCalledWith(3, 'completed', 'done');
    });
  });

  describe('type safety', () => {
    it('should return a valid FeatureStatus type', () => {
      const result: FeatureStatus = normalizeFeatureStatus('pending');
      expect(result).toBe('backlog');
    });
  });
});
