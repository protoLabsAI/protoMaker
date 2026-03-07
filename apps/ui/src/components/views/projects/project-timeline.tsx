/**
 * ProjectTimeline
 *
 * Renders a chronological activity feed fetched from /api/projects/:slug/timeline.
 * Each event type is rendered with a distinct icon and label.
 */

import { useQuery } from '@tanstack/react-query';
import { CheckCircle, Flag, PartyPopper, AlertTriangle, GitMerge, Activity } from 'lucide-react';
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
  type TimelineEvent,
  type TimelineEventType,
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

// ─── Component ────────────────────────────────────────────────────────────────

export function ProjectTimeline({ projectSlug }: { projectSlug: string }) {
  const projectPath = useAppStore((s) => s.currentProject?.path) ?? '';

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['project-timeline', projectPath, projectSlug],
    queryFn: () => fetchTimeline(projectPath, projectSlug),
    enabled: !!projectPath && !!projectSlug,
    staleTime: 30000,
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
    <div className="space-y-0" data-testid="timeline-feed">
      {events.map((event, idx) => {
        const config = getEventDisplayConfig(event.type);
        const Icon = getIcon(config.iconName);
        return (
          <div key={event.id ?? idx} className="flex gap-3 py-3 relative">
            {/* Connector line */}
            {idx < events.length - 1 && (
              <div className="absolute left-[15px] top-[36px] bottom-0 w-px bg-border" />
            )}
            {/* Icon */}
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
              <Icon className={`w-4 h-4 ${config.color}`} />
            </div>
            {/* Content */}
            <div className="flex-1 min-w-0 pt-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {config.label}
                </span>
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {new Date(event.occurredAt).toLocaleDateString()}
                </span>
              </div>
              <p className="text-sm text-foreground mt-0.5">{event.title}</p>
              {event.description && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                  {event.description}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
