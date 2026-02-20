/**
 * PipelineEventLog — Collapsible feed of recent pipeline:* events.
 *
 * Shows event type, phase, timestamp, and optional detail.
 * Toggles open/closed with a small header button.
 */

import { memo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, ChevronUp, Activity } from 'lucide-react';
import type { PipelineEvent } from './hooks/use-pipeline-progress';
import { cn } from '@/lib/utils';

interface PipelineEventLogProps {
  events: PipelineEvent[];
}

const EVENT_LABELS: Record<string, { label: string; color: string }> = {
  'pipeline:phase-entered': { label: 'Entered', color: 'text-violet-400' },
  'pipeline:phase-completed': { label: 'Completed', color: 'text-emerald-400' },
  'pipeline:gate-waiting': { label: 'Gate held', color: 'text-amber-400' },
  'pipeline:gate-resolved': { label: 'Gate resolved', color: 'text-violet-400' },
  'pipeline:phase-skipped': { label: 'Skipped', color: 'text-zinc-500' },
  'pipeline:trace-linked': { label: 'Traced', color: 'text-blue-400' },
};

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

function PipelineEventLogComponent({ events }: PipelineEventLogProps) {
  const [expanded, setExpanded] = useState(false);

  if (events.length === 0) return null;

  return (
    <div className="rounded-lg bg-card/60 border border-border/40 backdrop-blur-sm overflow-hidden">
      {/* Header toggle */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-[10px] text-muted-foreground hover:bg-muted/20 transition-colors"
      >
        <Activity className="w-3 h-3" />
        <span className="font-medium">Pipeline Events</span>
        <span className="ml-auto tabular-nums text-zinc-600">{events.length}</span>
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {/* Event list */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="max-h-[200px] overflow-y-auto border-t border-border/30">
              {events.map((event, i) => {
                const meta = EVENT_LABELS[event.type] ?? {
                  label: event.type.replace('pipeline:', ''),
                  color: 'text-zinc-400',
                };
                return (
                  <div
                    key={`${event.type}-${event.phase}-${i}`}
                    className="flex items-center gap-2 px-3 py-1 text-[10px] border-b border-border/20 last:border-0"
                  >
                    <span className="tabular-nums text-zinc-600 shrink-0">
                      {formatTime(event.timestamp)}
                    </span>
                    <span className={cn('font-medium shrink-0', meta.color)}>{meta.label}</span>
                    <span className="text-zinc-400 font-mono">{event.phase}</span>
                    {event.detail && (
                      <span className="text-zinc-600 truncate ml-auto">{event.detail}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export const PipelineEventLog = memo(PipelineEventLogComponent);
