import { Badge } from '@protolabs-ai/ui/atoms';
import { cn } from '@/lib/utils';
import { getMilestoneStatusVariant } from '../lib/status-variants';
import type { Project } from '@protolabs-ai/types';

export function MilestonesTab({ project }: { project: Project }) {
  if (!project.milestones || project.milestones.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-muted-foreground">
          No milestones defined. Approve a PRD to generate milestones.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 py-4">
      {project.milestones.map((ms, i) => {
        const totalPhases = ms.phases?.length ?? 0;
        const linkedPhases = ms.phases?.filter((p) => p.featureId).length ?? 0;
        const progressPct = totalPhases > 0 ? Math.round((linkedPhases / totalPhases) * 100) : 0;
        return (
          <div key={i} className="border border-border/30 rounded-lg overflow-hidden">
            <div className="px-3 py-2.5 bg-muted/20">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">{ms.title}</span>
                <div className="flex items-center gap-2">
                  {ms.targetDate && (
                    <span className="text-[10px] text-muted-foreground">{ms.targetDate}</span>
                  )}
                  <Badge
                    variant={getMilestoneStatusVariant(ms.status)}
                    size="sm"
                    className="uppercase tracking-wider"
                  >
                    {ms.status}
                  </Badge>
                </div>
              </div>
              {ms.description && (
                <p className="text-xs text-muted-foreground mt-0.5">{ms.description}</p>
              )}

              {/* Progress bar */}
              {totalPhases > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-muted/40 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--status-success)] rounded-full transition-all"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {linkedPhases}/{totalPhases}
                  </span>
                </div>
              )}
            </div>

            {/* Phases */}
            {ms.phases && ms.phases.length > 0 && (
              <div className="divide-y divide-border/20">
                {ms.phases.map((phase, j) => (
                  <div key={j} className="px-3 py-1.5 flex items-center gap-2">
                    <span className="text-xs text-foreground/80 flex-1">{phase.title}</span>
                    {phase.complexity && (
                      <span className="text-[10px] text-muted-foreground">{phase.complexity}</span>
                    )}
                    {phase.featureId && (
                      <Badge variant="outline" className="text-[9px]">
                        linked
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
