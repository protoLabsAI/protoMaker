import { FlaskConical, RefreshCw } from 'lucide-react';
import Markdown from 'react-markdown';
import { Button, Spinner } from '@protolabsai/ui/atoms';
import { toast } from 'sonner';
import type { Project } from '@protolabsai/types';
import { useResearchTrigger } from '../hooks/use-project';

type ResearchStatus = 'idle' | 'running' | 'complete' | 'failed';

type ProjectWithResearch = Project & {
  researchStatus?: ResearchStatus;
};

export function ResearchTab({ project }: { project: Project }) {
  const p = project as ProjectWithResearch;
  const researchStatus: ResearchStatus =
    p.researchStatus ?? (p.researchSummary ? 'complete' : 'idle');

  const { trigger, isPending } = useResearchTrigger(project.slug);

  const handleTrigger = () => {
    trigger(undefined, {
      onError: () => {
        toast.error('Failed to start research. Please try again.');
      },
    });
  };

  if (researchStatus === 'running' || isPending) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Spinner size="lg" />
        <p className="text-sm text-muted-foreground">Research in progress…</p>
      </div>
    );
  }

  if (researchStatus === 'failed') {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <FlaskConical className="w-10 h-10 text-destructive/40" />
        <p className="text-sm text-destructive">Research failed. Please try again.</p>
        <Button variant="outline" size="sm" onClick={handleTrigger} loading={isPending}>
          <RefreshCw className="w-4 h-4" />
          Retry Research
        </Button>
      </div>
    );
  }

  if (researchStatus === 'complete' && p.researchSummary) {
    return (
      <div className="py-4">
        <div className="prose prose-sm prose-invert max-w-none prose-p:text-foreground/90 prose-headings:text-foreground prose-li:text-foreground/90 prose-strong:text-foreground">
          <Markdown>{p.researchSummary}</Markdown>
        </div>
      </div>
    );
  }

  // idle state (or complete with no summary yet)
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <FlaskConical className="w-10 h-10 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">No research available yet.</p>
      <Button variant="outline" size="sm" onClick={handleTrigger} loading={isPending}>
        <FlaskConical className="w-4 h-4" />
        Run Research
      </Button>
    </div>
  );
}
