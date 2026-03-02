/**
 * ContextAggregator — reads all sensor readings and produces a unified UserPresenceState.
 *
 * Precedence rules (highest → lowest priority):
 *   headless  — builtin:websocket-clients reports 0 connected clients
 *   afk       — any sensor reports status/presence === 'away' or 'afk'
 *   idle      — builtin:electron-idle reports idleSeconds > IDLE_THRESHOLD_SECONDS
 *   active    — all other cases when at least one sensor is reporting
 *
 * Output shape:
 *   AggregatedPresenceState { status, lastActivity, confidence, sensors }
 */

import { createLogger } from '@protolabs-ai/utils';
import type { SensorRegistryService } from './sensor-registry-service.js';

const logger = createLogger('ContextAggregator');

/** Idle time in seconds before a user is considered idle (5 minutes) */
const IDLE_THRESHOLD_SECONDS = 5 * 60;

// ── Types ─────────────────────────────────────────────────────────────────────

/** Presence status after applying sensor precedence rules */
export type PresenceStatus = 'headless' | 'afk' | 'idle' | 'active' | 'unknown';

/**
 * Aggregated user presence state produced by ContextAggregator.
 *
 * - status        — resolved presence after applying precedence rules
 * - lastActivity  — ISO-8601 timestamp of the most recent sensor reading (if any)
 * - confidence    — 0–1 score reflecting how many active (non-stale) sensors contributed
 * - sensors       — list of sensor IDs that contributed to the final status
 */
export interface AggregatedPresenceState {
  status: PresenceStatus;
  lastActivity?: string;
  confidence: number;
  sensors: string[];
}

// ── Service ───────────────────────────────────────────────────────────────────

export class ContextAggregator {
  private readonly sensorRegistry: SensorRegistryService;

  constructor(sensorRegistry: SensorRegistryService) {
    this.sensorRegistry = sensorRegistry;
  }

  /**
   * Compute the aggregated user presence state from all currently registered sensors.
   *
   * Returns an AggregatedPresenceState with precedence:
   *   headless > afk > idle > active > unknown
   */
  getPresenceState(): AggregatedPresenceState {
    const allEntries = this.sensorRegistry.getAll();

    if (allEntries.length === 0) {
      return { status: 'unknown', confidence: 0, sensors: [] };
    }

    // Only consider entries that have at least one reading
    const withReadings = allEntries.filter((e) => e.reading !== undefined);

    if (withReadings.length === 0) {
      return { status: 'unknown', confidence: 0, sensors: [] };
    }

    // Active (non-stale, non-offline) sensors for confidence calculation
    const activeSensors = allEntries.filter((e) => e.state === 'active');
    const confidence = activeSensors.length / allEntries.length;

    // Most recent reading timestamp across all sensors
    let lastActivity: string | undefined;
    for (const entry of withReadings) {
      const receivedAt = entry.reading!.receivedAt;
      if (!lastActivity || receivedAt > lastActivity) {
        lastActivity = receivedAt;
      }
    }

    // ── Precedence rule 1: headless ──────────────────────────────────────────
    const wsEntry = this.sensorRegistry.get('builtin:websocket-clients');
    if (wsEntry?.reading) {
      const clientCount = wsEntry.reading.data['clientCount'];
      if (typeof clientCount === 'number' && clientCount === 0) {
        logger.debug('Presence: headless (0 WebSocket clients)');
        return {
          status: 'headless',
          lastActivity,
          confidence,
          sensors: ['builtin:websocket-clients'],
        };
      }
    }

    // ── Precedence rule 2: afk ───────────────────────────────────────────────
    const afkSensors: string[] = [];
    for (const entry of withReadings) {
      const data = entry.reading!.data;
      const presence = data['presence'] ?? data['status'];
      if (presence === 'away' || presence === 'afk') {
        afkSensors.push(entry.sensor.id);
      }
    }
    if (afkSensors.length > 0) {
      logger.debug(`Presence: afk (sensors: ${afkSensors.join(', ')})`);
      return {
        status: 'afk',
        lastActivity,
        confidence,
        sensors: afkSensors,
      };
    }

    // ── Precedence rule 3: idle (Electron powerMonitor) ──────────────────────
    const electronEntry = this.sensorRegistry.get('builtin:electron-idle');
    if (electronEntry?.reading) {
      const idleSeconds = electronEntry.reading.data['idleSeconds'];
      if (typeof idleSeconds === 'number' && idleSeconds >= IDLE_THRESHOLD_SECONDS) {
        logger.debug(`Presence: idle (idleSeconds=${idleSeconds})`);
        return {
          status: 'idle',
          lastActivity,
          confidence,
          sensors: ['builtin:electron-idle'],
        };
      }
    }

    // ── Precedence rule 4: active ────────────────────────────────────────────
    const activeSensorIds = withReadings.map((e) => e.sensor.id);
    logger.debug(`Presence: active (sensors: ${activeSensorIds.join(', ')})`);
    return {
      status: 'active',
      lastActivity,
      confidence,
      sensors: activeSensorIds,
    };
  }

  /**
   * Format the aggregated presence state as a brief markdown section
   * suitable for injection into a sitrep.
   */
  formatPresenceSection(): string {
    const state = this.getPresenceState();

    const lines: string[] = [];
    lines.push('## User Presence');
    lines.push('');

    const statusLabel: Record<PresenceStatus, string> = {
      headless: '🤖 Headless (no UI client connected)',
      afk: '🚶 Away from keyboard',
      idle: '💤 Idle',
      active: '🟢 Active',
      unknown: '❓ Unknown',
    };

    lines.push(`**Status:** ${statusLabel[state.status]}`);

    if (state.lastActivity) {
      lines.push(`**Last Activity:** ${state.lastActivity}`);
    }

    lines.push(`**Confidence:** ${Math.round(state.confidence * 100)}%`);

    if (state.sensors.length > 0) {
      lines.push(`**Contributing Sensors:** ${state.sensors.join(', ')}`);
    }

    return lines.join('\n');
  }
}
