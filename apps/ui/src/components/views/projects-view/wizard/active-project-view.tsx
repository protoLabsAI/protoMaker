import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  Settings2,
  ExternalLink,
  Layers,
  BookOpen,
  FileText,
  FlaskConical,
  Activity,
  Archive,
  RefreshCw,
} from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import Markdown from 'react-markdown';
import { Button, Badge, Tabs, TabsList, TabsTrigger, TabsContent } from '@protolabsai/ui/atoms';
import type { Project, ProjectHealth, ArtifactIndexEntry } from '@protolabsai/types';
import { useQueryClient } from '@tanstack/react-query';
import type { EventType } from '@protolabsai/types';
import { getHttpApiClient } from '@/lib/http-api-client';
import { useProjectFeatures } from '../hooks/use-project-features';
import { ProjectMetadataSheet } from './project-metadata-sheet';
import { HealthIndicator } from '../components/health-indicator';
import { FeaturesTab } from '../tabs/features-tab';
import { ResourcesTab } from '../tabs/resources-tab';
import { ProjectTimeline } from '@/components/views/projects/project-timeline';
import { ProjectArtifactViewer } from '@/components/views/projects/project-artifact-viewer';

interface ActiveProjectViewProps {
  project: Project;
  projectSlug: string;
  onBack: () => void;
}

const SPARC_SECTIONS = [
  { key: 'situation' as const, label: 'Situation' },
  { key: 'problem' as const, label: 'Problem' },
  { key: 'approach' as const, label: 'Approach' },
  { key: 'results' as const, label: 'Results' },
  { key: 'constraints' as const, label: 'Constraints' },
];

export function ActiveProjectView({ project, projectSlug, onBack }: ActiveProjectViewProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [isRefreshingTimeline, setIsRefreshingTimeline] = useState(false);
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

  const refreshTimeline = useCallback(() => {
    setIsRefreshingTimeline(true);
    queryClient
      .invalidateQueries({ queryKey: ['project-timeline', projectSlug] })
      .finally(() => setTimeout(() => setIsRefreshingTimeline(false), 500));
  }, [queryClient, projectSlug]);

  useEffect(() => {
    const TIMELINE_TRIGGER_EVENTS: EventType[] = [
      'feature:status-changed',
      'milestone:completed',
      'ceremony:fired',
      'pr:merged',
      'escalation:signal-received',
    ];

    const api = getHttpApiClient();
    const unsubscribe = api.subscribeToEvents((type: EventType) => {
      if ((TIMELINE_TRIGGER_EVENTS as string[]).includes(type)) {
        queryClient.invalidateQueries({ queryKey: ['project-timeline', projectSlug] });
      }
    });

    return unsubscribe;
  }, [queryClient, projectSlug]);

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

      {/* Tabs */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex flex-col flex-1 min-h-0"
        >
          <div className="shrink-0 px-4 pt-2">
            <TabsList>
              <TabsTrigger value="overview">
                <Layers className="size-3.5" />
                <span className="hidden sm:inline">Overview</span>
              </TabsTrigger>
              <TabsTrigger value="features">
                <Layers className="size-3.5" />
                <span className="hidden sm:inline">Features</span>
              </TabsTrigger>
              {project.prd && (
                <TabsTrigger value="prd">
                  <FileText className="size-3.5" />
                  <span className="hidden sm:inline">PRD</span>
                </TabsTrigger>
              )}
              {project.researchSummary && (
                <TabsTrigger value="research">
                  <FlaskConical className="size-3.5" />
                  <span className="hidden sm:inline">Research</span>
                </TabsTrigger>
              )}
              <TabsTrigger value="resources">
                <BookOpen className="size-3.5" />
                <span className="hidden sm:inline">Resources</span>
              </TabsTrigger>
              <TabsTrigger value="timeline">
                <Activity className="size-3.5" />
                <span className="hidden sm:inline">Timeline</span>
              </TabsTrigger>
              <TabsTrigger value="artifacts">
                <Archive className="size-3.5" />
                <span className="hidden sm:inline">Artifacts</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="max-w-4xl mx-auto px-4 sm:px-8">
              {/* Overview tab */}
              <TabsContent value="overview">
                <div className="py-6 space-y-8">
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
                            milestone.phases?.filter((p) => p.executionStatus === 'completed')
                              .length ?? 0;
                          const phasePct =
                            totalPhases > 0 ? Math.round((completedPhases / totalPhases) * 100) : 0;

                          return (
                            <div
                              key={milestone.slug ?? i}
                              className="rounded-lg border border-border/10 bg-muted/5 p-3"
                            >
                              <div className="flex items-center gap-2">
                                <Layers className="size-3.5 text-muted-foreground/50" />
                                <span className="text-sm font-medium flex-1">
                                  {milestone.title}
                                </span>
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
                                {update.author} &middot;{' '}
                                {new Date(update.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-xs text-foreground/80">{update.body}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* Features tab */}
              <TabsContent value="features">
                <FeaturesTab projectSlug={projectSlug} />
              </TabsContent>

              {/* PRD tab */}
              {project.prd && (
                <TabsContent value="prd">
                  <div className="py-6 space-y-4">
                    {SPARC_SECTIONS.map(({ key, label }) => {
                      const content = project.prd?.[key] ?? '';
                      if (!content) return null;
                      return (
                        <div key={key} className="space-y-1.5">
                          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            {label}
                          </h3>
                          <div className="rounded-lg border border-border/10 bg-muted/5 p-4 border-l-2 border-l-primary/30">
                            <div className="prose prose-sm prose-invert max-w-none prose-p:text-foreground/90 prose-headings:text-foreground prose-li:text-foreground/90">
                              <Markdown>{content}</Markdown>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </TabsContent>
              )}

              {/* Research tab */}
              {project.researchSummary && (
                <TabsContent value="research">
                  <div className="py-6">
                    <div className="rounded-lg border border-border/20 bg-muted/10 p-4">
                      <div className="prose prose-sm prose-invert max-w-none prose-p:text-foreground/90 prose-headings:text-foreground prose-li:text-foreground/90 prose-strong:text-foreground">
                        <Markdown>{project.researchSummary}</Markdown>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              )}

              {/* Resources tab */}
              <TabsContent value="resources">
                <ResourcesTab projectSlug={projectSlug} project={project} />
              </TabsContent>

              {/* Timeline tab */}
              <TabsContent value="timeline">
                <div className="py-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-foreground">Activity Timeline</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={refreshTimeline}
                      disabled={isRefreshingTimeline}
                      aria-label="Refresh timeline"
                    >
                      <RefreshCw
                        className={`size-4 mr-1 ${isRefreshingTimeline ? 'animate-spin' : ''}`}
                      />
                      Refresh
                    </Button>
                  </div>
                  <ProjectTimeline projectSlug={projectSlug} />
                </div>
              </TabsContent>

              {/* Artifacts tab */}
              <TabsContent value="artifacts">
                <div className="py-4">
                  <ProjectArtifactViewer
                    artifacts={
                      (project as Project & { artifacts?: ArtifactIndexEntry[] }).artifacts ?? []
                    }
                  />
                </div>
              </TabsContent>
            </div>
          </div>
        </Tabs>
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
