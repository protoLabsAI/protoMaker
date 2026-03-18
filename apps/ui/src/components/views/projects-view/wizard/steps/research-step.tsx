import { FlaskConical, RefreshCw, ArrowRight, SkipForward } from 'lucide-react';
import Markdown from 'react-markdown';
import { Button, Spinner } from '@protolabsai/ui/atoms';
import { toast } from 'sonner';
import type { Project } from '@protolabsai/types';
import { useResearchTrigger } from '../../hooks/use-project';
import { useProjectWizardStore } from '@/store/project-wizard-store';

type ResearchStatus = 'idle' | 'running' | 'complete' | 'failed';

interface ResearchStepProps {
  project: Project;
  onContinue: () => void;
  onSkip: () => void;
}

export function ResearchStep({ project, onContinue, onSkip }: ResearchStepProps) {
  const researchStatus: ResearchStatus =
    ((project as unknown as { researchStatus?: string }).researchStatus as ResearchStatus) ??
    (project.researchSummary ? 'complete' : 'idle');

  const { trigger, isPending } = useResearchTrigger(project.slug);
  const markCompleted = useProjectWizardStore((s) => s.markCompleted);

  const handleTrigger = () => {
    trigger(undefined, {
      onError: () => toast.error('Failed to start research. Please try again.'),
    });
  };

  const handleContinue = () => {
    markCompleted('research');
    onContinue();
  };

  const handleSkip = () => {
    onSkip();
  };

  if (researchStatus === 'running' || isPending) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Deep Research</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Analyzing the codebase and researching best practices...
          </p>
        </div>
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Spinner size="lg" />
          <p className="text-sm text-muted-foreground">Research in progress...</p>
          <p className="text-xs text-muted-foreground/60">
            This may take a few minutes. You can skip and come back later.
          </p>
        </div>
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={handleSkip}>
            <SkipForward className="size-4 mr-1.5" />
            Skip for now
          </Button>
        </div>
      </div>
    );
  }

  if (researchStatus === 'failed') {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Deep Research</h2>
          <p className="text-sm text-muted-foreground mt-1">Research encountered an error.</p>
        </div>
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <FlaskConical className="size-10 text-destructive/40" />
          <p className="text-sm text-destructive/80">Research failed. Please try again.</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleTrigger}>
              <RefreshCw className="size-4 mr-1.5" />
              Retry
            </Button>
            <Button variant="ghost" size="sm" onClick={handleSkip}>
              Skip
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (researchStatus === 'complete' && project.researchSummary) {
    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">Deep Research</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Research complete. Review the findings below.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={handleTrigger} loading={isPending}>
            <RefreshCw className="size-4 mr-1.5" />
            Re-run
          </Button>
        </div>
        <div className="rounded-lg border border-border/20 bg-muted/10 p-4">
          <div className="prose prose-sm prose-invert max-w-none prose-p:text-foreground/90 prose-headings:text-foreground prose-li:text-foreground/90 prose-strong:text-foreground">
            <Markdown>{project.researchSummary}</Markdown>
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleContinue}>
            Continue
            <ArrowRight className="size-4 ml-1.5" />
          </Button>
        </div>
      </div>
    );
  }

  // Idle state
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Deep Research</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Run AI-powered research to analyze the codebase and gather best practices before writing
          the PRD. This step is optional.
        </p>
      </div>
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <FlaskConical className="size-10 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No research available yet.</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleTrigger} loading={isPending}>
            <FlaskConical className="size-4 mr-1.5" />
            Run Research
          </Button>
          <Button variant="ghost" onClick={handleSkip}>
            <SkipForward className="size-4 mr-1.5" />
            Skip
          </Button>
        </div>
      </div>
    </div>
  );
}
