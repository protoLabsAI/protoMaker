/**
 * EventFeed component - displays recent events from the WebSocket event stream
 */

import { useEventFeed } from '@/hooks/use-event-feed';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EventFeedProps {
  projectPath: string | null;
  className?: string;
}

/**
 * Get a Lucide icon component by name
 */
function getIconComponent(iconName: string): LucideIcon {
  if (iconName && iconName in LucideIcons) {
    return (LucideIcons as unknown as Record<string, LucideIcon>)[iconName];
  }
  return LucideIcons.Circle;
}

/**
 * Format a timestamp for display
 */
function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

/**
 * Get color classes for event type
 */
function getColorClasses(color: 'green' | 'red' | 'blue' | 'yellow') {
  switch (color) {
    case 'green':
      return {
        bg: 'bg-green-500/10',
        border: 'border-green-500/30',
        icon: 'text-green-500',
        text: 'text-green-600 dark:text-green-400',
      };
    case 'red':
      return {
        bg: 'bg-red-500/10',
        border: 'border-red-500/30',
        icon: 'text-red-500',
        text: 'text-red-600 dark:text-red-400',
      };
    case 'blue':
      return {
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/30',
        icon: 'text-blue-500',
        text: 'text-blue-600 dark:text-blue-400',
      };
    case 'yellow':
      return {
        bg: 'bg-yellow-500/10',
        border: 'border-yellow-500/30',
        icon: 'text-yellow-500',
        text: 'text-yellow-600 dark:text-yellow-400',
      };
  }
}

export function EventFeed({ projectPath, className }: EventFeedProps) {
  const { events, isConnected, error } = useEventFeed({ projectPath });

  return (
    <Card className={cn('flex flex-col h-full', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Recent Events</CardTitle>
            <CardDescription>Live feed of project activity</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'w-2 h-2 rounded-full',
                isConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
              )}
              title={isConnected ? 'Connected' : 'Disconnected'}
            />
            <span className="text-xs text-muted-foreground">
              {isConnected ? 'Live' : 'Disconnected'}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        {error && (
          <div className="p-4 text-sm text-red-600 dark:text-red-400 bg-red-500/10 border-l-2 border-red-500">
            Error: {error}
          </div>
        )}

        {!error && events.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <LucideIcons.Radio className="w-12 h-12 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No events yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Events will appear here as they occur
            </p>
          </div>
        )}

        {!error && events.length > 0 && (
          <ScrollArea className="h-full">
            <div className="p-4 space-y-2">
              {events.map((event) => {
                const IconComponent = getIconComponent(event.icon);
                const colors = getColorClasses(event.color);

                return (
                  <div
                    key={event.id}
                    className={cn(
                      'flex items-start gap-3 p-3 rounded-lg border transition-colors hover:bg-muted/50',
                      colors.bg,
                      colors.border
                    )}
                  >
                    <div
                      className={cn(
                        'flex items-center justify-center w-8 h-8 rounded-full shrink-0 mt-0.5',
                        colors.bg
                      )}
                    >
                      <IconComponent className={cn('w-4 h-4', colors.icon)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground leading-tight">
                        {event.description}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatTimestamp(event.timestamp)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
