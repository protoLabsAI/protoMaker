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
 * import { initializeSentry, setFeatureContext, startSpan } from '@protolabs-ai/error-tracking';
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
 * // Track performance (Sentry v8 API)
 * await startSpan(
 *   {
 *     op: 'feature.execution',
 *     name: 'Execute Feature',
 *     attributes: { featureId: feature.id },
 *   },
 *   async (span) => {
 *     try {
 *       await executeFeature(feature);
 *       span.setStatus('ok');
 *     } catch (error) {
 *       span.setStatus('internal_error');
 *       throw error;
 *     }
 *   }
 * );
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
  startSpan,
  addBreadcrumb,
  flush,
  close,
  Sentry,
} from './sentry-client.js';

// Types
export type { SentryConfig } from './sentry-client.js';

// Privacy utilities (exported for testing/advanced usage)
export { scrubSensitiveData, hashProjectPath, hashIdentifier } from './privacy.js';
