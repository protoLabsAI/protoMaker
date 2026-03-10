/**
 * Pipeline Monitor — Shows feature state machine progression.
 *
 * Displays:
 * - State progression bar: INTAKE → PLAN → EXECUTE → REVIEW → MERGE → DEPLOY → DONE
 * - Current state highlighted with elapsed time
 * - Goal gate badges (pass/fail)
 * - Checkpoint timestamp
 */

import { useQuery } from '@tanstack/react-query';
import { Badge } from '@protolabsai/ui/atoms';
import { CheckCircle, XCircle, Clock, Shield, AlertTriangle } from 'lucide-react';
import { getHttpApiClient } from '@/lib/http-api-client';
import { queryKeys } from '@/lib/query-keys';
import { useAppStore } from '@/store/app-store';
import { formatTimestamp } from '@protolabsai/utils';

const PIPELINE_STATES = ['INTAKE', 'PLAN', 'EXECUTE', 'REVIEW', 'MERGE', 'DEPLOY', 'DONE'] as const;

const STATE_COLORS: Record<string, string> = {
  completed: 'bg-emerald-500',
  current: 'bg-violet-500 animate-pulse',
  upcoming: 'bg-muted-foreground/20',
  escalated: 'bg-red-500',
};

interface PipelineCheckpoint {
  featureId: string;
  currentState: string;
  completedStates: string[];
  goalGateResults: Array<{
    gateId: string;
    state: string;
    passed: boolean;
    reason: string;
  }>;
  timestamp: string;
}

export function PipelineMonitor({ featureId }: { featureId: string }) {
  const projectPath = useAppStore((s) => s.currentProject?.path);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.engine.pipelineCheckpoints(projectPath || ''),
    queryFn: async () => {
      const api = getHttpApiClient();
      return api.engine.pipelineCheckpoints(projectPath || '', featureId);
    },
    enabled: !!projectPath && !!featureId,
    staleTime: 5000,
  });

  if (isLoading) return <p className="text-xs text-muted-foreground">Loading pipeline...</p>;

  const checkpoint = data?.checkpoint as PipelineCheckpoint | null | undefined;

  if (!checkpoint) {
    return <p className="text-xs text-muted-foreground">No pipeline checkpoint</p>;
  }

  const completedSet = new Set(checkpoint.completedStates);
  const currentState = checkpoint.currentState;
  const isEscalated = currentState === 'ESCALATE';

  return (
    <div className="border-t border-border/30 pt-2 space-y-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        Pipeline State
      </p>

      {/* State progression bar */}
      <div className="flex items-center gap-1">
        {PIPELINE_STATES.map((state, i) => {
          let colorClass = STATE_COLORS.upcoming;
          if (completedSet.has(state)) colorClass = STATE_COLORS.completed;
          else if (state === currentState)
            colorClass = isEscalated ? STATE_COLORS.escalated : STATE_COLORS.current;

          return (
            <div key={state} className="flex items-center gap-1">
              <div className="flex flex-col items-center">
                <div className={`w-6 h-1.5 rounded-full ${colorClass}`} title={state} />
                <span className="text-[8px] text-muted-foreground mt-0.5">{state.slice(0, 3)}</span>
              </div>
              {i < PIPELINE_STATES.length - 1 && <div className="w-1 h-px bg-border/50" />}
            </div>
          );
        })}
      </div>

      {/* Current state + elapsed */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          {isEscalated ? (
            <AlertTriangle className="w-3 h-3 text-red-400" />
          ) : (
            <Shield className="w-3 h-3 text-violet-400" />
          )}
          <span className="font-medium">{currentState}</span>
        </div>
        <span className="flex items-center gap-1 text-muted-foreground">
          <Clock className="w-3 h-3" />
          {formatTimestamp(checkpoint.timestamp)}
        </span>
      </div>

      {/* Goal gate results */}
      {checkpoint.goalGateResults.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground font-medium">Goal Gates</p>
          <div className="flex flex-wrap gap-1.5">
            {checkpoint.goalGateResults.map((gate) => (
              <Badge
                key={gate.gateId}
                variant={gate.passed ? 'default' : 'destructive'}
                className="text-[10px] gap-1"
              >
                {gate.passed ? (
                  <CheckCircle className="w-2.5 h-2.5" />
                ) : (
                  <XCircle className="w-2.5 h-2.5" />
                )}
                {gate.gateId}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
