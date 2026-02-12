import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { History } from 'lucide-react';
import type { Feature } from '@/store/app-store';

interface ActivityFeedProps {
  features: Feature[];
  isLoading: boolean;
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'done':
    case 'verified':
      return '\u2705';
    case 'in_progress':
    case 'running':
      return '\uD83D\uDD04';
    case 'review':
      return '\uD83D\uDCCB';
    case 'blocked':
      return '\u26D4';
    case 'backlog':
      return '\u23F3';
    default:
      return '\u2022';
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'done':
      return 'completed';
    case 'verified':
      return 'verified';
    case 'in_progress':
    case 'running':
      return 'in progress';
    case 'review':
      return 'in review';
    case 'blocked':
      return 'blocked';
    case 'backlog':
      return 'queued';
    default:
      return status;
  }
}

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ActivityFeed({ features, isLoading }: ActivityFeedProps) {
  // Get features sorted by most recent activity
  const recentFeatures = features
    .filter((f) => f.updatedAt || f.completedAt || f.startedAt)
    .sort((a, b) => {
      const aDate = a.completedAt || a.updatedAt || a.startedAt || '';
      const bDate = b.completedAt || b.updatedAt || b.startedAt || '';
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    })
    .slice(0, 8);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <History className="h-4 w-4" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-5 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : recentFeatures.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No recent activity</p>
        ) : (
          <div className="space-y-2">
            {recentFeatures.map((feature) => {
              const date = feature.completedAt || feature.updatedAt || feature.startedAt || '';
              return (
                <div key={feature.id} className="flex items-start gap-2 text-sm py-1.5">
                  <span className="shrink-0 mt-0.5">{getStatusIcon(feature.status)}</span>
                  <div className="min-w-0 flex-1">
                    <span className="font-medium truncate block">
                      {feature.title || feature.id}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {getStatusLabel(feature.status)}
                      {date ? ` \u00B7 ${timeAgo(date)}` : ''}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
