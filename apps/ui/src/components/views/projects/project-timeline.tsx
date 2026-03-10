/**
 * ProjectTimeline
 *
 * Renders a chronological activity feed fetched from /api/projects/:slug/timeline.
 * Supports distinct card styles per entry type, filtering by category, and auto-refresh.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle,
  Flag,
  PartyPopper,
  AlertTriangle,
  GitMerge,
  Activity,
  Users,
  RefreshCw,
  Lightbulb,
  Trophy,
  ChevronDown,
  ChevronUp,
  UserCircle,
  Clock,
} from 'lucide-react';
import {
  getServerUrlSync,
  getApiKey,
  getSessionToken,
  waitForApiKeyInit,
  NO_STORE_CACHE_MODE,
} from '@/lib/http-api-client';
import { useAppStore } from '@/store/app-store';
import {
  getEventDisplayConfig,
  FILTER_CATEGORIES,
  type TimelineEvent,
  type TimelineEventType,
  type TimelineEntryCategory,
} from './timeline-utils';

// Re-export for backward compatibility / external usage
export { getEventDisplayConfig as getEventConfig, type TimelineEventType, type TimelineEvent };

// ─── Icon map ─────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  CheckCircle,
  Flag,
  PartyPopper,
  AlertTriangle,
  GitMerge,
  Activity,
  Users,
  RefreshCw,
  Lightbulb,
  Trophy,
};

function getIcon(iconName: string): React.ComponentType<{ className?: string }> {
  return ICON_MAP[iconName] ?? Activity;
}

// ─── Data fetching ─────────────────────────────────────────────────────────────

interface TimelineResponse {
  success: boolean;
  events?: TimelineEvent[];
  error?: string;
}

async function fetchTimeline(projectPath: string, projectSlug: string): Promise<TimelineEvent[]> {
  await waitForApiKeyInit();
  const serverUrl = getServerUrlSync();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const apiKey = getApiKey();
  if (apiKey) headers['X-API-Key'] = apiKey;
  const sessionToken = getSessionToken();
  if (sessionToken) headers['X-Session-Token'] = sessionToken;

  const response = await fetch(
    `${serverUrl}/api/projects/${encodeURIComponent(projectSlug)}/timeline?projectPath=${encodeURIComponent(projectPath)}`,
    { headers, credentials: 'include', cache: NO_STORE_CACHE_MODE }
  );

  if (!response.ok) return [];
  const data: TimelineResponse = await response.json();
  return data.events ?? [];
}

// ─── Timeline Card ─────────────────────────────────────────────────────────────

function TimelineCard({ event, isLast }: { event: TimelineEvent; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const config = getEventDisplayConfig(event.type);
  const Icon = getIcon(config.iconName);
  const hasExpandableContent = !!(event.description && event.description.length > 120);

  const formattedDate = new Date(event.occurredAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const formattedTime = new Date(event.occurredAt).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="flex gap-3 relative" data-testid={`timeline-card-${event.type}`}>
      {/* Connector line */}
      {!isLast && <div className="absolute left-[15px] top-[36px] bottom-0 w-px bg-border" />}

      {/* Icon bubble */}
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full border ${config.borderColor} ${config.bgColor} flex items-center justify-center`}
      >
        <Icon className={`w-4 h-4 ${config.color}`} />
      </div>

      {/* Card body */}
      <div
        className={`flex-1 min-w-0 mb-3 rounded-lg border-l-2 ${config.borderColor} ${config.bgColor} border border-border/50 p-3`}
      >
        {/* Header row */}
        <div className="flex items-start gap-2 flex-wrap">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${config.badgeClass}`}
          >
            {config.label}
          </span>
          <span className="text-sm font-medium text-foreground flex-1 min-w-0 mt-0.5">
            {event.title}
          </span>
        </div>

        {/* Meta row: author + timestamp */}
        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
          {event.author && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <UserCircle className="w-3 h-3" />
              {event.author}
            </span>
          )}
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="w-3 h-3" />
            <time dateTime={event.occurredAt}>
              {formattedDate} · {formattedTime}
            </time>
          </span>
        </div>

        {/* Description / expandable content */}
        {event.description && (
          <div className="mt-2">
            <p
              className={`text-xs text-muted-foreground leading-relaxed ${!expanded && hasExpandableContent ? 'line-clamp-3' : ''}`}
            >
              {event.description}
            </p>
            {hasExpandableContent && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="mt-1 flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                aria-expanded={expanded}
              >
                {expanded ? (
                  <>
                    <ChevronUp className="w-3 h-3" /> Show less
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3 h-3" /> Show more
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Filter bar ───────────────────────────────────────────────────────────────

function FilterBar({
  active,
  onChange,
}: {
  active: TimelineEntryCategory | 'all';
  onChange: (v: TimelineEntryCategory | 'all') => void;
}) {
  return (
    <div
      className="flex gap-1.5 flex-wrap mb-4"
      role="toolbar"
      aria-label="Filter timeline by type"
      data-testid="timeline-filter-bar"
    >
      {FILTER_CATEGORIES.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => onChange(value)}
          data-testid={`timeline-filter-${value}`}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            active === value
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProjectTimeline({ projectSlug }: { projectSlug: string }) {
  const projectPath = useAppStore((s) => s.currentProject?.path) ?? '';
  const [activeFilter, setActiveFilter] = useState<TimelineEntryCategory | 'all'>('all');

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['project-timeline', projectPath, projectSlug],
    queryFn: () => fetchTimeline(projectPath, projectSlug),
    enabled: !!projectPath && !!projectSlug,
    staleTime: 30000,
    // Auto-refresh every 60 seconds so new entries appear without a manual reload
    refetchInterval: 60000,
  });

  // Filter events by category when a filter is active
  const filteredEvents =
    activeFilter === 'all'
      ? events
      : events.filter((e) => {
          const config = getEventDisplayConfig(e.type);
          return config.category === activeFilter;
        });

  if (isLoading) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-muted-foreground">Loading timeline…</p>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="py-8 text-center" data-testid="timeline-empty">
        <Activity className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No activity yet.</p>
      </div>
    );
  }

  return (
    <div data-testid="timeline-feed">
      <FilterBar active={activeFilter} onChange={setActiveFilter} />

      {filteredEvents.length === 0 ? (
        <div className="py-8 text-center" data-testid="timeline-empty-filtered">
          <Activity className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No entries match this filter.</p>
        </div>
      ) : (
        <div className="space-y-0" data-testid="timeline-entries">
          {filteredEvents.map((event, idx) => (
            <TimelineCard
              key={event.id ?? idx}
              event={event}
              isLast={idx === filteredEvents.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
