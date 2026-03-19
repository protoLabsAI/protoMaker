/**
 * Authentication and server URL management.
 *
 * Extracted from http-api-client.ts. Owns server URL resolution,
 * API key caching, session token management, and auth operations.
 */
import { createLogger } from '@protolabsai/utils/logger';

const logger = createLogger('HttpClient');

export const NO_STORE_CACHE_MODE: RequestCache = 'no-store';

let cachedServerUrl: string | null = null;

/** Notify the UI that the current session is no longer valid. */
export const notifyLoggedOut = (): void => {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent('automaker:logged-out'));
  } catch {
    // Ignore - navigation will still be handled by failed requests in most cases
  }
};

/** Handle an unauthorized response: clear token, best-effort cookie clear, redirect. */
export const handleUnauthorized = (): void => {
  clearSessionToken();
  fetch(`${getServerUrl()}/api/auth/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: '{}',
    cache: NO_STORE_CACHE_MODE,
  }).catch(() => {});
  notifyLoggedOut();
};

/** Notify the UI that the server is offline/unreachable. */
export const notifyServerOffline = (): void => {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent('automaker:server-offline'));
  } catch {
    // Ignore
  }
};

/** Check if an error is a connection error (server offline/unreachable). */
export const isConnectionError = (error: unknown): boolean => {
  if (error instanceof TypeError) {
    const message = error.message.toLowerCase();
    return (
      message.includes('failed to fetch') ||
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('connection refused')
    );
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message: unknown }).message).toLowerCase();
    return (
      message.includes('failed to fetch') ||
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('connection refused')
    );
  }
  return false;
};

/** Handle a server offline error by notifying the UI to redirect. */
export const handleServerOffline = (): void => {
  logger.error('Server appears to be offline, redirecting to login...');
  notifyServerOffline();
};

/** Initialize server URL. No-op in web mode (URL comes from env or Vite proxy). */
export const initServerUrl = async (): Promise<void> => {
  // Server URL is resolved from VITE_SERVER_URL or Vite proxy — nothing to initialize
};

const SERVER_URL_OVERRIDE_KEY = 'automaker:serverUrlOverride';

export const getServerUrl = (): string => {
  // Check runtime override stored in localStorage (set via app-store.setServerUrlOverride)
  if (typeof window !== 'undefined') {
    try {
      const runtimeOverride = window.localStorage.getItem(SERVER_URL_OVERRIDE_KEY);
      if (runtimeOverride) return runtimeOverride;
    } catch {
      // localStorage might be disabled; fall through to other sources
    }
  }
  if (cachedServerUrl) return cachedServerUrl;
  if (typeof window !== 'undefined') {
    const envUrl = import.meta.env.VITE_SERVER_URL;
    if (envUrl) return envUrl;
    // Use relative URL to leverage Vite proxy
    return '';
  }
  const hostname = import.meta.env.VITE_HOSTNAME || 'localhost';
  return `http://${hostname}:3008`;
};

export const getServerUrlSync = (): string => getServerUrl();

// API key state (unused in web mode, kept for interface compatibility)
let cachedApiKey: string | null = null;
let apiKeyInitialized = false;
let apiKeyInitPromise: Promise<void> | null = null;

// Session token state (Web mode - explicit header auth)
let cachedSessionToken: string | null = null;
const SESSION_TOKEN_KEY = 'automaker:sessionToken';

const initSessionToken = (): void => {
  if (typeof window === 'undefined') return;
  try {
    cachedSessionToken = window.localStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    cachedSessionToken = null;
  }
};
initSessionToken();

export const getApiKey = (): string | null => cachedApiKey;

/** Wait for API key initialization to complete. Returns immediately if already initialized. */
export const waitForApiKeyInit = (): Promise<void> => {
  if (apiKeyInitialized) return Promise.resolve();
  if (apiKeyInitPromise) return apiKeyInitPromise;
  return initApiKey();
};

export const getSessionToken = (): string | null => cachedSessionToken;

export const setSessionToken = (token: string | null): void => {
  cachedSessionToken = token;
  if (typeof window === 'undefined') return;
  try {
    if (token) {
      window.localStorage.setItem(SESSION_TOKEN_KEY, token);
    } else {
      window.localStorage.removeItem(SESSION_TOKEN_KEY);
    }
  } catch {
    // localStorage might be disabled; continue with in-memory cache
  }
};

export const clearSessionToken = (): void => {
  cachedSessionToken = null;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(SESSION_TOKEN_KEY);
  } catch {
    // localStorage might be disabled
  }
};

export const isElectronMode = (): boolean => {
  return false;
};

let cachedExternalServerMode: boolean | null = null;

/** Check if running in external server mode (Docker API). */
export const checkExternalServerMode = async (): Promise<boolean> => {
  if (cachedExternalServerMode !== null) return cachedExternalServerMode;
  cachedExternalServerMode = false;
  return false;
};

