/**
 * MetricsSection - Tabbed dashboard with charts and KPIs
 *
 * Contains Project Metrics tab and All Projects tab.
 * Uses persistent ledger data that survives feature archival.
 */

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProjectMetricsTab } from './project-tab';

interface MetricsSectionProps {
  projectPath: string;
}

export function MetricsSection({ projectPath }: MetricsSectionProps) {
  return (
    <Tabs defaultValue="project" className="w-full">
      <TabsList className="grid w-full max-w-xs grid-cols-2">
        <TabsTrigger value="project">Project</TabsTrigger>
        <TabsTrigger value="all">All Projects</TabsTrigger>
      </TabsList>
      <TabsContent value="project" className="mt-4">
        <ProjectMetricsTab projectPath={projectPath} />
      </TabsContent>
      <TabsContent value="all" className="mt-4">
        <div className="text-center py-12 text-sm text-muted-foreground">
          All Projects view coming soon. Select a project to view its metrics.
        </div>
      </TabsContent>
    </Tabs>
  );
}
