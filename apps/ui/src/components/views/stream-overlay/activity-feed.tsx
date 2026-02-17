/**
 * Activity Feed - Shows last 10 agent/system events
 *
 * Ring buffer display of recent activity (auto-scrolling).
 */

interface ActivityEvent {
  id: string;
  type: string;
  message: string;
  timestamp: string;
}

interface ActivityFeedProps {
  events: ActivityEvent[];
}

export function ActivityFeed({ events }: ActivityFeedProps) {
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="h-full flex flex-col bg-gray-900/60 rounded-lg border border-gray-700/50 overflow-hidden">
      {/* Header */}
      <div className="bg-green-900/80 px-4 py-3 border-b border-green-700/50">
        <div className="text-lg font-bold text-green-200">Activity Feed</div>
        <div className="text-xs text-green-300 mt-0.5">Last 10 Events</div>
      </div>

      {/* Event List */}
      <div className="flex-1 overflow-y-auto scrollbar-hide p-3 space-y-2">
        {events.length === 0 ? (
          <div className="text-center text-gray-500 text-sm py-8">
            No activity yet. Waiting for events...
          </div>
        ) : (
          events.map((event) => (
            <div
              key={event.id}
              className="bg-gray-800/60 rounded-lg p-2.5 border border-gray-700/30"
            >
              <div className="flex items-start gap-2">
                <div className="flex-shrink-0 w-1.5 h-1.5 bg-green-500 rounded-full mt-1.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-white break-words leading-tight">
                    {event.message}
                  </div>
                  <div className="text-[10px] text-gray-500 mt-0.5">
                    {formatTimestamp(event.timestamp)}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
