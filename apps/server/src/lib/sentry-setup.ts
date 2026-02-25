/**
 * Sentry Setup - Server-side error tracking initialization
 *
 * CRITICAL: This module must be imported FIRST in index.ts before any other imports.
 * Sentry needs to be initialized early to capture errors during module loading.
 */

import { initializeSentry } from '@protolabs-ai/error-tracking';
import type { GlobalSettings } from '@protolabs-ai/types';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Initialize Sentry for server-side error tracking
 * Reads configuration from settings or falls back to environment variables
 */
export function setupSentry(): void {
  try {
    // Determine data directory (matches server's DATA_DIR logic)
    const dataDir = process.env.DATA_DIR || join(process.cwd(), 'data');
    const settingsPath = join(dataDir, 'settings.json');

    let settings: GlobalSettings | null = null;

    // Try to load settings from file
    if (existsSync(settingsPath)) {
      try {
        const settingsContent = readFileSync(settingsPath, 'utf-8');
        settings = JSON.parse(settingsContent) as GlobalSettings;
      } catch (error) {
        console.warn('[Sentry] Failed to load settings, using environment variables:', error);
      }
    }

    // Get error tracking config from settings or environment
    const errorTracking = settings?.errorTracking;
    const enabled = errorTracking?.enabled ?? process.env.SENTRY_ENABLED === 'true';
    const dsn = errorTracking?.dsn || process.env.SENTRY_DSN_SERVER || '';
    const environment =
      errorTracking?.environment ||
      (process.env.NODE_ENV as 'development' | 'staging' | 'production') ||
      'development';
    const tracesSampleRate = errorTracking?.tracesSampleRate ?? 0.1;
    const profilesSampleRate = errorTracking?.profilesSampleRate ?? 0.1;

    // Get release version from package.json
    let release: string | undefined;
    try {
      const packageJsonPath = join(process.cwd(), 'package.json');
      if (existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        release = `automaker-server@${packageJson.version}`;
      }
    } catch {
      // Ignore - release will be undefined
    }

    // Initialize Sentry
    initializeSentry({
      dsn,
      environment,
      enabled,
      tracesSampleRate,
      profilesSampleRate,
      release,
    });

    if (enabled && dsn) {
      console.log(`[Sentry] Server error tracking initialized (${environment})`);
    } else if (!enabled) {
      console.log('[Sentry] Error tracking disabled (user opt-out)');
    } else {
      console.warn('[Sentry] Error tracking disabled (no DSN configured)');
    }
  } catch (error) {
    // Never let Sentry initialization crash the server
    console.error('[Sentry] Failed to initialize:', error);
  }
}
