import Markdown from 'react-markdown';
import type { Project } from '@protolabsai/types';

export function ResearchTab({ project }: { project: Project }) {
  if (!project.researchSummary) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-muted-foreground">No research summary available yet.</p>
      </div>
    );
  }

  return (
    <div className="py-4">
      <div className="prose prose-sm prose-invert max-w-none prose-p:text-foreground/90 prose-headings:text-foreground prose-li:text-foreground/90 prose-strong:text-foreground">
        <Markdown>{project.researchSummary}</Markdown>
      </div>
    </div>
  );
}
