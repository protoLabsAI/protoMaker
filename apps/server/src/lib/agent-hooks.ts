/**
 * Agent Hook Factories — Standard hook sets for Claude Agent SDK integration
 *
 * Provides factory functions that build typed HookCallbackMatcher arrays
 * for common patterns: tool progress tracking, notification logging,
 * and agent lifecycle events.
 *
 * Usage:
 *   const hooks = buildDefaultHooks({ emitter, logger, events });
 *   // Pass to provider: { hooks }
 */

import type { HookCallback, HookCallbackMatcher } from '@protolabs-ai/types';
import type { EventEmitter } from './events.js';

// ── Types ──────────────────────────────────────────────────────────────────────

/** Logger interface — structurally compatible with createLogger() */
interface Logger {
  info: (msg: string, ...args: unknown[]) => void;
  warn: (msg: string, ...args: unknown[]) => void;
  debug: (msg: string, ...args: unknown[]) => void;
}

/** Progress emitter interface — structurally compatible with ToolProgressEmitter */
interface ProgressEmitter {
  emitProgress: (toolCallId: string, label: string, toolName?: string) => void;
  clear: (toolCallId: string) => void;
}

export interface BuildProgressHooksOptions {
  emitter: ProgressEmitter;
  /** Unique ID for progress tracking (e.g., tool call or session ID) */
  toolCallId: string;
  /** Label prefix for progress messages */
  agentLabel: string;
}

export interface BuildNotificationHooksOptions {
  logger: Logger;
  agentLabel: string;
}

export interface BuildLifecycleHooksOptions {
  events: EventEmitter;
  config: {
    name: string;
    role: string;
    projectPath: string;
  };
}

export interface BuildDefaultHooksOptions {
  emitter?: ProgressEmitter;
  toolCallId?: string;
  agentLabel: string;
  logger: Logger;
  events?: EventEmitter;
  config?: {
    name: string;
    role: string;
    projectPath: string;
  };
}

// ── Progress Hooks ─────────────────────────────────────────────────────────────

/**
 * Build PostToolUse hooks that emit tool progress via the sideband emitter.
 *
 * Fires after each tool execution with the native tool name, providing more
 * reliable progress tracking than the onToolUse pattern.
 */
export function buildProgressHooks(options: BuildProgressHooksOptions): HookCallbackMatcher[] {
  const { emitter, toolCallId, agentLabel } = options;

  const postToolUse: HookCallback = async (input) => {
    try {
      const toolName = typeof input?.tool_name === 'string' ? input.tool_name : 'unknown';
      emitter.emitProgress(toolCallId, `${agentLabel}: ${toolName}`, toolName);
    } catch {
      // Progress emission is non-critical — never block the agent
    }
    return {};
  };

  return [
    {
      matcher: undefined, // Match all tool calls
      hooks: [postToolUse],
    },
  ];
}

// ── Notification Hooks ─────────────────────────────────────────────────────────

/**
 * Build Notification hooks that log agent status messages.
 *
 * Handles permission_prompt, idle_prompt, and auth_success notifications
 * by logging them without throwing or modifying behavior.
 */
export function buildNotificationHooks(
  options: BuildNotificationHooksOptions
): HookCallbackMatcher[] {
  const { logger, agentLabel } = options;

  const notificationHook: HookCallback = async (input) => {
    try {
      const type = typeof input?.type === 'string' ? input.type : 'unknown';
      const message = typeof input?.message === 'string' ? input.message : '';

      switch (type) {
        case 'permission_prompt':
          logger.info(`[${agentLabel}] Permission prompt: ${message}`);
          break;
        case 'idle_prompt':
          logger.debug(`[${agentLabel}] Idle prompt received`);
          break;
        case 'auth_success':
          logger.info(`[${agentLabel}] Auth success`);
          break;
        default:
          logger.debug(`[${agentLabel}] Notification: ${type} — ${message}`);
      }
    } catch {
      // Notification logging is non-critical
    }
    return {};
  };

  return [
    {
      matcher: undefined,
      hooks: [notificationHook],
    },
  ];
}

// ── Lifecycle Hooks ────────────────────────────────────────────────────────────

/**
 * Build SubagentStart/SubagentStop hooks that emit authority:agent-registered events.
 *
 * These track when subagents are spawned and terminated, providing visibility
 * into the multi-agent execution graph.
 */
export function buildLifecycleHooks(
  options: BuildLifecycleHooksOptions
): Record<string, HookCallbackMatcher[]> {
  const { events, config } = options;

  const subagentStart: HookCallback = async (input) => {
    try {
      const subagentName = typeof input?.name === 'string' ? input.name : 'subagent';
      events.emit('authority:agent-registered', {
        name: subagentName,
        role: config.role,
        action: 'subagent-start',
        projectPath: config.projectPath,
        parentAgent: config.name,
      });
    } catch {
      // Event emission is non-critical
    }
    return {};
  };

  const subagentStop: HookCallback = async (input) => {
    try {
      const subagentName = typeof input?.name === 'string' ? input.name : 'subagent';
      events.emit('authority:agent-registered', {
        name: subagentName,
        role: config.role,
        action: 'subagent-stop',
        projectPath: config.projectPath,
        parentAgent: config.name,
      });
    } catch {
      // Event emission is non-critical
    }
    return {};
  };

  return {
    SubagentStart: [{ matcher: undefined, hooks: [subagentStart] }],
    SubagentStop: [{ matcher: undefined, hooks: [subagentStop] }],
  };
}

// ── Default Hooks ──────────────────────────────────────────────────────────────

/**
 * Assemble all standard hooks into a single hooks Record.
 *
 * Returns a Record<string, HookCallbackMatcher[]> ready to pass to the
 * Claude Agent SDK via ExecuteOptions.hooks.
 *
 * Only includes hooks for which the required dependencies are provided:
 * - PostToolUse (progress) requires emitter + toolCallId
 * - Notification requires logger
 * - SubagentStart/Stop (lifecycle) requires events + config
 */
export function buildDefaultHooks(
  options: BuildDefaultHooksOptions
): Record<string, HookCallbackMatcher[]> {
  const hooks: Record<string, HookCallbackMatcher[]> = {};

  // PostToolUse progress hooks
  if (options.emitter && options.toolCallId) {
    hooks['PostToolUse'] = buildProgressHooks({
      emitter: options.emitter,
      toolCallId: options.toolCallId,
      agentLabel: options.agentLabel,
    });
  }

  // Notification hooks
  hooks['Notification'] = buildNotificationHooks({
    logger: options.logger,
    agentLabel: options.agentLabel,
  });

  // Lifecycle hooks (subagent start/stop)
  if (options.events && options.config) {
    const lifecycle = buildLifecycleHooks({
      events: options.events,
      config: options.config,
    });
    Object.assign(hooks, lifecycle);
  }

  return hooks;
}
