/**
 * Ava Channel Handlers — response handlers for the reactor's classified messages.
 *
 * Each handler matches one or more classification types and posts a response
 * via AvaChannelService.postMessage(). Handlers are intentionally simple in
 * this first iteration — no LLM calls, just formatted acknowledgements.
 */

import { createLogger } from '@protolabsai/utils';
import type { AvaChatMessage } from '@protolabsai/types';
import type { MessageClassification } from './ava-channel-classifiers.js';
import type { AvaChannelService } from './ava-channel-service.js';

const logger = createLogger('AvaChannelHandlers');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HandlerContext {
  avaChannelService: AvaChannelService;
  instanceId: string;
  instanceName: string;
  getCapacity: () => { runningAgents: number; maxAgents: number; backlogCount: number };
}

export interface ReactorHandler {
  id: string;
  /** Which classification types this handler handles */
  handles: MessageClassification['type'][];
  /** Handle the message. Return true if handled successfully, false if failed. */
  handle(
    message: AvaChatMessage,
    classification: MessageClassification,
    ctx: HandlerContext
  ): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Handler implementations
// ---------------------------------------------------------------------------

const HelpRequestHandler: ReactorHandler = {
  id: 'help-request',
  handles: ['request'],
  async handle(_message, _classification, ctx) {
    const { runningAgents, maxAgents } = ctx.getCapacity();
    const hasCapacity = runningAgents < maxAgents;

    const content = hasCapacity
      ? `Working on it... (capacity: ${runningAgents}/${maxAgents} agents running)`
      : `[Help] I'm at capacity (${runningAgents}/${maxAgents} agents). Try again later.`;

    await ctx.avaChannelService.postMessage(content, 'ava', {
      instanceName: ctx.instanceName,
      intent: 'response',
      expectsResponse: false,
    });

    logger.debug(`[HelpRequest] Responded with capacity ${runningAgents}/${maxAgents}`);
    return true;
  },
};

const CoordinationHandler: ReactorHandler = {
  id: 'coordination',
  handles: ['coordination'],
  async handle(_message, _classification, ctx) {
    const { runningAgents, maxAgents, backlogCount } = ctx.getCapacity();

    const content = `[Coordination] Capacity: ${runningAgents}/${maxAgents} agents, ${backlogCount} in backlog`;

    await ctx.avaChannelService.postMessage(content, 'ava', {
      instanceName: ctx.instanceName,
      intent: 'response',
      expectsResponse: false,
    });

    logger.debug(`[Coordination] Posted capacity metrics`);
    return true;
  },
};

const SystemAlertHandler: ReactorHandler = {
  id: 'system-alert',
  handles: ['escalation'],
  async handle(message, _classification, ctx) {
    if (message.source !== 'system') return false;

    const content = `[Alert] Acknowledged system alert. Instance ${ctx.instanceName} operational.`;

    await ctx.avaChannelService.postMessage(content, 'ava', {
      instanceName: ctx.instanceName,
      intent: 'response',
      expectsResponse: false,
    });

    logger.debug(`[SystemAlert] Acknowledged alert from ${message.instanceName}`);
    return true;
  },
};

const EscalationHandler: ReactorHandler = {
  id: 'escalation',
  handles: ['escalation'],
  async handle(message, _classification, ctx) {
    if (message.source === 'system') return false;

    const content = `[Escalation] Acknowledged escalation from ${message.instanceName}. Will investigate.`;

    await ctx.avaChannelService.postMessage(content, 'ava', {
      instanceName: ctx.instanceName,
      intent: 'response',
      expectsResponse: false,
    });

    logger.debug(`[Escalation] Acknowledged escalation from ${message.instanceName}`);
    return true;
  },
};

// ---------------------------------------------------------------------------
// Factory and lookup
// ---------------------------------------------------------------------------

/**
 * Create the default set of reactor handlers, ordered so that more specific
 * handlers (SystemAlertHandler) appear before broader ones (EscalationHandler).
 */
export function createDefaultHandlers(): ReactorHandler[] {
  return [HelpRequestHandler, CoordinationHandler, SystemAlertHandler, EscalationHandler];
}

/**
 * Find the first handler that matches the given classification type and
 * is willing to handle the message. For handlers that share a classification
 * type (e.g. SystemAlertHandler and EscalationHandler both handle 'escalation'),
 * order matters — the first one whose `handles` array includes the type is returned.
 *
 * Note: the handler's `handle()` method may still return false at runtime
 * (e.g. SystemAlertHandler rejects non-system messages). Callers should
 * fall through to the next matching handler when that happens.
 */
export function findHandler(
  handlers: ReactorHandler[],
  classification: MessageClassification,
  _message: AvaChatMessage
): ReactorHandler | undefined {
  return handlers.find((h) => h.handles.includes(classification.type));
}
