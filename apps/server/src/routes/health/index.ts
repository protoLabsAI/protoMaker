/**
 * Health check routes
 *
 * NOTE: Only the basic health check (/) and environment check are unauthenticated.
 * The /detailed, /quick, /standard, and /deep endpoints require authentication.
 */

import { Router } from 'express';
import { createIndexHandler } from './routes/index.js';
import { createEnvironmentHandler } from './routes/environment.js';
import { createReadyHandler } from './routes/ready.js';
import { createLogPathHandler } from './routes/log-path.js';
import { createLogsHandler } from './routes/logs.js';

/**
 * Create unauthenticated health routes (basic check only)
 * Used by load balancers and container orchestration
 */
export function createHealthRoutes(): Router {
  const router = Router();

  // Basic health check - no sensitive info
  router.get('/', createIndexHandler());

  // Readiness check - verifies service is ready to serve traffic
  router.get('/ready', createReadyHandler());

  // Environment info including containerization status
  // This is unauthenticated so the UI can check on startup
  router.get('/environment', createEnvironmentHandler());

  // Log file path — unauthenticated so the MCP tool can resolve the correct
  // absolute path without knowing the server's working directory
  router.get('/log-path', createLogPathHandler());

  // Server log content — reads from disk inside the container.
  // The MCP tool uses this instead of direct disk access (which fails
  // when the tool runs on the host but logs are in a Docker volume).
  router.get('/logs', createLogsHandler());

  return router;
}

// Re-export handlers for use in authenticated routes
export { createDetailedHandler } from './routes/detailed.js';
export { createQuickHandler } from './routes/quick.js';
export { createStandardHandler } from './routes/standard.js';
export { createDeepHandler } from './routes/deep.js';
