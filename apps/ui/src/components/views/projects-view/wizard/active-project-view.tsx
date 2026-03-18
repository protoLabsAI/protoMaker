import { useState } from 'react';
import { ArrowLeft, Settings2, ExternalLink, Layers, BookOpen } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { Button, Badge } from '@protolabsai/ui/atoms';
import type { Project, ProjectHealth } from '@protolabsai/types';
import { useProjectUpdate } from '../hooks/use-project';
import { useProjectFeatures } from '../hooks/use-project-features';
import { ProjectMetadataSheet } from './project-metadata-sheet';
import { HealthIndicator } from '../components/health-indicator';

interface ActiveProjectViewProps {
  project: Project;
  projectSlug: string;
  onBack: () => void;
}

export function ActiveProjectView({ project, projectSlug, onBack }: ActiveProjectViewProps) {
  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);
  const { data: featuresData } = useProjectFeatures(projectSlug);

  const features = (featuresData?.data?.features ?? []) as Array<{
    id: string;
    title: string;
    status?: string;
    epicId?: string;
  }>;

  const totalFeatures = features.length;
  const doneFeatures = features.filter((f) => f.status === 'done').length;
  const inProgressFeatures = features.filter((f) => f.status === 'in_progress').length;
  const reviewFeatures = features.filter((f) => f.status === 'review').length;
  const blockedFeatures = features.filter((f) => f.status === 'blocked').length;
  const progressPct = totalFeatures > 0 ? Math.round((doneFeatures / totalFeatures) * 100) : 0;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-border/20">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to projects">
          <ArrowLeft className="size-4" />
        </Button>

        <div
          className="size-3 rounded-full shrink-0"
          style={{ backgroundColor: project.color || 'transparent' }}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold truncate">{project.title}</h1>
            <Badge variant="secondary" className="text-xs capitalize">
              {project.status}
            </Badge>
            {project.health && <HealthIndicator health={project.health as ProjectHealth} />}
          </div>
          {project.goal && <p className="text-xs text-muted-foreground truncate">{project.goal}</p>}
        </div>

        <Button variant="ghost" size="icon" onClick={() => setSheetOpen(true)}>
          <Settings2 className="size-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-6 sm:px-8 space-y-8">
          {/* Progress overview */}
          <div className="space-y-3">
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Progress
            </h2>
            <div className="rounded-lg border border-border/20 bg-muted/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{progressPct}% complete</span>
                <span className="text-xs text-muted-foreground">
                  {doneFeatures}/{totalFeatures} features
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500/60 transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="flex gap-4 text-xs">
                {inProgressFeatures > 0 && (
                  <span className="text-muted-foreground">
                    <span className="inline-block size-2 rounded-full bg-blue-400/60 mr-1" />
                    {inProgressFeatures} in progress
                  </span>
                )}
                {reviewFeatures > 0 && (
                  <span className="text-muted-foreground">
                    <span className="inline-block size-2 rounded-full bg-amber-400/60 mr-1" />
                    {reviewFeatures} in review
                  </span>
                )}
                {blockedFeatures > 0 && (
                  <span className="text-muted-foreground">
                    <span className="inline-block size-2 rounded-full bg-red-400/60 mr-1" />
                    {blockedFeatures} blocked
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Milestone progress */}
          {project.milestones && project.milestones.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Milestones
              </h2>
              <div className="space-y-2">
                {project.milestones.map((milestone, i) => {
                  const totalPhases = milestone.phases?.length ?? 0;
                  const completedPhases =
                    milestone.phases?.filter((p) => p.executionStatus === 'completed').length ?? 0;
                  const phasePct =
                    totalPhases > 0 ? Math.round((completedPhases / totalPhases) * 100) : 0;

                  return (
                    <div
                      key={milestone.slug ?? i}
                      className="rounded-lg border border-border/10 bg-muted/5 p-3"
                    >
                      <div className="flex items-center gap-2">
                        <Layers className="size-3.5 text-muted-foreground/50" />
                        <span className="text-sm font-medium flex-1">{milestone.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {completedPhases}/{totalPhases}
                        </span>
                      </div>
                      <div className="w-full h-1 rounded-full bg-muted mt-2 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-emerald-500/50"
                          style={{ width: `${phasePct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick actions */}
          <div className="space-y-3">
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Quick Actions
            </h2>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => navigate({ to: '/' })}>
                <ExternalLink className="size-3.5 mr-1.5" />
                View Board
              </Button>
              {project.links?.map((link) => (
                <Button key={link.id} variant="outline" size="sm" asChild>
                  <a href={link.url} target="_blank" rel="noopener noreferrer">
                    <BookOpen className="size-3.5 mr-1.5" />
                    {link.label}
                  </a>
                </Button>
              ))}
            </div>
          </div>

          {/* Recent updates */}
          {project.updates && project.updates.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Recent Updates
              </h2>
              <div className="space-y-2">
                {project.updates.slice(0, 5).map((update) => (
                  <div key={update.id} className="rounded-md bg-muted/5 p-3 text-sm">
                    <div className="flex items-center gap-2 mb-1">
                      {update.health && <HealthIndicator health={update.health} />}
                      <span className="text-xs text-muted-foreground">
                        {update.author} &middot; {new Date(update.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-xs text-foreground/80">{update.body}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <ProjectMetadataSheet
        project={project}
        projectSlug={projectSlug}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}
