/**
 * FrictionReport — backchannel message broadcast when FrictionTrackerService files
 * a System Improvement feature after a recurring failure pattern reaches threshold.
 *
 * Peer instances use this to de-duplicate: skip filing if the same pattern was
 * already filed by a peer within the last 24 hours.
 */
export interface FrictionReport {
  /** The failure pattern string (e.g. failure category) that triggered the filing */
  pattern: string;
  /** ISO timestamp when this instance filed the System Improvement feature */
  filedAt: string;
  /** The feature ID of the created System Improvement feature */
  featureId: string;
  /** Instance ID that filed the report */
  instanceId: string;
}
