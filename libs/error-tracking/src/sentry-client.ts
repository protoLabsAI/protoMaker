/**
 * Sentry Client - Error Tracking and Performance Monitoring
 *
 * Provides a wrapper around Sentry SDK with privacy controls and context management.
 * Supports both Node.js (server) and Electron (main/renderer) environments.
 */

import * as Sentry from '@sentry/node';
import type { Feature } from '@protolabs-ai/types';
import { scrubSensitiveData, hashProjectPath } from './privacy.js';

/**
 * Sentry configuration for initialization
 */
export interface SentryConfig {
  /** Sentry DSN (Data Source Name) */
  dsn: string;
  /** Environment name (development, staging, production) */
  environment: 'development' | 'staging' | 'production';
  /** Enable/disable error tracking (user opt-in) */
  enabled: boolean;
  /** Sample rate for performance tracing (0.0 - 1.0) */
  tracesSampleRate?: number;
  /** Sample rate for profiling (0.0 - 1.0) */
  profilesSampleRate?: number;
  /** Release version (defaults to package version) */
  release?: string;
}

/**
 * Initialize Sentry with privacy controls
 * Safe to call multiple times - only initializes once
 */
export function initializeSentry(config: SentryConfig): void {
  if (!config.enabled) {
    return;
  }

  if (!config.dsn) {
    console.warn('[Sentry] DSN not provided, error tracking disabled');
    return;
  }

  try {
    Sentry.init({
      dsn: config.dsn,
      environment: config.environment,
      release: config.release,
      tracesSampleRate: config.tracesSampleRate ?? 0.1,
      profilesSampleRate: config.profilesSampleRate ?? 0.1,

      // Privacy: Never send PII by default
      sendDefaultPii: false,

      // Scrub sensitive data before sending
      beforeSend: (event, hint) => scrubSensitiveData(event, config) as any,
    });

    console.log(`[Sentry] Initialized in ${config.environment} mode`);
  } catch (error) {
    console.error('[Sentry] Failed to initialize:', error);
  }
}

/**
 * Set feature context for all subsequent errors
 * Call this when entering a feature execution scope
 */
export function setFeatureContext(feature: Feature): void {
  Sentry.setContext('feature', {
    featureId: feature.id,
    featureTitle: feature.title,
    status: feature.status,
    model: feature.model || 'default',
    branchName: feature.branchName || 'unknown',
    complexity: feature.complexity || 'medium',
    hasBlocker: !!feature.blockingReason,
  });

  // Also set as tags for easier filtering in Sentry UI
  Sentry.setTag('feature.id', feature.id);
  Sentry.setTag('feature.status', feature.status);
  if (feature.model) {
    Sentry.setTag('feature.model', feature.model);
  }
}

/**
 * Set session context for all subsequent errors
 * Call this when starting an agent session
 */
export function setSessionContext(session: {
  id: string;
  name?: string;
  projectPath: string;
  messageCount?: number;
}): void {
  Sentry.setContext('session', {
    sessionId: session.id,
    sessionName: session.name || 'unnamed',
    projectPathHash: hashProjectPath(session.projectPath), // Privacy: hash instead of full path
    messageCount: session.messageCount || 0,
  });

  // Also set as tags for easier filtering
  Sentry.setTag('session.id', session.id);
  Sentry.setTag('project.hash', hashProjectPath(session.projectPath));
}

/**
 * Clear feature context (e.g., when exiting feature scope)
 */
export function clearFeatureContext(): void {
  Sentry.setContext('feature', null);
}

/**
 * Clear session context (e.g., when ending session)
 */
export function clearSessionContext(): void {
  Sentry.setContext('session', null);
}

/**
 * Manually capture an exception
 * Use this for caught errors that should still be tracked
 */
export function captureException(
  error: Error | unknown,
  context?: Record<string, any>
): string | undefined {
  if (context) {
    Sentry.setContext('error_context', context);
  }
  return Sentry.captureException(error);
}

/**
 * Manually capture a message
 * Use this for important events that aren't errors
 */
export function captureMessage(
  message: string,
  level: 'info' | 'warning' | 'error' = 'info'
): string | undefined {
  return Sentry.captureMessage(message, level);
}

/**
 * Start a performance span (Sentry v8 API)
 * Use this to track performance of operations.
 *
 * @example
 * ```typescript
 * await startSpan({ op: 'feature.execution', name: 'Execute Feature' }, async (span) => {
 *   await executeFeature(feature);
 *   span.setStatus('ok');
 * });
 * ```
 */
export function startSpan<T>(
  options: {
    op: string;
    name: string;
    attributes?: Record<string, any>;
  },
  callback: (span: any) => T | Promise<T>
): Promise<T> {
  return Promise.resolve(
    Sentry.startSpan(
      {
        op: options.op,
        name: options.name,
        attributes: options.attributes,
      },
      callback
    )
  );
}

/**
 * Start a performance transaction (compatibility shim for Sentry v8)
 * Sentry v8 removed startTransaction — returns a no-op stub.
 * Callers should migrate to startSpan for performance monitoring.
 */
export function startTransaction(_options: {
  op: string;
  name: string;
  data?: Record<string, any>;
}): {
  finish: () => void;
  setStatus: (status: string) => void;
  setAttribute: (key: string, value: unknown) => void;
} {
  return { finish: () => {}, setStatus: () => {}, setAttribute: () => {} };
}

/**
 * Add a breadcrumb (navigation trail for debugging)
 */
export function addBreadcrumb(breadcrumb: {
  message: string;
  category?: string;
  level?: 'info' | 'warning' | 'error';
  data?: Record<string, any>;
}): void {
  Sentry.addBreadcrumb({
    message: breadcrumb.message,
    category: breadcrumb.category || 'default',
    level: breadcrumb.level || 'info',
    data: breadcrumb.data,
  });
}

/**
 * Flush all pending events
 * Useful before shutting down the application
 */
export async function flush(timeout = 2000): Promise<boolean> {
  try {
    return await Sentry.flush(timeout);
  } catch (error) {
    console.error('[Sentry] Failed to flush events:', error);
    return false;
  }
}

/**
 * Close the Sentry client
 * Call this during application shutdown
 */
export async function close(timeout = 2000): Promise<boolean> {
  try {
    return await Sentry.close(timeout);
  } catch (error) {
    console.error('[Sentry] Failed to close client:', error);
    return false;
  }
}

// Re-export Sentry namespace for advanced usage
export { Sentry };
