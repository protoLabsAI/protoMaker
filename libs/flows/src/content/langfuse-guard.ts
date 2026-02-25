/**
 * Safe guard for LangfuseClient usage in LangGraph flows.
 *
 * LangGraph serializes state objects, which strips class prototype methods.
 * When a LangfuseClient instance passes through graph state, `isAvailable()`
 * becomes undefined. This guard checks both existence and callable-ness.
 */
import type { LangfuseClient } from '@protolabs-ai/observability';

export function isLangfuseReady(
  client: LangfuseClient | undefined | null
): client is LangfuseClient {
  return client != null && typeof client.isAvailable === 'function' && client.isAvailable();
}
