/**
 * Workstacean API Client
 *
 * HTTP client for communicating with the Workstacean bot pool service.
 * Used to publish HITL and other interactive events to Workstacean's plugin pipeline.
 *
 * Base URL is configured via WORKSTACEAN_URL (default: http://workstacean:8082).
 */

import { createLogger } from '@protolabsai/utils';

const logger = createLogger('WorkstaceanApiClient');

const DEFAULT_WORKSTACEAN_URL = 'http://workstacean:8082';

function getBaseUrl(): string {
  return (process.env.WORKSTACEAN_URL ?? DEFAULT_WORKSTACEAN_URL).replace(/\/$/, '');
}

/** Payload published to Workstacean's /publish endpoint */
export interface WorkstaceanPublishPayload {
  /** Event type, e.g. "hitl.request.gate-hold" */
  event: string;
  /** Arbitrary event metadata */
  data: Record<string, unknown>;
}

/** Response from Workstacean /publish */
export interface WorkstaceanPublishResponse {
  ok: boolean;
  error?: string;
}

/**
 * Publish an event to Workstacean's plugin pipeline.
 * Returns { ok: true } on success, { ok: false, error } on failure.
 */
export async function publish(
  payload: WorkstaceanPublishPayload
): Promise<WorkstaceanPublishResponse> {
  const url = `${getBaseUrl()}/publish`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '(no body)');
      logger.error(`Workstacean publish failed: HTTP ${response.status} — ${text}`);
      return { ok: false, error: `HTTP ${response.status}: ${text}` };
    }

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Workstacean publish request failed:', error);
    return { ok: false, error: message };
  }
}

/**
 * Check connectivity to Workstacean's health endpoint.
 * Returns true if reachable.
 */
export async function isReachable(): Promise<boolean> {
  const url = `${getBaseUrl()}/health`;
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
