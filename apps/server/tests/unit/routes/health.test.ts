/**
 * Unit tests for health check routes
 *
 * The protoExtension browser extension polls the health endpoint to determine
 * server connectivity status (badge indicator: green/red/gray).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { createMockExpressContext } from '../../utils/mocks.js';

vi.mock('@/lib/version.js', () => ({
  getVersion: vi.fn(),
}));

import { createIndexHandler } from '@/routes/health/routes/index.js';
import { getVersion } from '@/lib/version.js';

describe('health check routes', () => {
  beforeEach(() => {
    vi.mocked(getVersion).mockReturnValue('1.0.0-test');
  });

  describe('GET / (basic health check)', () => {
    it('returns status ok', () => {
      const { req, res } = createMockExpressContext();
      const handler = createIndexHandler();

      handler(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledOnce();
      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.status).toBe('ok');
    });

    it('returns a valid ISO timestamp', () => {
      const { req, res } = createMockExpressContext();
      const handler = createIndexHandler();

      handler(req as Request, res as Response);

      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(() => new Date(payload.timestamp)).not.toThrow();
      expect(new Date(payload.timestamp).toISOString()).toBe(payload.timestamp);
    });

    it('returns the server version', () => {
      const { req, res } = createMockExpressContext();
      const handler = createIndexHandler();

      handler(req as Request, res as Response);

      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.version).toBe('1.0.0-test');
      expect(getVersion).toHaveBeenCalledOnce();
    });

    it('returns all required fields for extension badge detection', () => {
      const { req, res } = createMockExpressContext();
      const handler = createIndexHandler();

      handler(req as Request, res as Response);

      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload).toHaveProperty('status');
      expect(payload).toHaveProperty('timestamp');
      expect(payload).toHaveProperty('version');
    });
  });
});
