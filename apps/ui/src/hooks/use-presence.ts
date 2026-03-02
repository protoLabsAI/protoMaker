/**
 * usePresence — Built-in Presence Sensors
 *
 * When the `userPresenceDetection` feature flag is enabled this hook attaches
 * three categories of browser listeners and periodically reports readings to
 * POST /api/sensors/report:
 *
 *   • builtin:tab-visibility — document visibilitychange + window online/offline
 *   • builtin:user-activity  — mousemove / keydown → active | idle | afk
 *
 * Reports fire at most every 30 s (periodic poll) or immediately on a state
 * transition.  The hook is a complete no-op when the flag is disabled.
 * All listeners are cleaned up on unmount.
 */

import { useEffect, useRef } from 'react';
import { createLogger } from '@protolabs-ai/utils/logger';
import { useAppStore } from '@/store/app-store';
import { getServerUrlSync, getApiKey, getSessionToken } from '@/lib/http-api-client';

const logger = createLogger('usePresence');

// ─── Thresholds ────────────────────────────────────────────────────────────────
const IDLE_THRESHOLD_MS = 60_000; // 60 s  → active  ➜ idle
const AFK_THRESHOLD_MS = 5 * 60_000; // 5 min → idle    ➜ afk
const REPORT_INTERVAL_MS = 30_000; // periodic full report cadence
const ACTIVITY_CHECK_MS = 10_000; // how often we evaluate the activity window
const ACTIVITY_DEBOUNCE_MS = 500; // debounce window for input events

// ─── Types ─────────────────────────────────────────────────────────────────────
type ActivityStatus = 'active' | 'idle' | 'afk';
type TabVisibility = 'visible' | 'hidden';
type ConnectivityStatus = 'online' | 'offline';

interface SensorReading {
  sensorId: string;
  value: unknown;
  timestamp: string;
}

// ─── Sensor POST ───────────────────────────────────────────────────────────────
async function postSensorReadings(readings: SensorReading[]): Promise<void> {
  const serverUrl = getServerUrlSync();
  const apiKey = getApiKey();
  const sessionToken = getSessionToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }
  if (sessionToken) {
    headers['Authorization'] = `Bearer ${sessionToken}`;
  }

  try {
    await fetch(`${serverUrl}/api/sensors/report`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ readings }),
    });
  } catch (error) {
    logger.debug('Failed to POST sensor readings:', error);
  }
}

// ─── Hook ──────────────────────────────────────────────────────────────────────
export function usePresence(): void {
  const featureFlags = useAppStore((s) => s.featureFlags);
  const enabled = featureFlags?.userPresenceDetection ?? false;

  // Mutable state refs — avoid triggering re-renders for internal bookkeeping
  const tabVisibilityRef = useRef<TabVisibility>(
    typeof document !== 'undefined' && document.visibilityState === 'visible' ? 'visible' : 'hidden'
  );
  const activityStatusRef = useRef<ActivityStatus>('active');
  const connectivityRef = useRef<ConnectivityStatus>(
    typeof navigator !== 'undefined' && navigator.onLine ? 'online' : 'offline'
  );
  const lastActivityRef = useRef<number>(Date.now());

  // Timer refs for cleanup
  const reportIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activityCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activityDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    // ── Helpers ────────────────────────────────────────────────────────────────

    /** Build and POST the current state of one or both sensors. */
    const sendReport = (
      which: Array<'builtin:tab-visibility' | 'builtin:user-activity'> = [
        'builtin:tab-visibility',
        'builtin:user-activity',
      ]
    ): void => {
      const readings: SensorReading[] = [];
      const timestamp = new Date().toISOString();

      if (which.includes('builtin:tab-visibility')) {
        readings.push({
          sensorId: 'builtin:tab-visibility',
          value: {
            visibility: tabVisibilityRef.current,
            online: connectivityRef.current,
          },
          timestamp,
        });
      }

      if (which.includes('builtin:user-activity')) {
        readings.push({
          sensorId: 'builtin:user-activity',
          value: {
            status: activityStatusRef.current,
            lastActivityAt: lastActivityRef.current,
          },
          timestamp,
        });
      }

      void postSensorReadings(readings);
    };

    // ── visibilitychange ───────────────────────────────────────────────────────
    const handleVisibilityChange = (): void => {
      const next: TabVisibility = document.visibilityState === 'visible' ? 'visible' : 'hidden';
      if (next !== tabVisibilityRef.current) {
        tabVisibilityRef.current = next;
        sendReport(['builtin:tab-visibility']);
      }
    };

    // ── online / offline ───────────────────────────────────────────────────────
    const handleOnline = (): void => {
      connectivityRef.current = 'online';
      sendReport(['builtin:tab-visibility']);
    };

    const handleOffline = (): void => {
      connectivityRef.current = 'offline';
      sendReport(['builtin:tab-visibility']);
    };

    // ── user activity (mousemove + keydown) ────────────────────────────────────
    const handleUserActivity = (): void => {
      lastActivityRef.current = Date.now();

      // Only report a transition back to 'active'
      if (activityStatusRef.current !== 'active') {
        activityStatusRef.current = 'active';

        // Debounce rapid bursts of activity events
        if (activityDebounceRef.current) {
          clearTimeout(activityDebounceRef.current);
        }
        activityDebounceRef.current = setTimeout(() => {
          sendReport(['builtin:user-activity']);
        }, ACTIVITY_DEBOUNCE_MS);
      }
    };

    // ── periodic activity status evaluation ────────────────────────────────────
    const checkActivityStatus = (): void => {
      const elapsed = Date.now() - lastActivityRef.current;

      let next: ActivityStatus;
      if (elapsed >= AFK_THRESHOLD_MS) {
        next = 'afk';
      } else if (elapsed >= IDLE_THRESHOLD_MS) {
        next = 'idle';
      } else {
        next = 'active';
      }

      if (next !== activityStatusRef.current) {
        activityStatusRef.current = next;
        sendReport(['builtin:user-activity']);
      }
    };

    // ── Attach ─────────────────────────────────────────────────────────────────
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('mousemove', handleUserActivity);
    window.addEventListener('keydown', handleUserActivity);

    // Start activity evaluation loop
    activityCheckIntervalRef.current = setInterval(checkActivityStatus, ACTIVITY_CHECK_MS);

    // Start 30 s periodic full report
    reportIntervalRef.current = setInterval(() => {
      sendReport();
    }, REPORT_INTERVAL_MS);

    // Send an initial report on mount
    sendReport();

    // ── Cleanup ────────────────────────────────────────────────────────────────
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('mousemove', handleUserActivity);
      window.removeEventListener('keydown', handleUserActivity);

      if (reportIntervalRef.current) {
        clearInterval(reportIntervalRef.current);
        reportIntervalRef.current = null;
      }

      if (activityCheckIntervalRef.current) {
        clearInterval(activityCheckIntervalRef.current);
        activityCheckIntervalRef.current = null;
      }

      if (activityDebounceRef.current) {
        clearTimeout(activityDebounceRef.current);
        activityDebounceRef.current = null;
      }
    };
  }, [enabled]);
}
