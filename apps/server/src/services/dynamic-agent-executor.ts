/**
 * DynamicAgentExecutor - Executes agents from factory-configured AgentConfig.
 *
 * Takes a fully resolved AgentConfig (from AgentFactoryService) and runs
 * it using simpleQuery or streamingQuery. Handles tool restrictions, system
 * prompt assembly, output capture, error classification, and event emission.
 */

import { createLogger, classifyError } from '@automaker/utils';
import {
  simpleQuery,
  streamingQuery,
  type SimpleQueryResult,
} from '../providers/simple-query-service.js';
import type { AgentConfig } from './agent-factory-service.js';
import type { EventEmitter } from '../lib/events.js';

const logger = createLogger('DynamicAgentExecutor');

/** Result of an agent execution */
export interface ExecutionResult {
  /** Whether execution completed successfully */
  success: boolean;
  /** The text output from the agent */
  output: string;
  /** Error message if failed */
  error?: string;
  /** Classified error type */
  errorType?: string;
  /** Execution duration in milliseconds */
  durationMs: number;
  /** Template name used */
  templateName: string;
  /** Model used */
  model: string;
}

/** Options for execution */
export interface ExecuteOptions {
  /** The user prompt / task description */
  prompt: string;
  /** Additional system prompt to prepend (merged with template's) */
  additionalSystemPrompt?: string;
  /** Abort controller for cancellation */
  abortController?: AbortController;
  /** Callback for streaming text output */
  onText?: (text: string) => void;
  /** Callback for tool use events */
  onToolUse?: (tool: string, input: unknown) => void;
}

export class DynamicAgentExecutor {
  private events?: EventEmitter;

  constructor(events?: EventEmitter) {
    this.events = events;
  }

  /**
   * Execute an agent with the given config and prompt.
   * Uses simpleQuery for non-streaming, streamingQuery for streaming.
   */
  async execute(config: AgentConfig, options: ExecuteOptions): Promise<ExecutionResult> {
    const startTime = Date.now();

    const systemPrompt = this.buildSystemPrompt(config, options.additionalSystemPrompt);
    const allowedTools = this.resolveTools(config);

    logger.info(
      `Executing "${config.templateName}" (${config.modelAlias}) for ${config.projectPath} — ${allowedTools.length} tools, ${config.maxTurns} max turns`
    );

    this.events?.emit('authority:agent-registered', {
      name: config.templateName,
      role: config.role,
      action: 'execute-start',
      projectPath: config.projectPath,
      model: config.modelAlias,
    });

    try {
      let output: string;

      if (options.onText || options.onToolUse) {
        // Streaming execution
        const result = await streamingQuery({
          prompt: options.prompt,
          model: config.resolvedModel,
          cwd: config.projectPath,
          systemPrompt,
          maxTurns: config.maxTurns,
          allowedTools,
          abortController: options.abortController,
          onText: options.onText,
          onToolUse: options.onToolUse,
        });
        output = result.text;
      } else {
        // Simple execution
        const result: SimpleQueryResult = await simpleQuery({
          prompt: options.prompt,
          model: config.resolvedModel,
          cwd: config.projectPath,
          systemPrompt,
          maxTurns: config.maxTurns,
          allowedTools,
          abortController: options.abortController,
        });
        output = result.text;
      }

      const durationMs = Date.now() - startTime;

      logger.info(`"${config.templateName}" completed in ${durationMs}ms (${output.length} chars)`);

      this.events?.emit('authority:agent-registered', {
        name: config.templateName,
        role: config.role,
        action: 'execute-complete',
        projectPath: config.projectPath,
        durationMs,
        success: true,
      });

      return {
        success: true,
        output,
        durationMs,
        templateName: config.templateName,
        model: config.modelAlias,
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorInfo = classifyError(err);

      logger.error(
        `"${config.templateName}" failed after ${durationMs}ms: [${errorInfo.type}] ${errorInfo.message}`
      );

      this.events?.emit('authority:agent-registered', {
        name: config.templateName,
        role: config.role,
        action: 'execute-error',
        projectPath: config.projectPath,
        durationMs,
        errorType: errorInfo.type,
        error: errorInfo.message,
      });

      return {
        success: false,
        output: '',
        error: errorInfo.message,
        errorType: errorInfo.type,
        durationMs,
        templateName: config.templateName,
        model: config.modelAlias,
      };
    }
  }

  /**
   * Build the system prompt from template config + optional additions.
   */
  private buildSystemPrompt(config: AgentConfig, additional?: string): string | undefined {
    const parts: string[] = [];

    // Template's inline system prompt
    if (config.systemPrompt) {
      parts.push(config.systemPrompt);
    }

    // Additional context
    if (additional) {
      parts.push(additional);
    }

    // Capability constraints
    const constraints: string[] = [];
    if (!config.capabilities.canUseBash) {
      constraints.push('You MUST NOT execute bash commands.');
    }
    if (!config.capabilities.canModifyFiles) {
      constraints.push('You MUST NOT modify any files.');
    }
    if (!config.capabilities.canCommit) {
      constraints.push('You MUST NOT create git commits.');
    }
    if (!config.capabilities.canCreatePRs) {
      constraints.push('You MUST NOT create pull requests.');
    }

    if (constraints.length > 0) {
      parts.push('## Restrictions\n' + constraints.join('\n'));
    }

    return parts.length > 0 ? parts.join('\n\n') : undefined;
  }

  /**
   * Resolve the effective tool list, applying disallowed filters.
   */
  private resolveTools(config: AgentConfig): string[] {
    const allowed = config.tools;
    const denied = new Set(config.disallowedTools);

    if (denied.size === 0) return allowed;
    return allowed.filter((tool) => !denied.has(tool));
  }
}
