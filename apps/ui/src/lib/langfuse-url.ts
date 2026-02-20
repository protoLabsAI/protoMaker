/**
 * Langfuse URL Construction
 *
 * Builds trace URLs for the Langfuse observability dashboard.
 */

const LANGFUSE_BASE_URL =
  import.meta.env.VITE_LANGFUSE_BASE_URL || 'https://langfuse.proto-labs.ai';
const LANGFUSE_PROJECT_ID = import.meta.env.VITE_LANGFUSE_PROJECT_ID || 'cmlo39667000jmk07fezv1le7';

/**
 * Get the full Langfuse trace URL for a given trace ID.
 */
export function getLangfuseTraceUrl(traceId: string): string {
  return `${LANGFUSE_BASE_URL}/project/${LANGFUSE_PROJECT_ID}/traces/${traceId}`;
}

/**
 * Get a Langfuse URL that deep-links to a specific span within a trace.
 */
export function getLangfuseSpanUrl(traceId: string, spanId: string): string {
  return `${LANGFUSE_BASE_URL}/project/${LANGFUSE_PROJECT_ID}/traces/${traceId}?observation=${spanId}`;
}
