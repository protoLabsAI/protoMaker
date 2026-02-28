/**
 * AutoModeSummaryPanel — Sidebar panel showing auto-mode status and trigger configuration
 *
 * Shows: per-project auto-mode status, trigger type (Always On vs Manual),
 * effective vs. configured concurrency, and system cap warnings.
 * Data fetched from /api/auto-mode/status (global) and /api/settings/global.
 */

import { useQuery } from '@tanstack/react-query';
import { X, Bot, Zap, AlertTriangle, Activity, Settings } from 'lucide-react';
import { getElectronAPI } from '@/lib/electron';
import { queryKeys } from '@/lib/query-keys';
import { useGlobalSettings } from '@/hooks/queries/use-settings';
import { DEFAULT_MAX_CONCURRENCY } from '@protolabs-ai/types';
import { cn } from '@/lib/utils';

interface AutoModeWorktreeEntry {
  projectPath: string;
  branchName: string | null;
}

interface GlobalAutoModeStatus {
  success: boolean;
  isRunning: boolean;
  runningCount: number;
  runningFeatures: string[];
  activeAutoLoopProjects: string[];
  activeAutoLoopWorktrees: AutoModeWorktreeEntry[];
  systemMaxConcurrency: number;
}

interface AutoModeSummaryPanelProps {
  onClose: () => void;
}

function worktreeLabel(entry: AutoModeWorktreeEntry): string {
  const parts = entry.projectPath.split('/');
  const projectName = parts[parts.length - 1] || entry.projectPath;
  return entry.branchName ? `${projectName} (${entry.branchName})` : projectName;
}

