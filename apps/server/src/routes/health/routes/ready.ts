/**
 * GET /ready endpoint - Readiness check for deployment verification
 *
 * Unlike /health (liveness), /ready checks that the service is truly ready to serve traffic:
 * - API key is configured
 * - Data directory is accessible and writable
 * - Core services are initialized
 *
 * This endpoint is unauthenticated to allow load balancers and deployment scripts
 * to verify readiness without requiring credentials.
 */

import type { Request, Response } from 'express';
import { existsSync, accessSync, constants as fsConstants, writeFileSync } from 'fs';
import path from 'path';
import { getVersion } from '../../../lib/version.js';

/**
 * Check if data directory exists and is writable
 */
function checkDataDir(): { accessible: boolean; writable: boolean; error?: string } {
  const dataDir = process.env.DATA_DIR || './data';

  try {
    // Check if directory exists
    if (!existsSync(dataDir)) {
      return { accessible: false, writable: false, error: 'Data directory does not exist' };
    }

    // Check read/write access
    accessSync(dataDir, fsConstants.R_OK | fsConstants.W_OK);

    // Try writing a test file to verify write permissions
    const testFile = path.join(dataDir, '.readiness-check');
    try {
      writeFileSync(testFile, Date.now().toString(), { encoding: 'utf-8' });
      return { accessible: true, writable: true };
    } catch (writeError) {
      return {
        accessible: true,
        writable: false,
        error: `Cannot write to data directory: ${writeError instanceof Error ? writeError.message : String(writeError)}`,
      };
    }
  } catch (error) {
    return {
      accessible: false,
      writable: false,
      error: `Data directory access error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Check if API key is configured
 */
function checkApiKey(): { configured: boolean; source?: string } {
  if (process.env.AUTOMAKER_API_KEY) {
    return { configured: true, source: 'environment' };
  }
  return { configured: true, source: 'default' };
}

export function createReadyHandler() {
  return (_req: Request, res: Response): void => {
    // Check all readiness criteria
    const apiKeyStatus = checkApiKey();
    const dataDirStatus = checkDataDir();

    // Service is ready if API key is configured and data dir is accessible/writable
    const isReady = apiKeyStatus.configured && dataDirStatus.accessible && dataDirStatus.writable;

    // Return 503 Service Unavailable if not ready (tells load balancers to wait)
    const statusCode = isReady ? 200 : 503;

    res.status(statusCode).json({
      status: isReady ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      version: getVersion(),
      checks: {
        apiKey: {
          configured: apiKeyStatus.configured,
          source: apiKeyStatus.source,
        },
        dataDir: {
          accessible: dataDirStatus.accessible,
          writable: dataDirStatus.writable,
          path: process.env.DATA_DIR || './data',
          error: dataDirStatus.error,
        },
      },
    });
  };
}
