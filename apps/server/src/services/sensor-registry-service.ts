/**
 * SensorRegistryService — In-memory registry for external sensors.
 *
 * Follows the RoleRegistry pattern: sensors register themselves with a unique id,
 * then POST periodic data payloads. The latest reading for each sensor is stored
 * in-memory. Readings older than TTL_MS are considered stale.
 *
 * Built-in sensors registered at startup:
 *   builtin:websocket-clients — tracks connected WebSocket client count (detects headless mode)
 *   builtin:electron-idle     — reports system idle time via Electron powerMonitor (Electron only)
 *
 * Events emitted:
 *   sensor:registered   — when a new sensor is registered
 *   sensor:data-received — when a sensor reports a reading
 */

import { createLogger } from '@protolabs-ai/utils';
import type { SensorConfig, SensorReading, SensorState } from '@protolabs-ai/types';
import type { EventEmitter } from '../lib/events.js';

const logger = createLogger('SensorRegistry');

/** Polling interval for builtin:electron-idle (30 seconds) */
const ELECTRON_IDLE_POLL_MS = 30_000;

/** How long after the last reading a sensor is considered "stale" (5 minutes) */
const STALE_TTL_MS = 5 * 60 * 1000;

/** How long after the last reading a sensor is considered "offline" (15 minutes) */
const OFFLINE_TTL_MS = 15 * 60 * 1000;

export class SensorRegistryService {
  private sensors = new Map<string, SensorConfig>();
  private readings = new Map<string, SensorReading>();
  private events?: EventEmitter;

  /** Current tracked WebSocket client count for the builtin:websocket-clients sensor */
  private _wsClientCount = 0;

  /** Interval handle for the Electron idle time poller */
  private _electronIdleInterval?: ReturnType<typeof setInterval>;

  constructor(events?: EventEmitter) {
    this.events = events;
  }

  /**
   * Register both built-in sensors and start their reporting loops.
   * Safe to call multiple times — re-registration is idempotent.
   */
  startBuiltinSensors(): void {
    // ── builtin:websocket-clients ────────────────────────────────────────────
    this.register({
      id: 'builtin:websocket-clients',
      name: 'WebSocket Clients',
      description:
        'Tracks the number of connected WebSocket UI clients. Count of 0 indicates headless (server-only) mode.',
    });
    // Report the initial count (0 at startup — clients haven't connected yet)
    this._reportWebSocketClients();

    // ── builtin:electron-idle ────────────────────────────────────────────────
    this.register({
      id: 'builtin:electron-idle',
      name: 'Electron Idle Time',
      description:
        'Reports system idle time in seconds via Electron powerMonitor.getSystemIdleTime(). Only active when running inside Electron.',
    });
    this._startElectronIdlePoller();

    logger.info('Built-in sensors registered (websocket-clients, electron-idle)');
  }

  /**
   * Update the WebSocket client count and immediately report to the builtin sensor.
   * Called by the WebSocket server whenever a client connects or disconnects.
   */
  notifyWebSocketClientCount(count: number): void {
    this._wsClientCount = Math.max(0, count);
    this._reportWebSocketClients();
  }

  /** Internal helper: report current WS client count to the builtin sensor */
  private _reportWebSocketClients(): void {
    this.report({
      sensorId: 'builtin:websocket-clients',
      data: { clientCount: this._wsClientCount },
    });
  }

  /**
   * Start a polling interval that reads system idle time from Electron's powerMonitor.
   * If not running inside Electron the dynamic import fails silently and no readings
   * are produced (the sensor stays offline / stale).
   */
  private _startElectronIdlePoller(): void {
    if (this._electronIdleInterval) return; // already started

    const poll = async () => {
      try {
        // Dynamic import: only works inside Electron renderer / main processes
        // eslint-disable-next-line n/no-extraneous-import
        const electron = await import('electron');
        const powerMonitor =
          electron.powerMonitor ?? (electron as unknown as Record<string, unknown>).default;
        if (
          powerMonitor &&
          typeof (powerMonitor as { getSystemIdleTime?: () => number }).getSystemIdleTime ===
            'function'
        ) {
          const idleSeconds = (
            powerMonitor as { getSystemIdleTime: () => number }
          ).getSystemIdleTime();
          this.report({
            sensorId: 'builtin:electron-idle',
            data: { idleSeconds },
          });
        }
      } catch {
        // Electron not available — no-op (sensor remains offline / stale)
      }
    };

    // Run once immediately, then on the interval
    void poll();
    this._electronIdleInterval = setInterval(() => void poll(), ELECTRON_IDLE_POLL_MS);
  }

