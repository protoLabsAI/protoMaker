/**
 * @@PROJECT_NAME-tracing
 *
 * Observability for your AI agent app.
 *
 * ## Quick start
 *
 * ```ts
 * import { createTracingConfig, wrapProviderWithTracing } from '@@PROJECT_NAME-tracing';
 *
 * // Auto-selects Langfuse when LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY are
 * // set, otherwise falls back to local file tracing in .traces/
 * const tracingConfig = await createTracingConfig();
 *
 * // Wrap any async-generator stream
 * const stream = wrapProviderWithTracing(myStream, tracingConfig, { model });
 * for await (const chunk of stream) { ... }
 * ```
 *
 * @module
 */

export type {
  Logger,
  LangfuseConfig,
  CreateTraceOptions,
  CreateGenerationOptions,
  CreateSpanOptions,
  CreateScoreOptions,
  TracingClientInterface,
  TraceRecord,
  SpanRecord,
} from './types.js';

export { LangfuseClient } from './langfuse-client.js';

export { FileTracer } from './file-tracer.js';
export type { FileTracerConfig } from './file-tracer.js';

export {
  calculateCost,
  wrapProviderWithTracing,
  createTracingContext,
  completeTracingContext,
} from './middleware.js';
export type { TracingConfig, TracingContext, TracedInvocationResult } from './middleware.js';

import { LangfuseClient } from './langfuse-client.js';
import { FileTracer } from './file-tracer.js';
import type { TracingConfig } from './middleware.js';
import type { Logger } from './types.js';

/**
 * Create a `TracingConfig` for use with `wrapProviderWithTracing`.
 *
 * **Auto-selection logic:**
 * - If `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` env vars are set →
 *   initialises a `LangfuseClient` and returns a remote-tracing config.
 * - Otherwise → returns a `FileTracer` config that writes JSON to `.traces/`.
 *
 * Set `TRACES_DIR` to override the directory used by `FileTracer`.
 *
 * @example
 * ```ts
 * // Server startup
 * const tracingConfig = await createTracingConfig();
 * app.locals.tracingConfig = tracingConfig;
 * ```
 */
export async function createTracingConfig(
  options: {
    /** Override the file tracer directory (default: `process.env.TRACES_DIR ?? '.traces'`). */
    dir?: string;
    /** Logger passed to the selected backend.  Defaults to `console`. */
    logger?: Logger;
  } = {}
): Promise<TracingConfig> {
  const log: Logger = options.logger ?? console;
  const publicKey = process.env['LANGFUSE_PUBLIC_KEY'];
  const secretKey = process.env['LANGFUSE_SECRET_KEY'];

  if (publicKey && secretKey) {
    const client = new LangfuseClient(
      {
        publicKey,
        secretKey,
        baseUrl: process.env['LANGFUSE_BASE_URL'],
      },
      log
    );

    // Wait for the optional langfuse package to load before returning
    await client.ready();

    if (client.isAvailable()) {
      log.info?.('[tracing] Langfuse tracing enabled');
      return { enabled: true, client, logger: log };
    }

    log.warn?.('[tracing] Langfuse init failed — falling back to file tracing');
  }

  const tracesDir = options.dir ?? process.env['TRACES_DIR'];
  const fileTracer = new FileTracer({ dir: tracesDir, logger: log });
  log.info?.(`[tracing] file tracing enabled → ${fileTracer.getDir()}`);
  return { enabled: true, client: fileTracer, logger: log };
}
