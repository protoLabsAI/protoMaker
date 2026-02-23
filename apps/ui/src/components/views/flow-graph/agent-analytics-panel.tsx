/**
 * AgentAnalyticsPanel — Sidebar panel showing agent performance analytics
 *
 * Shows: phase duration averages, slowest tools, and retry comparison data.
 * Data fetched from /api/analytics/agent-performance with 30s auto-refresh.
 */

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, BarChart3, Clock, RotateCcw } from 'lucide-react';
import { getHttpApiClient } from '@/lib/http-api-client';
import { useAppStore } from '@/store/app-store';
import { formatDuration } from '@/lib/dashboard-transforms';
import { cn } from '@/lib/utils';

interface PhaseAverage {
  phase: string;
  avgDurationMs: number;
  maxDurationMs: number;
}

interface SlowTool {
  name: string;
  totalTimeMs: number;
  count: number;
}

interface RetryAttempt {
  attemptNumber: number;
  durationMs: number;
}

interface RetryComparison {
  featureTitle: string;
  attempts: RetryAttempt[];
}

interface AgentPerformanceData {
  phaseAverages: PhaseAverage[];
  slowestTools: SlowTool[];
  retryComparisons: RetryComparison[];
  hasEnoughData: boolean;
}

interface AgentAnalyticsPanelProps {
  onClose: () => void;
}

export function AgentAnalyticsPanel({ onClose }: AgentAnalyticsPanelProps) {
  const projectPath = useAppStore((s) => s.currentProject?.path);

  const { data, refetch } = useQuery<AgentPerformanceData>({
    queryKey: ['agent-performance', projectPath],
    queryFn: async () => {
      const api = getHttpApiClient();
      return api.analytics.getAgentPerformance(projectPath!);
    },
    enabled: !!projectPath,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  // Auto-refresh every 30s while panel is open
  useEffect(() => {
    const interval = setInterval(() => {
      refetch();
    }, 30_000);
    return () => clearInterval(interval);
  }, [refetch]);

  const analytics = data ?? {
    phaseAverages: [],
    slowestTools: [],
    retryComparisons: [],
    hasEnoughData: false,
  };

  // Empty state when not enough data
  if (!analytics.hasEnoughData) {
    return (
      <div className="fixed top-0 right-0 h-full w-[320px] bg-card border-l border-border shadow-2xl flex flex-col z-30">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Agent Analytics</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-muted rounded transition-colors"
            aria-label="Close analytics panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center text-sm text-muted-foreground">
            <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium mb-1">Not enough data yet</p>
            <p className="text-xs">
              Analytics will appear after at least 5 features have been completed.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed top-0 right-0 h-full w-[320px] bg-card border-l border-border shadow-2xl flex flex-col z-30 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Agent Analytics</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-muted rounded transition-colors"
          aria-label="Close analytics panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Phase Averages */}
        {analytics.phaseAverages.length > 0 && (
          <div className="px-4 py-3 border-b border-border">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Average Duration by Phase
            </h4>
            <div className="space-y-2">
              {analytics.phaseAverages.map((phase) => {
                const percentage = phase.maxDurationMs
                  ? (phase.avgDurationMs / phase.maxDurationMs) * 100
                  : 0;
                return (
                  <div key={phase.phase}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium">{phase.phase}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {formatDuration(phase.avgDurationMs)}
                      </span>
                    </div>
                    <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          percentage > 80
                            ? 'bg-red-500/60'
                            : percentage > 60
                              ? 'bg-amber-500/60'
                              : 'bg-emerald-500/60'
                        )}
                        style={{ width: `${Math.min(percentage, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Slowest Operations */}
        {analytics.slowestTools.length > 0 && (
          <div className="px-4 py-3 border-b border-border">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              Slowest Operations
            </h4>
            <div className="space-y-2">
              {analytics.slowestTools.slice(0, 5).map((tool, idx) => (
                <div
                  key={`${tool.name}-${idx}`}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="font-mono text-muted-foreground flex-1 truncate">
                    {tool.name}
                  </span>
                  <span className="text-muted-foreground tabular-nums ml-2">
                    {formatDuration(tool.totalTimeMs)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Retry Comparison */}
        {analytics.retryComparisons.length > 0 && (
          <div className="px-4 py-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <RotateCcw className="w-3 h-3" />
              Retry Comparison
            </h4>
            <div className="space-y-3">
              {analytics.retryComparisons.map((retry, idx) => (
                <div key={idx} className="space-y-1.5">
                  <p className="text-xs font-medium truncate" title={retry.featureTitle}>
                    Feature: "{retry.featureTitle}"
                  </p>
                  {retry.attempts.map((attempt, attemptIdx) => {
                    const prevAttempt = attemptIdx > 0 ? retry.attempts[attemptIdx - 1] : null;
                    const isFaster = prevAttempt && attempt.durationMs < prevAttempt.durationMs;
                    return (
                      <div key={attemptIdx} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          Attempt {attempt.attemptNumber}:
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="tabular-nums">{formatDuration(attempt.durationMs)}</span>
                          {isFaster && (
                            <span className="text-emerald-500 text-[10px]">✓ faster</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