export const isExternalServerMode = (): boolean | null => cachedExternalServerMode;

/** Initialize authentication. Web mode uses cookie-based auth. */
export const initApiKey = async (): Promise<void> => {
  if (apiKeyInitPromise) return apiKeyInitPromise;
  if (apiKeyInitialized) return;
  apiKeyInitPromise = (async () => {
    try {
      await initServerUrl();
      logger.info('Web mode - using cookie-based authentication');
    } finally {
      apiKeyInitialized = true;
    }
  })();
  return apiKeyInitPromise;
};

/** Check authentication status with the server. */
export const checkAuthStatus = async (): Promise<{
  authenticated: boolean;
  required: boolean;
}> => {
  try {
    const response = await fetch(`${getServerUrl()}/api/auth/status`, {
      credentials: 'include',
      headers: getApiKey() ? { 'X-API-Key': getApiKey()! } : undefined,
      cache: NO_STORE_CACHE_MODE,
    });
    const data = await response.json();
    return {
      authenticated: data.authenticated ?? false,
      required: data.required ?? true,
    };
  } catch (error) {
    logger.error('Failed to check auth status:', error);
    return { authenticated: false, required: true };
  }
};

/**
 * Login with API key (for web mode).
 * After login succeeds, verifies the session is actually working.
 */
export const login = async (
  apiKey: string
): Promise<{ success: boolean; error?: string; token?: string }> => {
  try {
    const response = await fetch(`${getServerUrl()}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ apiKey }),
      cache: NO_STORE_CACHE_MODE,
    });
    const data = await response.json();
    if (data.success && data.token) {
      setSessionToken(data.token);
      logger.info('Session token stored after login');
      const verified = await verifySession();
      if (!verified) {
        logger.error('Login appeared successful but session verification failed');
        return { success: false, error: 'Session verification failed. Please try again.' };
      }
      logger.info('Login verified successfully');
    }
    return data;
  } catch (error) {
    logger.error('Login failed:', error);
    return { success: false, error: 'Network error' };
  }
};

/** Check if the session cookie is still valid. Does NOT retrieve the session token. */
export const fetchSessionToken = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${getServerUrl()}/api/auth/status`, {
      credentials: 'include',
      cache: NO_STORE_CACHE_MODE,
    });
    if (!response.ok) {
      logger.info('Failed to check auth status');
      return false;
    }
    const data = await response.json();
    if (data.success && data.authenticated) {
      logger.info('Session cookie is valid');
      return true;
    }
    logger.info('Session cookie is not authenticated');
    return false;
  } catch (error) {
    logger.error('Failed to check session:', error);
    return false;
  }
};

export const logout = async (): Promise<{ success: boolean }> => {
  try {
    const response = await fetch(`${getServerUrl()}/api/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      cache: NO_STORE_CACHE_MODE,
    });
    clearSessionToken();
    logger.info('Session token cleared on logout');
    return await response.json();
  } catch (error) {
    logger.error('Logout failed:', error);
    return { success: false };
  }
};

/**
 * Verify that the current session is still valid.
 * Returns true if valid, false if definitively invalid (401/403), throws on transient errors.
 */
export const verifySession = async (): Promise<boolean> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const apiKey = getApiKey();
  if (apiKey) headers['X-API-Key'] = apiKey;
  const sessionToken = getSessionToken();
  if (sessionToken) headers['X-Session-Token'] = sessionToken;

  const response = await fetch(`${getServerUrl()}/api/settings/status`, {
    headers,
    credentials: 'include',
    cache: NO_STORE_CACHE_MODE,
    signal: AbortSignal.timeout(2500),
  });

  if (response.status === 401 || response.status === 403) {
    logger.warn('Session verification failed - session expired or invalid');
    clearSessionToken();
    return false;
  }
  if (!response.ok) {
    const error = new Error(`Session verification failed with status: ${response.status}`);
    logger.warn('Session verification failed with status:', response.status);
    throw error;
  }
  logger.info('Session verified successfully');
  return true;
};

/** Check if the server is running in a containerized (sandbox) environment. */
export const checkSandboxEnvironment = async (): Promise<{
  isContainerized: boolean;
  skipSandboxWarning?: boolean;

  error?: string;
}> => {
  try {
    const response = await fetch(`${getServerUrl()}/api/health/environment`, {
      method: 'GET',
      cache: NO_STORE_CACHE_MODE,
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      logger.warn('Failed to check sandbox environment');
      return { isContainerized: false, error: 'Failed to check environment' };
    }
    const data = await response.json();
    return {
      isContainerized: data.isContainerized ?? false,
      skipSandboxWarning: data.skipSandboxWarning ?? false,
    };
  } catch (error) {
    logger.error('Sandbox environment check failed:', error);
    return { isContainerized: false, error: 'Network error' };
  }
};
