import { CircleDot, RefreshCw } from 'lucide-react';
import { PanelHeader } from '@/components/shared/panel-header';
import type { IssuesStateFilter } from '../types';
import { IssuesFilterControls } from './issues-filter-controls';

interface IssuesListHeaderProps {
  openCount: number;
  closedCount: number;
  totalOpenCount?: number;
  totalClosedCount?: number;
  hasActiveFilter?: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  compact?: boolean;
  filterProps?: {
    stateFilter: IssuesStateFilter;
    selectedLabels: string[];
    availableLabels: string[];
    onStateFilterChange: (filter: IssuesStateFilter) => void;
    onLabelsChange: (labels: string[]) => void;
  };
}

export function IssuesListHeader({
  openCount,
  closedCount,
  totalOpenCount,
  totalClosedCount,
  hasActiveFilter = false,
  refreshing,
  onRefresh,
  compact = false,
  filterProps,
}: IssuesListHeaderProps) {
  const totalIssues = openCount + closedCount;

  const getCountsSubtitle = () => {
    if (totalIssues === 0) {
      return hasActiveFilter ? 'No matching issues' : 'No issues found';
    }
    if (hasActiveFilter && totalOpenCount !== undefined && totalClosedCount !== undefined) {
      const openText =
        openCount === totalOpenCount
          ? `${openCount} open`
          : `${openCount} of ${totalOpenCount} open`;
      const closedText =
        closedCount === totalClosedCount
          ? `${closedCount} closed`
          : `${closedCount} of ${totalClosedCount} closed`;
      return `${openText}, ${closedText}`;
    }
    return `${openCount} open, ${closedCount} closed`;
  };

  return (
    <div className="border-b border-border">
      <PanelHeader
        icon={CircleDot}
        title="Issues"
        badge={<span className="text-xs text-muted-foreground">{getCountsSubtitle()}</span>}
        actions={[
          {
            icon: RefreshCw,
            label: 'Refresh',
            onClick: onRefresh,
            disabled: refreshing,
            loading: refreshing,
          },
        ]}
      />

      {filterProps && (
        <div className="px-4 pb-3 pt-1">
          <IssuesFilterControls
            stateFilter={filterProps.stateFilter}
            selectedLabels={filterProps.selectedLabels}
            availableLabels={filterProps.availableLabels}
            onStateFilterChange={filterProps.onStateFilterChange}
            onLabelsChange={filterProps.onLabelsChange}
            disabled={refreshing}
            compact={compact}
          />
        </div>
      )}
    </div>
  );
}