  /** Stop built-in sensor polling loops (for clean shutdown). */
  stopBuiltinSensors(): void {
    if (this._electronIdleInterval) {
      clearInterval(this._electronIdleInterval);
      this._electronIdleInterval = undefined;
    }
  }

  /**
   * Register a new sensor. If a sensor with the same id already exists it is
   * updated (re-registration is idempotent — useful for sensor restarts).
   */
  register(input: { id: string; name: string; description?: string }): {
    success: boolean;
    sensor?: SensorConfig;
    error?: string;
  } {
    if (!input.id || typeof input.id !== 'string' || !input.id.trim()) {
      return { success: false, error: 'Sensor id is required and must be a non-empty string' };
    }

    if (!input.name || typeof input.name !== 'string' || !input.name.trim()) {
      return { success: false, error: 'Sensor name is required and must be a non-empty string' };
    }

    const existing = this.sensors.get(input.id);
    const registeredAt = existing?.registeredAt ?? new Date().toISOString();

    const sensor: SensorConfig = {
      id: input.id.trim(),
      name: input.name.trim(),
      description: input.description?.trim(),
      registeredAt,
      lastSeenAt: existing?.lastSeenAt,
    };

    this.sensors.set(sensor.id, sensor);

    logger.info(`Sensor registered: "${sensor.id}" (${sensor.name})`);

    this.events?.emit('sensor:registered', {
      sensorId: sensor.id,
      name: sensor.name,
      registeredAt: sensor.registeredAt,
    });

    return { success: true, sensor };
  }

  /**
   * Record a data reading from a sensor.
   * The sensor must already be registered.
   */
  report(input: { sensorId: string; data: Record<string, unknown> }): {
    success: boolean;
    reading?: SensorReading;
    error?: string;
  } {
    const sensor = this.sensors.get(input.sensorId);
    if (!sensor) {
      return {
        success: false,
        error: `Sensor "${input.sensorId}" is not registered. Call POST /api/sensors/register first.`,
      };
    }

    const receivedAt = new Date().toISOString();

    const reading: SensorReading = {
      sensorId: input.sensorId,
      data: input.data,
      receivedAt,
    };

    // Store the latest reading (replaces previous)
    this.readings.set(input.sensorId, reading);

    // Update sensor's lastSeenAt
    sensor.lastSeenAt = receivedAt;
    this.sensors.set(sensor.id, sensor);

    logger.debug(`Sensor data received from "${input.sensorId}"`);

    this.events?.emit('sensor:data-received', {
      sensorId: input.sensorId,
      data: input.data,
      receivedAt,
    });

    return { success: true, reading };
  }

  /**
   * Get the current state of a sensor based on how long ago it last reported.
   */
  getState(sensorId: string): SensorState {
    const sensor = this.sensors.get(sensorId);
    if (!sensor || !sensor.lastSeenAt) return 'offline';

    const ageMs = Date.now() - new Date(sensor.lastSeenAt).getTime();
    if (ageMs > OFFLINE_TTL_MS) return 'offline';
    if (ageMs > STALE_TTL_MS) return 'stale';
    return 'active';
  }

  /**
   * Get the config and latest reading for a single sensor.
   */
  get(
    sensorId: string
  ): { sensor: SensorConfig; reading?: SensorReading; state: SensorState } | undefined {
    const sensor = this.sensors.get(sensorId);
    if (!sensor) return undefined;

    return {
      sensor,
      reading: this.readings.get(sensorId),
      state: this.getState(sensorId),
    };
  }

  /**
   * List all registered sensors with their latest readings and computed state.
   */
  getAll(): Array<{ sensor: SensorConfig; reading?: SensorReading; state: SensorState }> {
    return Array.from(this.sensors.values()).map((sensor) => ({
      sensor,
      reading: this.readings.get(sensor.id),
      state: this.getState(sensor.id),
    }));
  }

  /**
   * Number of registered sensors.
   */
  get size(): number {
    return this.sensors.size;
  }
}
