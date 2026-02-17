/**
 * PanelToolbar — Toggle buttons for floating panels
 */

import { BarChart3, HeartPulse, LineChart, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PanelToolbarProps {
  showMetrics: boolean;
  showHealth: boolean;
  showCharts: boolean;
  showLegend: boolean;
  onToggleMetrics: () => void;
  onToggleHealth: () => void;
  onToggleCharts: () => void;
  onToggleLegend: () => void;
}

const buttons = [
  { key: 'metrics', icon: BarChart3, label: 'Metrics' },
  { key: 'health', icon: HeartPulse, label: 'Health' },
  { key: 'charts', icon: LineChart, label: 'Charts' },
  { key: 'legend', icon: Info, label: 'Legend' },
] as const;

export function PanelToolbar({
  showMetrics,
  showHealth,
  showCharts,
  showLegend,
  onToggleMetrics,
  onToggleHealth,
  onToggleCharts,
  onToggleLegend,
}: PanelToolbarProps) {
  const states: Record<string, boolean> = {
    metrics: showMetrics,
    health: showHealth,
    charts: showCharts,
    legend: showLegend,
  };
  const toggles: Record<string, () => void> = {
    metrics: onToggleMetrics,
    health: onToggleHealth,
    charts: onToggleCharts,
    legend: onToggleLegend,
  };

  return (
    <div className="flex items-center gap-1 rounded-lg border border-border/50 bg-card/90 backdrop-blur-md shadow-lg p-1">
      {buttons.map((btn) => (
        <button
          key={btn.key}
          onClick={toggles[btn.key]}
          title={btn.label}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-medium transition-colors',
            states[btn.key]
              ? 'bg-violet-500/15 text-violet-400'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          )}
        >
          <btn.icon className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{btn.label}</span>
        </button>
      ))}
    </div>
  );
}
