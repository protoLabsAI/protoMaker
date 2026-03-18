import { useState } from 'react';
import {
  ArrowRight,
  CheckCircle,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  Layers,
} from 'lucide-react';
import Markdown from 'react-markdown';
import { Button, Badge } from '@protolabsai/ui/atoms';
import { toast } from 'sonner';
import type { Project } from '@protolabsai/types';
import { useApprovePrd, useRequestChanges } from '../../hooks/use-project';
import { useProjectWizardStore } from '@/store/project-wizard-store';

const SPARC_SECTIONS = [
  { key: 'situation', label: 'Situation' },
  { key: 'problem', label: 'Problem' },
  { key: 'approach', label: 'Approach' },
  { key: 'results', label: 'Results' },
  { key: 'constraints', label: 'Constraints' },
] as const;

interface ReviewStepProps {
  project: Project;
  projectSlug: string;
  onContinue: () => void;
}

export function ReviewStep({ project, projectSlug, onContinue }: ReviewStepProps) {
  const approveMutation = useApprovePrd(projectSlug);
  const requestChangesMutation = useRequestChanges(projectSlug);
  const markCompleted = useProjectWizardStore((s) => s.markCompleted);

  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [expandedPrd, setExpandedPrd] = useState<Set<string>>(new Set());

  const isApproved =
    project.status === 'approved' || project.status === 'active' || project.status === 'completed';
  const isPending = approveMutation.isPending || requestChangesMutation.isPending;

  const totalMilestones = project.milestones?.length ?? 0;
  const totalPhases = project.milestones?.reduce((acc, m) => acc + (m.phases?.length ?? 0), 0) ?? 0;

  const handleApprove = () => {
    approveMutation.mutate(undefined, {
      onSuccess: (res) => {
        if (res.success) {
          toast.success('PRD approved — features created on the board');
          markCompleted('review');
        } else {
          toast.error(res.error ?? 'Failed to approve PRD');
        }
      },
      onError: () => toast.error('Failed to approve PRD'),
    });
  };

  const handleRequestChanges = () => {
    if (!feedback.trim()) {
      toast.error('Please provide feedback');
      return;
    }
    requestChangesMutation.mutate(feedback, {
      onSuccess: (res) => {
        if (res.success) {
          toast.success('Changes requested');
          setShowFeedback(false);
          setFeedback('');
        } else {
          toast.error(res.error ?? 'Failed to request changes');
        }
      },
    });
  };

  const togglePrdSection = (key: string) => {
    setExpandedPrd((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Review & Approve</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {isApproved
            ? 'PRD has been approved. Features have been created on the board.'
            : 'Review the PRD and plan before creating board features.'}
        </p>
      </div>

      {/* Summary stats */}
      <div className="flex gap-4">
        <div className="rounded-lg bg-muted/20 px-4 py-3 text-center">
          <div className="text-2xl font-semibold">{totalMilestones}</div>
          <div className="text-xs text-muted-foreground">Milestones</div>
        </div>
        <div className="rounded-lg bg-muted/20 px-4 py-3 text-center">
          <div className="text-2xl font-semibold">{totalPhases}</div>
          <div className="text-xs text-muted-foreground">Phases</div>
        </div>
        <div className="rounded-lg bg-muted/20 px-4 py-3 text-center">
          <div className="text-2xl font-semibold">{totalPhases}</div>
          <div className="text-xs text-muted-foreground">Features</div>
        </div>
      </div>

      {/* PRD overview */}
      {project.prd && (
        <div className="space-y-1">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            PRD Summary
          </h3>
          {SPARC_SECTIONS.map(({ key, label }) => {
            const content = project.prd?.[key as keyof typeof project.prd] as string;
            if (!content) return null;
            const isExpanded = expandedPrd.has(key);
            return (
              <div key={key} className="rounded-md bg-muted/5">
                <button
                  type="button"
                  onClick={() => togglePrdSection(key)}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-muted/10 transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown className="size-3 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-3 text-muted-foreground" />
                  )}
                  <span className="text-xs font-medium text-muted-foreground">{label}</span>
                </button>
                {isExpanded && (
                  <div className="px-3 pb-2">
                    <div className="prose prose-sm prose-invert max-w-none prose-p:text-foreground/80 text-xs">
                      <Markdown>{content}</Markdown>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Milestone tree */}
      {project.milestones && project.milestones.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Plan
          </h3>
          {project.milestones.map((milestone, i) => (
            <div key={milestone.slug ?? i} className="rounded-md bg-muted/10 p-2.5">
              <div className="flex items-center gap-2">
                <Layers className="size-3.5 text-muted-foreground/60" />
                <span className="text-sm font-medium">{milestone.title}</span>
                <Badge variant="secondary" className="text-xs ml-auto">
                  {milestone.phases?.length ?? 0} phases
                </Badge>
              </div>
              {milestone.phases && milestone.phases.length > 0 && (
                <div className="mt-1.5 pl-5 space-y-0.5">
                  {milestone.phases.map((phase, pi) => (
                    <div
                      key={phase.name ?? pi}
                      className="flex items-center gap-2 text-xs text-muted-foreground"
                    >
                      <span className="text-muted-foreground/30">-</span>
                      <span>{phase.title}</span>
                      <Badge variant="outline" className="text-xs ml-auto">
                        {phase.complexity ?? 'medium'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      {isApproved ? (
        <div className="flex items-center justify-between pt-2 border-t border-border/10">
          <div className="flex items-center gap-2 text-sm text-emerald-400">
            <CheckCircle className="size-4" />
            Approved — features created
          </div>
          <Button onClick={onContinue}>
            Continue to Launch
            <ArrowRight className="size-4 ml-1.5" />
          </Button>
        </div>
      ) : (
        <div className="space-y-3 pt-2 border-t border-border/10">
          {showFeedback && (
            <div className="space-y-2">
              <textarea
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                rows={4}
                placeholder="Describe the changes needed..."
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowFeedback(false);
                    setFeedback('');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleRequestChanges}
                  loading={requestChangesMutation.isPending}
                >
                  <MessageSquare className="size-3.5 mr-1.5" />
                  Submit Feedback
                </Button>
              </div>
            </div>
          )}
          {!showFeedback && (
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFeedback(true)}
                disabled={isPending}
              >
                <MessageSquare className="size-3.5 mr-1.5" />
                Request Changes
              </Button>
              <Button
                onClick={handleApprove}
                loading={approveMutation.isPending}
                disabled={isPending}
              >
                <CheckCircle className="size-3.5 mr-1.5" />
                Approve & Create Features
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
