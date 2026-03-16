/**
 * Token Bucket Rate Limiter Middleware
 *
 * Per-IP rate limiting using the token bucket algorithm. Each IP address
 * gets a bucket that refills at a steady rate. When the bucket is empty,
 * requests are rejected with 429 Too Many Requests.
 *
 * Designed for webhook endpoints where bursts are normal but sustained
 * high-frequency traffic indicates abuse.
 */

import type { Request, Response, NextFunction } from 'express';
import { createLogger } from '@protolabsai/utils';

const logger = createLogger('RateLimiter');

/** Configuration for the token bucket rate limiter */
export interface RateLimiterOptions {
  /** Maximum tokens in the bucket (burst capacity). Default: 100 */
  maxTokens: number;
  /** Tokens added per second. Default: 100/60 (~1.67 tokens/sec) */
  refillRate: number;
  /** Refill calculation window in milliseconds. Default: 60000 (1 min) */
  windowMs: number;
}

const DEFAULT_OPTIONS: RateLimiterOptions = {
  maxTokens: 100,
  refillRate: 100 / 60,
  windowMs: 60_000,
};

/** Internal state for a single IP's token bucket */
interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

/** Milliseconds after which an idle bucket is eligible for cleanup */
const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
/** How often the cleanup sweep runs */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Extract the client IP from the request.
 * Prefers x-forwarded-for (first entry) for proxied deployments,
 * falls back to req.ip which Express 5 resolves natively.
 */
function extractClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.ip ?? 'unknown';
}

/**
 * Creates a token bucket rate limiter middleware.
 *
 * Each unique client IP gets an independent bucket that starts full
 * (maxTokens) and refills at refillRate tokens/second. A request
 * consumes one token; when no tokens remain the request is rejected
 * with HTTP 429 and a Retry-After header.
 *
 * A background interval sweeps stale buckets (no requests for 10+ min)
 * every 5 minutes to prevent unbounded memory growth.
 *
 * @param options - Partial overrides for rate limiter configuration
 * @returns Express middleware function and a cleanup handle
 */
export function createRateLimiter(options?: Partial<RateLimiterOptions>): {
  middleware: (req: Request, res: Response, next: NextFunction) => void;
  /** Call to stop the background cleanup timer (for graceful shutdown / tests) */
  destroy: () => void;
  /** Exposed for testing: the internal bucket map */
  _buckets: Map<string, TokenBucket>;
} {
  const config: RateLimiterOptions = { ...DEFAULT_OPTIONS, ...options };
  const buckets = new Map<string, TokenBucket>();

  // Periodic cleanup of stale entries
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    let removed = 0;
    for (const [ip, bucket] of buckets) {
      if (now - bucket.lastRefill > STALE_THRESHOLD_MS) {
        buckets.delete(ip);
        removed++;
      }
    }
    if (removed > 0) {
      logger.debug(`Rate limiter cleanup: removed ${removed} stale bucket(s)`);
    }
  }, CLEANUP_INTERVAL_MS);

  // Allow the process to exit even if the timer is still running
  cleanupTimer.unref();

  function middleware(req: Request, res: Response, next: NextFunction): void {
    const ip = extractClientIp(req);
    const now = Date.now();

    let bucket = buckets.get(ip);

    if (!bucket) {
      // First request from this IP — start with a full bucket
      bucket = { tokens: config.maxTokens, lastRefill: now };
      buckets.set(ip, bucket);
    } else {
      // Refill tokens based on elapsed time
      const elapsedSeconds = (now - bucket.lastRefill) / 1000;
      const refillAmount = elapsedSeconds * config.refillRate;
      bucket.tokens = Math.min(config.maxTokens, bucket.tokens + refillAmount);
      bucket.lastRefill = now;
    }

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      next();
    } else {
      // Calculate seconds until at least 1 token is available
      const retryAfterSeconds = Math.ceil(1 / config.refillRate);
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({
        success: false,
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${retryAfterSeconds} second(s).`,
      });
      logger.warn(`Rate limit exceeded for IP ${ip}`);
    }
  }

  function destroy(): void {
    clearInterval(cleanupTimer);
    buckets.clear();
  }

  return { middleware, destroy, _buckets: buckets };
}
