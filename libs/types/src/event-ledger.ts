/**
 * Event Ledger Types
 *
 * Append-only JSONL event persistence layer.
 * Each entry captures a discrete system event with correlation IDs for cross-entity querying.
 * Written to `.automaker/ledger/events.jsonl`.
 */

/**
 * Correlation IDs for linking events to project entities.
 * All fields are optional — populate whichever are relevant to the event.
 */
export interface EventLedgerCorrelationIds {
  projectSlug?: string;
  milestoneSlug?: string;
  featureId?: string;
  ceremonyId?: string;
  traceId?: string;
}

/**
 * A single entry in the event ledger.
 * Written as one JSON object per line in `.automaker/ledger/events.jsonl`.
 */
export interface EventLedgerEntry {
  /** UUID v4 — unique identifier for this event */
  id: string;
  /** ISO 8601 timestamp when the event was recorded */
  timestamp: string;
  /** Semantic event type (e.g. "feature:started", "agent:completed") */
  eventType: string;
  /** IDs linking this event to project entities */
  correlationIds: EventLedgerCorrelationIds;
  /** Arbitrary structured payload — event-type-specific data */
  payload: object;
  /** Which service emitted this event (e.g. "LeadEngineerService") */
  source: string;
}
