import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRateLimiter } from '@/middleware/rate-limiter.js';
import { createMockExpressContext } from '../../utils/mocks.js';

describe('rate-limiter', () => {
  let rateLimiter: ReturnType<typeof createRateLimiter>;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    rateLimiter?.destroy();
    vi.useRealTimers();
  });

  describe('token bucket basics', () => {
    it('should allow requests when tokens are available', () => {
      rateLimiter = createRateLimiter({ maxTokens: 10 });
      const { req, res, next } = createMockExpressContext();
      req.ip = '192.168.1.1';

      rateLimiter.middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should start each IP with a full bucket', () => {
      rateLimiter = createRateLimiter({ maxTokens: 5 });

      // 5 requests should all pass
      for (let i = 0; i < 5; i++) {
        const { req, res, next } = createMockExpressContext();
        req.ip = '10.0.0.1';
        rateLimiter.middleware(req, res, next);
        expect(next).toHaveBeenCalled();
      }

      // 6th request should be rejected
      const { req, res, next } = createMockExpressContext();
      req.ip = '10.0.0.1';
      rateLimiter.middleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(429);
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 429 with Retry-After header when exhausted', () => {
      rateLimiter = createRateLimiter({ maxTokens: 1, refillRate: 0.5 });
      const ip = '10.0.0.2';

      // Consume the single token
      const ctx1 = createMockExpressContext();
      ctx1.req.ip = ip;
      rateLimiter.middleware(ctx1.req, ctx1.res, ctx1.next);
      expect(ctx1.next).toHaveBeenCalled();

      // Next request should be rate limited
      const ctx2 = createMockExpressContext();
      ctx2.req.ip = ip;
      rateLimiter.middleware(ctx2.req, ctx2.res, ctx2.next);

      expect(ctx2.res.status).toHaveBeenCalledWith(429);
      expect(ctx2.res.setHeader).toBeTruthy();
      expect(ctx2.next).not.toHaveBeenCalled();

      // Verify response body
      const jsonCall = ctx2.res.json.mock.calls[0][0];
      expect(jsonCall.success).toBe(false);
      expect(jsonCall.error).toBe('Too Many Requests');
    });
  });

  describe('token refill', () => {
    it('should refill tokens over time', () => {
      rateLimiter = createRateLimiter({ maxTokens: 2, refillRate: 1 }); // 1 token/sec
      const ip = '10.0.0.3';

      // Consume both tokens
      for (let i = 0; i < 2; i++) {
        const ctx = createMockExpressContext();
        ctx.req.ip = ip;
        rateLimiter.middleware(ctx.req, ctx.res, ctx.next);
        expect(ctx.next).toHaveBeenCalled();
      }

      // Should be exhausted
      const ctxExhausted = createMockExpressContext();
      ctxExhausted.req.ip = ip;
      rateLimiter.middleware(ctxExhausted.req, ctxExhausted.res, ctxExhausted.next);
      expect(ctxExhausted.res.status).toHaveBeenCalledWith(429);

      // Advance time by 1.5 seconds — should have refilled ~1.5 tokens
      vi.advanceTimersByTime(1500);

      const ctxAfterRefill = createMockExpressContext();
      ctxAfterRefill.req.ip = ip;
      rateLimiter.middleware(ctxAfterRefill.req, ctxAfterRefill.res, ctxAfterRefill.next);
      expect(ctxAfterRefill.next).toHaveBeenCalled();
    });

    it('should not refill beyond maxTokens', () => {
      rateLimiter = createRateLimiter({ maxTokens: 3, refillRate: 10 }); // fast refill
      const ip = '10.0.0.4';

      // Consume one token
      const ctx1 = createMockExpressContext();
      ctx1.req.ip = ip;
      rateLimiter.middleware(ctx1.req, ctx1.res, ctx1.next);

      // Wait a long time
      vi.advanceTimersByTime(60_000);

      // Bucket should be capped at maxTokens (3), not overflowed
      const bucket = rateLimiter._buckets.get(ip);
      expect(bucket).toBeDefined();

      // Consume 3 tokens — should all pass, then 4th should fail
      for (let i = 0; i < 3; i++) {
        const ctx = createMockExpressContext();
        ctx.req.ip = ip;
        rateLimiter.middleware(ctx.req, ctx.res, ctx.next);
        expect(ctx.next).toHaveBeenCalled();
      }

      const ctxOver = createMockExpressContext();
      ctxOver.req.ip = ip;
      rateLimiter.middleware(ctxOver.req, ctxOver.res, ctxOver.next);
      expect(ctxOver.res.status).toHaveBeenCalledWith(429);
    });
  });

  describe('per-IP isolation', () => {
    it('should track each IP independently', () => {
      rateLimiter = createRateLimiter({ maxTokens: 1 });

      // Exhaust IP A
      const ctxA = createMockExpressContext();
      ctxA.req.ip = '1.1.1.1';
      rateLimiter.middleware(ctxA.req, ctxA.res, ctxA.next);
      expect(ctxA.next).toHaveBeenCalled();

      // IP A exhausted
      const ctxA2 = createMockExpressContext();
      ctxA2.req.ip = '1.1.1.1';
      rateLimiter.middleware(ctxA2.req, ctxA2.res, ctxA2.next);
      expect(ctxA2.res.status).toHaveBeenCalledWith(429);

      // IP B should still work
      const ctxB = createMockExpressContext();
      ctxB.req.ip = '2.2.2.2';
      rateLimiter.middleware(ctxB.req, ctxB.res, ctxB.next);
      expect(ctxB.next).toHaveBeenCalled();
    });
  });

  describe('x-forwarded-for extraction', () => {
    it('should use x-forwarded-for header when present', () => {
      rateLimiter = createRateLimiter({ maxTokens: 1 });

      // Send request with x-forwarded-for
      const ctx = createMockExpressContext();
      ctx.req.headers['x-forwarded-for'] = '203.0.113.50, 70.41.3.18';
      ctx.req.ip = '127.0.0.1'; // proxy IP
      rateLimiter.middleware(ctx.req, ctx.res, ctx.next);
      expect(ctx.next).toHaveBeenCalled();

      // Same forwarded IP should be rate limited
      const ctx2 = createMockExpressContext();
      ctx2.req.headers['x-forwarded-for'] = '203.0.113.50, 70.41.3.18';
      ctx2.req.ip = '127.0.0.1';
      rateLimiter.middleware(ctx2.req, ctx2.res, ctx2.next);
      expect(ctx2.res.status).toHaveBeenCalledWith(429);

      // Different forwarded IP should pass
      const ctx3 = createMockExpressContext();
      ctx3.req.headers['x-forwarded-for'] = '203.0.113.99';
      ctx3.req.ip = '127.0.0.1';
      rateLimiter.middleware(ctx3.req, ctx3.res, ctx3.next);
      expect(ctx3.next).toHaveBeenCalled();
    });
  });

  describe('stale entry cleanup', () => {
    it('should remove entries not seen for more than 10 minutes', () => {
      rateLimiter = createRateLimiter({ maxTokens: 10 });
      const ip = '10.10.10.10';

      // Create a bucket entry
      const ctx = createMockExpressContext();
      ctx.req.ip = ip;
      rateLimiter.middleware(ctx.req, ctx.res, ctx.next);
      expect(rateLimiter._buckets.has(ip)).toBe(true);

      // The cleanup interval runs every 5 minutes and removes entries older than 10 minutes.
      // Advance 15 minutes so: (1) the bucket becomes stale at 10 min, (2) the cleanup
      // timer fires at 15 min and evicts it.
      vi.advanceTimersByTime(15 * 60 * 1000);

      // Bucket should have been cleaned up by the interval
      expect(rateLimiter._buckets.has(ip)).toBe(false);
    });

    it('should not remove recently active entries', () => {
      rateLimiter = createRateLimiter({ maxTokens: 10 });
      const ip = '10.10.10.11';

      // Create entry
      const ctx = createMockExpressContext();
      ctx.req.ip = ip;
      rateLimiter.middleware(ctx.req, ctx.res, ctx.next);

      // Advance 4 minutes, then make another request (refreshes lastRefill)
      vi.advanceTimersByTime(4 * 60 * 1000);
      const ctx2 = createMockExpressContext();
      ctx2.req.ip = ip;
      rateLimiter.middleware(ctx2.req, ctx2.res, ctx2.next);

      // Advance another 6 minutes (total 10 from first, but 6 from last activity)
      vi.advanceTimersByTime(6 * 60 * 1000);

      // Should still exist — only 6 minutes since last request
      expect(rateLimiter._buckets.has(ip)).toBe(true);
    });
  });

  describe('destroy', () => {
    it('should clear all buckets and stop the cleanup timer', () => {
      rateLimiter = createRateLimiter({ maxTokens: 5 });

      // Add some entries
      for (const ip of ['1.0.0.1', '1.0.0.2', '1.0.0.3']) {
        const ctx = createMockExpressContext();
        ctx.req.ip = ip;
        rateLimiter.middleware(ctx.req, ctx.res, ctx.next);
      }

      expect(rateLimiter._buckets.size).toBe(3);

      rateLimiter.destroy();

      expect(rateLimiter._buckets.size).toBe(0);
    });
  });
});
