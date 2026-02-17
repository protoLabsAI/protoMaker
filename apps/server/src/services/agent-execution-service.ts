/**
 * AgentExecutionService - Unified agent execution layer
 *
 * Consolidates three execution paths into a single service:
 * 1. AgentService (UI chat sessions)
 * 2. AutoModeService.runAgent() (Feature auto-mode)
 * 3. DynamicAgentExecutor (Crew/authority agents)
 *
 * Provides consistent handling of:
 * - Working directory validation
 * - Model resolution
 * - Tool allowlists
 * - System prompt construction
 * - Provider execution
 * - Event emission
 * - Error classification
 */

import { createLogger, classifyError } from '@automaker/utils';
import { resolveModelString } from '@automaker/model-resolver';
import { validateWorkingDirectory, TOOL_PRESETS, MAX_TURNS } from '../lib/sdk-options.js';
import type { EventEmitter } from '../lib/events.js';
import type {
  ExecuteOptions as ProviderExecuteOptions,
  ThinkingLevel,
  McpServerConfig,
  ClaudeCompatibleProvider,
  Credentials,
  AgentDefinition,
} from '@automaker/types';
import { stripProviderPrefix } from '@automaker/types';
import { ProviderFactory } from '../providers/provider-factory.js';

const logger = createLogger('AgentExecutionService');

/**
 * Execution mode determines default tool sets and constraints
 */
export type ExecutionMode = 'chat' | 'feature' | 'dynamic' | 'readonly';

/**
 * Capability flags that constrain agent behavior
 */
export interface AgentCapabilities {
  /** Can execute bash commands */
  canUseBash?: boolean;
  /** Can modify files */
  canModifyFiles?: boolean;
  /** Can create git commits */
  canCommit?: boolean;
  /** Can create pull requests */
  canCreatePRs?: boolean;
}

/**
 * Unified execution configuration
 */
export interface ExecutionConfig {
  /** The prompt/task for the agent */
  prompt: string;

  /** Working directory (worktree path for features) */
  cwd: string;

  /** Execution mode determines default tools and constraints */
  mode: ExecutionMode;

  /** Model to use (alias like 'sonnet' or full ID) */
  model?: string;

  /** Maximum turns before stopping */
  maxTurns?: number;

  /** Explicit tool allowlist (overrides mode defaults) */
  allowedTools?: string[];

  /** Tools to exclude from the allowlist */
  disallowedTools?: string[];

  /** System prompt (prepended to any mode-specific prompt) */
  systemPrompt?: string;

  /** Capability constraints */
  capabilities?: AgentCapabilities;

  /** Abort controller for cancellation */
  abortController?: AbortController;

  /** MCP servers configuration */
  mcpServers?: Record<string, McpServerConfig>;

  /** Thinking level for Claude extended thinking */
  thinkingLevel?: ThinkingLevel;

  /** Claude-compatible provider for alternative endpoints */
  claudeCompatibleProvider?: ClaudeCompatibleProvider;

  /** Credentials for API key resolution */
  credentials?: Credentials;

  /** Custom subagents for task delegation */
  agents?: Record<string, AgentDefinition>;

  /** SDK session ID for conversation continuity */
  sdkSessionId?: string;

  /** Setting sources for CLAUDE.md loading */
  settingSources?: Array<'user' | 'project' | 'local'>;

  /** Environment context (development/staging/production) */
  environment?: 'development' | 'staging' | 'production';

  /** Template name for logging/events (dynamic mode) */
  templateName?: string;

  /** Role identifier for events */
  role?: string;

  /** Project path for events/logging (may differ from cwd in worktree scenarios) */
  projectPath?: string;
}

/**
 * Result of an agent execution
 */
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

  /** Model used */
  model: string;

  /** SDK session ID for continuity */
  sessionId?: string;
}

/**
 * Streaming callbacks for real-time output
 */
export interface StreamingCallbacks {
  /** Called when text output is received */
  onText?: (text: string) => void;

  /** Called when a tool is used */
  onToolUse?: (tool: string, input: unknown) => void;

  /** Called for each stream message (raw provider message) */
  onMessage?: (message: unknown) => void;
}

/**
 * Default tools per execution mode
 */
const MODE_TOOL_DEFAULTS: Record<ExecutionMode, readonly string[]> = {
  chat: TOOL_PRESETS.chat,
  feature: TOOL_PRESETS.fullAccess,
  dynamic: TOOL_PRESETS.fullAccess,
  readonly: TOOL_PRESETS.readOnly,
};

