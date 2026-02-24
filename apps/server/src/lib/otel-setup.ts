/**
 * OpenTelemetry Setup for AI SDK + Langfuse
 *
 * Initializes the OTEL NodeSDK with Langfuse as a span processor.
 * This enables automatic tracing of all AI SDK calls (streamText, generateText)
 * when they use `experimental_telemetry: { isEnabled: true }`.
 *
 * Must be called BEFORE any AI SDK calls are made.
 */

import { createLogger } from '@protolabs-ai/utils';

const logger = createLogger('OTELSetup');

let sdkInstance: { shutdown: () => Promise<void> } | null = null;

/**
 * Initialize OTEL with Langfuse span processor.
 * No-ops gracefully if Langfuse credentials are missing.
 */
export async function initOTEL(): Promise<void> {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const baseUrl = process.env.LANGFUSE_BASE_URL;

  if (!publicKey || !secretKey) {
    logger.info('OTEL/Langfuse: Skipping — missing LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY');
    return;
  }

  try {
    // Dynamic imports to avoid loading OTEL when not configured
    const { LangfuseSpanProcessor } = await import('@langfuse/otel');
    const { NodeSDK } = await import('@opentelemetry/sdk-node');

    const sdk = new NodeSDK({
      spanProcessors: [
        new LangfuseSpanProcessor({
          publicKey,
          secretKey,
          baseUrl: baseUrl || 'https://cloud.langfuse.com',
        }),
      ],
    });

    sdk.start();
    sdkInstance = sdk;
    logger.info('OTEL/Langfuse: Initialized — AI SDK telemetry will be traced');
  } catch (error) {
    logger.warn('OTEL/Langfuse: Failed to initialize —', error);
  }
}

/**
 * Graceful shutdown — flush pending spans.
 */
export async function shutdownOTEL(): Promise<void> {
  if (sdkInstance) {
    try {
      await sdkInstance.shutdown();
      logger.info('OTEL/Langfuse: Shut down');
    } catch (error) {
      logger.warn('OTEL/Langfuse: Shutdown error —', error);
    }
    sdkInstance = null;
  }
}
