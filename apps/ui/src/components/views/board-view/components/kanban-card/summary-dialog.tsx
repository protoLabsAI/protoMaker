// @ts-nocheck -- Feature index signature causes property access type errors
import { useState } from 'react';
import { Feature } from '@/store/types';
import { AgentTaskInfo } from '@/lib/agent-context-parser';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@protolabs-ai/ui/atoms';
import { Button } from '@protolabs-ai/ui/atoms';
import { Markdown } from '@protolabs-ai/ui/molecules';
import { Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';

interface SummaryDialogProps {
  feature: Feature;
  agentInfo: AgentTaskInfo | null;
  summary?: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SummaryDialog({
  feature,
  agentInfo,
  summary,
  isOpen,
  onOpenChange,
}: SummaryDialogProps) {
  const [stepIndex, setStepIndex] = useState(0);

  const pipelineSummaries = feature.pipelineSummaries;
  const hasPipelineSteps = pipelineSummaries && pipelineSummaries.length > 0;
  const mainSummary = feature.summary || summary || agentInfo?.summary;

  // Build the list of phases: main summary + pipeline step summaries
  const phases = [
    ...(mainSummary ? [{ label: 'Implementation', content: mainSummary }] : []),
    ...(hasPipelineSteps
      ? pipelineSummaries.map((s) => ({ label: s.stepName, content: s.summary }))
      : []),
  ];

  const currentPhase = phases[stepIndex] ?? null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col select-text"
        data-testid={`summary-dialog-${feature.id}`}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[var(--status-success)]" />
            Implementation Summary
          </DialogTitle>
          <DialogDescription
            className="text-sm"
            title={feature.description || feature.summary || ''}
          >
            {(() => {
              const displayText = feature.description || feature.summary || 'No description';
              return displayText.length > 100 ? `${displayText.slice(0, 100)}...` : displayText;
            })()}
          </DialogDescription>
        </DialogHeader>

        {/* Phase navigation when multiple phases are available */}
        {phases.length > 1 && (
          <div className="flex items-center justify-between gap-2 px-1 shrink-0">
            <button
              onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
              disabled={stepIndex === 0}
              className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="Previous phase"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {phases.map((phase, idx) => (
                <button
                  key={idx}
                  onClick={() => setStepIndex(idx)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                    idx === stepIndex
                      ? 'bg-primary/20 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {phase.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setStepIndex((i) => Math.min(phases.length - 1, i + 1))}
              disabled={stepIndex === phases.length - 1}
              className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="Next phase"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 bg-card rounded-lg border border-border/50">
          <Markdown>{currentPhase?.content ?? 'No summary available'}</Markdown>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            data-testid="close-summary-button"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
