import { Card, CardContent, CardHeader, CardTitle } from '@protolabs/ui/atoms';
import { Gauge } from 'lucide-react';

interface CapacityPanelProps {
  utilizationPercent: number;
  currentConcurrency: number;
  maxConcurrency: number;
  backlogSize: number;
  blockedCount: number;
  reviewCount: number;
  isLoading: boolean;
}

function MetricRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}

export function CapacityPanel({
  utilizationPercent,
  currentConcurrency,
  maxConcurrency,
  backlogSize,
  blockedCount,
  reviewCount,
  isLoading,
}: CapacityPanelProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Gauge className="h-4 w-4" />
          Capacity
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-5 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Utilization bar */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-muted-foreground">Utilization</span>
                <span className="text-sm font-semibold tabular-nums">
                  {utilizationPercent.toFixed(0)}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(utilizationPercent, 100)}%`,
                    backgroundColor:
                      utilizationPercent > 80
                        ? 'var(--destructive)'
                        : utilizationPercent > 50
                          ? 'var(--chart-3)'
                          : 'var(--primary)',
                  }}
                />
              </div>
            </div>
            <div className="divide-y divide-border/50">
              <MetricRow label="In progress" value={`${currentConcurrency} / ${maxConcurrency}`} />
              <MetricRow label="Backlog" value={backlogSize} />
              <MetricRow label="Blocked" value={blockedCount} />
              <MetricRow label="In review" value={reviewCount} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
