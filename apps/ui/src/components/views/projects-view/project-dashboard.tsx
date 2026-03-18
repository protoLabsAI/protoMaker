import { useState, useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Plus, FolderKanban } from 'lucide-react';
import { Button, Badge, Spinner } from '@protolabsai/ui/atoms';
import type { ProjectHealth } from '@protolabsai/types';
import { useAppStore } from '@/store/app-store';
import { getHttpApiClient } from '@/lib/http-api-client';
import { cn } from '@/lib/utils';
import { useProjectFeatures } from './hooks/use-project-features';
import { HealthIndicator } from './components/health-indicator';

type FilterStatus = 'all' | 'planning' | 'active' | 'completed';

const PLANNING_STATUSES = ['researching', 'drafting', 'reviewing', 'approved', 'scaffolded'];
const ACTIVE_STATUSES = ['active', 'ongoing'];
const COMPLETED_STATUSES = ['completed'];

function matchesFilter(status: string, filter: FilterStatus): boolean {
  if (filter === 'all') return true;
  if (filter === 'planning') return PLANNING_STATUSES.includes(status);
  if (filter === 'active') return ACTIVE_STATUSES.includes(status);
  if (filter === 'completed') return COMPLETED_STATUSES.includes(status);
  return true;
}

interface ProjectSummary {
  slug: string;
  title: string;
  goal?: string;
  status: string;
  health?: string;
  color?: string;
  updatedAt?: string;
  milestones?: Array<{
    title: string;
    phases: Array<{ title: string }>;
  }>;
}

function ProjectProgress({ projectSlug }: { projectSlug: string }) {
  const { data: featuresData } = useProjectFeatures(projectSlug);
  const features = (featuresData?.data?.features ?? []) as Array<{ status?: string }>;
  const total = features.length;
  const done = features.filter((f) => f.status === 'done').length;

  if (total === 0) return null;

  const pct = Math.round((done / total) * 100);

  return (
    <div className="space-y-1">
      <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-emerald-500/60 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground">
        {done}/{total} features
      </span>
    </div>
  );
}

function relativeTime(date: string): string {
  const ms = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ProjectDashboard() {
  const projectPath = useAppStore((s) => s.currentProject?.path);
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterStatus>('all');

  const { data: listData, isLoading: isLoadingList } = useQuery({
    queryKey: ['projects-list', projectPath],
    queryFn: async () => {
      const api = getHttpApiClient();
      return api.lifecycle.listProjects(projectPath || '');
    },
    enabled: !!projectPath,
  });

  const { data: projectDetails, isLoading: isLoadingDetails } = useQuery({
    queryKey: ['projects-details', projectPath, listData?.projects],
    queryFn: async () => {
      const api = getHttpApiClient();
      const slugs = listData?.projects || [];
      const results: ProjectSummary[] = [];
      for (const slug of slugs) {
        const res = await api.lifecycle.getProject(projectPath || '', slug);
        if (res.success && res.project) {
          results.push(res.project as ProjectSummary);
        }
      }
      return results;
    },
    enabled: !!projectPath && !!listData?.projects && listData.projects.length > 0,
  });

  const projects = projectDetails || [];
  const isLoading = isLoadingList || isLoadingDetails;

  const filtered = useMemo(
    () => projects.filter((p) => matchesFilter(p.status, filter)),
    [projects, filter]
  );

  const filterCounts = useMemo(() => {
    return {
      all: projects.length,
      planning: projects.filter((p) => PLANNING_STATUSES.includes(p.status)).length,
      active: projects.filter((p) => ACTIVE_STATUSES.includes(p.status)).length,
      completed: projects.filter((p) => COMPLETED_STATUSES.includes(p.status)).length,
    };
  }, [projects]);

  const filters: { key: FilterStatus; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'planning', label: 'Planning' },
    { key: 'completed', label: 'Completed' },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 sm:px-8 py-4">
        <h1 className="text-lg font-semibold">Projects</h1>

        <div className="flex-1" />

        {/* Filter pills */}
        <div className="flex gap-1">
          {filters.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                filter === key
                  ? 'bg-foreground/10 text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              {label}
              {filterCounts[key] > 0 && (
                <span className="ml-1 text-muted-foreground/60">{filterCounts[key]}</span>
              )}
            </button>
          ))}
        </div>

        <Button size="sm" onClick={() => navigate({ to: '/project-management/new' })}>
          <Plus className="size-4 mr-1.5" />
          New Project
        </Button>
      </div>

      {/* Card grid */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 pb-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <FolderKanban className="size-10 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">
              {projects.length === 0
                ? 'No projects yet. Create one to get started.'
                : 'No projects match this filter.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((project) => (
              <button
                key={project.slug}
                type="button"
                onClick={() =>
                  navigate({
                    to: '/project-management/$slug',
                    params: { slug: project.slug },
                  })
                }
                className="group relative flex rounded-lg bg-card text-left transition-all hover:shadow-sm hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring overflow-hidden"
              >
                {/* Color accent bar */}
                <div
                  className="w-[3px] shrink-0"
                  style={{ backgroundColor: project.color || 'transparent' }}
                />

                <div className="flex-1 p-3.5 space-y-2.5 min-w-0">
                  {/* Title row */}
                  <div className="flex items-start gap-2">
                    <span className="text-sm font-medium truncate flex-1">{project.title}</span>
                    {project.health && <HealthIndicator health={project.health as ProjectHealth} />}
                  </div>

                  {/* Goal */}
                  {project.goal && (
                    <p className="text-xs text-muted-foreground line-clamp-1">{project.goal}</p>
                  )}

                  {/* Bottom row: status + progress + time */}
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs capitalize">
                      {project.status}
                    </Badge>

                    {ACTIVE_STATUSES.includes(project.status) && (
                      <div className="flex-1 min-w-0">
                        <ProjectProgress projectSlug={project.slug} />
                      </div>
                    )}

                    {project.updatedAt && (
                      <span className="text-xs text-muted-foreground/50 shrink-0 ml-auto">
                        {relativeTime(project.updatedAt)}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
