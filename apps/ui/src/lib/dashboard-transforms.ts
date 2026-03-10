import type { LucideIcon } from 'lucide-react';
import { formatDuration, formatTimestamp } from '@protolabsai/utils';

// ============================================================================
// Type Definitions
// ============================================================================

export interface HeroStat {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  icon: LucideIcon;
  trend?: number;
  sparkline?: number[];
  color?: string;
  orb?: 'top-right' | 'bottom-left' | 'none';
}

export interface DonutEntry {
  name: string;
  value: number;
  color: string;
}

export interface Gauge {
  value: number;
  max: number;
  label: string;
  unit?: string;
  thresholds?: { warn: number; critical: number };
  size?: number;
}

export interface ActivityItem {
  id: string;
  icon: string;
  source: 'discord' | 'github' | 'agent';
  message: string;
  timestamp: string;
}

// API Response types (adjust based on actual API schemas)
export interface MetricsSummary {
  totalCost?: number;
  totalTokens?: number;
  activeAgents?: number;
  completedTasks?: number;
  [key: string]: number | undefined;
}

export interface TimeSeriesEntry {
  timestamp: string;
  value: number;
  secondaryValue?: number;
  [key: string]: string | number | undefined;
}

export interface ModelDistribution {
  [modelName: string]: number;
}

export interface CapacityMetrics {
  cpu?: { current: number; max: number };
  memory?: { current: number; max: number };
  disk?: { current: number; max: number };
  [key: string]: { current: number; max: number } | undefined;
}

export interface EventEntry {
  id: string;
  type: string;
  message: string;
  timestamp: number | string;
  source?: string;
}

// ============================================================================
// Transformation Functions
// ============================================================================

/**
 * Transforms API metrics summary into HeroStat components
 * @param summary - Metrics summary from API
 * @param icons - Icon mapping for each metric
 * @returns Array of HeroStat objects
 */
export function metricsToHeroStats(
  summary: MetricsSummary | null | undefined,
  icons: Record<string, LucideIcon>
): HeroStat[] {
  if (!summary) {
    return [];
  }

  const stats: HeroStat[] = [];

  // Total Cost
  if (summary.totalCost !== undefined && icons.cost) {
    stats.push({
      label: 'Total Cost',
      value: summary.totalCost,
      prefix: '$',
      decimals: 2,
      icon: icons.cost,
      color: '#10b981',
      orb: 'top-right',
    });
  }

  // Total Tokens
  if (summary.totalTokens !== undefined && icons.tokens) {
    stats.push({
      label: 'Tokens Used',
      value: summary.totalTokens,
      suffix: '',
      decimals: 0,
      icon: icons.tokens,
      color: '#8b5cf6',
      orb: 'bottom-left',
    });
  }

  // Active Agents
  if (summary.activeAgents !== undefined && icons.agents) {
    stats.push({
      label: 'Active Agents',
      value: summary.activeAgents,
      suffix: '',
      decimals: 0,
      icon: icons.agents,
      color: '#06b6d4',
      orb: 'top-right',
    });
  }

  // Completed Tasks
  if (summary.completedTasks !== undefined && icons.tasks) {
    stats.push({
      label: 'Completed Tasks',
      value: summary.completedTasks,
      suffix: '',
      decimals: 0,
      icon: icons.tasks,
      color: '#f59e0b',
      orb: 'bottom-left',
    });
  }

  return stats;
}

/**
 * Transforms time series ledger data into GlowAreaChart format
 * @param ledger - Array of time series entries
 * @param xKey - Key to use for X-axis (default: 'name')
 * @param dataKey - Key to use for primary data series (default: 'value')
 * @returns Array of chart data objects
 */
export function timeSeriesData(
  ledger: TimeSeriesEntry[] | null | undefined,
  xKey: string = 'name',
  dataKey: string = 'value'
): Array<Record<string, unknown>> {
  if (!ledger || ledger.length === 0) {
    // Return empty data with at least one point to avoid chart errors
    return [{ [xKey]: 'N/A', [dataKey]: 0 }];
  }

  return ledger.map((entry) => ({
    [xKey]: formatTimestamp(entry.timestamp),
    [dataKey]: entry.value || 0,
    ...(entry.secondaryValue !== undefined && { secondary: entry.secondaryValue }),
  }));
}

