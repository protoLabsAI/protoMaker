import { ArrowLeft, ExternalLink } from 'lucide-react';
import { Badge } from '@protolabs-ai/ui/atoms';
import { Button } from '@protolabs-ai/ui/atoms';
import { cn } from '@/lib/utils';
import { HealthIndicator } from './health-indicator';
import type { Project, ProjectHealth } from '@protolabs-ai/types';

const STATUS_COLORS: Record<string, string> = {
  researching: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  drafting: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  reviewing: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  approved: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  scaffolded: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  active: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  completed: 'bg-green-500/20 text-green-400 border-green-500/30',
};

export function ProjectHeader({ project, onBack }: { project: Project; onBack: () => void }) {
  const statusClass = STATUS_COLORS[project.status] || 'bg-muted text-muted-foreground';

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
              variant="outline"
              className={cn('text-[10px] uppercase tracking-wider shrink-0', statusClass)}
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