/**
 * Default max turns per execution mode
 */
const MODE_MAX_TURNS_DEFAULTS: Record<ExecutionMode, number> = {
  chat: MAX_TURNS.standard,
  feature: MAX_TURNS.maximum,
  dynamic: MAX_TURNS.extended,
  readonly: MAX_TURNS.standard,
};

/**
 * Unified service for all agent executions
 */
export class AgentExecutionService {
  private events?: EventEmitter;

  constructor(events?: EventEmitter) {
    this.events = events;
  }

  /**
   * Execute an agent with the given configuration.
   * This is the unified entry point for all agent executions.
   */
  async execute(config: ExecutionConfig, callbacks?: StreamingCallbacks): Promise<ExecutionResult> {
    const startTime = Date.now();

    // Validate working directory
    validateWorkingDirectory(config.cwd);

    // Resolve model
    const resolvedModel = this.resolveModel(config.model);
    const bareModel = stripProviderPrefix(resolvedModel);

    // Build tool list
    const allowedTools = this.buildToolList(config);

    // Build system prompt
    const systemPrompt = this.buildSystemPrompt(config);

    // Determine max turns
    const maxTurns = config.maxTurns ?? MODE_MAX_TURNS_DEFAULTS[config.mode];

    const logContext = config.templateName || config.mode;
    const projectPath = config.projectPath || config.cwd;

    logger.info(
      `Executing "${logContext}" (${bareModel}) for ${projectPath} — ` +
        `${allowedTools.length} tools, ${maxTurns} max turns`
    );

    // Emit start event
    this.emitExecutionEvent('start', {
      templateName: config.templateName,
      role: config.role,
      projectPath,
      model: bareModel,
      mode: config.mode,
    });

    try {
      // Get provider for this model
      const provider = ProviderFactory.getProviderForModel(resolvedModel);

      // Build provider execute options
      const executeOptions: ProviderExecuteOptions = {
        prompt: config.prompt,
        model: bareModel,
        cwd: config.cwd,
        systemPrompt,
        maxTurns,
        allowedTools,
        abortController: config.abortController,
        mcpServers: config.mcpServers,
        thinkingLevel: config.thinkingLevel,
        claudeCompatibleProvider: config.claudeCompatibleProvider,
        credentials: config.credentials,
        agents: config.agents,
        sdkSessionId: config.sdkSessionId,
        settingSources: config.settingSources,
      };

      // Execute via provider
      const stream = provider.executeQuery(executeOptions);
      let output = '';
      let sessionId: string | undefined;

      for await (const msg of stream) {
        // Capture session ID
        if (msg.session_id && !sessionId) {
          sessionId = msg.session_id;
        }

        // Call raw message callback
        callbacks?.onMessage?.(msg);

        if (msg.type === 'assistant' && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === 'text' && block.text) {
              output += block.text;
              callbacks?.onText?.(block.text);
            } else if (block.type === 'tool_use' && block.name) {
              callbacks?.onToolUse?.(block.name, block.input);
            }
          }
        } else if (msg.type === 'result' && msg.subtype === 'success' && msg.result) {
          output = msg.result;
        } else if (msg.type === 'error') {
          throw new Error(msg.error || 'Unknown provider error');
        }
      }

      const durationMs = Date.now() - startTime;

      logger.info(`"${logContext}" completed in ${durationMs}ms (${output.length} chars)`);

      // Emit complete event
      this.emitExecutionEvent('complete', {
        templateName: config.templateName,
        role: config.role,
        projectPath,
        durationMs,
        success: true,
      });

      return {
        success: true,
        output,
        durationMs,
        model: bareModel,
        sessionId,
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorInfo = classifyError(err);

      logger.error(
        `"${logContext}" failed after ${durationMs}ms: [${errorInfo.type}] ${errorInfo.message}`
      );

      // Emit error event
      this.emitExecutionEvent('error', {
        templateName: config.templateName,
        role: config.role,
        projectPath,
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
        model: bareModel,
      };
    }
  }

  /**
   * Resolve a model alias to a full model ID
   */
  private resolveModel(model?: string): string {
    if (!model) {
      return resolveModelString('sonnet');
    }
    return resolveModelString(model);
  }

