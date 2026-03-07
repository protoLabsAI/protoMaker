/**
 * OpenTelemetry SDK — Unified OTLP + Langfuse Span Processor
 *
 * Single NodeSDK instance with two span processors:
 * 1. BatchSpanProcessor → OTLP HTTP exporter (Langfuse OTel endpoint) for infra traces
 * 2. LangfuseSpanProcessor → enriched LLM trace capture for AI SDK calls
 *
 * Only one NodeSDK can register the global TracerProvider — creating two
 * separate instances causes the second to silently no-op. This unified
 * setup ensures both processors are active under a single TracerProvider.
 *
 * Called at the top of runStartup() before service initialization begins.
 * Gracefully no-ops if LANGFUSE_PUBLIC_KEY is not set.
 */

import { createLogger } from '@protolabsai/utils';

const logger = createLogger('OTel');

let sdkInstance: { shutdown: () => Promise<void> } | null = null;

/**
 * Initialize OTel with both OTLP HTTP exporter and Langfuse span processor.
 * No-ops gracefully if Langfuse credentials are missing.
 */
export async function initOtel(): Promise<void> {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const baseUrl = process.env.LANGFUSE_BASE_URL ?? 'https://cloud.langfuse.com';

  if (!publicKey || !secretKey) {
    logger.warn(
      'OTel: Skipping — LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY not set. Agent traces will NOT be recorded.'
    );
    return;
  }

  // Set service name from env or default — used to identify traces in Langfuse
  if (!process.env.OTEL_SERVICE_NAME) {
    process.env.OTEL_SERVICE_NAME = 'protolabs-server';
  }

  try {
    // Dynamic imports to avoid loading OTel when not configured
    const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
    const { BatchSpanProcessor } = await import('@opentelemetry/sdk-trace-base');
    const { getNodeAutoInstrumentations } =
      await import('@opentelemetry/auto-instrumentations-node');
    const { LangfuseSpanProcessor } = await import('@langfuse/otel');
    const { NodeSDK } = await import('@opentelemetry/sdk-node');

    // OTLP exporter — full URL required (OTLPTraceExporter only auto-appends
    // /v1/traces when using OTEL_EXPORTER_OTLP_ENDPOINT env var, not the `url` option)
    const otlpExporter = new OTLPTraceExporter({
      url: `${baseUrl}/api/public/otel/v1/traces`,
      headers: {
        Authorization: `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString('base64')}`,
      },
    });

    // Langfuse span processor — enriched LLM trace capture for AI SDK
    // experimental_telemetry spans (streamText, generateText) get model/token/cost parsing
    const langfuseProcessor = new LangfuseSpanProcessor({
      publicKey,
      secretKey,
      baseUrl: baseUrl || 'https://cloud.langfuse.com',
    });

    const sdk = new NodeSDK({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- OTLP + Langfuse SDK types don't extend SpanProcessor
      spanProcessors: [new BatchSpanProcessor(otlpExporter as any), langfuseProcessor as any],
      // Auto-instruments Express HTTP, pg, fs, and other common Node.js modules
      instrumentations: [getNodeAutoInstrumentations()],
    });

    sdk.start();
    sdkInstance = sdk;
    logger.info(
      `OTel: Initialized — OTLP exporter + LangfuseSpanProcessor active (${baseUrl}/api/public/otel/v1/traces, service=${process.env.OTEL_SERVICE_NAME})`
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
