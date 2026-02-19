import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Pause, Play, Filter, Search, History } from 'lucide-react';
import { getHttpApiClient } from '@/lib/http-api-client';
import { useEventHistory } from '@/hooks/queries/use-metrics';
import { cn } from '@/lib/utils';

interface StreamEvent {
  type: string;
  service: string;
  timestamp: number;
  preview: string;
  featureId?: string;
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

const TIME_RANGES = [
  { label: '5m', ms: 5 * 60 * 1000 },
  { label: '15m', ms: 15 * 60 * 1000 },
  { label: '1h', ms: 60 * 60 * 1000 },
  { label: 'All', ms: 0 },
] as const;

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

export function EventsTab() {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const [featureIdFilter, setFeatureIdFilter] = useState('');
  const [timeRange, setTimeRange] = useState<number>(0); // 0 = all
  const [showHistory, setShowHistory] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  // Build server-side query filter for history.
  // timeRange is used as a key but `since` is computed at fetch time (inside queryFn)
  // to avoid the window drifting due to useMemo capturing Date.now() once.
  const historyFilter = useMemo(() => {
    if (!showHistory) return undefined;
    const f: Record<string, unknown> = { limit: 500 };
    if (filter) f.service = filter;
    if (featureIdFilter) f.featureId = featureIdFilter;
    // Store timeRange as a signal; useEventHistory computes `since` at fetch time
    if (timeRange > 0) f._timeRangeMs = timeRange;
    return f;
  }, [showHistory, filter, featureIdFilter, timeRange]);

  const { data: rawHistoryData } = useEventHistory(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    historyFilter as any
  );
  const historyData = rawHistoryData as
    | { events: StreamEvent[]; total: number; bufferSize: number }
    | undefined;

  const handleEvent = useCallback((type: string, payload: unknown) => {
    if (pausedRef.current) return;
    const p = payload as Record<string, unknown> | null;
    const event: StreamEvent = {
      type,
      service: classifyService(type),
      timestamp: Date.now(),
      preview: getPreview(payload),
      featureId: (p?.featureId as string) || undefined,
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

  useEffect(() => {
    if (!paused && listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [events.length, paused]);

  // Merge live events with history when in history mode
  const displayEvents = useMemo(() => {
    let base = events;

    // Apply time range to live events
    if (timeRange > 0) {
      const cutoff = Date.now() - timeRange;
      base = base.filter((e) => e.timestamp >= cutoff);
    }

    // Apply feature filter
    if (featureIdFilter) {
      base = base.filter((e) => e.featureId?.includes(featureIdFilter));
    }

    // Apply service filter
    if (filter) {
      base = base.filter((e) => e.service === filter);
    }

    // If showing history, merge server-side events with live events.
    // Dedup uses type + closest-second timestamp since client and server
    // timestamps may differ by a few ms for the same event.
    if (showHistory && historyData?.events) {
      const liveKeys = new Set(base.map((e) => `${e.type}-${Math.floor(e.timestamp / 1000)}`));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const serverEvents: StreamEvent[] = (historyData.events as any[])
        .filter((e) => !liveKeys.has(`${e.type}-${Math.floor(e.timestamp / 1000)}`))
        .map((e) => ({
          type: e.type,
          service: e.service,
          timestamp: e.timestamp,
          preview: e.preview || '',
          featureId: e.featureId,
        }));
      base = [...base, ...serverEvents];
    }

    // Sort newest first after merge
    base.sort((a, b) => b.timestamp - a.timestamp);

    return base;
  }, [events, filter, featureIdFilter, timeRange, showHistory, historyData]);

  const activeServices = [...new Set(events.map((e) => e.service))].sort();
  // Total reflects merged display set to avoid N > total confusion
  const totalCount = displayEvents.length;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/30 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {displayEvents.length}
            {totalCount !== displayEvents.length && ` / ${totalCount}`} events
          </span>
          {!paused && (
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowHistory((h) => !h)}
            title={showHistory ? 'Hide server history' : 'Load server history'}
            className={cn(
              'p-1 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground',
              showHistory && 'text-violet-400'
            )}
          >
            <History className="w-3 h-3" />
          </button>
          <button
            onClick={() => setPaused((p) => !p)}
            title={paused ? 'Resume' : 'Pause'}
            className="p-1 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground"
          >
            {paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-1 px-3 py-1 border-b border-border/20 overflow-x-auto shrink-0">
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

        {/* Spacer */}
        <div className="flex-1" />

        {/* Time range buttons */}
        {TIME_RANGES.map((tr) => (
          <button
            key={tr.label}
            onClick={() => setTimeRange(tr.ms)}
            className={cn(
              'text-[10px] px-1.5 py-0.5 rounded-md shrink-0',
              timeRange === tr.ms
                ? 'bg-blue-500/15 text-blue-400'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tr.label}
          </button>
        ))}

        {/* Feature ID filter */}
        <div className="relative shrink-0">
          <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="feature..."
            value={featureIdFilter}
            onChange={(e) => setFeatureIdFilter(e.target.value)}
            className="text-[10px] pl-5 pr-1.5 py-0.5 w-20 rounded-md bg-muted/30 border border-border/20 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-violet-500/50"
          />
        </div>
      </div>

      {/* Event list */}
      <div ref={listRef} className="flex-1 overflow-y-auto min-h-0">
        {displayEvents.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            {events.length === 0 ? 'Waiting for events...' : 'No events match filter'}
          </p>
        ) : (
          displayEvents.map((event, i) => (
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
    </div>
  );
}
