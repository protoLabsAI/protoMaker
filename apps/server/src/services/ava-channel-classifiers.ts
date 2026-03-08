/**
 * Ava Channel Classifier Chain — priority-ordered rule-based message classification.
 *
 * Rules are evaluated highest-to-lowest priority. The first rule that returns a
 * non-null classification wins. If no rule matches, DefaultRule returns informational.
 *
 * All rules are pure functions — no side effects, no async operations.
 */

import type { AvaChatMessage, MessageIntent } from '@protolabsai/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Result of classifying a message.
 */
export interface MessageClassification {
  /** Broad category of this message */
  type: 'informational' | 'request' | 'coordination' | 'escalation';
  /** Whether this instance should generate a response */
  shouldRespond: boolean;
  /** Resolved intent, if narrowed beyond the type */
  intent?: MessageIntent;
  /** Human-readable reason this classification was chosen (for debugging) */
  reason?: string;
}

/**
 * Runtime context passed to each rule during classification.
 */
export interface ClassifierContext {
  /** Maximum allowed conversation depth before loop-breaking kicks in */
  maxConversationDepth: number;
  /** Messages older than this many milliseconds are considered stale */
  staleThresholdMs: number;
  /** Instance ID of the classifier host */
  localInstanceId: string;
  /** Number of agents currently running on this instance */
  runningAgents: number;
  /** Maximum agents this instance can run concurrently */
  maxAgents: number;
}

/**
 * A single classifier rule in the chain.
 */
export interface MessageClassifierRule {
  /** Stable identifier for this rule (used in logs and tests) */
  id: string;
  /** Higher priority rules are evaluated first */
  priority: number;
  /**
   * Classify the message, returning null if this rule does not apply.
   * Must be a pure function — no side effects, no async.
   */
  classify(message: AvaChatMessage, context: ClassifierContext): MessageClassification | null;
}

// ---------------------------------------------------------------------------
// Rule implementations (highest → lowest priority)
// ---------------------------------------------------------------------------

/**
 * LoopBreakerRule (priority 100)
 * Prevents infinite conversation loops by capping conversation depth.
 */
const LoopBreakerRule: MessageClassifierRule = {
  id: 'LoopBreakerRule',
  priority: 100,
  classify(message, context) {
    const depth = message.conversationDepth ?? 0;
    if (depth >= context.maxConversationDepth) {
      return {
        type: 'informational',
        shouldRespond: false,
        intent: 'inform',
        reason: `Conversation depth ${depth} >= maxConversationDepth ${context.maxConversationDepth}`,
      };
    }
    return null;
  },
};

/**
 * TerminalMessageRule (priority 90)
 * Messages explicitly marked as not expecting a response are informational.
 */
const TerminalMessageRule: MessageClassifierRule = {
  id: 'TerminalMessageRule',
  priority: 90,
  classify(message) {
    if (message.expectsResponse === false) {
      return {
        type: 'informational',
        shouldRespond: false,
        intent: message.intent ?? 'inform',
        reason: 'Message has expectsResponse:false',
      };
    }
    return null;
  },
};

/**
 * SelfMessageRule (priority 80)
 * Messages originating from this instance should not trigger a self-response.
 */
const SelfMessageRule: MessageClassifierRule = {
  id: 'SelfMessageRule',
  priority: 80,
  classify(message, context) {
    if (message.instanceId === context.localInstanceId) {
      return {
        type: 'informational',
        shouldRespond: false,
        intent: message.intent ?? 'inform',
        reason: 'Message originated from this instance',
      };
    }
    return null;
  },
};

/**
 * StaleMessageRule (priority 75)
 * Messages older than staleThresholdMs are ignored to avoid replying to ancient history.
 */
const StaleMessageRule: MessageClassifierRule = {
  id: 'StaleMessageRule',
  priority: 75,
  classify(message, context) {
    const age = Date.now() - new Date(message.timestamp).getTime();
    if (age > context.staleThresholdMs) {
      return {
        type: 'informational',
        shouldRespond: false,
        intent: message.intent ?? 'inform',
        reason: `Message is ${age}ms old, exceeds staleThresholdMs ${context.staleThresholdMs}`,
      };
    }
    return null;
  },
};

/**
 * SystemSourceRule (priority 70)
 * System messages are informational unless they start with [BugReport] or [SystemAlert],
 * which are treated as escalations requiring attention.
 */
const SystemSourceRule: MessageClassifierRule = {
  id: 'SystemSourceRule',
  priority: 70,
  classify(message) {
    if (message.source !== 'system') return null;

    const isBugReport = message.content.startsWith('[BugReport]');
    const isSystemAlert = message.content.startsWith('[SystemAlert]');

    if (isBugReport || isSystemAlert) {
      return {
        type: 'escalation',
        shouldRespond: true,
        intent: 'escalation',
        reason: `System message with ${isBugReport ? '[BugReport]' : '[SystemAlert]'} prefix`,
      };
    }

    return {
      type: 'informational',
      shouldRespond: false,
      intent: 'system_alert',
      reason: 'System source message without action prefix',
    };
  },
};

/**
 * RequestRule (priority 50)
 * Messages with intent:'request' and expectsResponse:true are active requests.
 */
