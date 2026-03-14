import { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Layers,
  BookOpen,
  MessageSquare,
  FlaskConical,
  Activity,
  Archive,
  Milestone,
  RefreshCw,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@protolabsai/ui/atoms';
import { Spinner, Button } from '@protolabsai/ui/atoms';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getHttpApiClient } from '@/lib/http-api-client';
import type { EventType } from '@protolabsai/types';
import { ProjectHeader } from './components/project-header';
import { ProjectSidebar } from './components/project-sidebar';
import { useProject, useProjectDelete } from './hooks/use-project';
import { useAppStore } from '@/store/app-store';
import { useAvaChannelStore } from '@/store/ava-channel-store';
import { useChatStore } from '@/store/chat-store';
import { PrdTab } from './tabs/prd-tab';
import { FeaturesTab } from './tabs/features-tab';
import { ResourcesTab } from './tabs/resources-tab';
import { UpdatesTab } from './tabs/updates-tab';
import { ResearchTab } from './tabs/research-tab';
import { MilestonesTab } from './tabs/milestones-tab';
import { ProjectTimeline } from '@/components/views/projects/project-timeline';
import { ProjectArtifactViewer } from '@/components/views/projects/project-artifact-viewer';
import { ProjectProgressWizard } from './components/project-progress-wizard';
import type { Project, ArtifactIndexEntry } from '@protolabsai/types';

export function ProjectDetail({
  projectSlug,
  onBack,
}: {
  projectSlug: string;
  onBack: () => void;
}) {
  const projectPath = useAppStore((s) => s.currentProject?.path) ?? '';
  const { data: project, isLoading } = useProject(projectSlug);
  const deleteMutation = useProjectDelete();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('features');
  const setPendingProjectSlug = useAvaChannelStore((s) => s.setPendingProjectSlug);
  const setLastActiveTab = useAvaChannelStore((s) => s.setLastActiveTab);
  const setChatModalOpen = useChatStore((s) => s.setChatModalOpen);
  const queryClient = useQueryClient();
  const [isRefreshingTimeline, setIsRefreshingTimeline] = useState(false);

  const handleOpenPmChat = () => {
    setPendingProjectSlug(projectSlug);
    setLastActiveTab('projects');
    setChatModalOpen(true);
  };

  // ── Timeline refresh ─────────────────────────────────────────────────────────

  const refreshTimeline = useCallback(() => {
    setIsRefreshingTimeline(true);
    queryClient
      .invalidateQueries({ queryKey: ['project-timeline', projectPath, projectSlug] })
      .finally(() => {
        // Brief delay to let the spinner show before hiding
        setTimeout(() => setIsRefreshingTimeline(false), 500);
      });
  }, [queryClient, projectPath, projectSlug]);

  // Subscribe to WebSocket events that generate timeline entries and auto-refresh
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

  // ─────────────────────────────────────────────────────────────────────────────

  const handleDelete = () => {
    deleteMutation.mutate(projectSlug, {
      onSuccess: (res) => {
        if (res.success) {
          toast.success(`Deleted project "${project?.title ?? projectSlug}"`);
          onBack();
        } else {
          toast.error(res.error ?? 'Failed to delete project');
        }
      },
      onError: () => {
        toast.error('Failed to delete project');
      },
    });
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner className="w-5 h-5" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Project not found.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <ProjectHeader
        project={project as Project}
        onBack={onBack}
        onDelete={handleDelete}
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        sidebarOpen={sidebarOpen}
        onOpenPmChat={handleOpenPmChat}
      />

      <div className="flex-1 flex min-h-0">
        <ProjectSidebar project={project as Project} isOpen={sidebarOpen} />

        <div className="flex-1 overflow-y-auto">
          <ProjectProgressWizard project={project as Project} onTabChange={setActiveTab} />
          <div className="px-3 sm:px-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
              <TabsList className="mt-3 mb-1">
                <TabsTrigger value="prd">
                  <FileText />
                  <span className="hidden sm:inline">PRD</span>
                </TabsTrigger>
                {project.milestones && project.milestones.length > 0 && (
                  <TabsTrigger value="milestones">
                    <Milestone />
                    <span className="hidden sm:inline">Milestones</span>
                  </TabsTrigger>
                )}
                <TabsTrigger value="features">
                  <Layers />
                  <span className="hidden sm:inline">Features</span>
                </TabsTrigger>
                <TabsTrigger value="resources">
                  <BookOpen />
                  <span className="hidden sm:inline">Resources</span>
                </TabsTrigger>
                <TabsTrigger value="updates">
                  <MessageSquare />
                  <span className="hidden sm:inline">Updates</span>
                </TabsTrigger>
                {project.researchSummary && (
                  <TabsTrigger value="research">
                    <FlaskConical />
                    <span className="hidden sm:inline">Research</span>
                  </TabsTrigger>
                )}
                <TabsTrigger value="timeline">
                  <Activity />
                  <span className="hidden sm:inline">Timeline</span>
                </TabsTrigger>
                <TabsTrigger value="artifacts">
                  <Archive />
                  <span className="hidden sm:inline">Artifacts</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="prd">
                <PrdTab project={project as Project} projectSlug={projectSlug} />
              </TabsContent>

              {project.milestones && project.milestones.length > 0 && (
                <TabsContent value="milestones">
                  <MilestonesTab project={project as Project} />
                </TabsContent>
              )}

              <TabsContent value="features">
                <FeaturesTab projectSlug={projectSlug} />
              </TabsContent>

              <TabsContent value="resources">
                <ResourcesTab projectSlug={projectSlug} project={project as Project} />
              </TabsContent>

              <TabsContent value="updates">
                <UpdatesTab project={project as Project} />
              </TabsContent>

              {project.researchSummary && (
                <TabsContent value="research">
                  <ResearchTab project={project as Project} />
                </TabsContent>
              )}

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
                      data-testid="timeline-refresh-button"
                    >
                      <RefreshCw
                        className={`w-4 h-4 mr-1 ${isRefreshingTimeline ? 'animate-spin' : ''}`}
                      />
                      Refresh
                    </Button>
                  </div>
                  <ProjectTimeline projectSlug={projectSlug} />
                </div>
              </TabsContent>

              <TabsContent value="artifacts">
                <div className="py-4">
                  <ProjectArtifactViewer
                    artifacts={
                      (project as Project & { artifacts?: ArtifactIndexEntry[] }).artifacts ?? []
                    }
                  />
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}
