/**
 * TimeRangeSelector - Shared time range picker for dashboard metrics
 */

import { useMemo } from 'react';

export type TimeRange = '7d' | '30d' | '90d' | 'all';

const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: '90d', label: '90D' },
  { value: 'all', label: 'All' },
];

interface TimeRangeSelectorProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
}

export function TimeRangeSelector({ value, onChange }: TimeRangeSelectorProps) {
  return (
    <div className="flex items-center gap-1 rounded-lg bg-muted/50 p-0.5">
      {TIME_RANGES.map((range) => (
        <button
          key={range.value}
          onClick={() => onChange(range.value)}
          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
            value === range.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {range.label}
        </button>
      ))}
    </div>
  );
}

export function useTimeRangeDates(range: TimeRange): {
  startDate: string | undefined;
  endDate: string | undefined;
} {
  return useMemo(() => {
    if (range === 'all') return { startDate: undefined, endDate: undefined };

    const now = new Date();
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
    const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    return {
      startDate: start.toISOString(),
      endDate: now.toISOString(),
    };
  }, [range]);
}
