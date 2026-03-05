import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FolderKanban, Plus, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { Input, Textarea } from '@protolabsai/ui/atoms';
import { Button } from '@protolabsai/ui/atoms';
import { PanelHeader } from '@/components/shared/panel-header';
import { Spinner } from '@protolabsai/ui/atoms';
import { useAppStore } from '@/store/app-store';
import { getHttpApiClient } from '@/lib/http-api-client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ProjectSummary {
  slug: string;
  title: string;
  goal: string;
  status: string;
  health?: string;
  color?: string;
  milestones?: Array<{
    title: string;
    phases: Array<{ title: string }>;
  }>;
}

const PROJECT_STATUS_ORDER: Record<string, number> = {
  ongoing: -1,
  researching: 0,
  drafting: 1,
  reviewing: 2,
  approved: 3,
  scaffolded: 4,
  active: 5,
  completed: 6,
};

const PROJECT_STATUS_COLORS: Record<string, string> = {
  ongoing: 'bg-[var(--status-in-progress)]',
  researching: 'bg-[var(--status-info)]',
  drafting: 'bg-[var(--status-warning)]',
  reviewing: 'bg-[var(--status-in-progress)]',
  approved: 'bg-[var(--status-success)]',
  scaffolded: 'bg-[var(--status-info)]',
  active: 'bg-[var(--status-warning)]',
  completed: 'bg-[var(--status-done)]',
};

const PROJECT_STATUS_LABELS: Record<string, string> = {
  ongoing: 'Ongoing',
  researching: 'Researching',
  drafting: 'Drafting',
  reviewing: 'Reviewing',
  approved: 'Approved',
  scaffolded: 'Scaffolded',
  active: 'Active',
  completed: 'Completed',
};