const RequestRule: MessageClassifierRule = {
  id: 'RequestRule',
  priority: 50,
  classify(message) {
    if (message.intent === 'request' && message.expectsResponse === true) {
      return {
        type: 'request',
        shouldRespond: true,
        intent: 'request',
        reason: 'Message has intent:request and expectsResponse:true',
      };
    }
    return null;
  },
};

/**
 * CoordinationRule (priority 40)
 * Coordination messages are actionable only when this instance has available capacity.
 */
const CoordinationRule: MessageClassifierRule = {
  id: 'CoordinationRule',
  priority: 40,
  classify(message, context) {
    if (message.intent !== 'coordination') return null;

    const hasCapacity = context.runningAgents < context.maxAgents;
    return {
      type: 'coordination',
      shouldRespond: hasCapacity,
      intent: 'coordination',
      reason: hasCapacity
        ? `Coordination message; capacity available (${context.runningAgents}/${context.maxAgents} agents)`
        : `Coordination message; no capacity (${context.runningAgents}/${context.maxAgents} agents)`,
    };
  },
};

/**
 * EscalationRule (priority 30)
 * Escalation messages always warrant a response, with depth up to 3.
 */
const EscalationRule: MessageClassifierRule = {
  id: 'EscalationRule',
  priority: 30,
  classify(message) {
    if (message.intent !== 'escalation') return null;

    const depth = message.conversationDepth ?? 0;
    // Escalations have a hard cap of depth 3 regardless of global maxConversationDepth
    const escalationDepthCap = 3;
    if (depth >= escalationDepthCap) {
      return {
        type: 'escalation',
        shouldRespond: false,
        intent: 'escalation',
        reason: `Escalation depth ${depth} >= escalation cap ${escalationDepthCap}`,
      };
    }

    return {
      type: 'escalation',
      shouldRespond: true,
      intent: 'escalation',
      reason: 'Escalation message within allowed depth',
    };
  },
};

/**
 * DefaultRule (priority 0)
 * Catch-all: anything that didn't match a higher-priority rule is informational.
 */
const DefaultRule: MessageClassifierRule = {
  id: 'DefaultRule',
  priority: 0,
  classify(message) {
    return {
      type: 'informational',
      shouldRespond: false,
      intent: message.intent ?? 'inform',
      reason: 'No specific rule matched; defaulting to informational',
    };
  },
};

// ---------------------------------------------------------------------------
// Chain factory and runner
// ---------------------------------------------------------------------------

/** Default settings for the classifier chain. */
export interface ClassifierChainSettings {
  /** Maximum allowed conversation depth (default: 5) */
  maxConversationDepth?: number;
  /** Stale message threshold in ms (default: 5 minutes) */
  staleThresholdMs?: number;
  /** Number of agents currently running on this instance (default: 0) */
  runningAgents?: number;
  /** Maximum agents this instance can run (default: 5) */
  maxAgents?: number;
}

/**
 * Create a priority-ordered classifier chain bound to a specific instance.
 *
 * The returned array is sorted highest-to-lowest by priority and is ready
 * to be passed to `runClassifierChain`.
 *
 * @param localInstanceId  The instance ID of the host running the classifier
 * @param settings         Optional overrides for chain-wide settings
 */
export function createClassifierChain(
  localInstanceId: string,
  settings: ClassifierChainSettings = {}
): { rules: MessageClassifierRule[]; context: ClassifierContext } {
  const rules: MessageClassifierRule[] = [
    LoopBreakerRule,
    TerminalMessageRule,
    SelfMessageRule,
    StaleMessageRule,
    SystemSourceRule,
    RequestRule,
    CoordinationRule,
    EscalationRule,
    DefaultRule,
  ].sort((a, b) => b.priority - a.priority);

  const context: ClassifierContext = {
    localInstanceId,
    maxConversationDepth: settings.maxConversationDepth ?? 5,
    staleThresholdMs: settings.staleThresholdMs ?? 5 * 60 * 1000,
    runningAgents: settings.runningAgents ?? 0,
    maxAgents: settings.maxAgents ?? 5,
  };

  return { rules, context };
}

/**
 * Run a message through the classifier chain and return the first matching classification.
 *
 * Rules are assumed to be sorted by descending priority (as produced by
 * `createClassifierChain`). The first non-null result wins.
 *
 * @param message  The Ava Channel message to classify
 * @param context  Classifier context (from createClassifierChain)
 * @param rules    Ordered rule array (from createClassifierChain)
 * @returns        The winning classification (always non-null — DefaultRule is the fallback)
 */
export function runClassifierChain(
  message: AvaChatMessage,
  context: ClassifierContext,
  rules: MessageClassifierRule[]
): MessageClassification {
  for (const rule of rules) {
    const result = rule.classify(message, context);
    if (result !== null) {
      return result;
    }
  }

  // This path is unreachable in practice because DefaultRule always matches,
  // but TypeScript's control-flow analysis needs the explicit fallback.
  return {
    type: 'informational',
    shouldRespond: false,
    intent: 'inform',
    reason: 'Unreachable fallback — DefaultRule should have matched',
  };
}
