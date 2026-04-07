/**
 * Integration tests for HITL gate-hold routing via Workstacean.
 *
 * These tests verify that HITLGateService correctly publishes gate-hold and
 * cancel events to Workstacean's /publish endpoint, and gracefully handles
 * network failures.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HITLGateService } from '../../src/services/hitl-gate.service.js';

function makeFetchMock(status: number, body = '{}'): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: vi.fn().mockResolvedValue(body),
  } as unknown as Response);
}

describe('HITLGateService', () => {
  let service: HITLGateService;
  let originalFetch: typeof globalThis.fetch;
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalEnv = {
      WORKSTACEAN_URL: process.env.WORKSTACEAN_URL,
    };
    process.env.WORKSTACEAN_URL = 'http://workstacean-test:8082';
    service = new HITLGateService();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    vi.restoreAllMocks();
  });

  describe('requestGateHold', () => {
    it('publishes hitl.request.gate-hold event to Workstacean', async () => {
      globalThis.fetch = makeFetchMock(200);

      const result = await service.requestGateHold({
        featureId: 'feature-123',
        projectPath: '/path/to/project',
        featureTitle: 'Test Feature',
        channelId: '1469195643590541353',
        phase: 'REVIEW',
      });

      expect(result).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledOnce();

      const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        RequestInit,
      ];
      expect(url).toBe('http://workstacean-test:8082/publish');
      expect(init.method).toBe('POST');

      const body = JSON.parse(init.body as string);
      expect(body.event).toBe('hitl.request.gate-hold');
      expect(body.data.featureId).toBe('feature-123');
      expect(body.data.channelId).toBe('1469195643590541353');
      expect(body.data.phase).toBe('REVIEW');
      expect(body.data.source).toBe('protomaker');
    });

    it('tracks pending gate after successful publish', async () => {
      globalThis.fetch = makeFetchMock(200);

      await service.requestGateHold({
        featureId: 'feature-456',
        projectPath: '/path',
        channelId: '1469195643590541353',
      });

      expect(service.hasPendingGate('feature-456')).toBe(true);
      expect(service.getPendingFeatureIds()).toContain('feature-456');
    });

    it('returns false when Workstacean is unreachable', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await service.requestGateHold({
        featureId: 'feature-789',
        projectPath: '/path',
        channelId: '1469195643590541353',
      });

      expect(result).toBe(false);
      expect(service.hasPendingGate('feature-789')).toBe(false);
    });

    it('returns false on non-2xx response from Workstacean', async () => {
      globalThis.fetch = makeFetchMock(503, 'service unavailable');

      const result = await service.requestGateHold({
        featureId: 'feature-999',
        projectPath: '/path',
        channelId: '1469195643590541353',
      });

      expect(result).toBe(false);
    });
  });

  describe('cancelGateHold', () => {
    it('publishes hitl.request.cancel and removes pending gate', async () => {
      globalThis.fetch = makeFetchMock(200);

      // First create a gate
      await service.requestGateHold({
        featureId: 'feature-cancel-test',
        projectPath: '/path',
        channelId: '1469195643590541353',
      });

      expect(service.hasPendingGate('feature-cancel-test')).toBe(true);

      // Now cancel it
      await service.cancelGateHold('feature-cancel-test');

      expect(service.hasPendingGate('feature-cancel-test')).toBe(false);

      // Verify the cancel event was published
      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls).toHaveLength(2);
      const cancelBody = JSON.parse((calls[1] as [string, RequestInit])[1].body as string);
      expect(cancelBody.event).toBe('hitl.request.cancel');
      expect(cancelBody.data.featureId).toBe('feature-cancel-test');
    });

    it('no-ops gracefully when gate does not exist', async () => {
      globalThis.fetch = makeFetchMock(200);

      // cancelGateHold for non-existent gate should not throw
      await expect(service.cancelGateHold('nonexistent-feature')).resolves.toBeUndefined();
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });

  describe('hasPendingGate / getPendingFeatureIds', () => {
    it('returns false for non-tracked features', () => {
      expect(service.hasPendingGate('unknown')).toBe(false);
    });

    it('returns all pending feature IDs', async () => {
      globalThis.fetch = makeFetchMock(200);

      await service.requestGateHold({
        featureId: 'f1',
        projectPath: '/path',
        channelId: '111',
      });
      await service.requestGateHold({
        featureId: 'f2',
        projectPath: '/path',
        channelId: '222',
      });

      const ids = service.getPendingFeatureIds();
      expect(ids).toContain('f1');
      expect(ids).toContain('f2');
    });
  });
});
