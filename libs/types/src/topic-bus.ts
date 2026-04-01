/**
 * TopicBus type definitions
 *
 * MQTT-style hierarchical topic bus for internal event routing.
 * Coexists with the existing EventEmitter — services can subscribe
 * to topic patterns without tight coupling or direct wiring.
 *
 * Topic hierarchy examples:
 *   feature.status.{featureId}
 *   pr.created.{prNumber}
 *   pr.merged.{prNumber}
 *   pr.checks.{prNumber}.{checkName}
 *   maintenance.sweep.{checkName}
 *
 * Wildcard patterns:
 *   * — matches exactly one level (e.g. feature.status.*)
 *   # — matches zero or more levels (e.g. pr.#)
 */

/** Message envelope delivered to subscribers */
export interface TopicMessage<T = unknown> {
  /** The full topic string that was published (e.g. "feature.status.abc123") */
  topic: string;
  /** Arbitrary payload */
  payload: T;
  /** ISO timestamp of when the message was published */
  timestamp: string;
}

/** Callback signature for topic subscriptions */
export type TopicHandler<T = unknown> = (message: TopicMessage<T>) => void;

/** Function returned by subscribe() to remove the subscription */
export type TopicUnsubscribeFn = () => void;

/** Public contract for the TopicBus */
export interface TopicBusInterface {
  /**
   * Publish a message to a topic.
   * All matching subscribers are invoked synchronously.
   */
  publish<T = unknown>(topic: string, payload: T): void;

  /**
   * Subscribe to a topic pattern.
   * Supports MQTT-style wildcards:
   *   * — matches exactly one level
   *   # — matches zero or more levels (must be last segment)
   *
   * Returns an unsubscribe function.
   */
  subscribe<T = unknown>(pattern: string, handler: TopicHandler<T>): TopicUnsubscribeFn;
}
