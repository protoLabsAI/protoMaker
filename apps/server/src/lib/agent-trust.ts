/**
 * Agent Trust — canUseTool callback factory for subagent permission control.
 *
 * Provides `buildCanUseToolCallback` which returns the appropriate tool
 * permission callback based on the configured trust level:
 *
 * - 'full':  Returns undefined. The caller preserves bypassPermissions mode,
 *            allowing subagents to run fully autonomously.
 * - 'gated': Returns an async canUseTool function. Each tool invocation emits
 *            a `subagent:tool-approval-request` event and awaits a matching
 *            `subagent:tool-approval-response` event before proceeding.
 *            Automatically denies after a 5-minute timeout.
 */

import { randomUUID } from 'node:crypto';
import type { CanUseTool, EventType } from '@protolabs-ai/types';
import type { EventEmitter } from './events.js';

/** Timeout duration before an unresponded approval request is auto-denied. */
const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Payload emitted with a `subagent:tool-approval-request` event.
 */
export interface ToolApprovalRequest {
  /** Unique identifier for this specific tool call instance */
  toolCallId: string;
  /** Name of the tool requesting permission */
  toolName: string;
  /** Input arguments passed to the tool */
  toolInput: Record<string, unknown>;
  /** Unique identifier linking the request to its response */
  approvalId: string;
}

/**
 * Payload expected in a `subagent:tool-approval-response` event.
 */
export interface ToolApprovalResponse {
  /** Must match the `approvalId` from the corresponding request */
  approvalId: string;
  /** Whether the tool call is approved */
  approved: boolean;
  /** Optional message explaining the decision */
  message?: string;
}

/**
 * Build a `canUseTool` callback appropriate for the given trust level.
 *
 * @param trust           - 'full' | 'gated'. Full trust returns undefined so the
 *                          caller can keep bypassPermissions. Gated trust returns
 *                          an async callback that gates every tool invocation.
 * @param approvalEmitter - EventEmitter used to emit approval requests and
 *                          receive approval responses. Required when trust is
 *                          'gated'; ignored when trust is 'full'.
 * @returns A CanUseTool callback for 'gated' trust, or undefined for 'full'.
 */
export function buildCanUseToolCallback(
  trust: 'full' | 'gated',
  approvalEmitter?: EventEmitter
): CanUseTool | undefined {
  if (trust === 'full') {
    return undefined;
  }

  // Gated trust: every tool call must be explicitly approved via events.
  return async (
    toolName: string,
    toolInput: Record<string, unknown>,
    { signal }: { signal: AbortSignal }
  ): Promise<{ behavior: 'allow' | 'deny'; message?: string }> => {
    if (!approvalEmitter) {
      return {
        behavior: 'deny',
        message: 'No approval emitter configured for gated subagent trust',
      };
    }

    const approvalId = randomUUID();
    const toolCallId = randomUUID();

    return new Promise<{ behavior: 'allow' | 'deny'; message?: string }>((resolve) => {
      let settled = false;
      // Declare onAbort as undefined initially so settle can safely reference it
      // before the event listener is registered (handles the already-aborted case).
      let onAbort: (() => void) | undefined;

      /** Settle the promise once, cleaning up subscriptions and timer. */
      const settle = (result: { behavior: 'allow' | 'deny'; message?: string }) => {
        if (settled) return;
        settled = true;
        unsubscribe();
        clearTimeout(timeoutHandle);
        if (onAbort) {
          signal.removeEventListener('abort', onAbort);
        }
        resolve(result);
      };

      // Subscribe to all events; filter for matching approval responses.
      const unsubscribe = approvalEmitter.subscribe((eventType, payload) => {
        if (eventType === ('subagent:tool-approval-response' as EventType)) {
          const response = payload as ToolApprovalResponse;
          if (response.approvalId === approvalId) {
            settle(
              response.approved
                ? { behavior: 'allow' }
                : { behavior: 'deny', message: response.message ?? 'Denied by approver' }
            );
          }
        }
      });

      // Auto-deny after 5 minutes if no response arrives.
      const timeoutHandle = setTimeout(() => {
        settle({
          behavior: 'deny',
          message: 'Approval request timed out after 5 minutes',
        });
      }, APPROVAL_TIMEOUT_MS);

      // Deny immediately if the signal is already aborted.
      if (signal.aborted) {
        settle({ behavior: 'deny', message: 'Request was aborted' });
        return;
      }

      // Deny if the abort signal fires while we're waiting.
      onAbort = () => settle({ behavior: 'deny', message: 'Request was aborted' });
      signal.addEventListener('abort', onAbort, { once: true });

      // Emit the approval request for external handlers to process.
      approvalEmitter.emit('subagent:tool-approval-request' as EventType, {
        toolCallId,
        toolName,
        toolInput,
        approvalId,
      } satisfies ToolApprovalRequest);
    });
  };
}
