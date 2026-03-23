import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Switch } from '@protolabsai/ui/atoms';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@protolabsai/ui/atoms';
import { Label, Kbd, KbdGroup } from '@protolabsai/ui/atoms';
import { GitBranch, DollarSign, Sparkles, FolderKanban, SlidersHorizontal } from 'lucide-react';
import { queryKeys } from '@/lib/query-keys';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@protolabsai/ui/atoms';
import { PanelHeader } from '@/components/shared/panel-header';
import { useAppStore } from '@/store/app-store';
import { useWorktreeStore } from '@/store/worktree-store';
import { useSetupStore } from '@/store/setup-store';
import { useIsTablet } from '@/hooks/use-media-query';
import { AutoModeSettingsPopover } from './dialogs/auto-mode-settings-popover';
import { WorktreeSettingsPopover } from './dialogs/worktree-settings-popover';
import { getHttpApiClient } from '@/lib/http-api-client';
import { BoardSearchBar } from './board-search-bar';
import { BoardControls } from './board-controls';
import { ViewToggle, type ViewMode } from './components';
import { HeaderMobileMenu } from './header-mobile-menu';
import { formatCostUsd } from '@/lib/format';
import { formatShortcut } from '@/store/types';

export type { ViewMode };

interface BoardHeaderProps {
  projectPath: string;
  maxConcurrency: number;
  runningAgentsCount: number;
  onConcurrencyChange: (value: number) => void;
  isAutoModeRunning: boolean;
  onAutoModeToggle: (enabled: boolean) => void;
  isMounted: boolean;
  // Search bar props
  searchQuery: string;
  onSearchChange: (query: string) => void;
  isCreatingSpec: boolean;
  creatingSpecProjectPath?: string;
  // Board controls props
  onShowBoardBackground: () => void;
  // View toggle props
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  // Project filter props
  selectedProjectSlug: string | null;
  onProjectFilterChange: (slug: string | null) => void;
  // Settings panel props
  isSettingsPanelOpen: boolean;
  onSettingsPanelToggle: () => void;
}

// Shared styles for header control containers
const controlContainerClass =
  'flex items-center gap-1.5 px-3 h-8 rounded-md bg-secondary border border-border';

