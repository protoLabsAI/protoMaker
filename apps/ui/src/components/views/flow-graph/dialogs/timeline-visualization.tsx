/**
 * TimelineVisualization — Execution timeline with phase durations and tool logs
 *
 * Renders a horizontal bar chart showing:
 * - Per-phase execution durations with proportional bar widths
 * - Tool executions nested underneath each phase
 * - Wait times (gate waiting) distinguished from active work
 * - Langfuse deep links for phases with span IDs
 */

import { ExternalLink, Clock, AlertCircle } from 'lucide-react';
import type { PipelinePhase, PhaseTransition } from '@automaker/types';
import { getLangfuseSpanUrl } from '@/lib/langfuse-url';

interface ToolExecution {
  name: string;
  icon?: string;
  duration?: number;
  phase?: PipelinePhase;
  timestamp?: string;
  success?: boolean;
}

interface TimelineVisualizationProps {
  phaseDurations?: Partial<Record<PipelinePhase, number>>;
  toolExecutions?: ToolExecution[];
  phaseHistory: PhaseTransition[];
  phaseSpanIds?: Partial<Record<PipelinePhase, string>>;
  traceId?: string;
  gateWaitingSince?: string;
}

const PHASE_LABELS: Record<PipelinePhase, string> = {
  TRIAGE: 'Triage',
  RESEARCH: 'Research',
  SPEC: 'Spec',
  SPEC_REVIEW: 'Review',
  DESIGN: 'Design',
  PLAN: 'Plan',
  EXECUTE: 'Code',
  VERIFY: 'Verify',
  PUBLISH: 'Publish',
};

const PHASE_COLORS: Record<PipelinePhase, string> = {
  TRIAGE: 'bg-blue-500/30',
  RESEARCH: 'bg-violet-500/30',
  SPEC: 'bg-purple-500/30',
  SPEC_REVIEW: 'bg-amber-500/30',
  DESIGN: 'bg-cyan-500/30',
  PLAN: 'bg-indigo-500/30',
  EXECUTE: 'bg-emerald-500/30',
  VERIFY: 'bg-orange-500/30',
  PUBLISH: 'bg-green-500/30',
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function TimelineVisualization({
  phaseDurations = {},
  toolExecutions = [],
  phaseHistory,
  phaseSpanIds = {},
  traceId,
  gateWaitingSince,
}: TimelineVisualizationProps) {
  // Calculate completed phases from phaseHistory
  const completedPhases = new Set<PipelinePhase>();
  for (const transition of phaseHistory) {
    if (transition.from) {
      completedPhases.add(transition.from);
    }
  }

  // Get phases with durations in order
  const phasesWithDurations = Array.from(completedPhases)
    .filter((phase) => phaseDurations[phase] && phaseDurations[phase]! > 0)
    .sort((a, b) => {
      // Sort by first appearance in phaseHistory
      const aIdx = phaseHistory.findIndex((t) => t.to === a);
      const bIdx = phaseHistory.findIndex((t) => t.to === b);
      return aIdx - bIdx;
    });

  if (phasesWithDurations.length === 0) {
    return (
      <div className="text-xs text-muted-foreground py-4 text-center">
        No phase duration data available yet
      </div>
    );
  }

  // Find longest duration for proportional scaling
  const maxDuration = Math.max(...phasesWithDurations.map((phase) => phaseDurations[phase]!));

  // Calculate total duration
  const totalDuration = phasesWithDurations.reduce(
    (sum, phase) => sum + (phaseDurations[phase] || 0),
    0
  );

  // Group tool executions by phase
  const toolsByPhase = new Map<PipelinePhase, ToolExecution[]>();
  for (const tool of toolExecutions) {
    if (tool.phase) {
      if (!toolsByPhase.has(tool.phase)) {
        toolsByPhase.set(tool.phase, []);
      }
      toolsByPhase.get(tool.phase)!.push(tool);
    }
  }

  return (
    <div className="space-y-3">
      {/* Total duration */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Total Duration</span>
        <span className="font-medium tabular-nums">{formatDuration(totalDuration)}</span>
      </div>

      {/* Timeline bars */}
      <div className="space-y-3">
        {phasesWithDurations.map((phase) => {
          const duration = phaseDurations[phase]!;
          const widthPercent = (duration / maxDuration) * 100;
          const spanId = phaseSpanIds[phase];
          const tools = toolsByPhase.get(phase) || [];
          const hasLangfuseLink = traceId && spanId;

          // Check if this phase had gate waiting
          const nextTransition = phaseHistory.find((t) => t.from === phase);
          const isWaiting = gateWaitingSince && !nextTransition;

          return (
            <div key={phase} className="space-y-1.5">
              {/* Phase bar */}
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">{PHASE_LABELS[phase]}</span>
                      {hasLangfuseLink && (
                        <a
                          href={getLangfuseSpanUrl(traceId, spanId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] text-violet-400 hover:text-violet-300 transition-colors"
                        >
                          <ExternalLink className="w-2.5 h-2.5" />
                          View in Langfuse
                        </a>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatDuration(duration)}
                    </span>
                  </div>
                  {/* Progress bar container */}
                  <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${PHASE_COLORS[phase]} rounded-full transition-all duration-300`}
                      style={{ width: `${widthPercent}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Tool executions nested under phase */}
              {tools.length > 0 && (
                <div className="ml-4 pl-3 border-l-2 border-border/30 space-y-1">
                  {tools.map((tool, idx) => (
                    <div key={idx} className="flex items-center justify-between text-[11px] py-0.5">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        {tool.icon && <span className="shrink-0">{tool.icon}</span>}
                        <span
                          className={`truncate ${tool.success === false ? 'text-red-400' : 'text-muted-foreground'}`}
                        >
                          {tool.name}
                        </span>
                        {tool.success === false && (
                          <AlertCircle className="w-3 h-3 text-red-400 shrink-0" />
                        )}
                      </div>
                      {tool.duration && (
                        <span className="text-muted-foreground tabular-nums text-[10px] ml-2">
                          {formatDuration(tool.duration)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Gate waiting indicator */}
              {isWaiting && gateWaitingSince && (
                <div className="ml-4 pl-3 border-l-2 border-amber-500/30 flex items-center gap-1.5 text-[11px] text-amber-400">
                  <Clock className="w-3 h-3" />
                  <span>Gate wait</span>
                  <span className="text-muted-foreground">
                    (since {formatTimestamp(gateWaitingSince)})
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
