/**
 * SitrepCard — Status card for get_sitrep tool results.
 *
 * Renders a JSON preview of the operational situation report.
 */

import { Loader2, Activity } from 'lucide-react';
import type { ToolResultRendererProps } from '../tool-result-registry.js';

export function SitrepCard({ output, state }: ToolResultRendererProps) {
  const isLoading =
    state === 'input-streaming' || state === 'input-available' || state === 'approval-responded';

  if (isLoading) {
    return (
      <div
        data-slot="sitrep-card"
        className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        <Loader2 className="size-3.5 animate-spin" />
        <span>Fetching situation report…</span>
      </div>
    );
  }

  if (!output) {
    return (
      <div
        data-slot="sitrep-card"
        className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        Situation report unavailable
      </div>
    );
  }

  const json = typeof output === 'string' ? output : JSON.stringify(output, null, 2);

  return (
    <div data-slot="sitrep-card" className="rounded-md border border-border/50 bg-muted/30 text-xs">
      <div className="flex items-center gap-1.5 border-b border-border/50 px-3 py-1.5">
        <Activity className="size-3.5 text-muted-foreground" />
        <span className="font-medium text-foreground/80">Situation Report</span>
      </div>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground/80">
        {json}
      </pre>
    </div>
  );
}