  /**
   * Build the effective tool list based on mode and config
   */
  private buildToolList(config: ExecutionConfig): string[] {
    // Start with explicit allowedTools or mode defaults
    const baseTools = config.allowedTools
      ? [...config.allowedTools]
      : [...MODE_TOOL_DEFAULTS[config.mode]];

    // Apply capability constraints
    const filteredTools = this.applyCapabilityConstraints(baseTools, config.capabilities);

    // Remove disallowed tools
    if (config.disallowedTools && config.disallowedTools.length > 0) {
      const disallowed = new Set(config.disallowedTools);
      return filteredTools.filter((tool) => !disallowed.has(tool));
    }

    return filteredTools;
  }

  /**
   * Apply capability constraints to remove tools
   */
  private applyCapabilityConstraints(tools: string[], capabilities?: AgentCapabilities): string[] {
    if (!capabilities) {
      return tools;
    }

    return tools.filter((tool) => {
      // Remove Bash if canUseBash is false
      if (tool === 'Bash' && capabilities.canUseBash === false) {
        return false;
      }
      // Remove Write/Edit if canModifyFiles is false
      if ((tool === 'Write' || tool === 'Edit') && capabilities.canModifyFiles === false) {
        return false;
      }
      return true;
    });
  }

  /**
   * Build the system prompt from config
   */
  private buildSystemPrompt(config: ExecutionConfig): string | undefined {
    const parts: string[] = [];

    // Custom system prompt
    if (config.systemPrompt) {
      parts.push(config.systemPrompt);
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

    // Capability constraints as explicit restrictions
    const constraints: string[] = [];
    if (config.capabilities) {
      if (config.capabilities.canUseBash === false) {
        constraints.push('You MUST NOT execute bash commands.');
      }
      if (config.capabilities.canModifyFiles === false) {
        constraints.push('You MUST NOT modify any files.');
      }
      if (config.capabilities.canCommit === false) {
        constraints.push('You MUST NOT create git commits.');
      }
      if (config.capabilities.canCreatePRs === false) {
        constraints.push('You MUST NOT create pull requests.');
      }
    }

    if (constraints.length > 0) {
      parts.push('## Restrictions\n' + constraints.join('\n'));
    }

    return parts.length > 0 ? parts.join('\n\n') : undefined;
  }

  /**
   * Emit execution events using authority:agent-registered event type
   * for compatibility with existing event handlers
   */
  private emitExecutionEvent(
    action: 'start' | 'complete' | 'error',
    data: {
      templateName?: string;
      role?: string;
      projectPath: string;
      model?: string;
      mode?: ExecutionMode;
      durationMs?: number;
      success?: boolean;
      errorType?: string;
      error?: string;
    }
  ): void {
    if (!this.events) {
      return;
    }

    // Map action to DynamicAgentExecutor's action format for compatibility
    const actionMap: Record<string, string> = {
      start: 'execute-start',
      complete: 'execute-complete',
      error: 'execute-error',
    };

    this.events.emit('authority:agent-registered', {
      action: actionMap[action] || action,
      name: data.templateName || data.mode || 'agent',
      role: data.role,
      projectPath: data.projectPath,
      model: data.model,
      durationMs: data.durationMs,
      success: data.success,
      errorType: data.errorType,
      error: data.error,
    });
  }
}

/**
 * Helper to create an execution config for chat mode
 */
export function createChatExecutionConfig(
  prompt: string,
  cwd: string,
  options?: Partial<Omit<ExecutionConfig, 'prompt' | 'cwd' | 'mode'>>
): ExecutionConfig {
  return {
    prompt,
    cwd,
    mode: 'chat',
    ...options,
  };
}

/**
 * Helper to create an execution config for feature implementation
 */
export function createFeatureExecutionConfig(
  prompt: string,
  cwd: string,
  options?: Partial<Omit<ExecutionConfig, 'prompt' | 'cwd' | 'mode'>>
): ExecutionConfig {
  return {
    prompt,
    cwd,
    mode: 'feature',
    ...options,
  };
}

/**
 * Helper to create an execution config for dynamic/authority agents
 */
export function createDynamicExecutionConfig(
  prompt: string,
  cwd: string,
  templateName: string,
  options?: Partial<Omit<ExecutionConfig, 'prompt' | 'cwd' | 'mode' | 'templateName'>>
): ExecutionConfig {
  return {
    prompt,
    cwd,
    mode: 'dynamic',
    templateName,
    ...options,
  };
}

/**
 * Helper to create an execution config for read-only analysis
 */
export function createReadOnlyExecutionConfig(
  prompt: string,
  cwd: string,
  options?: Partial<Omit<ExecutionConfig, 'prompt' | 'cwd' | 'mode'>>
): ExecutionConfig {
  return {
    prompt,
    cwd,
    mode: 'readonly',
    ...options,
  };
}
