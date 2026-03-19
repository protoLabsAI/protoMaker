/**
 * Version utility - Reads version from package.json
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createLogger } from '@protolabsai/utils';

const logger = createLogger('Version');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let cachedVersion: string | null = null;

/**
 * Get the version from package.json
 * Caches the result for performance
 */
export function getVersion(): string {
  if (cachedVersion) {
    return cachedVersion;
  }

  // Try multiple candidate paths: the compiled output may be nested
  // deeper than src (e.g. dist/apps/server/src/lib/ in Docker builds).
  const candidates = [
    join(__dirname, '..', '..', 'package.json'),
    join(__dirname, '..', '..', '..', '..', 'package.json'),
    join(__dirname, '..', '..', '..', '..', '..', 'package.json'),
  ];

  for (const candidate of candidates) {
    try {
      const packageJson = JSON.parse(readFileSync(candidate, 'utf-8'));
      if (packageJson.name?.includes('server') || packageJson.name?.includes('protolabs')) {
        const version = packageJson.version || '0.0.0';
        cachedVersion = version;
        return version;
      }
    } catch {
      // Try next candidate
    }
  }

  logger.warn(
    'Failed to read version from package.json, tried:',
    candidates.map((c) => ({ path: c }))
  );
  return '0.0.0';
}
