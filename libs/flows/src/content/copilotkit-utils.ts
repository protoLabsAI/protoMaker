/**
 * CopilotKit State Emission Utilities
 *
 * Provides graceful helpers for emitting state and heartbeat messages
 * to CopilotKit when running in a CopilotKit context, with no-op fallbacks
 * when CopilotKit is not available.
 */

import type { RunnableConfig } from '@langchain/core/runnables';

/**
 * State emission payload
 */
export interface StateEmission {
  currentActivity: string;
  progress?: number;
  [key: string]: unknown;
}

/**
 * Safely emit state to CopilotKit if available
 *
 * @param config - LangGraph RunnableConfig
 * @param state - State to emit with currentActivity and optional progress
 */
export async function copilotkitEmitState(
  config: RunnableConfig,
  state: StateEmission
): Promise<void> {
  try {
    // Check if CopilotKit context is available
    // The config object may have a copilotkit property or similar
    if (config && typeof (config as any).copilotkit?.emitState === 'function') {
      await (config as any).copilotkit.emitState(state);
    }
    // Graceful no-op if CopilotKit is not available
  } catch (error) {
    // Silently handle errors - CopilotKit integration is optional
    console.debug('[CopilotKit] State emission skipped:', error);
  }
}

/**
 * Emit a heartbeat message during long-running operations
 *
 * @param config - LangGraph RunnableConfig
 * @param message - Heartbeat message to emit
 */
export async function emitHeartbeat(config: RunnableConfig, message: string): Promise<void> {
  try {
    // Check if writer is available on config
    if (config && typeof (config as any).writer === 'function') {
      const writer = (config as any).writer();
      if (writer && typeof writer.write === 'function') {
        writer.write({ type: 'heartbeat', message });
      }
    }
    // Graceful no-op if writer is not available
  } catch (error) {
    // Silently handle errors - heartbeat is optional
    console.debug('[CopilotKit] Heartbeat emission skipped:', error);
  }
}
