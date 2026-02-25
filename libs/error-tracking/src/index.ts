/**
 * Error Tracking Package - Sentry Integration
 *
 * Provides centralized error tracking and performance monitoring with:
 * - Privacy controls (PII scrubbing, project path hashing)
 * - Feature and session context management
 * - Performance transaction tracking
 * - Multi-environment support (Node.js, Electron main/renderer)
 *
 * @example
 * ```typescript
 * import { initializeSentry, setFeatureContext, startTransaction } from '@protolabs-ai/error-tracking';
 *
 * // Initialize at app startup
 * initializeSentry({
 *   dsn: process.env.SENTRY_DSN,
 *   environment: 'production',
 *   enabled: true,
 *   tracesSampleRate: 0.1,
 * });
 *
 * // Set feature context when executing a feature
 * setFeatureContext(feature);
 *
 * // Track performance
 * const transaction = startTransaction({
 *   op: 'feature.execution',
 *   name: 'Execute Feature',
 *   data: { featureId: feature.id },
 * });
 * try {
 *   await executeFeature(feature);
 *   transaction.setStatus('ok');
 * } catch (error) {
 *   transaction.setStatus('internal_error');
 *   throw error;
 * } finally {
 *   transaction.finish();
 * }
 * ```
 */

// Client initialization and configuration
export {
  initializeSentry,
  setFeatureContext,
  setSessionContext,
  clearFeatureContext,
  clearSessionContext,
  captureException,
  captureMessage,
  startTransaction,
  addBreadcrumb,
  flush,
  close,
  Sentry,
} from './sentry-client.js';

// Types
export type { SentryConfig } from './sentry-client.js';

// Privacy utilities (exported for testing/advanced usage)
export { scrubSensitiveData, hashProjectPath, hashIdentifier } from './privacy.js';
