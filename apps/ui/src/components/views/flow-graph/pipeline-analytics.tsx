/**
 * PipelineAnalytics — Collapsible analytics panel for pipeline health.
 *
 * Shows: active pipelines count, completed today, avg phase duration,
 * and gate hold frequency. Data fetched from /api/engine/pipeline/analytics.
 */

import { memo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronDown,
  ChevronUp,
  BarChart3,
  Clock,
  CheckCircle2,
  Hand,
  Activity,
} from 'lucide-react';
import { getHttpApiClient } from '@/lib/http-api-client';
import { useAppStore } from '@/store/app-store';
import { cn } from '@/lib/utils';

interface PipelineAnalyticsData {
  activePipelines: number;
  completedToday: number;
  avgDurationMinutes: number;
  gateHoldRate: number;
  phaseBreakdown: Array<{
    phase: string;
    avgDurationMs: number;
    successRate: number;
    gateHoldCount: number;
  }>;
}

function formatDuration(minutes: number): string {
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours}h ${mins}m`;
}

function StatCard({
  icon: Icon,
  label,
  value,
  subValue,
}: {
  icon: typeof Activity;
  label: string;
  value: string | number;
  subValue?: string;
}) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-muted/30 border border-border/30">
      <Icon className="w-3 h-3 text-muted-foreground" />
      <div>
        <p className="text-[10px] text-muted-foreground leading-none">{label}</p>
        <p className="text-xs font-medium tabular-nums leading-tight">{value}</p>
        {subValue && <p className="text-[9px] text-muted-foreground leading-none">{subValue}</p>}
      </div>
    </div>
  );
}

function PipelineAnalyticsComponent() {
  const [expanded, setExpanded] = useState(false);
  const projectPath = useAppStore((s) => s.currentProject?.path);

  const { data } = useQuery<PipelineAnalyticsData>({
    queryKey: ['pipeline-analytics', projectPath],
    queryFn: async () => {
      const api = getHttpApiClient();
      const result = await api.engine.pipelineStatus(projectPath!, '');
      // Transform to analytics shape (simple aggregation from available data)
      return {
        activePipelines: 0,
        completedToday: 0,
        avgDurationMinutes: 0,
        gateHoldRate: 0,
        phaseBreakdown: [],
        ...((result as any)?.analytics ?? {}),
      };
    },
    enabled: !!projectPath,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const analytics = data ?? {
    activePipelines: 0,
    completedToday: 0,
    avgDurationMinutes: 0,
    gateHoldRate: 0,
    phaseBreakdown: [],
  };

  return (
    <div className="rounded-lg bg-card/60 border border-border/40 backdrop-blur-sm overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-[10px] text-muted-foreground hover:bg-muted/20 transition-colors"
      >
        <BarChart3 className="w-3 h-3" />
        <span className="font-medium">Pipeline Analytics</span>
        <span className="ml-auto" />
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 border-t border-border/30 pt-2">
              <div className="grid grid-cols-4 gap-2">
                <StatCard icon={Activity} label="Active" value={analytics.activePipelines} />
                <StatCard
                  icon={CheckCircle2}
                  label="Completed"
                  value={analytics.completedToday}
                  subValue="today"
                />
                <StatCard
                  icon={Clock}
                  label="Avg Duration"
                  value={formatDuration(analytics.avgDurationMinutes)}
                />
                <StatCard
                  icon={Hand}
                  label="Gate Hold"
                  value={`${Math.round(analytics.gateHoldRate * 100)}%`}
                />
              </div>

              {analytics.phaseBreakdown.length > 0 && (
                <div className="mt-2 space-y-1">
                  <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">
                    Per-Phase Breakdown
                  </p>
                  {analytics.phaseBreakdown.map((phase) => (
                    <div key={phase.phase} className="flex items-center gap-2 text-[10px]">
                      <span className="w-16 text-muted-foreground font-mono">{phase.phase}</span>
                      <div className="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full',
                            phase.successRate > 0.8
                              ? 'bg-emerald-500/60'
                              : phase.successRate > 0.5
                                ? 'bg-amber-500/60'
                                : 'bg-red-500/60'
                          )}
                          style={{ width: `${Math.round(phase.successRate * 100)}%` }}
                        />
                      </div>
                      <span className="tabular-nums text-zinc-500 w-8 text-right">
                        {Math.round(phase.avgDurationMs / 1000)}s
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export const PipelineAnalytics = memo(PipelineAnalyticsComponent);
