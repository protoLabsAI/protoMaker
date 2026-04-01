/**
 * TopicBus - Hierarchical pub/sub for internal event routing
 *
 * MQTT-style topic bus that coexists with the existing EventEmitter.
 * Supports wildcard patterns:
 *   * — matches exactly one topic level
 *   # — matches zero or more levels (must be the last segment)
 *
 * In-memory, synchronous delivery. See the deviation rules in the plan
 * for when to add async/batched delivery.
 */

import type {
  TopicMessage,
  TopicHandler,
  TopicUnsubscribeFn,
  TopicBusInterface,
} from '@protolabsai/types';
import { createLogger } from '@protolabsai/utils';

const logger = createLogger('TopicBus');

/**
 * Check whether a topic matches a subscription pattern.
 *
 * Rules (MQTT-style):
 * - Levels are separated by '.'
 * - '*' matches exactly one level
 * - '#' matches zero or more levels and must be the last segment
 * - Exact strings match literally
 */
export function topicMatchesPattern(topic: string, pattern: string): boolean {
  const topicParts = topic.split('.');
  const patternParts = pattern.split('.');

  let ti = 0;
  let pi = 0;

  while (pi < patternParts.length) {
    const pp = patternParts[pi];

    if (pp === '#') {
      // '#' must be the last segment — matches zero or more remaining levels
      return true;
    }

    // If we've run out of topic levels but still have pattern parts, no match
    if (ti >= topicParts.length) {
      return false;
    }

    if (pp === '*') {
      // '*' matches exactly one level — consume one level from both
      ti++;
      pi++;
      continue;
    }

    // Exact match
    if (pp !== topicParts[ti]) {
      return false;
    }

    ti++;
    pi++;
  }

  // Both must be fully consumed for an exact or single-wildcard match
  return ti === topicParts.length;
}

interface Subscription {
  pattern: string;
  handler: TopicHandler;
}

export class TopicBus implements TopicBusInterface {
  private readonly subscriptions: Subscription[] = [];

  publish<T = unknown>(topic: string, payload: T): void {
    if (!topic) {
      logger.warn('TopicBus.publish called with empty topic, ignoring');
      return;
    }

    const message: TopicMessage<T> = {
      topic,
      payload,
      timestamp: new Date().toISOString(),
    };

    for (const sub of this.subscriptions) {
      if (topicMatchesPattern(topic, sub.pattern)) {
        try {
          (sub.handler as TopicHandler<T>)(message);
        } catch (error) {
          logger.error(`Error in TopicBus subscriber for pattern "${sub.pattern}":`, error);
        }
      }
    }
  }

  subscribe<T = unknown>(pattern: string, handler: TopicHandler<T>): TopicUnsubscribeFn {
    const sub: Subscription = { pattern, handler: handler as TopicHandler };
    this.subscriptions.push(sub);

    return () => {
      const idx = this.subscriptions.indexOf(sub);
      if (idx !== -1) {
        this.subscriptions.splice(idx, 1);
      }
    };
  }
}

// Singleton
let instance: TopicBus | null = null;

export function getTopicBus(): TopicBus {
  if (!instance) {
    instance = new TopicBus();
  }
  return instance;
}

/** Reset for testing */
export function resetTopicBus(): void {
  instance = null;
}
