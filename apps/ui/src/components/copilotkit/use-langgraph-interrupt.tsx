/**
 * LangGraph Interrupt Handler Hook
 *
 * Handles CopilotKit interrupt events from LangGraph flows and routes them
 * to the appropriate UI component based on the interrupt payload type.
 *
 * When a LangGraph flow calls `interrupt(payload)`, this hook:
 * 1. Detects the interrupt via the AG-UI protocol
 * 2. Routes to the appropriate UI based on payload.type discriminant
 * 3. Provides a resume function to continue the graph with user's response
 *
 * Usage:
 * ```tsx
 * function MyComponent() {
 *   const interruptUI = useLangGraphInterrupt();
 *   return <>{interruptUI}</>;
 * }
 * ```
 */

import { useState, useEffect } from 'react';
import { useAgent, UseAgentUpdate } from '@copilotkitnext/react';
import type { InterruptPayload } from '@automaker/types';
import { GenericApprovalDialog } from './generic-dialog';

/**
 * Hook to handle LangGraph interrupts and route to appropriate UI components.
 * Returns JSX for the interrupt dialog or null if no interrupt is active.
 */
export function useLangGraphInterrupt() {
  const [interruptPayload, setInterruptPayload] = useState<InterruptPayload | null>(null);
  const [resumeCallback, setResumeCallback] = useState<((response: unknown) => void) | null>(null);

  try {
    // Subscribe to agent state changes via AG-UI protocol
    // Interrupts are communicated via agent state
    const { agent } = useAgent({
      updates: [UseAgentUpdate.OnStateChanged],
    });

    // Detect when an interrupt occurs by checking agent state
    useEffect(() => {
      // Check if agent state contains interrupt information
      const state = agent.state as Record<string, unknown> | undefined;
      const interruptData = state?.interrupt as InterruptPayload | undefined;
      const isWaitingForInput = state?.waitingForInput as boolean | undefined;

      if (isWaitingForInput && interruptData) {
        setInterruptPayload(interruptData);

        // Store resume function for later use
        // Resume by sending the response back through the agent
        setResumeCallback(() => (response: unknown) => {
          // Send resume response - implementation depends on CopilotKit AG-UI protocol
          // For now, we'll assume the agent has a method to continue
          if (agent && typeof (agent as any).sendMessage === 'function') {
            (agent as any).sendMessage({ type: 'interrupt-response', data: response });
          }
          setInterruptPayload(null);
          setResumeCallback(null);
        });
      } else if (!isWaitingForInput && interruptPayload) {
        // Clear interrupt if agent is no longer waiting
        setInterruptPayload(null);
        setResumeCallback(null);
      }
    }, [agent, agent.state, interruptPayload]);

    // Route interrupts to appropriate UI component
    if (interruptPayload && resumeCallback) {
      return <InterruptRouter payload={interruptPayload} onResume={resumeCallback} />;
    }

    return null;
  } catch {
    // Gracefully handle when CopilotKit context is not available
    return null;
  }
}

/**
 * Routes interrupt payloads to the appropriate UI component
 */
function InterruptRouter({
  payload,
  onResume,
}: {
  payload: InterruptPayload;
  onResume: (response: unknown) => void;
}) {
  switch (payload.type) {
    case 'prd-review':
      // TODO: Implement PRD editor modal integration
      // For now, fallback to generic approval dialog
      return (
        <GenericApprovalDialog
          open={true}
          title="PRD Review Required"
          message={`Review PRD: ${payload.prdTitle}`}
          onResolve={(approved) => onResume({ approved })}
        />
      );

    case 'entity-review':
      // TODO: Implement entity review UI
      return (
        <GenericApprovalDialog
          open={true}
          title="Entity Review Required"
          message={`Review ${payload.entities.length} entities`}
          onResolve={(approved) => onResume({ approved })}
        />
      );

    case 'phase-approval':
      // TODO: Implement phase approval UI
      return (
        <GenericApprovalDialog
          open={true}
          title={payload.phaseTitle}
          message={payload.phaseDescription}
          onResolve={(approved) => onResume({ approved })}
        />
      );

    case 'generic':
      return (
        <GenericApprovalDialog
          open={true}
          title={payload.title}
          message={payload.message}
          onResolve={(approved) => onResume({ approved })}
        />
      );

    default: {
      // Exhaustiveness check
      const _exhaustive: never = payload;
      return _exhaustive;
    }
  }
}
