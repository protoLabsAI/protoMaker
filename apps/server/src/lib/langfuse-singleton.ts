/**
 * Langfuse Singleton
 *
 * Provides a single shared LangfuseClient instance for the entire server.
 * Lazy-initialized on first access. Gracefully degrades when credentials
 * are missing — callers should check isAvailable() before relying on tracing.
 *
 * Also provides a shared PromptResolver for three-layer prompt resolution
 * (user override > Langfuse > hardcoded default).
 */

import { LangfuseClient } from '@automaker/observability';
import { createLogger } from '@automaker/utils';
import { PromptResolver } from '../services/prompt-resolver.js';

const logger = createLogger('LangfuseSingleton');

let instance: LangfuseClient | null = null;
let promptResolverInstance: PromptResolver | null = null;

/**
 * Get the shared LangfuseClient instance.
 * Creates one on first call using env vars. Returns a disabled client
 * if credentials are missing (isAvailable() will return false).
 */
export function getLangfuseInstance(): LangfuseClient {
  if (!instance) {
    instance = new LangfuseClient({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      baseUrl: process.env.LANGFUSE_BASE_URL,
      enabled: true,
    });

    if (instance.isAvailable()) {
      logger.info('Langfuse singleton initialized (tracing enabled)');
    } else {
      logger.info('Langfuse singleton initialized (tracing disabled — missing credentials)');
    }
  }
  return instance;
}

/**
 * Get the shared PromptResolver instance.
 * Uses the LangfuseClient singleton for three-layer prompt resolution.
 * Safe to call even when Langfuse is unavailable — falls through to defaults.
 */
export function getPromptResolver(): PromptResolver {
  if (!promptResolverInstance) {
    promptResolverInstance = new PromptResolver(getLangfuseInstance());

    if (getLangfuseInstance().isAvailable()) {
      logger.info('PromptResolver initialized (Langfuse prompt layer enabled)');
    } else {
      logger.info('PromptResolver initialized (Langfuse unavailable — using defaults only)');
    }
  }
  return promptResolverInstance;
}

/**
 * Shutdown the Langfuse client and flush pending events.
 * Called during server graceful shutdown.
 */
export async function shutdownLangfuse(): Promise<void> {
  if (instance) {
    await instance.shutdown();
    instance = null;
    promptResolverInstance = null;
    logger.info('Langfuse singleton shut down');
  }
}
