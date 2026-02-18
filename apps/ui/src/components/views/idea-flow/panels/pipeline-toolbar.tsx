/**
 * PipelineToolbar — Toggle buttons for idea flow panels
 *
 * Controls visibility of list, detail, and legend panels.
 */

import { List, FileText, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PipelineToolbarProps {
  showList: boolean;
  showDetail: boolean;
  showLegend: boolean;
  onToggleList: () => void;
  onToggleDetail: () => void;
  onToggleLegend: () => void;
}

const buttons = [
  { key: 'list', icon: List, label: 'List' },
  { key: 'detail', icon: FileText, label: 'Detail' },
  { key: 'legend', icon: Info, label: 'Legend' },
] as const;

export function PipelineToolbar({
  showList,
  showDetail,
  showLegend,
  onToggleList,
  onToggleDetail,
  onToggleLegend,
}: PipelineToolbarProps) {
  const states: Record<string, boolean> = {
    list: showList,
    detail: showDetail,
    legend: showLegend,
  };
  const toggles: Record<string, () => void> = {
    list: onToggleList,
    detail: onToggleDetail,
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
