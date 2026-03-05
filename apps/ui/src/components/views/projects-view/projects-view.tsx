import { useState } from 'react';
import { FolderKanban, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import { ProjectsList } from './projects-list';
import { ProjectDetail } from './project-detail';
import { ProjectMetricsTab } from '../dashboard-view/metrics/project-tab';
import { TimeRangeSelector, type TimeRange } from '../dashboard-view/metrics/time-range';

type ProjectsTab = 'plans' | 'metrics';

const tabBtnClass =
  'inline-flex h-[calc(100%-1px)] items-center justify-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

function toggleBtnClass(active: boolean) {
  return cn(
    tabBtnClass,
    active
      ? 'bg-primary text-primary-foreground shadow-md'
      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
  );
}

export function ProjectsView() {
  const projectPath = useAppStore((s) => s.currentProject?.path);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ProjectsTab>('plans');
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');

  if (!projectPath) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Open a project to view its plans.</p>
      </div>
    );
  }

  if (selectedSlug) {
    return <ProjectDetail projectSlug={selectedSlug} onBack={() => setSelectedSlug(null)} />;
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="shrink-0 px-4 py-2 flex items-center gap-3">
        <div
          className="inline-flex h-8 items-center rounded-md bg-muted p-[3px] border border-border"
          role="tablist"
          aria-label="Projects view"
        >
          <button
            role="tab"
            aria-selected={activeTab === 'plans'}
            onClick={() => setActiveTab('plans')}
            className={toggleBtnClass(activeTab === 'plans')}
          >
            <FolderKanban className="w-4 h-4" />
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'metrics'}
            onClick={() => setActiveTab('metrics')}
            className={toggleBtnClass(activeTab === 'metrics')}
          >
            <BarChart3 className="w-4 h-4" />
          </button>
        </div>
        {activeTab === 'metrics' && (
          <>
            <div className="flex-1" />
            <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
          </>
        )}
      </div>

      {activeTab === 'plans' ? (
        <ProjectsList onSelect={setSelectedSlug} />
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-2 sm:px-8 sm:py-2">
          <div className="max-w-6xl mx-auto">
            <ProjectMetricsTab projectPath={projectPath} timeRange={timeRange} />
          </div>
        </div>
      )}
    </div>
  );
}