export function ProjectsList({ onSelect }: { onSelect: (slug: string) => void }) {
  const projectPath = useAppStore((s) => s.currentProject?.path);
  const queryClient = useQueryClient();
  const [showNewProjectInput, setShowNewProjectInput] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

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

  const initiateMutation = useMutation({
    mutationFn: async () => {
      const api = getHttpApiClient();
      return api.lifecycle.initiate(projectPath || '', newTitle, newDescription);
    },
    onSuccess: (result) => {
      if (result.hasDuplicates) {
        toast.warning('Duplicate project detected in Linear', {
          description: `Found ${result.duplicates?.length} existing project(s) with a similar name.`,
        });
      } else {
        toast.success('Project created', {
          description: `Created "${newTitle}" (${result.localSlug})`,
        });
      }
      setNewTitle('');
      setNewDescription('');
      setShowNewProjectInput(false);
      queryClient.invalidateQueries({ queryKey: ['projects-list', projectPath] });
    },
    onError: (error) => {
      toast.error(
        `Failed to create project: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    },
  });

  const handleCreateProject = useCallback(() => {
    if (!newTitle.trim()) {
      toast.error('Project title is required');
      return;
    }
    if (!newDescription.trim()) {
      toast.error('Project description is required');
      return;
    }
    initiateMutation.mutate();
  }, [newTitle, newDescription, initiateMutation]);

  const projects = projectDetails || [];
  const isLoading = isLoadingList || isLoadingDetails;

  // Group projects by status
  const statusGroups = useMemo(() => {
    const groups: Record<string, ProjectSummary[]> = {};
    for (const project of projects) {
      const status = project.status || 'drafting';
      if (!groups[status]) groups[status] = [];
      groups[status].push(project);
    }

    return Object.entries(groups)
      .sort(([a], [b]) => (PROJECT_STATUS_ORDER[a] ?? 99) - (PROJECT_STATUS_ORDER[b] ?? 99))
      .map(([status, items]) => ({ status, items }));
  }, [projects]);

  const toggleGroup = useCallback((status: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  }, []);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <PanelHeader
        icon={FolderKanban}
        title="Projects"
        badge={
          <span className="text-xs text-muted-foreground">
            {projects.length} project{projects.length !== 1 ? 's' : ''}
          </span>
        }
        actions={[
          {
            icon: Plus,
            label: 'New project',
            onClick: () => setShowNewProjectInput(!showNewProjectInput),
          },
        ]}
      />

      {/* New Project Form */}
      {showNewProjectInput && (
        <div className="shrink-0 px-6 py-4 border-b border-border/40 bg-muted/20 space-y-3">
          <Input
            placeholder="Project title..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            autoFocus
          />
          <Textarea
            placeholder="Describe the project goal..."
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            rows={3}
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setShowNewProjectInput(false);
                setNewTitle('');
                setNewDescription('');
              }}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreateProject} disabled={initiateMutation.isPending}>
              {initiateMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5 mr-1.5" />
              )}
              Create
            </Button>
          </div>
        </div>
      )}

      {/* Project List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner className="w-5 h-5" />
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            <FolderKanban className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm">No projects yet.</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Create a new project to start planning with PRDs and milestones.
            </p>
          </div>
        ) : (
          <div>
            {statusGroups.map(({ status, items }) => {
              const isExpanded = !collapsedGroups.has(status);

              return (
                <div key={status}>
                  {/* Status group header */}
                  <button
                    type="button"
                    onClick={() => toggleGroup(status)}
                    className={cn(
                      'flex items-center gap-2 w-full px-3 py-2 text-left',
                      'bg-muted/50 hover:bg-muted/70 transition-colors duration-200',
                      'border-b border-border/50',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
                    )}
                    aria-expanded={isExpanded}
                  >
                    <span className="text-muted-foreground">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </span>
                    <span
                      className={cn(
                        'w-2.5 h-2.5 rounded-full shrink-0',
                        PROJECT_STATUS_COLORS[status] || 'bg-muted-foreground'
                      )}
                      aria-hidden="true"
                    />
                    <span className="font-medium text-sm">
                      {PROJECT_STATUS_LABELS[status] || status}
                    </span>
                    <span className="text-xs text-muted-foreground">({items.length})</span>
                  </button>

                  {/* Project rows */}
                  {isExpanded &&
                    items.map((project) => {
                      const milestoneCount = project.milestones?.length || 0;
                      const phaseCount =
                        project.milestones?.reduce(
                          (sum, ms) => sum + (ms.phases?.length || 0),
                          0
                        ) || 0;

                      return (
                        <div
                          key={project.slug}
                          role="button"
                          tabIndex={0}
                          onClick={() => onSelect(project.slug)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onSelect(project.slug);
                            }
                          }}
                          className={cn(
                            'flex items-center w-full border-b border-border/50',
                            'hover:bg-accent/50 cursor-pointer transition-colors duration-200',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
                          )}
                        >
                          {/* Color indicator */}
                          <div
                            className="w-1 self-stretch shrink-0 rounded-sm"
                            style={{ backgroundColor: project.color || 'transparent' }}
                            aria-hidden="true"
                          />
                          {/* Title + goal */}
                          <div className="flex-1 min-w-0 pl-3 pr-3 py-3">
                            <span className="font-medium text-sm truncate block">
                              {project.title}
                            </span>
                            {project.goal && (
                              <p className="text-xs text-muted-foreground truncate mt-0.5">
                                {project.goal}
                              </p>
                            )}
                          </div>

                          {/* Milestone / phase counts */}
                          <div className="w-32 shrink-0 flex items-center gap-3 text-xs text-muted-foreground pr-3">
                            {milestoneCount > 0 && <span>{milestoneCount} ms</span>}
                            {phaseCount > 0 && <span>{phaseCount} ph</span>}
                          </div>

                          {/* Navigate chevron */}
                          <div className="w-[40px] shrink-0 flex items-center justify-center text-muted-foreground">
                            <ChevronRight className="w-4 h-4" />
                          </div>
                        </div>
                      );
                    })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
