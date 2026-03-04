/**
 * MetricsCard — Compact grid for get_project_metrics / get_capacity_metrics tool results.
 *
 * Renders key metrics as labeled values in a responsive grid layout.
 */

import { Loader2, BarChart3, Activity } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import type { ToolResultRendererProps } from '../tool-result-registry.js';

interface MetricItem {
  label: string;
  value: string | number;
  color?: string;
}

function extractMetrics(output: unknown, toolName: string): MetricItem[] {
  if (!output || typeof output !== 'object') return [];
  const o = output as Record<string, unknown>;
  const data =
    'success' in o && 'data' in o && typeof o.data === 'object' && o.data !== null
      ? (o.data as Record<string, unknown>)
      : o;

  if ('error' in data) return [];

  const metrics: MetricItem[] = [];

  if (toolName === 'get_project_metrics') {
    if (data.totalFeatures != null)
      metrics.push({ label: 'Total Features', value: Number(data.totalFeatures) });
    if (data.completedFeatures != null)
      metrics.push({
        label: 'Completed',
        value: Number(data.completedFeatures),
        color: 'text-green-500',
      });
    if (data.successRate != null)
      metrics.push({
        label: 'Success Rate',
        value: `${(Number(data.successRate) * 100).toFixed(0)}%`,
        color: Number(data.successRate) >= 0.8 ? 'text-green-500' : 'text-amber-500',
      });
    if (data.throughputPerDay != null)
      metrics.push({
        label: 'Throughput/Day',
        value: Number(data.throughputPerDay).toFixed(1),
      });
    if (data.costPerFeature != null)
      metrics.push({
        label: 'Cost/Feature',
        value: `$${Number(data.costPerFeature).toFixed(2)}`,
      });
    if (data.totalCostUsd != null)
      metrics.push({
        label: 'Total Cost',
        value: `$${Number(data.totalCostUsd).toFixed(2)}`,
      });
    if (data.escalationRate != null)
      metrics.push({
        label: 'Escalation Rate',
        value: `${(Number(data.escalationRate) * 100).toFixed(0)}%`,
        color: Number(data.escalationRate) > 0.2 ? 'text-red-500' : 'text-green-500',
      });
    if (data.avgCycleTimeMs != null)
      metrics.push({
        label: 'Avg Cycle',
        value: formatMs(Number(data.avgCycleTimeMs)),
      });
  } else {
    // capacity metrics
    if (data.currentConcurrency != null)
      metrics.push({ label: 'Current', value: Number(data.currentConcurrency) });
    if (data.maxConcurrency != null)
      metrics.push({ label: 'Max', value: Number(data.maxConcurrency) });
    if (data.backlogSize != null)
      metrics.push({ label: 'Backlog', value: Number(data.backlogSize) });
    if (data.blockedCount != null)
      metrics.push({
        label: 'Blocked',
        value: Number(data.blockedCount),
        color: Number(data.blockedCount) > 0 ? 'text-red-500' : undefined,
      });
    if (data.reviewCount != null)
      metrics.push({ label: 'In Review', value: Number(data.reviewCount) });
    if (data.utilizationPercent != null)
      metrics.push({
        label: 'Utilization',
        value: `${Number(data.utilizationPercent).toFixed(0)}%`,
        color: Number(data.utilizationPercent) > 80 ? 'text-amber-500' : 'text-green-500',
      });
  }

  return metrics;
}

function formatMs(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(0)}s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(0)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

export function MetricsCard({ output, state, toolName }: ToolResultRendererProps) {
  const isLoading =
    state === 'input-streaming' || state === 'input-available' || state === 'approval-responded';

  if (isLoading) {
    return (
      <div
        data-slot="metrics-card"
        className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        <Loader2 className="size-3.5 animate-spin" />
        <span>Loading metrics…</span>
      </div>
    );
  }

  const metrics = extractMetrics(output, toolName);

  if (metrics.length === 0) {
    // Check for error
    const errMsg =
      output && typeof output === 'object' && 'error' in (output as Record<string, unknown>)
        ? String((output as Record<string, unknown>).error)
        : 'No metrics available';
    return (
      <div
        data-slot="metrics-card"
        className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        {errMsg}
      </div>
    );
  }

  const isCapacity = toolName === 'get_capacity_metrics';
  const Icon = isCapacity ? Activity : BarChart3;
  const title = isCapacity ? 'Capacity Metrics' : 'Project Metrics';

  return (
    <div
      data-slot="metrics-card"
      className="rounded-md border border-border/50 bg-muted/30 text-xs"
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 border-b border-border/50 px-3 py-1.5">
        <Icon className="size-3.5 text-muted-foreground" />
        <span className="font-medium text-foreground/80">{title}</span>
      </div>

      {/* Metric grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 px-3 py-2 sm:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.label} className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {m.label}
            </span>
            <span className={cn('font-semibold tabular-nums text-foreground/90', m.color)}>
              {m.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
