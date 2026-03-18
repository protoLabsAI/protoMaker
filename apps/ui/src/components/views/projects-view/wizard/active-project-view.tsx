import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  PanelLeft,
  Trash2,
  MessageSquareDot,
  FileText,
  Layers,
  BookOpen,
  MessageSquare,
  FlaskConical,
  Activity,
  Archive,
  Milestone as MilestoneIcon,
  RefreshCw,
  ChevronDown,
  Calendar,
  User,
  ExternalLink,
  Palette,
} from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import Markdown from 'react-markdown';
import {
  Button,
  Badge,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@protolabsai/ui/atoms';
import type { Project, ProjectHealth, ProjectStatus, ArtifactIndexEntry } from '@protolabsai/types';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { EventType } from '@protolabsai/types';
import { getHttpApiClient } from '@/lib/http-api-client';
import { cn } from '@/lib/utils';
import { useProjectUpdate, useProjectDelete } from '../hooks/use-project';
import { useProjectFeatures } from '../hooks/use-project-features';
import { HealthIndicator } from '../components/health-indicator';
import { getProjectStatusVariant, getMilestoneStatusVariant } from '../lib/status-variants';
import { FeaturesTab } from '../tabs/features-tab';
import { ResourcesTab } from '../tabs/resources-tab';
import { ProjectTimeline } from '@/components/views/projects/project-timeline';
import { ProjectArtifactViewer } from '@/components/views/projects/project-artifact-viewer';
import { useAppStore } from '@/store/app-store';
import { useAvaChannelStore } from '@/store/ava-channel-store';
import { useChatStore } from '@/store/chat-store';
import { DeleteConfirmDialog } from '@/components/shared/delete-confirm-dialog';

interface ActiveProjectViewProps {
  project: Project;
  projectSlug: string;
  onBack: () => void;
}

const PROJECT_STATUSES: { value: ProjectStatus; label: string }[] = [
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'researching', label: 'Researching' },
  { value: 'drafting', label: 'Drafting' },
  { value: 'reviewing', label: 'Reviewing' },
  { value: 'approved', label: 'Approved' },
  { value: 'scaffolded', label: 'Scaffolded' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
];

const SPARC_SECTIONS = [
  { key: 'situation' as const, label: 'Situation' },
  { key: 'problem' as const, label: 'Problem' },
  { key: 'approach' as const, label: 'Approach' },
  { key: 'results' as const, label: 'Results' },
  { key: 'constraints' as const, label: 'Constraints' },
];

const HEALTH_OPTIONS: { value: ProjectHealth; label: string }[] = [
  { value: 'on-track', label: 'On Track' },
  { value: 'at-risk', label: 'At Risk' },
  { value: 'off-track', label: 'Off Track' },
];

export function ActiveProjectView({ project, projectSlug, onBack }: ActiveProjectViewProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const projectPath = useAppStore((s) => s.currentProject?.path) ?? '';
  const setPendingProjectSlug = useAvaChannelStore((s) => s.setPendingProjectSlug);
  const setLastActiveTab = useAvaChannelStore((s) => s.setLastActiveTab);
  const setChatModalOpen = useChatStore((s) => s.setChatModalOpen);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState('features');
  const [isRefreshingTimeline, setIsRefreshingTimeline] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const updateProject = useProjectUpdate(projectSlug);
  const deleteMutation = useProjectDelete();
  const { data: featuresData } = useProjectFeatures(projectSlug);

  const features = (featuresData?.data?.features ?? []) as Array<{
    id: string;
    title: string;
    status?: string;
    epicId?: string;
  }>;
  const epics = ((featuresData?.data as Record<string, unknown>)?.epics ?? []) as Array<{
    id: string;
    status?: string;
  }>;

  const allItems = [...features, ...epics];
  const totalFeatures = allItems.length;
  const doneFeatures = allItems.filter((f) => f.status === 'done').length;
  const progressPct = totalFeatures > 0 ? Math.round((doneFeatures / totalFeatures) * 100) : 0;

  const handleOpenPmChat = () => {
    setPendingProjectSlug(projectSlug);
    setLastActiveTab('projects');
    setChatModalOpen(true);
  };

  const handleDelete = () => {
    deleteMutation.mutate(projectSlug, {
      onSuccess: (res) => {
        if (res.success) {
          toast.success(`Deleted project "${project.title}"`);
          onBack();
        } else {
          toast.error(res.error ?? 'Failed to delete project');
        }
      },
      onError: () => toast.error('Failed to delete project'),
    });
  };

  const handleStatusChange = (status: ProjectStatus) => {
    updateProject.mutate({ status });
  };

  const handleHealthChange = (health: ProjectHealth) => {
    updateProject.mutate({ health });
  };

  const refreshTimeline = useCallback(() => {
    setIsRefreshingTimeline(true);
    queryClient
      .invalidateQueries({ queryKey: ['project-timeline', projectPath, projectSlug] })
      .finally(() => setTimeout(() => setIsRefreshingTimeline(false), 500));
  }, [queryClient, projectPath, projectSlug]);

  useEffect(() => {
    if (!projectPath || !projectSlug) return;

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
        queryClient.invalidateQueries({ queryKey: ['project-timeline', projectPath, projectSlug] });
      }
    });

    return unsubscribe;
  }, [queryClient, projectPath, projectSlug]);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-border/20">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to projects">
          <ArrowLeft className="size-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarOpen((v) => !v)}
          className={sidebarOpen ? 'text-foreground' : 'text-muted-foreground'}
          aria-label="Toggle sidebar"
        >
          <PanelLeft className="size-4" />
        </Button>

        <div
          className="size-2.5 rounded-full shrink-0"
          style={{ backgroundColor: project.color || 'var(--muted)' }}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold truncate">{project.title}</h1>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-0.5 hover:opacity-80 transition-opacity shrink-0"
                >
                  <Badge
                    variant={getProjectStatusVariant(project.status)}
                    size="sm"
                    className="uppercase tracking-wider text-[10px]"
                  >
                    {project.status}
                  </Badge>
                  <ChevronDown className="size-3 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {PROJECT_STATUSES.map((s) => (
                  <DropdownMenuItem key={s.value} onClick={() => handleStatusChange(s.value)}>
                    <Badge
                      variant={getProjectStatusVariant(s.value)}
                      size="sm"
                      className="uppercase tracking-wider text-[10px]"
                    >
                      {s.label}
                    </Badge>
                    {s.value === project.status && (
                      <span className="text-[10px] text-muted-foreground ml-auto">current</span>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {totalFeatures > 0 && (
              <span className="text-[10px] text-muted-foreground shrink-0">
                {doneFeatures}/{totalFeatures}
              </span>
            )}
            {project.health && <HealthIndicator health={project.health as ProjectHealth} />}
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={handleOpenPmChat}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Open PM chat"
        >
          <MessageSquareDot className="size-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowDeleteDialog(true)}
          className="text-muted-foreground hover:text-destructive"
          aria-label="Delete project"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      {/* Main area: sidebar + content */}
      <div className="flex-1 flex min-h-0">
        {/* Sidebar — collapsible property panel */}
        {sidebarOpen && (
          <div className="w-56 shrink-0 border-r border-border/10 overflow-y-auto bg-muted/[0.02]">
            <div className="px-3 py-3 space-y-3">
              {/* Progress */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Progress
                </span>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-foreground/80">{progressPct}%</span>
                    <span className="text-muted-foreground">
                      {doneFeatures}/{totalFeatures}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500/60 transition-all"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="h-px bg-border/10" />

              {/* Properties */}
              <div className="space-y-2">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Properties
                </span>

                {/* Health */}
                <PropertyRow label="Health">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="text-xs hover:text-foreground transition-colors text-left"
                      >
                        {project.health ? (
                          <HealthIndicator health={project.health as ProjectHealth} size="sm" />
                        ) : (
                          <span className="text-muted-foreground">None</span>
                        )}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {HEALTH_OPTIONS.map((h) => (
                        <DropdownMenuItem key={h.value} onClick={() => handleHealthChange(h.value)}>
                          <HealthIndicator health={h.value} size="sm" />
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </PropertyRow>

                {/* Priority */}
                <PropertyRow label="Priority">
                  <span className="text-xs text-foreground/80 capitalize">
                    {project.priority ?? 'none'}
                  </span>
                </PropertyRow>

                {/* Lead */}
                <PropertyRow label="Lead" icon={User}>
                  <span className="text-xs text-foreground/80">{project.lead || '—'}</span>
                </PropertyRow>

                {/* Color */}
                {project.color && (
                  <PropertyRow label="Color" icon={Palette}>
                    <div className="flex items-center gap-1.5">
                      <div
                        className="size-3 rounded-sm"
                        style={{ backgroundColor: project.color }}
                      />
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {project.color}
                      </span>
                    </div>
                  </PropertyRow>
                )}

                {/* Target date */}
                {project.targetDate && (
                  <PropertyRow label="Target" icon={Calendar}>
                    <span className="text-xs text-foreground/80">{project.targetDate}</span>
                  </PropertyRow>
                )}

                {/* Start date */}
                {project.startDate && (
                  <PropertyRow label="Started" icon={Calendar}>
                    <span className="text-xs text-foreground/80">{project.startDate}</span>
                  </PropertyRow>
                )}
              </div>

              {/* Milestones */}
              {project.milestones && project.milestones.length > 0 && (
                <>
                  <div className="h-px bg-border/10" />
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Milestones
                    </span>
                    {project.milestones.map((m, i) => {
                      const total = m.phases?.length ?? 0;
                      const done =
                        m.phases?.filter((p) => p.executionStatus === 'completed').length ?? 0;
                      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                      return (
                        <div key={m.slug ?? i} className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-foreground/80 truncate flex-1">
                              {m.title}
                            </span>
                            <Badge
                              variant={getMilestoneStatusVariant(m.status)}
                              size="sm"
                              className="text-[9px] shrink-0"
                            >
                              {done}/{total}
                            </Badge>
                          </div>
                          <div className="h-1 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-emerald-500/50"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Links */}
              {project.links && project.links.length > 0 && (
                <>
                  <div className="h-px bg-border/10" />
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Links
                    </span>
                    {project.links.map((link) => (
                      <a
                        key={link.id}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs text-foreground/70 hover:text-foreground transition-colors"
                      >
                        <ExternalLink className="size-3 shrink-0" />
                        <span className="truncate">{link.label}</span>
                      </a>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Main content — tabs */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex flex-col flex-1 min-h-0"
          >
            <div className="shrink-0 px-3 pt-1.5 border-b border-border/10">
              <TabsList>
                {project.prd && (
                  <TabsTrigger value="prd">
                    <FileText className="size-3.5" />
                    <span className="hidden sm:inline">PRD</span>
                  </TabsTrigger>
                )}
                {project.milestones && project.milestones.length > 0 && (
                  <TabsTrigger value="milestones">
                    <MilestoneIcon className="size-3.5" />
                    <span className="hidden sm:inline">Milestones</span>
                  </TabsTrigger>
                )}
                <TabsTrigger value="features">
                  <Layers className="size-3.5" />
                  <span className="hidden sm:inline">Features</span>
                </TabsTrigger>
                <TabsTrigger value="resources">
                  <BookOpen className="size-3.5" />
                  <span className="hidden sm:inline">Resources</span>
                </TabsTrigger>
                {project.updates && project.updates.length > 0 && (
                  <TabsTrigger value="updates">
                    <MessageSquare className="size-3.5" />
                    <span className="hidden sm:inline">Updates</span>
                  </TabsTrigger>
                )}
                {project.researchSummary && (
                  <TabsTrigger value="research">
                    <FlaskConical className="size-3.5" />
                    <span className="hidden sm:inline">Research</span>
                  </TabsTrigger>
                )}
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
              <div className="max-w-4xl mx-auto px-4 sm:px-6">
                {/* PRD */}
                {project.prd && (
                  <TabsContent value="prd">
                    <div className="py-4 space-y-3">
                      {SPARC_SECTIONS.map(({ key, label }) => {
                        const content = project.prd?.[key] ?? '';
                        if (!content) return null;
                        return (
                          <div key={key}>
                            <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                              {label}
                            </h3>
                            <div className="rounded-md bg-muted/5 p-3 border-l-2 border-l-primary/20">
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

                {/* Milestones */}
                {project.milestones && project.milestones.length > 0 && (
                  <TabsContent value="milestones">
                    <div className="py-4 space-y-2">
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
                            className="rounded-md border border-border/10 bg-muted/[0.03] p-3 space-y-2"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium flex-1 truncate">
                                {milestone.title}
                              </span>
                              <Badge
                                variant={getMilestoneStatusVariant(milestone.status)}
                                size="sm"
                                className="text-[10px] uppercase tracking-wider shrink-0"
                              >
                                {milestone.status}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                {completedPhases}/{totalPhases}
                              </span>
                            </div>
                            {milestone.description && (
                              <p className="text-xs text-muted-foreground line-clamp-2">
                                {milestone.description}
                              </p>
                            )}
                            <div className="h-1 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full bg-emerald-500/50"
                                style={{ width: `${phasePct}%` }}
                              />
                            </div>
                            {milestone.phases && milestone.phases.length > 0 && (
                              <div className="space-y-1 pt-1">
                                {milestone.phases.map((phase, pi) => (
                                  <div
                                    key={phase.name ?? pi}
                                    className="flex items-center gap-2 text-xs"
                                  >
                                    <div
                                      className={cn(
                                        'size-1.5 rounded-full shrink-0',
                                        phase.executionStatus === 'completed'
                                          ? 'bg-emerald-500/60'
                                          : phase.executionStatus === 'in-progress'
                                            ? 'bg-blue-400/60'
                                            : 'bg-muted-foreground/20'
                                      )}
                                    />
                                    <span className="text-foreground/80 truncate flex-1">
                                      {phase.title}
                                    </span>
                                    {phase.complexity && (
                                      <span className="text-[10px] text-muted-foreground shrink-0">
                                        {phase.complexity}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </TabsContent>
                )}

                {/* Features */}
                <TabsContent value="features">
                  <FeaturesTab projectSlug={projectSlug} />
                </TabsContent>

                {/* Resources */}
                <TabsContent value="resources">
                  <ResourcesTab projectSlug={projectSlug} project={project} />
                </TabsContent>

                {/* Updates */}
                {project.updates && project.updates.length > 0 && (
                  <TabsContent value="updates">
                    <div className="py-4 space-y-2">
                      {project.updates.map((update) => (
                        <div key={update.id} className="rounded-md bg-muted/5 p-3">
                          <div className="flex items-center gap-2 mb-1">
                            {update.health && <HealthIndicator health={update.health} size="sm" />}
                            <span className="text-[10px] text-muted-foreground">
                              {update.author} &middot;{' '}
                              {new Date(update.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-xs text-foreground/80">{update.body}</p>
                        </div>
                      ))}
                    </div>
                  </TabsContent>
                )}

                {/* Research */}
                {project.researchSummary && (
                  <TabsContent value="research">
                    <div className="py-4">
                      <div className="rounded-md bg-muted/5 p-4">
                        <div className="prose prose-sm prose-invert max-w-none prose-p:text-foreground/90 prose-headings:text-foreground prose-li:text-foreground/90 prose-strong:text-foreground">
                          <Markdown>{project.researchSummary}</Markdown>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                )}

                {/* Timeline */}
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
                          className={cn('size-3.5 mr-1', isRefreshingTimeline && 'animate-spin')}
                        />
                        Refresh
                      </Button>
                    </div>
                    <ProjectTimeline projectSlug={projectSlug} />
                  </div>
                </TabsContent>

                {/* Artifacts */}
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
      </div>

      <DeleteConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onConfirm={handleDelete}
        title={`Delete "${project.title}"?`}
        description="The project directory will be removed. A stats summary is preserved for historical reference. Linked board features are not affected."
      />
    </div>
  );
}

function PropertyRow({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
        {Icon && <Icon className="size-3" />}
        {label}
      </span>
      {children}
    </div>
  );
}
