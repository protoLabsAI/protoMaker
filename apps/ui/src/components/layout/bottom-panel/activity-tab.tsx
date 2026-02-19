import { useAppStore, type Feature } from '@/store/app-store';

function getStatusDot(status: string): string {
  switch (status) {
    case 'done':
    case 'verified':
      return 'bg-green-500';
    case 'in_progress':
    case 'running':
      return 'bg-blue-500';
    case 'review':
      return 'bg-amber-500';
    case 'blocked':
      return 'bg-red-500';
    case 'backlog':
      return 'bg-muted-foreground';
    default:
      return 'bg-muted-foreground';
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'done':
      return 'done';
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

export function ActivityTab() {
  const features = useAppStore((s) => s.features);

  const recentFeatures = features
    .filter((f: Feature) => f.updatedAt || f.completedAt || f.startedAt)
    .sort((a: Feature, b: Feature) => {
      const aDate = String(a.completedAt || a.updatedAt || a.startedAt || '');
      const bDate = String(b.completedAt || b.updatedAt || b.startedAt || '');
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    })
    .slice(0, 12);

  if (recentFeatures.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        No recent activity
      </div>
    );
  }

  return (
    <div className="space-y-0.5 overflow-y-auto h-full px-3 py-2">
      {recentFeatures.map((feature: Feature) => {
        const date = String(feature.completedAt || feature.updatedAt || feature.startedAt || '');
        return (
          <div
            key={feature.id}
            className="flex items-center gap-2 text-xs py-1.5 hover:bg-muted/50 rounded px-1.5 -mx-1.5"
          >
            <span className={`shrink-0 h-2 w-2 rounded-full ${getStatusDot(feature.status)}`} />
            <span className="font-medium truncate flex-1">{feature.title || feature.id}</span>
            <span className="text-muted-foreground shrink-0">{getStatusLabel(feature.status)}</span>
            {date && (
              <span className="text-muted-foreground/70 shrink-0 tabular-nums">
                {timeAgo(date)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