export function BoardHeader({
  projectPath,
  maxConcurrency,
  runningAgentsCount,
  onConcurrencyChange,
  isAutoModeRunning,
  onAutoModeToggle,
  isMounted,
  searchQuery,
  onSearchChange,
  isCreatingSpec,
  creatingSpecProjectPath,
  onShowBoardBackground,
  viewMode,
  onViewModeChange,
  selectedProjectSlug,
  onProjectFilterChange,
  isSettingsPanelOpen,
  onSettingsPanelToggle,
}: BoardHeaderProps) {
  const claudeAuthStatus = useSetupStore((state) => state.claudeAuthStatus);
  const skipVerificationInAutoMode = useAppStore((state) => state.skipVerificationInAutoMode);
  const setSkipVerificationInAutoMode = useAppStore((state) => state.setSkipVerificationInAutoMode);
  const addFeatureUseSelectedWorktreeBranch = useAppStore(
    (state) => state.addFeatureUseSelectedWorktreeBranch
  );
  const setAddFeatureUseSelectedWorktreeBranch = useAppStore(
    (state) => state.setAddFeatureUseSelectedWorktreeBranch
  );
  const codexAuthStatus = useSetupStore((state) => state.codexAuthStatus);

  // Worktree panel visibility (per-project)
  const worktreePanelVisibleByProject = useWorktreeStore(
    (state) => state.worktreePanelVisibleByProject
  );
  const setWorktreePanelVisible = useWorktreeStore((state) => state.setWorktreePanelVisible);
  const isWorktreePanelVisible = worktreePanelVisibleByProject[projectPath] ?? true;

  const handleWorktreePanelToggle = useCallback(
    async (visible: boolean) => {
      // Update local store
      setWorktreePanelVisible(projectPath, visible);

      // Persist to server
      try {
        const httpClient = getHttpApiClient();
        await httpClient.settings.updateProject(projectPath, {
          worktreePanelVisible: visible,
        });
      } catch (error) {
        console.error('Failed to persist worktree panel visibility:', error);
      }
    },
    [projectPath, setWorktreePanelVisible]
  );

  const isClaudeCliVerified = !!claudeAuthStatus?.authenticated;
  const showClaudeUsage = isClaudeCliVerified;

  // Codex usage tracking visibility logic
  // Show if Codex is authenticated (CLI or API key)
  const showCodexUsage = !!codexAuthStatus?.authenticated;

  // Ava Anywhere shortcut for discoverability hint
  const avaAnywhereShortcut = useAppStore((state) => state.keyboardShortcuts.avaAnywhere);

  // Calculate cumulative project cost from all features
  const features = useAppStore((state) => state.features);
  const totalProjectCost = useMemo(() => {
    return features.reduce((sum, f) => {
      return sum + (typeof f.costUsd === 'number' ? f.costUsd : 0);
    }, 0);
  }, [features]);

  // State for mobile actions panel
  const [showActionsPanel, setShowActionsPanel] = useState(false);

  const isTablet = useIsTablet();

  const isBoardMode = viewMode === 'kanban' || viewMode === 'list';

  // Fetch project slugs for the filter dropdown
  const { data: projectsData } = useQuery({
    queryKey: queryKeys.projects.list(projectPath),
    queryFn: async () => {
      const api = getHttpApiClient();
      return api.lifecycle.listProjects(projectPath);
    },
    enabled: !!projectPath,
  });

  // Fetch project details (title) for each slug
  const projectSlugs = projectsData?.projects ?? [];
  const { data: projectDetails } = useQuery({
    queryKey: ['projects-details-for-filter', projectPath, projectSlugs],
    queryFn: async () => {
      const api = getHttpApiClient();
      const results: Array<{ slug: string; title: string }> = [];
      for (const slug of projectSlugs) {
        const res = await api.lifecycle.getProject(projectPath, slug);
        if (res.success && res.project) {
          results.push({ slug, title: (res.project as { title?: string }).title ?? slug });
        }
      }
      return results;
    },
    enabled: projectSlugs.length > 0,
  });

  const projectOptions = projectDetails ?? [];
  const hasProjects = projectOptions.length > 0;

  return (
    <PanelHeader
      extra={
        <div className="flex items-center gap-4 flex-1">
          {/* Left group: view toggle + search + board controls */}
          <div className="flex items-center gap-4 flex-1">
            {isMounted && <ViewToggle viewMode={viewMode} onViewModeChange={onViewModeChange} />}
            {isBoardMode && (
              <BoardSearchBar
                searchQuery={searchQuery}
                onSearchChange={onSearchChange}
                isCreatingSpec={isCreatingSpec}
                creatingSpecProjectPath={creatingSpecProjectPath}
                currentProjectPath={projectPath}
              />
            )}
            {isBoardMode && hasProjects && (
              <div className="flex items-center gap-1.5">
                <FolderKanban className="w-3.5 h-3.5 text-muted-foreground" />
                <Select
                  value={selectedProjectSlug ?? '__all__'}
                  onValueChange={(value) =>
                    onProjectFilterChange(value === '__all__' ? null : value)
                  }
                >
                  <SelectTrigger
                    className="h-8 w-[160px] text-xs border-border bg-secondary"
                    data-testid="project-filter"
                  >
                    <SelectValue placeholder="All Projects" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Projects</SelectItem>
                    {projectOptions.map((project) => (
                      <SelectItem key={project.slug} value={project.slug}>
                        {project.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {isBoardMode && (
              <BoardControls isMounted={isMounted} onShowBoardBackground={onShowBoardBackground} />
            )}
          </div>

          {/* Right group: cost, conflicts, usage, worktree, auto-mode, plan, ava */}
          {isBoardMode && (
            <div className="flex gap-4 items-center">
              {/* Project cost - show if any features have cost data */}
              {isMounted && !isTablet && totalProjectCost > 0 && (
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1 px-2 h-8 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
                        <DollarSign className="w-3.5 h-3.5" />
                        {formatCostUsd(totalProjectCost)}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      <p>Cumulative agent cost for this project</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              {/* Tablet/Mobile view: show hamburger menu with all controls */}
              {isMounted && isTablet && (
                <HeaderMobileMenu
                  isOpen={showActionsPanel}
                  onToggle={() => setShowActionsPanel(!showActionsPanel)}
                  isWorktreePanelVisible={isWorktreePanelVisible}
                  onWorktreePanelToggle={handleWorktreePanelToggle}
                  maxConcurrency={maxConcurrency}
                  runningAgentsCount={runningAgentsCount}
                  onConcurrencyChange={onConcurrencyChange}
                  isAutoModeRunning={isAutoModeRunning}
                  onAutoModeToggle={onAutoModeToggle}
                  skipVerificationInAutoMode={skipVerificationInAutoMode}
                  onSkipVerificationChange={setSkipVerificationInAutoMode}
                  showClaudeUsage={showClaudeUsage}
                  showCodexUsage={showCodexUsage}
                />
              )}

              {/* Desktop view: show full controls */}
              {/* Worktrees Toggle - only show after mount to prevent hydration issues */}
              {isMounted && !isTablet && (
                <div className={controlContainerClass} data-testid="worktrees-toggle-container">
                  <GitBranch className="w-4 h-4 text-muted-foreground" />
                  <Label
                    htmlFor="worktrees-toggle"
                    className="text-xs font-medium cursor-pointer whitespace-nowrap"
                  >
                    Worktree Bar
                  </Label>
                  <Switch
                    id="worktrees-toggle"
                    checked={isWorktreePanelVisible}
                    onCheckedChange={handleWorktreePanelToggle}
                    data-testid="worktrees-toggle"
                  />
                  <WorktreeSettingsPopover
                    addFeatureUseSelectedWorktreeBranch={addFeatureUseSelectedWorktreeBranch}
                    onAddFeatureUseSelectedWorktreeBranchChange={
                      setAddFeatureUseSelectedWorktreeBranch
                    }
                  />
                </div>
              )}

              {/* Auto Mode Toggle - only show after mount to prevent hydration issues */}
              {isMounted && !isTablet && (
                <div className={controlContainerClass} data-testid="auto-mode-toggle-container">
                  <Label
                    htmlFor="auto-mode-toggle"
                    className="text-xs font-medium cursor-pointer whitespace-nowrap"
                  >
                    Auto Mode
                  </Label>
                  <span
                    className="text-[10px] font-medium text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded"
                    data-testid="auto-mode-max-concurrency"
                    title="Max concurrent agents"
                  >
                    {maxConcurrency}
                  </span>
                  <Switch
                    id="auto-mode-toggle"
                    checked={isAutoModeRunning}
                    onCheckedChange={onAutoModeToggle}
                    data-testid="auto-mode-toggle"
                  />
                  <AutoModeSettingsPopover
                    skipVerificationInAutoMode={skipVerificationInAutoMode}
                    onSkipVerificationChange={setSkipVerificationInAutoMode}
                    maxConcurrency={maxConcurrency}
                    runningAgentsCount={runningAgentsCount}
                    onConcurrencyChange={onConcurrencyChange}
                  />
                </div>
              )}

              {/* Settings Panel Toggle */}
              {isMounted && !isTablet && (
                <button
                  type="button"
                  onClick={onSettingsPanelToggle}
                  className={`p-1.5 rounded-md border transition-colors ${
                    isSettingsPanelOpen
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-secondary border-border text-muted-foreground hover:text-foreground hover:bg-accent'
                  }`}
                  title="Board Settings"
                  data-testid="board-settings-toggle"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>
      }
    />
  );
}
