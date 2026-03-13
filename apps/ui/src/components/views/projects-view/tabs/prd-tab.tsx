import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  CheckCircle,
  MessageSquare,
  Rocket,
  Loader2,
} from 'lucide-react';
import Markdown from 'react-markdown';
import { Button } from '@protolabsai/ui/atoms';
import { toast } from 'sonner';
import type { Project } from '@protolabsai/types';
import {
  useApprovePrd,
  useRequestChanges,
  useLaunchProject,
  useProjectUpdate,
} from '../hooks/use-project';
import { InlineEditor } from '@/components/shared/inline-editor';

const SPARC_SECTIONS = [
  { key: 'situation', label: 'Situation', color: 'text-[var(--status-info)]' },
  { key: 'problem', label: 'Problem', color: 'text-[var(--status-error)]' },
  { key: 'approach', label: 'Approach', color: 'text-[var(--status-success)]' },
  { key: 'results', label: 'Results', color: 'text-[var(--status-warning)]' },
  { key: 'constraints', label: 'Constraints', color: 'text-[color:var(--primary)]' },
] as const;

function CollapsibleSection({
  label,
  color,
  content,
  defaultOpen = false,
  onSave,
  isSaving,
}: {
  label: string;
  color: string;
  content: string;
  defaultOpen?: boolean;
  onSave?: (html: string) => void;
  isSaving?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border/20 rounded-lg overflow-hidden">
      <button
        type="button"
        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        )}
        <h4 className={`text-xs font-semibold uppercase tracking-wider ${color}`}>{label}</h4>
      </button>
      {open && (
        <div className="px-3 pb-3">
          {onSave ? (
            <InlineEditor
              content={content}
              onSave={onSave}
              isSaving={isSaving}
              placeholder={`Describe the ${label.toLowerCase()}...`}
              className="prose prose-sm prose-invert max-w-none prose-p:text-foreground/90 prose-headings:text-foreground prose-li:text-foreground/90 prose-strong:text-foreground"
            />
          ) : (
            <div className="prose prose-sm prose-invert max-w-none prose-p:text-foreground/90 prose-headings:text-foreground prose-li:text-foreground/90 prose-strong:text-foreground">
              <Markdown>{content}</Markdown>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReviewingActions({ projectSlug }: { projectSlug: string }) {
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState('');
  const approveMutation = useApprovePrd(projectSlug);
  const requestChangesMutation = useRequestChanges(projectSlug);

  const handleApprove = () => {
    approveMutation.mutate(undefined, {
      onSuccess: (res) => {
        if (res.success) {
          toast.success('PRD approved — creating features');
        } else {
          toast.error(res.error ?? 'Failed to approve PRD');
        }
      },
      onError: () => toast.error('Failed to approve PRD'),
    });
  };

  const handleRequestChanges = () => {
    if (!feedback.trim()) {
      toast.error('Please provide feedback before submitting');
      return;
    }
    requestChangesMutation.mutate(feedback, {
      onSuccess: (res) => {
        if (res.success) {
          toast.success('Changes requested — feedback stored for PRD regeneration');
          setShowFeedback(false);
          setFeedback('');
        } else {
          toast.error(res.error ?? 'Failed to request changes');
        }
      },
      onError: () => toast.error('Failed to request changes'),
    });
  };

  const isPending = approveMutation.isPending || requestChangesMutation.isPending;

  return (
    <div className="border-t border-border/30 pt-3 mt-3 space-y-3">
      {showFeedback && (
        <div className="space-y-2">
          <textarea
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            rows={4}
            placeholder="Describe the changes needed..."
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            disabled={requestChangesMutation.isPending}
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowFeedback(false);
                setFeedback('');
              }}
              disabled={requestChangesMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleRequestChanges}
              disabled={requestChangesMutation.isPending}
            >
              {requestChangesMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
              )}
              Submit Feedback
            </Button>
          </div>
        </div>
      )}
      {!showFeedback && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFeedback(true)}
            disabled={isPending}
            data-testid="request-changes-button"
          >
            <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
            Request Changes
          </Button>
          <Button
            size="sm"
            onClick={handleApprove}
            disabled={isPending}
            data-testid="approve-prd-button"
          >
            {approveMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
            )}
            Approve PRD
          </Button>
        </div>
      )}
    </div>
  );
}

function ApprovedActions({ projectSlug }: { projectSlug: string }) {
  const launchMutation = useLaunchProject(projectSlug);
  const [maxConcurrency, setMaxConcurrency] = useState<string>('');

  const handleLaunch = () => {
    const concurrency = maxConcurrency.trim() ? parseInt(maxConcurrency, 10) : undefined;
    launchMutation.mutate(concurrency, {
      onSuccess: (res) => {
        if (res.success) {
          toast.success(
            res.autoModeStarted
              ? `Project launched — auto-mode started with ${res.featuresInBacklog ?? 0} features`
              : 'Project launched'
          );
        } else {
          toast.error(res.error ?? 'Failed to launch project');
        }
      },
      onError: () => toast.error('Failed to launch project'),
    });
  };

  return (
    <div className="border-t border-border/30 pt-3 mt-3">
      <div className="flex items-center justify-end gap-2">
        <input
          type="number"
          min={1}
          max={10}
          placeholder="Max concurrency (optional)"
          value={maxConcurrency}
          onChange={(e) => setMaxConcurrency(e.target.value)}
          disabled={launchMutation.isPending}
          className="w-48 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <Button
          size="sm"
          onClick={handleLaunch}
          disabled={launchMutation.isPending}
          data-testid="launch-project-button"
        >
          {launchMutation.isPending ? (
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          ) : (
            <Rocket className="w-3.5 h-3.5 mr-1.5" />
          )}
          Launch
        </Button>
      </div>
    </div>
  );
}

export function PrdTab({ project, projectSlug }: { project: Project; projectSlug: string }) {
  const updateMutation = useProjectUpdate(projectSlug);

  if (!project.prd) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-muted-foreground">
          No PRD generated yet. Use the project lifecycle to create one.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 py-4">
      {SPARC_SECTIONS.map(({ key, label, color }) => {
        const content = project.prd?.[key as keyof typeof project.prd];
        if (!content || typeof content !== 'string') return null;
        return (
          <CollapsibleSection
            key={key}
            label={label}
            color={color}
            content={content}
            defaultOpen={key === 'situation'}
            isSaving={updateMutation.isPending}
            onSave={(html) => {
              updateMutation.mutate(
                { prd: { ...project.prd, [key]: html } },
                { onSuccess: () => toast.success(`${label} updated`) }
              );
            }}
          />
        );
      })}

      {project.status === 'reviewing' && <ReviewingActions projectSlug={projectSlug} />}
      {project.status === 'approved' && <ApprovedActions projectSlug={projectSlug} />}
    </div>
  );
}
