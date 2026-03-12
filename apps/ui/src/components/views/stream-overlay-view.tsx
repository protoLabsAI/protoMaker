/**
 * Stream Overlay View - OBS-optimized view for streaming
 *
 * Displays:
 * - Current board state (compact cards in columns)
 * - 'Now Building' banner with submitter attribution
 * - Agent activity feed (last 10 events)
 *
 * Dark theme, large fonts, no scrollbars, no interactive elements.
 * WebSocket-driven auto-refresh.
 */

import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/app-store';
import { getHttpApiClient } from '@/lib/http-api-client';
import { OverlayBoard } from './stream-overlay/overlay-board';
import { ActivityFeed } from './stream-overlay/activity-feed';

interface ActivityEvent {
  id: string;
  type: string;
  message: string;
  timestamp: string;
}

export function StreamOverlayView() {
  const { currentProject, features } = useAppStore((state) => ({
    currentProject: state.currentProject,
    features: state.features,
  }));

  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]);

  // Subscribe to real-time events for activity feed
  useEffect(() => {
    const api = getHttpApiClient();

    // Subscribe to all events and filter for activity feed
    const unsubscribe = api.subscribeToEvents((type, payload) => {
      // Create activity event from any significant system event
      const activityEvent: ActivityEvent = {
        id: `${Date.now()}-${Math.random()}`,
        type,
        message: formatActivityMessage(type, payload),
        timestamp: new Date().toISOString(),
      };

      // Add to feed (ring buffer of 10 events)
      setActivityEvents((prev) => {
        const newEvents = [activityEvent, ...prev];
        return newEvents.slice(0, 10);
      });
    });

    return unsubscribe;
  }, []);

  // Find the currently building feature (in_progress)
  const buildingFeature = features.find((f) => f.status === 'in_progress');

  return (
    <div className="h-screen w-screen bg-black text-white overflow-hidden flex flex-col p-4 gap-4">
      {/* Now Building Banner */}
      {buildingFeature && (
        <div className="bg-gradient-to-r from-blue-900/80 to-purple-900/80 rounded-lg p-6 border border-blue-500/50">
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-blue-300 font-medium mb-1">NOW BUILDING</div>
              <div className="text-2xl font-bold truncate">{buildingFeature.description}</div>
              {buildingFeature.category && (
                <div className="text-sm text-gray-400 mt-1">
                  Category: {buildingFeature.category}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Content Grid */}
      <div className="flex-1 grid grid-cols-3 gap-4 min-h-0">
        {/* Board State - 2 columns */}
        <div className="col-span-2 overflow-hidden">
          <OverlayBoard features={features} />
        </div>

        {/* Right Sidebar - 1 column */}
        <div className="flex flex-col gap-4 overflow-hidden">
          {/* Activity Feed */}
          <div className="flex-1 min-h-0">
            <ActivityFeed events={activityEvents} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Format event type and payload into a human-readable activity message
 */
function formatActivityMessage(type: string, payload: unknown): string {
  switch (type) {
    case 'auto-mode:event':
      return `Auto mode: ${JSON.stringify(payload)}`;
    case 'agent:stream':
      return 'Agent activity detected';
    case 'feature:created':
      return 'New feature created';
    case 'feature:updated':
      return 'Feature updated';
    case 'worktree:init-started':
      return 'Worktree initialization started';
    case 'worktree:init-completed':
      return 'Worktree initialization completed';
    default:
      return `${type}`;
  }
}
