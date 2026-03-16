/**
 * Webhook Delivery Tracking Types
 *
 * Transient operational data for tracking inbound webhook processing,
 * retry scheduling, and duplicate detection. Not persisted to disk --
 * held in-memory with a rolling window eviction policy.
 */

/**
 * Processing status of a webhook delivery attempt
 */
export type WebhookDeliveryStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'retrying';

/**
 * Source system that sent the webhook
 */
export type WebhookDeliverySource = 'github' | 'discord' | 'external';

/**
 * A single webhook delivery record, tracking reception through final disposition.
 *
 * Each inbound webhook creates one delivery. Retries increment `attempts` and
 * update `status` until the delivery either completes or exhausts `maxAttempts`.
 */
export interface WebhookDelivery {
  /** Unique delivery identifier (UUID) */
  id: string;
  /** Origin of the webhook event */
  source: WebhookDeliverySource;
  /** Event type string (e.g. "pull_request", "issues", "push") */
  eventType: string;
  /** ISO timestamp when the webhook was first received */
  receivedAt: string;
  /** Current processing status */
  status: WebhookDeliveryStatus;
  /** Number of processing attempts so far */
  attempts: number;
  /** Maximum attempts before permanent failure (default: 3) */
  maxAttempts: number;
  /** Error message from the most recent failed attempt */
  lastError?: string;
  /** ISO timestamp when processing completed successfully */
  completedAt?: string;
  /** ISO timestamp for the next scheduled retry */
  nextRetryAt?: string;
  /** Raw webhook payload (truncated for memory safety) */
  payload?: Record<string, unknown>;
  /** Caller-provided metadata (project path, dedup key, etc.) */
  metadata?: Record<string, unknown>;
}
