/**
 * Authentication middleware for API security
 *
 * Supports two authentication methods:
 * 1. Header-based (X-API-Key) - Used by Electron mode
 * 2. Cookie-based (HTTP-only session cookie) - Used by web mode
 *
 * Uses a known default key (override via AUTOMAKER_API_KEY env var).
 */

import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import path from 'path';
import * as secureFs from './secure-fs.js';
import { createLogger } from '@protolabs-ai/utils';

const logger = createLogger('Auth');

const DATA_DIR = process.env.DATA_DIR || './data';
const DEFAULT_API_KEY = 'protoLabs_studio_key';
const SESSIONS_FILE = path.join(DATA_DIR, '.sessions');
const SESSION_COOKIE_NAME = 'automaker_session';
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const WS_TOKEN_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes for WebSocket connection tokens

/**
 * Check if an environment variable is set to 'true'
 */
function isEnvTrue(envVar: string | undefined): boolean {
  return envVar === 'true';
}

/**
 * Check if auth is disabled (only allowed in development, never in production/staging)
 */
function isAuthDisabled(): boolean {
  return (
    isEnvTrue(process.env.AUTOMAKER_DISABLE_AUTH) &&
    process.env.NODE_ENV !== 'production' &&
    process.env.NODE_ENV !== 'staging'
  );
}

// Session store - persisted to file for survival across server restarts
const validSessions = new Map<string, { createdAt: number; expiresAt: number }>();

// Short-lived WebSocket connection tokens (in-memory only, not persisted)
const wsConnectionTokens = new Map<string, { createdAt: number; expiresAt: number }>();

// Clean up expired WebSocket tokens periodically
setInterval(() => {
  const now = Date.now();
  wsConnectionTokens.forEach((data, token) => {
    if (data.expiresAt <= now) {
      wsConnectionTokens.delete(token);
    }
  });
}, 60 * 1000); // Clean up every minute

/**
 * Load sessions from file on startup
 */
function loadSessions(): void {
  try {
    if (secureFs.existsSync(SESSIONS_FILE)) {
      const data = secureFs.readFileSync(SESSIONS_FILE, 'utf-8') as string;
      const sessions = JSON.parse(data) as Array<
        [string, { createdAt: number; expiresAt: number }]
      >;
      const now = Date.now();
      let loadedCount = 0;
      let expiredCount = 0;

      for (const [token, session] of sessions) {
        // Only load non-expired sessions
        if (session.expiresAt > now) {
          validSessions.set(token, session);
          loadedCount++;
        } else {
          expiredCount++;
        }
      }

      if (loadedCount > 0 || expiredCount > 0) {
        logger.info(`Loaded ${loadedCount} sessions (${expiredCount} expired)`);
      }
    }
  } catch (error) {
    logger.warn('Error loading sessions:', error);
  }
}

/**
 * Save sessions to file (async)
 */
async function saveSessions(): Promise<void> {
  try {
    await secureFs.mkdir(path.dirname(SESSIONS_FILE), { recursive: true });
    const sessions = Array.from(validSessions.entries());
    await secureFs.writeFile(SESSIONS_FILE, JSON.stringify(sessions), {
      encoding: 'utf-8',
      mode: 0o600,
    });
  } catch (error) {
    logger.error('Failed to save sessions:', error);
  }
}

// Load existing sessions on startup
loadSessions();

// API key — env override or default. Electron passes AUTOMAKER_API_KEY at launch.
const API_KEY = process.env.AUTOMAKER_API_KEY || DEFAULT_API_KEY;

logger.info(`API key: ${API_KEY}${process.env.AUTOMAKER_API_KEY ? ' (from env)' : ' (default)'}`);

/**
 * Generate a cryptographically secure session token
 */
function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Create a new session and return the token
 */
export async function createSession(): Promise<string> {
  const token = generateSessionToken();
  const now = Date.now();
  validSessions.set(token, {
    createdAt: now,
    expiresAt: now + SESSION_MAX_AGE_MS,
  });
  await saveSessions(); // Persist to file
  return token;
}

/**
 * Validate a session token
 * Note: This returns synchronously but triggers async persistence if session expired
 */
export function validateSession(token: string): boolean {
  const session = validSessions.get(token);
  if (!session) return false;

  if (Date.now() > session.expiresAt) {
    validSessions.delete(token);
    // Fire-and-forget: persist removal asynchronously
    saveSessions().catch((err) => logger.error('Error saving sessions:', err));
    return false;
  }

  return true;
}

/**
 * Invalidate a session token
 */
export async function invalidateSession(token: string): Promise<void> {
  validSessions.delete(token);
  await saveSessions(); // Persist removal
}

/**
 * Create a short-lived WebSocket connection token
 * Used for initial WebSocket handshake authentication
 */
export function createWsConnectionToken(): string {
  const token = generateSessionToken();
  const now = Date.now();
  wsConnectionTokens.set(token, {
    createdAt: now,
    expiresAt: now + WS_TOKEN_MAX_AGE_MS,
  });
  return token;
}

/**
 * Validate a WebSocket connection token
 * These tokens are single-use and short-lived (5 minutes)
 * Token is invalidated immediately after first successful use
 */
export function validateWsConnectionToken(token: string): boolean {
  const tokenData = wsConnectionTokens.get(token);
  if (!tokenData) return false;

  // Always delete the token (single-use)
  wsConnectionTokens.delete(token);

  // Check if expired
  if (Date.now() > tokenData.expiresAt) {
    return false;
  }

  return true;
}

