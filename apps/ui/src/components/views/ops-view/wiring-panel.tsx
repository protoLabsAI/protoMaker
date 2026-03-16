/**
 * Wiring Panel
 *
 * Displays service instantiation status from the QA check endpoint.
 * Shows a grid of service cards with green/red wired indicators,
 * a wiring summary, and timer counts.
 */

import { CheckCircle2, XCircle, Unplug } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { useQaCheck } from '@/hooks/queries/use-metrics';

// ============================================================================
// Sub-components
// ============================================================================

interface ServiceCardProps {
  name: string;
  wired: boolean;
}

function ServiceCard({ name, wired }: ServiceCardProps) {
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
        wired ? 'border-border/50 bg-card' : 'border-destructive/40 bg-destructive/5'
      }`}
    >
      {wired ? (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
      ) : (
        <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
      )}
      <span
        className={`text-xs font-mono truncate ${
          wired ? 'text-foreground-secondary' : 'text-destructive font-medium'
        }`}
      >
        {name}
      </span>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
}

function StatCard({ label, value, sub }: StatCardProps) {
  return (
    <div className="rounded-lg border border-border/50 bg-card px-4 py-3 flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold tabular-nums">{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function WiringPanel() {
  const projectPath = useAppStore((s) => s.currentProject?.path);
  const { data, isLoading, error } = useQaCheck(projectPath);

  if (!projectPath) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        No project selected
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        Loading wiring status...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-48 text-destructive text-sm">
        Failed to load wiring status: {(error as Error).message}
      </div>
    );
  }

  const report = data?.report;
  if (!report) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
        <Unplug className="h-8 w-8 opacity-50" />
        <p className="text-sm">No QA data available</p>
      </div>
    );
  }

  const { wiring, timers } = report;
  const wiredCount = wiring.services.filter((s) => s.wired).length;
  const totalCount = wiring.totalServices;
  const allWired = wiredCount === totalCount;
  const missingCount = totalCount - wiredCount;

  const summaryLabel = allWired
    ? `${wiredCount}/${totalCount} services wired`
    : `${wiredCount}/${totalCount} — ${missingCount} missing`;

  return (
    <div className="space-y-5">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard
          label="Wiring"
          value={summaryLabel}
          sub={allWired ? 'All services wired' : `${missingCount} service(s) not wired`}
        />
        <StatCard
          label="Timers"
          value={timers.total}
          sub={`${timers.running} running / ${timers.paused} paused`}
        />
        <StatCard label="Signal Timers" value={timers.signalTimers.length} />
        <StatCard label="Health Timers" value={timers.healthTimers.length} />
      </div>

      {/* Service Grid */}
      <div>
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
          Service Wiring ({wiredCount}/{totalCount})
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {wiring.services.map((service) => (
            <ServiceCard key={service.name} name={service.name} wired={service.wired} />
          ))}
        </div>
      </div>

      {/* Timer Detail */}
      {(timers.signalTimers.length > 0 || timers.healthTimers.length > 0) && (
        <div className="grid grid-cols-2 gap-4">
          {timers.signalTimers.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Signal Timers
              </h3>
              <div className="space-y-1">
                {timers.signalTimers.map((id) => (
                  <div
                    key={id}
                    className="text-xs font-mono text-foreground-secondary px-2 py-1 rounded bg-muted/40"
                  >
                    {id}
                  </div>
                ))}
              </div>
            </div>
          )}
          {timers.healthTimers.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Health Timers
              </h3>
              <div className="space-y-1">
                {timers.healthTimers.map((id) => (
                  <div
                    key={id}
                    className="text-xs font-mono text-foreground-secondary px-2 py-1 rounded bg-muted/40"
                  >
                    {id}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
