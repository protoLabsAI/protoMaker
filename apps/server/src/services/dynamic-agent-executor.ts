/**
 * DynamicAgentExecutor - Executes agents from factory-configured AgentConfig.
 *
 * Takes a fully resolved AgentConfig (from AgentFactoryService) and runs
 * it using simpleQuery or streamingQuery. Handles tool restrictions, system
 * prompt assembly, output capture, error classification, and event emission.
 */

import * as fsp from 'fs/promises';
import * as path from 'path';
import { createLogger, classifyError, listSkills, type SkillsFsModule } from '@protolabs-ai/utils';
import type { HookCallbackMatcher, CanUseTool } from '@protolabs-ai/types';
import {
  simpleQuery,
  streamingQuery,
  type SimpleQueryResult,
} from '../providers/simple-query-service.js';
import type { AgentConfig } from './agent-factory-service.js';
import type { EventEmitter } from '../lib/events.js';
import { buildDefaultHooks } from '../lib/agent-hooks.js';

const fsModule: SkillsFsModule = {
  readFile: (p, enc) => fsp.readFile(p, enc as BufferEncoding) as Promise<string>,
  writeFile: (p, c) => fsp.writeFile(p, c),
  readdir: (p) => fsp.readdir(p),
  stat: (p) => fsp.stat(p),
  mkdir: async (p, opts) => {
    await fsp.mkdir(p, opts);
  },
  unlink: (p) => fsp.unlink(p),
  access: (p) => fsp.access(p),
};

const logger = createLogger('DynamicAgentExecutor');

/**
 * Merge two hooks records, concatenating arrays for shared keys.
 * Base hooks are listed first; override hooks are appended.
 */
function mergeHooks(
  base: Record<string, HookCallbackMatcher[]>,
  override?: Partial<Record<string, HookCallbackMatcher[]>>
): Record<string, HookCallbackMatcher[]> {
  if (!override) return base;
  const merged: Record<string, HookCallbackMatcher[]> = { ...base };
  for (const [key, matchers] of Object.entries(override)) {
    if (matchers) {
      merged[key] = [...(merged[key] ?? []), ...matchers];
    }
  }
  return merged;
}

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
  /** Trace context for Langfuse — enriches traces with feature/role metadata */
  traceContext?: {
    featureId?: string;
    featureName?: string;
    agentRole?: string;
  };
  /**
   * Lifecycle hooks for the Claude Agent SDK.
   * Maps hook event names (e.g. 'PreToolUse', 'PostToolUse') to arrays of callback matchers.
   */
  hooks?: Partial<Record<string, HookCallbackMatcher[]>>;
  /**
   * Permission callback invoked before each tool execution.
   * Return value controls whether the tool is allowed to run.
   */
  canUseTool?: CanUseTool;
  /**
   * MCP server configurations to make available for this execution.
   * Enables per-execution MCP server assignment for future use.
   */
  mcpServers?: AgentConfig['mcpServers'];
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

    const systemPrompt = await this.buildSystemPrompt(config, options.additionalSystemPrompt);
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

      // Auto-derive traceContext from config when caller doesn't provide it
      const traceContext = options.traceContext ?? {
        agentRole: config.templateName,
      };

      // Build default hooks (lifecycle + notification) and merge with caller-provided hooks
      const defaultHooks = buildDefaultHooks({
        agentLabel: config.templateName,
        logger,
        events: this.events,
        config: {
          name: config.templateName,
          role: config.role,
          projectPath: config.projectPath,
        },
      });
      const mergedHooks = mergeHooks(defaultHooks, options.hooks);

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
          hooks: mergedHooks,
          canUseTool: options.canUseTool,
          traceContext,
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
          hooks: mergedHooks,
          canUseTool: options.canUseTool,
          traceContext,
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
  private async buildSystemPrompt(
    config: AgentConfig,
    additional?: string
  ): Promise<string | undefined> {
    const parts: string[] = [];

    // Template's inline system prompt
    if (config.systemPrompt) {
      parts.push(config.systemPrompt);
    }

    // Additional context
    if (additional) {
      parts.push(additional);
    }

    // Environment context
    if (config.environment) {
      parts.push(
        `## Environment\nYou are running in **${config.environment}** mode. ` +
          (config.environment === 'development'
            ? 'This is a local development environment — be conservative with resources and concurrency.'
            : config.environment === 'staging'
              ? 'This is a staging environment with higher capacity — you can run more agents and use more memory.'
              : 'This is a production environment — prioritize stability and reliability.')
      );
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

    // Available skills block — metadata only, no content loaded
    if (config.projectPath) {
      try {
        const skills = await listSkills(config.projectPath, fsModule);
        if (skills.length > 0) {
          const lines: string[] = ['<available_skills>'];
          for (const skill of skills) {
            const skillPath = path.join('.automaker', 'skills', `${skill.name}.md`);
            lines.push('  <skill>');
            lines.push(`    <name>${skill.name}</name>`);
            lines.push(`    <description>${skill.description}</description>`);
            lines.push(`    <path>${skillPath}</path>`);
            lines.push('  </skill>');
          }
          lines.push(
            '  <instruction>When your task matches a skill above, read the full skill file via read_file before proceeding. Skills contain proven patterns and techniques for this project.</instruction>'
          );
          lines.push('</available_skills>');
          parts.push(lines.join('\n'));
        }
      } catch {
        // Skills loading is non-critical; continue without them
      }
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
