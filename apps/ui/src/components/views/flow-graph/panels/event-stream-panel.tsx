/**
 * EventStreamPanel — Live event stream for engine observability.
 *
 * Subscribes to WebSocket events and shows a scrollable, filterable list.
 * Categorizes events by service for easy filtering.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'motion/react';
import { Pause, Play, X, Filter } from 'lucide-react';
import { getHttpApiClient } from '@/lib/http-api-client';
import { cn } from '@/lib/utils';

interface StreamEvent {
  type: string;
  service: string;
  timestamp: number;
  preview: string;
}

const SERVICE_PREFIXES: Record<string, string> = {
  'feature:': 'features',
  'agent:': 'agents',
  'auto-mode:': 'auto-mode',
  'pr:': 'pr-feedback',
  'github:': 'github',
  'linear:': 'linear',
  'discord:': 'discord',
  'ralph:': 'ralph',
  'signal:': 'signal-intake',
  'project:': 'projects',
  'lead-engineer:': 'lead-engineer',
  'content:': 'content',
};

function classifyService(eventType: string): string {
  for (const [prefix, service] of Object.entries(SERVICE_PREFIXES)) {
    if (eventType.startsWith(prefix)) return service;
  }
  return 'system';
}

const SERVICE_COLORS: Record<string, string> = {
  features: 'text-amber-400',
  agents: 'text-violet-400',
  'auto-mode': 'text-blue-400',
  'pr-feedback': 'text-emerald-400',
  github: 'text-zinc-300',
  linear: 'text-indigo-400',
  discord: 'text-purple-400',
  ralph: 'text-cyan-400',
  'signal-intake': 'text-orange-400',
  projects: 'text-pink-400',
  'lead-engineer': 'text-rose-400',
  content: 'text-teal-400',
  system: 'text-zinc-400',
};

const MAX_EVENTS = 200;

function getPreview(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const p = payload as Record<string, unknown>;
  const parts: string[] = [];
  if (p.featureId) parts.push(`feature:${String(p.featureId).slice(0, 8)}`);
  if (p.featureTitle) parts.push(String(p.featureTitle).slice(0, 30));
  if (p.prNumber) parts.push(`PR#${p.prNumber}`);
  if (p.status) parts.push(String(p.status));
  if (p.error) parts.push(String(p.error).slice(0, 40));
  return parts.join(' | ') || '';
}

interface EventStreamPanelProps {
  onClose: () => void;
}

export function EventStreamPanel({ onClose }: EventStreamPanelProps) {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const handleEvent = useCallback((type: string, payload: unknown) => {
    if (pausedRef.current) return;
    const event: StreamEvent = {
      type,
      service: classifyService(type),
      timestamp: Date.now(),
      preview: getPreview(payload),
    };
    setEvents((prev) => {
      const next = [event, ...prev];
      return next.length > MAX_EVENTS ? next.slice(0, MAX_EVENTS) : next;
    });
  }, []);

  useEffect(() => {
    const api = getHttpApiClient();
    const unsubscribe = api.subscribeToEvents((type, payload) => {
      handleEvent(type, payload);
    });
    return unsubscribe;
  }, [handleEvent]);

  // Auto-scroll to top when new events arrive (if not paused)
  useEffect(() => {
    if (!paused && listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [events.length, paused]);

  const filtered = filter ? events.filter((e) => e.service === filter) : events;

  // Get unique services that have events
  const activeServices = [...new Set(events.map((e) => e.service))].sort();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="rounded-xl border border-border/50 bg-card/90 backdrop-blur-md shadow-lg overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/30">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold">Event Stream</h3>
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {filtered.length} events
          </span>
          {/* Live indicator */}
          {!paused && (
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPaused((p) => !p)}
            title={paused ? 'Resume' : 'Pause'}
            className="p-1 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground"
          >
            {paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Filter bar */}
      {activeServices.length > 1 && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border/20 overflow-x-auto">
          <Filter className="w-3 h-3 text-muted-foreground shrink-0" />
          <button
            onClick={() => setFilter(null)}
            className={cn(
              'text-[10px] px-1.5 py-0.5 rounded-md shrink-0',
              filter === null
                ? 'bg-violet-500/15 text-violet-400'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            All
          </button>
          {activeServices.map((svc) => (
            <button
              key={svc}
              onClick={() => setFilter(filter === svc ? null : svc)}
              className={cn(
                'text-[10px] px-1.5 py-0.5 rounded-md shrink-0',
                filter === svc
                  ? 'bg-violet-500/15 text-violet-400'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {svc}
            </button>
          ))}
        </div>
      )}

      {/* Event list */}
      <div ref={listRef} className="max-h-[250px] overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            {events.length === 0 ? 'Waiting for events...' : 'No events match filter'}
          </p>
        ) : (
          filtered.map((event, i) => (
            <div
              key={`${event.timestamp}-${i}`}
              className="flex items-center gap-2 px-3 py-1 text-[11px] hover:bg-muted/20 border-b border-border/10 last:border-0"
            >
              <span className="text-[10px] tabular-nums text-muted-foreground shrink-0 w-16">
                {new Date(event.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
              <span
                className={cn(
                  'text-[10px] font-medium shrink-0 w-20 truncate',
                  SERVICE_COLORS[event.service] || 'text-zinc-400'
                )}
              >
                {event.service}
              </span>
              <span className="font-mono text-foreground shrink-0">{event.type}</span>
              {event.preview && (
                <span className="text-muted-foreground truncate ml-1">{event.preview}</span>
              )}
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
}
