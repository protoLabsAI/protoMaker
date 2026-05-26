/**
 * CLI configuration — resolves API credentials from env or .env fallback.
 *
 * Priority:
 *   1. process.env.AUTOMAKER_API_URL / AUTOMAKER_API_KEY
 *   2. .env file in the current working directory
 *   3. default values (URL only)
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DEFAULT_API_URL = 'http://localhost:3008';

/**
 * Parse a minimal .env file (KEY=VALUE per line, no quotes expansion needed).
 * Only reads AUTOMAKER_API_URL and AUTOMAKER_API_KEY.
 */
function parseDotEnv(filePath: string): Record<string, string> {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const result: Record<string, string> = {};

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;

      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();

      // Strip surrounding quotes
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (key === 'AUTOMAKER_API_URL' || key === 'AUTOMAKER_API_KEY') {
        result[key] = value;
      }
    }

    return result;
  } catch {
    return {};
  }
}

/**
 * Resolve API configuration.
 *
 * Checks process.env first, then falls back to .env in the project directory
 * (defaults to cwd). The project path can be overridden via `--project` flag.
 *
 * @param projectPath - Project directory for .env lookup (defaults to cwd).
 */
export function resolveApiConfig(projectPath: string = process.cwd()): {
  apiUrl: string;
  apiKey?: string;
} {
  const envUrl = process.env.AUTOMAKER_API_URL;
  const envKey = process.env.AUTOMAKER_API_KEY;

  // If both are set in env, use them directly
  if (envUrl && envKey) {
    return { apiUrl: envUrl, apiKey: envKey };
  }

  // Try .env file in the project directory
  const dotenv = parseDotEnv(resolve(projectPath, '.env'));

  const apiUrl = envUrl || dotenv.AUTOMAKER_API_URL || DEFAULT_API_URL;
  const apiKey = envKey || dotenv.AUTOMAKER_API_KEY;

  return { apiUrl, apiKey };
}
