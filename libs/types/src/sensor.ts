/**
 * Sensor framework types for AutoMaker.
 *
 * Sensors are external data reporters (e.g., user presence detectors, IoT devices,
 * CI environment probes) that push readings into the server via REST. Each sensor
 * registers itself with a unique id, then POSTs periodic data payloads. The server
 * stores the latest reading in-memory with TTL-based eviction.
 */

/** Opaque sensor identifier string */
export type SensorId = string;

/** Possible lifecycle states for a registered sensor */
export type SensorState = 'active' | 'stale' | 'offline';

/** Possible presence states reported by a user-presence sensor */
export type UserPresenceState = 'present' | 'away' | 'unknown';

/**
 * Configuration record stored in the SensorRegistryService when a sensor registers.
 * Mirrors the body of POST /api/sensors/register.
 */
export interface SensorConfig {
  /** Unique identifier for this sensor */
  id: SensorId;
  /** Human-readable name */
  name: string;
  /** Optional free-form description */
  description?: string;
  /** ISO-8601 timestamp of when the sensor was registered */
  registeredAt: string;
  /** ISO-8601 timestamp of the most recent reading, or undefined if none yet */
  lastSeenAt?: string;
}

/**
 * A single data payload received from a sensor via POST /api/sensors/report.
 * The `data` field is intentionally open so any sensor type can report arbitrary values.
 */
export interface SensorReading {
  /** Sensor that produced this reading */
  sensorId: SensorId;
  /** Arbitrary sensor payload (e.g. { presence: 'present', confidence: 0.92 }) */
  data: Record<string, unknown>;
  /** ISO-8601 timestamp when the reading was received by the server */
  receivedAt: string;
}