/**
 * Validate the API key using timing-safe comparison
 * Prevents timing attacks that could leak information about the key
 */
export function validateApiKey(key: string): boolean {
  if (!key || typeof key !== 'string') return false;

  // Both buffers must be the same length for timingSafeEqual
  const keyBuffer = Buffer.from(key);
  const apiKeyBuffer = Buffer.from(API_KEY);

  // If lengths differ, compare against a dummy to maintain constant time
  if (keyBuffer.length !== apiKeyBuffer.length) {
    crypto.timingSafeEqual(apiKeyBuffer, apiKeyBuffer);
    return false;
  }

  return crypto.timingSafeEqual(keyBuffer, apiKeyBuffer);
}

/**
 * Get session cookie options
 */
export function getSessionCookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'strict' | 'lax' | 'none';
  maxAge: number;
  path: string;
} {
  return {
    httpOnly: true, // JavaScript cannot access this cookie
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    sameSite: 'lax', // Sent for same-site requests and top-level navigations, but not cross-origin fetch/XHR
    maxAge: SESSION_MAX_AGE_MS,
    path: '/',
  };
}

/**
 * Get the session cookie name
 */
export function getSessionCookieName(): string {
  return SESSION_COOKIE_NAME;
}

/**
 * Authentication result type
 */
type AuthResult =
  | { authenticated: true }
  | { authenticated: false; errorType: 'invalid_api_key' | 'invalid_session' | 'no_auth' };

/**
 * Core authentication check - shared between middleware and status check
 * Extracts auth credentials from various sources and validates them
 */
function checkAuthentication(
  headers: Record<string, string | string[] | undefined>,
  query: Record<string, string | undefined>,
  cookies: Record<string, string | undefined>
): AuthResult {
  // Check for API key in header (Electron mode)
  const headerKey = headers['x-api-key'] as string | undefined;
  if (headerKey) {
    if (validateApiKey(headerKey)) {
      return { authenticated: true };
    }
    return { authenticated: false, errorType: 'invalid_api_key' };
  }

  // Check for session token in header (web mode with explicit token)
  const sessionTokenHeader = headers['x-session-token'] as string | undefined;
  if (sessionTokenHeader) {
    if (validateSession(sessionTokenHeader)) {
      return { authenticated: true };
    }
    return { authenticated: false, errorType: 'invalid_session' };
  }

  // Check for API key in query parameter (fallback)
  const queryKey = query.apiKey;
  if (queryKey) {
    if (validateApiKey(queryKey)) {
      return { authenticated: true };
    }
    return { authenticated: false, errorType: 'invalid_api_key' };
  }

  // Check for session token in query parameter (web mode - needed for image loads)
  const queryToken = query.token;
  if (queryToken) {
    if (validateSession(queryToken)) {
      return { authenticated: true };
    }
    return { authenticated: false, errorType: 'invalid_session' };
  }

  // Check for session cookie (web mode)
  const sessionToken = cookies[SESSION_COOKIE_NAME];
  if (sessionToken && validateSession(sessionToken)) {
    return { authenticated: true };
  }

  return { authenticated: false, errorType: 'no_auth' };
}

/**
 * Authentication middleware
 *
 * Accepts either:
 * 1. X-API-Key header (for Electron mode)
 * 2. X-Session-Token header (for web mode with explicit token)
 * 3. apiKey query parameter (fallback for Electron, cases where headers can't be set)
 * 4. token query parameter (fallback for web mode, needed for image loads via CSS/img tags)
 * 5. Session cookie (for web mode)
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Allow disabling auth in development only (never in production/staging)
  if (isAuthDisabled()) {
    next();
    return;
  }

  const result = checkAuthentication(
    req.headers as Record<string, string | string[] | undefined>,
    req.query as Record<string, string | undefined>,
    (req.cookies || {}) as Record<string, string | undefined>
  );

  if (result.authenticated) {
    next();
    return;
  }

  // Return appropriate error based on what failed
  switch (result.errorType) {
    case 'invalid_api_key':
      res.status(403).json({
        success: false,
        error: 'Invalid API key.',
      });
      break;
    case 'invalid_session':
      res.status(403).json({
        success: false,
        error: 'Invalid or expired session token.',
      });
      break;
    case 'no_auth':
    default:
      res.status(401).json({
        success: false,
        error: 'Authentication required.',
      });
  }
}

/**
 * Check if authentication is enabled (always true now)
 */
export function isAuthEnabled(): boolean {
  return true;
}

/**
 * Get authentication status for health endpoint
 */
export function getAuthStatus(): { enabled: boolean; method: string } {
  const disabled = isAuthDisabled();
  return {
    enabled: !disabled,
    method: disabled ? 'disabled (dev only)' : 'api_key_or_session',
  };
}

/**
 * Check if a request is authenticated (for status endpoint)
 */
export function isRequestAuthenticated(req: Request): boolean {
  if (isAuthDisabled()) return true;
  const result = checkAuthentication(
    req.headers as Record<string, string | string[] | undefined>,
    req.query as Record<string, string | undefined>,
    (req.cookies || {}) as Record<string, string | undefined>
  );
  return result.authenticated;
}

/**
 * Check if raw credentials are authenticated
 * Used for WebSocket authentication where we don't have Express request objects
 */
export function checkRawAuthentication(
  headers: Record<string, string | string[] | undefined>,
  query: Record<string, string | undefined>,
  cookies: Record<string, string | undefined>
): boolean {
  if (isAuthDisabled()) return true;
  return checkAuthentication(headers, query, cookies).authenticated;
}
