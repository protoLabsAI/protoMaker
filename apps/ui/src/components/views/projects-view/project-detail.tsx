import {
  LayoutDashboard,
  FileText,
  Milestone,
  Layers,
  FileEdit,
  ExternalLink,
  MessageSquare,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@protolabs-ai/ui/atoms';
import { Spinner } from '@protolabs-ai/ui/atoms';
import { ProjectHeader } from './components/project-header';
import { useProject } from './hooks/use-project';
import { OverviewTab } from './tabs/overview-tab';
import { PrdTab } from './tabs/prd-tab';
import { MilestonesTab } from './tabs/milestones-tab';
import { FeaturesTab } from './tabs/features-tab';
import { DocumentsTab } from './tabs/documents-tab';
import { LinksTab } from './tabs/links-tab';
import { UpdatesTab } from './tabs/updates-tab';
import type { Project } from '@protolabs-ai/types';

export function ProjectDetail({
  projectSlug,
  onBack,
}: {
  projectSlug: string;
  onBack: () => void;
}) {
  const { data: project, isLoading } = useProject(projectSlug);

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
      <ProjectHeader project={project as Project} onBack={onBack} />

      <div className="flex-1 overflow-y-auto px-6">
        <Tabs defaultValue="overview" className="flex flex-col h-full">
          <TabsList className="mt-3 mb-1">
            <TabsTrigger value="overview">
              <LayoutDashboard />
              Overview
            </TabsTrigger>
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
            <TabsTrigger value="documents">
              <FileEdit />
              Documents
            </TabsTrigger>
            <TabsTrigger value="links">
              <ExternalLink />
              Links
            </TabsTrigger>
            <TabsTrigger value="updates">
              <MessageSquare />
              Updates
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab project={project as Project} />
          </TabsContent>

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
  );
}
