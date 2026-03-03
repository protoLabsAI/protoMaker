import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FolderKanban, Plus, Loader2, Milestone, Layers } from 'lucide-react';
import { Badge, Input, Textarea } from '@protolabs-ai/ui/atoms';
import { Button } from '@protolabs-ai/ui/atoms';
import { Spinner } from '@protolabs-ai/ui/atoms';
import { Card } from '@protolabs-ai/ui/atoms';
import { useAppStore } from '@/store/app-store';
import { getHttpApiClient } from '@/lib/http-api-client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { getProjectStatusVariant } from './lib/status-variants';

interface ProjectSummary {
  slug: string;
  title: string;
  goal: string;
  status: string;
  health?: string;
  milestones?: Array<{
    title: string;
    phases: Array<{ title: string }>;
  }>;
}

export function ProjectsList({ onSelect }: { onSelect: (slug: string) => void }) {
  const projectPath = useAppStore((s) => s.currentProject?.path);
  const queryClient = useQueryClient();
  const [showNewProjectInput, setShowNewProjectInput] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');

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

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-border/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500/20 to-violet-600/10 flex items-center justify-center border border-violet-500/20">
              <FolderKanban className="w-5 h-5 text-violet-500" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground tracking-tight">Projects</h1>
              <p className="text-xs text-muted-foreground">
                {projects.length} project{projects.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowNewProjectInput(!showNewProjectInput)}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            New Project
          </Button>
        </div>
      </div>

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
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner className="w-5 h-5" />
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FolderKanban className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No projects yet.</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Create a new project to start planning with PRDs and milestones.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {projects.map((project) => {
              const phaseCount =
                project.milestones?.reduce((sum, ms) => sum + (ms.phases?.length || 0), 0) || 0;

              return (
                <Card
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
                    'py-3 px-4 cursor-pointer hover:bg-card/80 transition-colors',
                    'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none'
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-medium text-foreground truncate">
                        {project.title}
                      </h3>
                      <div className="flex items-center gap-3 mt-1.5">
                        {project.milestones && project.milestones.length > 0 && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Milestone className="w-3 h-3" />
                            {project.milestones.length} milestone
                            {project.milestones.length !== 1 ? 's' : ''}
                          </span>
                        )}
                        {phaseCount > 0 && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Layers className="w-3 h-3" />
                            {phaseCount} phase{phaseCount !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    <Badge
                      variant={getProjectStatusVariant(project.status)}
                      size="sm"
                      className="uppercase tracking-wider shrink-0"
                    >
                      {project.status}
                    </Badge>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