function WorktreeRow({
  worktreeKey,
  projectPath,
  branchName,
  isActive,
  configuredConcurrency,
  systemMaxConcurrency,
  isAlwaysOn,
}: {
  worktreeKey: string;
  projectPath: string;
  branchName: string | null;
  isActive: boolean;
  configuredConcurrency: number;
  systemMaxConcurrency: number;
  isAlwaysOn: boolean;
}) {
  const effectiveConcurrency = Math.min(configuredConcurrency, systemMaxConcurrency);
  const isCapped = configuredConcurrency > systemMaxConcurrency;
  const label = worktreeLabel({ projectPath, branchName });

  return (
    <div
      key={worktreeKey}
      className={cn(
        'flex flex-col gap-1.5 px-4 py-3 border-b border-border/30',
        isActive && 'bg-brand-500/5'
      )}
    >
      {/* Project/worktree name + status badge */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium truncate flex-1" title={`${projectPath}`}>
          {label}
        </span>
        <span
          className={cn(
            'text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0',
            isActive ? 'bg-brand-500/15 text-brand-400' : 'bg-muted/50 text-muted-foreground'
          )}
        >
          {isActive ? 'Running' : 'Stopped'}
        </span>
      </div>

      {/* Trigger type + concurrency */}
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1">
          {isAlwaysOn ? (
            <>
              <Zap className="w-3 h-3 text-amber-400" />
              <span>Always On</span>
            </>
          ) : (
            <>
              <Settings className="w-3 h-3" />
              <span>Manual</span>
            </>
          )}
        </div>
        <span className="text-border/60">|</span>
        <div className="flex items-center gap-1">
          <Bot className="w-3 h-3" />
          <span className="tabular-nums">
            {effectiveConcurrency}/{configuredConcurrency} agents
          </span>
        </div>
        {isCapped && (
          <div className="flex items-center gap-1 text-amber-500">
            <AlertTriangle className="w-3 h-3" />
            <span>capped at {systemMaxConcurrency}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function AutoModeSummaryPanel({ onClose }: AutoModeSummaryPanelProps) {
  // Global auto-mode status — includes activeAutoLoopWorktrees and systemMaxConcurrency
  const { data: statusData } = useQuery<GlobalAutoModeStatus>({
    queryKey: queryKeys.autoMode.status(undefined),
    queryFn: async (): Promise<GlobalAutoModeStatus> => {
      const api = getElectronAPI();
      const result = await api.autoMode?.status(undefined, null);
      return result as GlobalAutoModeStatus;
    },
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  // Global settings — includes autoModeByWorktree and autoModeAlwaysOn
  const { data: settings } = useGlobalSettings();

  const systemMaxConcurrency = statusData?.systemMaxConcurrency ?? 10;
  const activeWorktrees = statusData?.activeAutoLoopWorktrees ?? [];

  // Build a set of active worktree keys for quick lookup
  const activeKeys = new Set(
    activeWorktrees.map((w) => `${w.projectPath}::${w.branchName ?? '__main__'}`)
  );

  // Collect all configured worktrees from settings, merging with always-on config
  const configuredWorktrees: Array<{
    worktreeKey: string;
    projectPath: string;
    branchName: string | null;
    configuredConcurrency: number;
    isAlwaysOn: boolean;
  }> = [];

  const autoModeByWorktree = settings?.autoModeByWorktree ?? {};
  const alwaysOnProjects = settings?.autoModeAlwaysOn?.projects ?? [];
  const alwaysOnEnabled = settings?.autoModeAlwaysOn?.enabled ?? false;

  // Include worktrees from autoModeByWorktree settings
  for (const [key, value] of Object.entries(autoModeByWorktree)) {
    const [rawProjectPath, rawBranch] = key.split('::');
    const projectPath = rawProjectPath ?? key;
    const branchName = rawBranch === '__main__' ? null : (rawBranch ?? null);
    configuredWorktrees.push({
      worktreeKey: key,
      projectPath,
      branchName,
      configuredConcurrency: value.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY,
      isAlwaysOn: false,
    });
  }

  // Include always-on worktrees not already in the list
  if (alwaysOnEnabled) {
    for (const project of alwaysOnProjects) {
      const key = `${project.projectPath}::${project.branchName ?? '__main__'}`;
      const existing = configuredWorktrees.find((w) => w.worktreeKey === key);
      if (existing) {
        // Mark as always-on
        existing.isAlwaysOn = true;
        if (project.maxConcurrency != null) {
          existing.configuredConcurrency = project.maxConcurrency;
        }
      } else {
        configuredWorktrees.push({
          worktreeKey: key,
          projectPath: project.projectPath,
          branchName: project.branchName,
          configuredConcurrency: project.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY,
          isAlwaysOn: true,
        });
      }
    }
  }

  // Include active worktrees not in settings (e.g. started from the UI without saving settings)
  for (const active of activeWorktrees) {
    const key = `${active.projectPath}::${active.branchName ?? '__main__'}`;
    if (!configuredWorktrees.find((w) => w.worktreeKey === key)) {
      configuredWorktrees.push({
        worktreeKey: key,
        projectPath: active.projectPath,
        branchName: active.branchName,
        configuredConcurrency: DEFAULT_MAX_CONCURRENCY,
        isAlwaysOn: false,
      });
    }
  }

  const isAnyCapped = configuredWorktrees.some(
    (w) => w.configuredConcurrency > systemMaxConcurrency
  );
  const hasAnyActivity = activeKeys.size > 0 || configuredWorktrees.length > 0;

  return (
    <div className="fixed top-0 right-0 h-full w-[320px] bg-card border-l border-border shadow-2xl flex flex-col z-30 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Auto-Mode Summary</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-muted rounded transition-colors"
          aria-label="Close auto-mode summary panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* System cap banner */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted/20 border-b border-border/30">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
          System Concurrency Cap
        </span>
        <span className="text-xs font-semibold tabular-nums">
          {systemMaxConcurrency} agents max
        </span>
      </div>

      {isAnyCapped && (
        <div className="flex items-start gap-2 px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-500 text-[10px]">
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
          <span>
            Some worktrees are configured above the system cap. Set{' '}
            <code className="font-mono">AUTOMAKER_MAX_CONCURRENCY</code> to increase the limit.
          </span>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {!hasAnyActivity ? (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center text-sm text-muted-foreground">
            <Bot className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium mb-1">No auto-mode configured</p>
            <p className="text-xs">
              Start auto-mode from the board view to see per-project status here.
            </p>
          </div>
        ) : (
          <>
            {/* Section header */}
            <div className="px-4 pt-3 pb-1">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Worktrees
              </h4>
            </div>

            {configuredWorktrees.map((w) => (
              <WorktreeRow
                key={w.worktreeKey}
                worktreeKey={w.worktreeKey}
                projectPath={w.projectPath}
                branchName={w.branchName}
                isActive={activeKeys.has(w.worktreeKey)}
                configuredConcurrency={w.configuredConcurrency}
                systemMaxConcurrency={systemMaxConcurrency}
                isAlwaysOn={w.isAlwaysOn}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
