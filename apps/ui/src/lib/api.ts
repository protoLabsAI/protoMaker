/**
 * Convenience re-export of the singleton HTTP API client.
 *
 * Usage:
 *   import { api } from '@/lib/api';
 *   api.ava.getConfig(projectPath);
 */
import { getHttpApiClient } from './http-api-client';

export const api = getHttpApiClient();

// Re-export types useful for consumers
export type { AvaConfig, AvaToolGroups } from './clients/ava-client';
