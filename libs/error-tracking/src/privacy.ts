/**
 * Privacy Controls - PII Scrubbing and Data Sanitization
 *
 * Ensures no sensitive data is sent to Sentry:
 * - Email addresses
 * - API keys and tokens
 * - Full project paths (hashed instead)
 * - Authorization headers
 * - Passwords and secrets
 */

import type { Event as SentryEvent } from '@sentry/types';
import { createHash } from 'crypto';

/**
 * Scrub sensitive data from Sentry events before transmission
 * Returns null if event should not be sent (e.g., tracking disabled)
 */
export function scrubSensitiveData(
  event: SentryEvent,
  config: { enabled: boolean }
): SentryEvent | null {
  // Respect user consent
  if (!config.enabled) {
    return null;
  }

  // Remove PII from user context
  if (event.user) {
    delete event.user.email;
    delete event.user.username;
    delete event.user.ip_address;
  }

  // Scrub sensitive headers from request context
  if (event.request?.headers) {
    const sensitiveHeaders = ['authorization', 'x-api-key', 'cookie', 'set-cookie', 'x-csrf-token'];
    for (const header of sensitiveHeaders) {
      if (event.request.headers[header]) {
        event.request.headers[header] = '[REDACTED]';
      }
    }
  }

  // Scrub API keys and tokens from breadcrumbs
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((breadcrumb) => ({
      ...breadcrumb,
      data: scrubObject(breadcrumb.data),
      message: scrubString(breadcrumb.message),
    }));
  }

  // Scrub sensitive data from exception values
  if (event.exception?.values) {
    event.exception.values = event.exception.values.map((exception) => ({
      ...exception,
      value: scrubString(exception.value),
    }));
  }

  // Scrub sensitive data from extra context
  if (event.extra) {
    event.extra = scrubObject(event.extra);
  }

  // Scrub sensitive data from contexts
  if (event.contexts) {
    for (const [key, value] of Object.entries(event.contexts)) {
      if (typeof value === 'object' && value !== null) {
        event.contexts[key] = scrubObject(value);
      }
    }
  }

  return event;
}

/**
 * Recursively scrub sensitive keys from objects
 */
function scrubObject(obj: any): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => scrubObject(item));
  }

  const sensitiveKeys = [
    'password',
    'passwd',
    'pwd',
    'token',
    'apikey',
    'api_key',
    'secret',
    'authorization',
    'auth',
    'bearer',
    'credentials',
    'cookie',
    'session',
    'api-key',
  ];

  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some((sensitiveKey) => lowerKey.includes(sensitiveKey))) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      result[key] = scrubObject(value);
    } else if (typeof value === 'string') {
      result[key] = scrubString(value);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Scrub sensitive patterns from strings
 */
function scrubString(str: string | undefined): string | undefined {
  if (!str) {
    return str;
  }

  // Redact email addresses
  str = str.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL_REDACTED]');

  // Redact common API key patterns
  str = str.replace(/\b[A-Za-z0-9]{32,}\b/g, (match) => {
    // Only redact if it looks like an API key (all uppercase and numbers, or contains dashes/underscores)
    if (/^[A-Z0-9_-]+$/.test(match)) {
      return '[API_KEY_REDACTED]';
    }
    return match;
  });

  // Redact Bearer tokens
  str = str.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [TOKEN_REDACTED]');

  // Redact JWT tokens
  str = str.replace(/eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/g, '[JWT_REDACTED]');

  return str;
}

/**
 * Hash project paths to prevent exposing user directory structure
 * Returns a consistent short hash for the same path
 */
export function hashProjectPath(projectPath: string): string {
  return createHash('sha256').update(projectPath).digest('hex').slice(0, 16);
}

/**
 * Hash sensitive identifiers while preserving uniqueness
 */
export function hashIdentifier(identifier: string): string {
  return createHash('sha256').update(identifier).digest('hex').slice(0, 12);
}
