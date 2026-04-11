import { createLogger } from '@protolabsai/utils';
import type { ServiceContainer } from '../server/services.js';
import type { TopicMessage } from '@protolabsai/types';
import type { HitlPrRemediationStuckPayload } from './hitl-pattern-analysis-service.js';

const logger = createLogger('Server:Wiring');

/**
 * Wires HitlPatternAnalysisService to the TopicBus.
 *
 * Subscribes to 'hitl.request.pr.remediation_stuck.#' — the pattern emitted
 * by Workstacean's pr-remediator when a (PR, kind) tuple exhausts its retry
 * budget. Each matching message is forwarded to the service for persistent
 * storage and pattern analysis.
 *
 * Transport note: for events to arrive here, the inbound transport layer must
 * publish them to the TopicBus using the topic
 * 'hitl.request.pr.remediation_stuck.{id}'. The Workstacean inbound route
 * (POST /api/hitl/events) is the recommended transport.
 */
export async function register(container: ServiceContainer): Promise<void> {
  const { topicBus, hitlPatternAnalysisService } = container;

  // Initialize persistent store on startup (loads disk state into memory)
  await hitlPatternAnalysisService.initialize();

  // Subscribe to all pr-remediator stuck escalations from Workstacean
  topicBus.subscribe('hitl.request.pr.remediation_stuck.#', (msg: TopicMessage<unknown>) => {
    const payload = msg.payload as HitlPrRemediationStuckPayload;
    void hitlPatternAnalysisService.handleEscalation(payload).catch((err: unknown) => {
      logger.warn('[HitlPatternAnalysis] Failed to handle escalation:', err);
    });
  });

  logger.info('[HitlPatternAnalysis] Subscribed to hitl.request.pr.remediation_stuck.#');
}
