/**
 * Error Display Component
 *
 * Displays errors from failed workflow nodes with retry functionality
 * and expandable stack trace details for debugging.
 *
 * Features:
 * - Shows error message from failed nodes
 * - Retry button to restart from last checkpoint
 * - Expandable stack trace for debugging
 * - Graceful network error handling
 */

import { useAgent, UseAgentUpdate } from '@copilotkitnext/react';
import { AlertCircle, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { useState } from 'react';

export function ErrorDisplay() {
  const [isStackTraceExpanded, setIsStackTraceExpanded] = useState(false);

  try {
    // Subscribe to agent state changes to detect errors
    const { agent } = useAgent({
      updates: [UseAgentUpdate.OnStateChanged],
    });

    // Extract error information from agent state
    const error = agent.state?.error as
      | {
          message?: string;
          stack?: string;
          type?: string;
          timestamp?: number;
        }
      | undefined;

    // Check if agent has failed
    const hasFailed = agent.state?.status === 'failed' || error != null;

    // Only show when there's an error to display
    if (!hasFailed || !error) {
      return null;
    }

    const errorMessage = error.message || 'An unexpected error occurred';
    const errorStack = error.stack;
    const errorType = error.type || 'Error';

    const handleRetry = () => {
      // Restart the agent from last checkpoint
      // The agent instance should have a restart method that resumes from checkpoint
      if (typeof (agent as any).restart === 'function') {
        (agent as any).restart();
      } else {
        // Fallback: reload the page to restart
        window.location.reload();
      }
    };

    return (
      <div className="border-t border-destructive bg-destructive/10 p-3">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            <AlertCircle className="size-4 text-destructive" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-medium text-destructive uppercase tracking-wide">
                Workflow Error
              </span>
              <span className="text-xs text-muted-foreground">({errorType})</span>
            </div>
            <p className="text-sm text-foreground mb-3 break-words">{errorMessage}</p>

            {/* Retry Button */}
            <button
              onClick={handleRetry}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-destructive bg-background border border-destructive rounded-md hover:bg-destructive/5 transition-colors"
            >
              <RefreshCw className="size-3" />
              Retry from checkpoint
            </button>

            {/* Expandable Stack Trace */}
            {errorStack && (
              <div className="mt-3">
                <button
                  onClick={() => setIsStackTraceExpanded(!isStackTraceExpanded)}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {isStackTraceExpanded ? (
                    <ChevronUp className="size-3" />
                  ) : (
                    <ChevronDown className="size-3" />
                  )}
                  {isStackTraceExpanded ? 'Hide' : 'Show'} stack trace
                </button>
                {isStackTraceExpanded && (
                  <div className="mt-2 p-2 bg-muted rounded text-xs font-mono text-muted-foreground overflow-x-auto max-h-48 overflow-y-auto">
                    <pre className="whitespace-pre-wrap break-words">{errorStack}</pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  } catch {
    // Gracefully handle when CopilotKit context is not available
    return null;
  }
}
