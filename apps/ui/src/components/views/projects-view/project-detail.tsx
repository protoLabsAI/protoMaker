import { FileText, Milestone, Layers, FolderOpen, MessageSquare } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@protolabsai/ui/atoms';
import { Spinner } from '@protolabsai/ui/atoms';
import { toast } from 'sonner';
import { ProjectHeader } from './components/project-header';
import { ProjectSidebar } from './components/project-sidebar';
import { useProject, useProjectDelete } from './hooks/use-project';
import { PrdTab } from './tabs/prd-tab';
import { MilestonesTab } from './tabs/milestones-tab';
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
  const { data: project, isLoading } = useProject(projectSlug);
  const deleteMutation = useProjectDelete();

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
      <ProjectHeader project={project as Project} onBack={onBack} onDelete={handleDelete} />

      <div className="flex-1 flex min-h-0">
        <ProjectSidebar project={project as Project} />

        <div className="flex-1 overflow-y-auto px-6">
          <Tabs defaultValue="prd" className="flex flex-col h-full">
            <TabsList className="mt-3 mb-1">
              <TabsTrigger value="prd">
                <FileText />
                PRD
              </TabsTrigger>
              <TabsTrigger value="milestones">
                <Milestone />
                Milestones
              </TabsTrigger>
              <TabsTrigger value="features">
                <Layers />
                Features
              </TabsTrigger>
              <TabsTrigger value="resources">
                <FolderOpen />
                Resources
              </TabsTrigger>
              <TabsTrigger value="updates">
                <MessageSquare />
                Updates
              </TabsTrigger>
            </TabsList>

            <TabsContent value="prd">
              <PrdTab project={project as Project} />
            </TabsContent>

            <TabsContent value="milestones">
              <MilestonesTab project={project as Project} />
            </TabsContent>

            <TabsContent value="features">
              <FeaturesTab projectSlug={projectSlug} />
            </TabsContent>

            <TabsContent value="documents">
              <DocumentsTab projectSlug={projectSlug} />
            </TabsContent>

            <TabsContent value="links">
              <LinksTab project={project as Project} />
            </TabsContent>

            <TabsContent value="updates">
              <UpdatesTab project={project as Project} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
