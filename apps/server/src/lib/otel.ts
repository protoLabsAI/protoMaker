/**
 * OpenTelemetry SDK — OTLP HTTP Exporter + Auto-Instrumentation
 *
 * Initializes the OTEL NodeSDK with:
 * - OTLP HTTP exporter pointing to the Langfuse OTel endpoint
 * - Auto-instrumentation for Express HTTP, pg, and fs
 * - Basic Auth from LANGFUSE_PUBLIC_KEY:LANGFUSE_SECRET_KEY
 *
 * Called at the top of runStartup() before service initialization begins.
 * Gracefully no-ops if LANGFUSE_PUBLIC_KEY is not set.
 */

import { createLogger } from '@protolabs-ai/utils';

const logger = createLogger('OTel');

let sdkInstance: { shutdown: () => Promise<void> } | null = null;

/**
 * Initialize OTel with OTLP HTTP exporter and auto-instrumentation.
 * No-ops gracefully if Langfuse credentials are missing.
 */
export async function initOtel(): Promise<void> {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const baseUrl = process.env.LANGFUSE_BASE_URL ?? 'https://cloud.langfuse.com';

  if (!publicKey || !secretKey) {
    logger.info('OTel: Skipping — missing LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY');
    return;
  }

  // Set service name from env or default — used to identify traces in Langfuse
  if (!process.env.OTEL_SERVICE_NAME) {
    process.env.OTEL_SERVICE_NAME = 'protolabs-server';
  }

  try {
    // Dynamic imports to avoid loading OTel when not configured
    const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
    const { getNodeAutoInstrumentations } =
      await import('@opentelemetry/auto-instrumentations-node');
    const { NodeSDK } = await import('@opentelemetry/sdk-node');

    // OTLP exporter — OTLPTraceExporter auto-appends /v1/traces to the base URL
    const exporter = new OTLPTraceExporter({
      url: `${baseUrl}/api/public/otel`,
      headers: {
        Authorization: `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString('base64')}`,
      },
    });

    const sdk = new NodeSDK({
      traceExporter: exporter,
      // Auto-instruments Express HTTP, pg, fs, and other common Node.js modules
      instrumentations: [getNodeAutoInstrumentations()],
    });

    sdk.start();
    sdkInstance = sdk;
    logger.info(
      `OTel: Initialized — traces will be exported to ${baseUrl}/api/public/otel as ${process.env.OTEL_SERVICE_NAME}`
    );
  } catch (error) {
    logger.warn('OTel: Failed to initialize —', error);
  }
}

/**
 * Graceful shutdown — flush pending spans before process exits.
 */
export async function shutdownOtel(): Promise<void> {
  if (sdkInstance) {
    try {
      await sdkInstance.shutdown();
      logger.info('OTel: Shut down');
    } catch (error) {
      logger.warn('OTel: Shutdown error —', error);
    }
    sdkInstance = null;
  }
}