/**
 * Transforms model distribution data into GlowDonut format
 * @param distribution - Object mapping model names to usage counts
 * @param colorPalette - Optional color palette (defaults to predefined colors)
 * @returns Array of DonutEntry objects
 */
export function modelDistToDonut(
  distribution: ModelDistribution | null | undefined,
  colorPalette?: string[]
): DonutEntry[] {
  if (!distribution || Object.keys(distribution).length === 0) {
    return [{ name: 'No data', value: 1, color: '#64748b' }];
  }

  const defaultColors = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];
  const colors = colorPalette || defaultColors;

  return Object.entries(distribution)
    .sort(([, a], [, b]) => b - a) // Sort by value descending
    .map(([name, value], index) => ({
      name: formatModelName(name),
      value: value || 0,
      color: colors[index % colors.length],
    }));
}

/**
 * Transforms capacity metrics into Gauge components
 * @param capacity - Capacity metrics from API
 * @returns Array of Gauge objects
 */
export function capacityToGauges(capacity: CapacityMetrics | null | undefined): Gauge[] {
  if (!capacity) {
    return [];
  }

  const gauges: Gauge[] = [];

  // CPU
  if (capacity.cpu) {
    gauges.push({
      value: capacity.cpu.current || 0,
      max: capacity.cpu.max || 100,
      label: 'CPU',
      unit: '%',
      thresholds: { warn: 70, critical: 90 },
      size: 100,
    });
  }

  // Memory
  if (capacity.memory) {
    gauges.push({
      value: capacity.memory.current || 0,
      max: capacity.memory.max || 100,
      label: 'Memory',
      unit: '%',
      thresholds: { warn: 75, critical: 90 },
      size: 100,
    });
  }

  // Disk
  if (capacity.disk) {
    gauges.push({
      value: capacity.disk.current || 0,
      max: capacity.disk.max || 100,
      label: 'Disk',
      unit: '%',
      thresholds: { warn: 80, critical: 95 },
      size: 100,
    });
  }

  return gauges;
}

/**
 * Transforms event entries into ActivityItem format
 * @param events - Array of event entries
 * @returns Array of ActivityItem objects
 */
export function eventsToActivity(events: EventEntry[] | null | undefined): ActivityItem[] {
  if (!events || events.length === 0) {
    return [];
  }

  return events.map((event, index) => ({
    id: event.id || `event-${index}`,
    icon: getEventIcon(event.type),
    source: mapEventSource(event.source || event.type),
    message: event.message || 'Unknown event',
    timestamp: formatRelativeTime(event.timestamp),
  }));
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Formats model names for display
 */
function formatModelName(name: string): string {
  if (!name) return 'Unknown';

  // Common model name transformations
  return name
    .replace(/^claude-/, '')
    .replace(/-/g, ' ')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Formats currency values
 */
export function formatCurrency(value: number): string {
  if (value === 0) return '$0.00';
  if (value < 0.01) return '<$0.01';
  return `$${value.toFixed(2)}`;
}

/**
 * Formats large numbers with abbreviations
 */
export function formatNumber(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toLocaleString();
}

/**
 * Formats percentages
 */
export function formatPercentage(value: number): string {
  return `${Math.round(value)}%`;
}

export { formatDuration } from '@protolabsai/utils';

/**
 * Formats relative time from timestamp
 */
function formatRelativeTime(timestamp: string | number): string {
  if (!timestamp) return 'now';

  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return 'Invalid';

    const now = Date.now();
    const diff = now - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return `${seconds}s`;
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    return `${days}d`;
  } catch {
    return 'Invalid';
  }
}

/**
 * Maps event types to emoji icons
 */
function getEventIcon(type: string): string {
  const iconMap: Record<string, string> = {
    agent: '🤖',
    github: '📦',
    discord: '💬',
    error: '❌',
    success: '✅',
    warning: '⚠️',
    info: 'ℹ️',
  };

  return iconMap[type.toLowerCase()] || '•';
}

/**
 * Maps event sources to ActivityItem source types
 */
function mapEventSource(source: string): 'discord' | 'github' | 'agent' {
  const normalized = source.toLowerCase();

  if (normalized.includes('discord')) return 'discord';
  if (normalized.includes('github') || normalized.includes('git')) return 'github';

  return 'agent';
}
