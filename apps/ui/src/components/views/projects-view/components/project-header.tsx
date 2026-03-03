import { ArrowLeft, ExternalLink } from 'lucide-react';
import { Badge } from '@protolabs-ai/ui/atoms';
import { Button } from '@protolabs-ai/ui/atoms';
import { HealthIndicator } from './health-indicator';
import { getProjectStatusVariant } from '../lib/status-variants';
import type { Project, ProjectHealth } from '@protolabs-ai/types';

export function ProjectHeader({ project, onBack }: { project: Project; onBack: () => void }) {
  return (
    <div className="shrink-0 px-6 py-4 border-b border-border/40">
      <div className="flex items-center gap-3">
        <Button size="sm" variant="ghost" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-foreground tracking-tight truncate">
              {project.title}
            </h1>
            <Badge
              variant={getProjectStatusVariant(project.status)}
              size="sm"
              className="uppercase tracking-wider shrink-0"
            >
              {project.status}
            </Badge>
            {project.health && <HealthIndicator health={project.health as ProjectHealth} />}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{project.slug}</p>
        </div>
        {project.linearProjectUrl && (
          <a
            href={project.linearProjectUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Open project in Linear"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
      </div>
    </div>
  );
}
