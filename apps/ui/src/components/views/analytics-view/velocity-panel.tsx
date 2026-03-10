import { Card, CardContent, CardHeader, CardTitle } from '@protolabsai/ui/atoms';
import { Clock } from 'lucide-react';
import { formatDuration } from '@protolabsai/utils';

interface VelocityPanelProps {
  avgCycleTimeMs: number;
  avgAgentTimeMs: number;
  avgPrReviewTimeMs: number;
  estimatedBacklogTimeMs: number;
  isLoading: boolean;
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}

export function VelocityPanel({
  avgCycleTimeMs,
  avgAgentTimeMs,
  avgPrReviewTimeMs,
  estimatedBacklogTimeMs,
  isLoading,
}: VelocityPanelProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Clock className="h-4 w-4" />
          Velocity
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-5 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            <MetricRow label="Avg cycle time" value={formatDuration(avgCycleTimeMs)} />
            <MetricRow label="Avg agent time" value={formatDuration(avgAgentTimeMs)} />
            <MetricRow label="Avg PR review" value={formatDuration(avgPrReviewTimeMs)} />
            <MetricRow label="Backlog ETA" value={formatDuration(estimatedBacklogTimeMs)} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
