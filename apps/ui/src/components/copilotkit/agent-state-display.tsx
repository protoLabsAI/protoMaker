/**
 * Agent State Display
 *
 * Displays the current LangGraph agent state (currentActivity, progress)
 * from the CopilotKit AG-UI protocol. State is automatically streamed via
 * StateDeltaEvent/StateSnapshotEvent and available on the AbstractAgent instance.
 *
 * Gracefully handles when no agent is running.
 */

import { useAgent, UseAgentUpdate } from '@copilotkitnext/react';
import { Activity, Loader2 } from 'lucide-react';

export function AgentStateDisplay() {
  try {
    // Subscribe to agent state changes via AG-UI protocol.
    // State is streamed from LangGraph via copilotkitEmitState() calls
    // and arrives as StateDeltaEvent/StateSnapshotEvent.
    const { agent } = useAgent({
      updates: [UseAgentUpdate.OnStateChanged],
    });

    const currentActivity = agent.state?.currentActivity as string | undefined;
    const progress = agent.state?.progress as number | undefined;

    // Only show when agent is running and has activity to display
    if (!agent.isRunning || !currentActivity) {
      return null;
    }

    const progressPercent = Math.round((progress ?? 0) * 100);

    return (
      <div className="border-t border-border bg-muted/50 p-3">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            <Loader2 className="size-4 text-primary animate-spin" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <Activity className="size-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Agent Activity
              </span>
            </div>
            <p className="text-sm text-foreground mb-2 break-words">{currentActivity}</p>
            {progress != null && (
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300 ease-out"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground font-mono min-w-[3ch]">
                  {progressPercent}%
                </span>
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
