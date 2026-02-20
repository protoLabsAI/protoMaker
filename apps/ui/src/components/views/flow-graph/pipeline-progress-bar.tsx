/**
 * PipelineProgressBar — Horizontal stepper showing unified pipeline phases.
 *
 * Displays all 9 phases with status indicators:
 *  - Completed: filled circle + checkmark
 *  - Current: animated/pulsing circle
 *  - Awaiting gate: amber circle with action buttons
 *  - Skipped: dashed outline
 *  - Future: outline circle
 *
 * Clicking a completed phase links to its Langfuse span.
 * Gate-waiting phases show Advance/Reject buttons.
 */

import { memo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, ExternalLink, ChevronRight, Loader2, Hand, SkipForward } from 'lucide-react';
import type { PipelinePhase, PipelineState, PipelineBranch } from '@automaker/types';
import { PIPELINE_PHASES, GTM_SKIP_PHASES } from '@automaker/types';
import { getLangfuseTraceUrl, getLangfuseSpanUrl } from '@/lib/langfuse-url';
import { cn } from '@/lib/utils';

interface PipelineProgressBarProps {
  pipelineState: PipelineState;
  branch: PipelineBranch;
  onResolveGate?: (action: 'advance' | 'reject') => void;
}

type PhaseStatus = 'completed' | 'current' | 'gate-waiting' | 'skipped' | 'future';

const PHASE_LABELS: Record<PipelinePhase, string> = {
  TRIAGE: 'Triage',
  RESEARCH: 'Research',
  SPEC: 'Spec',
  SPEC_REVIEW: 'Review',
  DESIGN: 'Design',
  PLAN: 'Plan',
  EXECUTE: 'Execute',
  VERIFY: 'Verify',
  PUBLISH: 'Publish',
};

function getPhaseStatus(
  phase: PipelinePhase,
  state: PipelineState,
  branch: PipelineBranch
): PhaseStatus {
  const currentIdx = PIPELINE_PHASES.indexOf(state.currentPhase);
  const phaseIdx = PIPELINE_PHASES.indexOf(phase);

  // GTM skips DESIGN and PLAN
  if (branch === 'gtm' && GTM_SKIP_PHASES.includes(phase)) {
    return 'skipped';
  }

  // Check if phase is in history (completed)
  const inHistory = state.phaseHistory.some(
    (t) => t.to === phase && state.phaseHistory.some((t2) => t2.from === phase)
  );
  if (inHistory && phaseIdx < currentIdx) {
    return 'completed';
  }

  // If before current phase, it's completed
  if (phaseIdx < currentIdx) {
    return 'completed';
  }

  // Current phase
  if (phase === state.currentPhase) {
    return state.awaitingGate ? 'gate-waiting' : 'current';
  }

  return 'future';
}

function PhaseIndicator({
  phase,
  status,
  traceId,
  spanId,
}: {
  phase: PipelinePhase;
  status: PhaseStatus;
  traceId?: string;
  spanId?: string;
}) {
  const hasLangfuseLink = traceId && (status === 'completed' || status === 'current');
  const url =
    spanId && traceId
      ? getLangfuseSpanUrl(traceId, spanId)
      : traceId
        ? getLangfuseTraceUrl(traceId)
        : undefined;

  const indicator = (
    <div className="flex flex-col items-center gap-1">
      <div className="relative">
        {status === 'completed' && (
          <div className="w-6 h-6 rounded-full bg-violet-500/20 border border-violet-500/50 flex items-center justify-center">
            <Check className="w-3 h-3 text-violet-400" />
          </div>
        )}
        {status === 'current' && (
          <motion.div
            className="w-6 h-6 rounded-full bg-violet-500/30 border-2 border-violet-400 flex items-center justify-center"
            animate={{ scale: [1, 1.15, 1], opacity: [0.8, 1, 0.8] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Loader2 className="w-3 h-3 text-violet-300 animate-spin" />
          </motion.div>
        )}
        {status === 'gate-waiting' && (
          <motion.div
            className="w-6 h-6 rounded-full bg-amber-500/30 border-2 border-amber-400 flex items-center justify-center"
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Hand className="w-3 h-3 text-amber-300" />
          </motion.div>
        )}
        {status === 'skipped' && (
          <div className="w-6 h-6 rounded-full border border-dashed border-zinc-600 flex items-center justify-center">
            <SkipForward className="w-3 h-3 text-zinc-600" />
          </div>
        )}
        {status === 'future' && (
          <div className="w-6 h-6 rounded-full border border-zinc-700 flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-zinc-700" />
          </div>
        )}
        {hasLangfuseLink && (
          <ExternalLink className="absolute -top-1 -right-1 w-2.5 h-2.5 text-violet-400/60" />
        )}
      </div>
      <span
        className={cn(
          'text-[9px] font-medium leading-none',
          status === 'completed' && 'text-violet-400',
          status === 'current' && 'text-violet-300',
          status === 'gate-waiting' && 'text-amber-400',
          status === 'skipped' && 'text-zinc-600',
          status === 'future' && 'text-zinc-600'
        )}
      >
        {PHASE_LABELS[phase]}
      </span>
    </div>
  );

  if (hasLangfuseLink && url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="hover:opacity-80">
        {indicator}
      </a>
    );
  }

  return indicator;
}

function PipelineProgressBarComponent({
  pipelineState,
  branch,
  onResolveGate,
}: PipelineProgressBarProps) {
  const visiblePhases = PIPELINE_PHASES;

  return (
    <div className="flex items-center gap-1 px-3 py-2 rounded-lg bg-card/80 border border-border/50 backdrop-blur-sm">
      {/* Branch badge */}
      <span
        className={cn(
          'text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded mr-2',
          branch === 'ops'
            ? 'bg-violet-500/20 text-violet-400'
            : 'bg-emerald-500/20 text-emerald-400'
        )}
      >
        {branch}
      </span>

      {visiblePhases.map((phase, i) => {
        const status = getPhaseStatus(phase, pipelineState, branch);
        const spanId = pipelineState.phaseSpanIds?.[phase];
        const isLast = i === visiblePhases.length - 1;

        return (
          <div key={phase} className="flex items-center gap-1">
            <PhaseIndicator
              phase={phase}
              status={status}
              traceId={pipelineState.traceId}
              spanId={spanId}
            />
            {!isLast && (
              <ChevronRight
                className={cn(
                  'w-3 h-3',
                  status === 'completed' ? 'text-violet-500/40' : 'text-zinc-700'
                )}
              />
            )}
          </div>
        );
      })}

      {/* Gate action buttons */}
      <AnimatePresence>
        {pipelineState.awaitingGate && onResolveGate && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            className="flex items-center gap-1 ml-3 pl-3 border-l border-border/50"
          >
            <button
              onClick={() => onResolveGate('advance')}
              className="text-[10px] font-medium px-2 py-1 rounded bg-violet-500/20 text-violet-300 hover:bg-violet-500/30 transition-colors"
            >
              Advance
            </button>
            <button
              onClick={() => onResolveGate('reject')}
              className="text-[10px] font-medium px-2 py-1 rounded bg-zinc-500/20 text-zinc-400 hover:bg-zinc-500/30 transition-colors"
            >
              Reject
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export const PipelineProgressBar = memo(PipelineProgressBarComponent);
