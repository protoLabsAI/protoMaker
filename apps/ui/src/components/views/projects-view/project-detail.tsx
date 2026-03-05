import { useState } from 'react';
import { FileText, Layers, BookOpen, MessageSquare } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@protolabsai/ui/atoms';
import { Spinner } from '@protolabsai/ui/atoms';
import { toast } from 'sonner';
import { ProjectHeader } from './components/project-header';
import { ProjectSidebar } from './components/project-sidebar';
import { PmChatPanel } from './components/pm-chat-panel';
import { useProject, useProjectDelete } from './hooks/use-project';
import { useAppStore } from '@/store/app-store';
import { PrdTab } from './tabs/prd-tab';
import { FeaturesTab } from './tabs/features-tab';
import { ResourcesTab } from './tabs/resources-tab';
import { UpdatesTab } from './tabs/updates-tab';
import type { Project } from '@protolabsai/types';

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
  const [pmChatOpen, setPmChatOpen] = useState(false);

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

  const hasResources = (project.links?.length ?? 0) > 0;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <ProjectHeader
        project={project as Project}
        onBack={onBack}
        onDelete={handleDelete}
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        sidebarOpen={sidebarOpen}
        onTogglePmChat={() => setPmChatOpen((v) => !v)}
        pmChatOpen={pmChatOpen}
      />

      <div className="flex-1 flex min-h-0">
        <ProjectSidebar project={project as Project} isOpen={sidebarOpen} />

        <div className="flex-1 overflow-y-auto px-3 sm:px-6">
          <Tabs defaultValue="features" className="flex flex-col h-full">
            <TabsList className="mt-3 mb-1">
              <TabsTrigger value="prd">
                <FileText />
                <span className="hidden sm:inline">PRD</span>
              </TabsTrigger>
              <TabsTrigger value="features">
                <Layers />
                <span className="hidden sm:inline">Features</span>
              </TabsTrigger>
              {hasResources && (
                <TabsTrigger value="resources">
                  <BookOpen />
                  <span className="hidden sm:inline">Resources</span>
                </TabsTrigger>
              )}
              <TabsTrigger value="updates">
                <MessageSquare />
                <span className="hidden sm:inline">Updates</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="prd">
              <PrdTab project={project as Project} />
            </TabsContent>

            <TabsContent value="features">
              <FeaturesTab projectSlug={projectSlug} />
            </TabsContent>

            {hasResources && (
              <TabsContent value="resources">
                <ResourcesTab projectSlug={projectSlug} project={project as Project} />
              </TabsContent>
            )}

            <TabsContent value="updates">
              <UpdatesTab project={project as Project} />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <PmChatPanel
        open={pmChatOpen}
        onClose={() => setPmChatOpen(false)}
        project={project as Project}
        projectPath={projectPath}
      />
    </div>
  );
}
