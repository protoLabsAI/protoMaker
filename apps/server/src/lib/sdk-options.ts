/**
 * SDK Options Factory - Centralized configuration for Claude Agent SDK
 *
 * Provides presets for common use cases:
 * - Spec generation: Long-running analysis with read-only tools
 * - Feature generation: Quick JSON generation from specs
 * - Feature building: Autonomous feature implementation with full tool access
 * - Suggestions: Analysis with read-only tools
 * - Chat: Full tool access for interactive coding
 *
 * Uses model-resolver for consistent model handling across the application.
 *
 * SECURITY: All factory functions validate the working directory (cwd) against
 * ALLOWED_ROOT_DIRECTORY before returning options. This provides a centralized
 * security check that applies to ALL AI model invocations, regardless of provider.
 */

import type { Options, HookCallback } from '@anthropic-ai/claude-agent-sdk';
import path from 'path';
import { resolveModelString } from '@protolabsai/model-resolver';
import { createLogger } from '@protolabsai/utils';

const logger = createLogger('SdkOptions');
import {
  DEFAULT_MODELS,
  CLAUDE_MODEL_MAP,
  type McpServerConfig,
  type ThinkingLevel,
  getThinkingTokenBudget,
} from '@protolabsai/types';
import { isPathAllowed, PathNotAllowedError, getAllowedRootDirectory } from '@protolabsai/platform';

/**
 * Result of sandbox compatibility check
 */
export interface SandboxCompatibilityResult {
  /** Whether sandbox mode can be enabled for this path */
  enabled: boolean;
  /** Optional message explaining why sandbox is disabled */
  message?: string;
}

/**
 * Check if a working directory is compatible with sandbox mode.
 * Some paths (like cloud storage mounts) may not work with sandboxed execution.
 *
 * @param cwd - The working directory to check
 * @param sandboxRequested - Whether sandbox mode was requested by settings
 * @returns Object indicating if sandbox can be enabled and why not if disabled
 */
export function checkSandboxCompatibility(
  cwd: string,
  sandboxRequested: boolean
): SandboxCompatibilityResult {
  if (!sandboxRequested) {
    return { enabled: false };
  }

  const resolvedCwd = path.resolve(cwd);

  // Check for cloud storage paths that may not be compatible with sandbox
  const cloudStoragePatterns = [
    // macOS mounted volumes
    /^\/Volumes\/GoogleDrive/i,
    /^\/Volumes\/Dropbox/i,
    /^\/Volumes\/OneDrive/i,
    /^\/Volumes\/iCloud/i,
    // macOS home directory
    /^\/Users\/[^/]+\/Google Drive/i,
    /^\/Users\/[^/]+\/Dropbox/i,
    /^\/Users\/[^/]+\/OneDrive/i,
    /^\/Users\/[^/]+\/Library\/Mobile Documents/i, // iCloud
    // Linux home directory
    /^\/home\/[^/]+\/Google Drive/i,
    /^\/home\/[^/]+\/Dropbox/i,
    /^\/home\/[^/]+\/OneDrive/i,
    // Windows
    /^C:\\Users\\[^\\]+\\Google Drive/i,
    /^C:\\Users\\[^\\]+\\Dropbox/i,
    /^C:\\Users\\[^\\]+\\OneDrive/i,
  ];

  for (const pattern of cloudStoragePatterns) {
    if (pattern.test(resolvedCwd)) {
      return {
        enabled: false,
        message: `Sandbox disabled: Cloud storage path detected (${resolvedCwd}). Sandbox mode may not work correctly with cloud-synced directories.`,
      };
    }
  }

  return { enabled: true };
}

/**
 * Validate that a working directory is allowed by ALLOWED_ROOT_DIRECTORY.
 * This is the centralized security check for ALL AI model invocations.
 *
 * @param cwd - The working directory to validate
 * @throws PathNotAllowedError if the directory is not within ALLOWED_ROOT_DIRECTORY
 *
 * This function is called by all create*Options() factory functions to ensure
 * that AI models can only operate within allowed directories. This applies to:
 * - All current models (Claude, future models)
 * - All invocation types (chat, auto-mode, spec generation, etc.)
 */
export function validateWorkingDirectory(cwd: string): void {
  const resolvedCwd = path.resolve(cwd);

  if (!isPathAllowed(resolvedCwd)) {
    const allowedRoot = getAllowedRootDirectory();
    throw new PathNotAllowedError(
      `Working directory "${cwd}" (resolved: ${resolvedCwd}) is not allowed. ` +
        (allowedRoot
          ? `Must be within ALLOWED_ROOT_DIRECTORY: ${allowedRoot}`
          : 'ALLOWED_ROOT_DIRECTORY is configured but path is not within allowed directories.')
    );
  }
}

/**
 * Tools that perform file writes (Edit, Write, MultiEdit).
 * Bash is handled separately since we can only inspect the command string.
 */
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);

/**
 * Create a PreToolUse hook that blocks file writes outside the worktree.
 *
 * Agents receive their CWD set to the worktree, but prompts and context files
 * contain absolute paths to the main project directory. LLMs follow those paths
 * and write to the main repo, corrupting it. This hook intercepts Write/Edit
 * tool calls and blocks any that target projectPath but not the worktree.
 *
 * @param workDir - Resolved absolute path to the worktree (agent CWD)
 * @param projectPath - Resolved absolute path to the main repository
 * @returns PreToolUse hook callback, or undefined if workDir === projectPath (no worktree)
 */
export function createWorktreeWriteGuard(
  workDir: string,
  projectPath: string
): HookCallback | undefined {
  const resolvedWorkDir = path.resolve(workDir);
  const resolvedProjectPath = path.resolve(projectPath);

  // No guard needed if working directly in the project (no worktree)
  if (resolvedWorkDir === resolvedProjectPath) {
    return undefined;
  }

  const hook: HookCallback = async (input) => {
    if (input.hook_event_name !== 'PreToolUse') {
      return {};
    }

    const toolInput = input.tool_input as Record<string, unknown> | undefined;
    const toolName = input.tool_name;

    // Check Write/Edit/MultiEdit file_path
    if (WRITE_TOOLS.has(toolName) && toolInput) {
      const filePath = toolInput.file_path as string | undefined;
      if (filePath) {
        const resolved = path.resolve(filePath);
        // Block if path is inside projectPath but NOT inside the worktree.
        // Allow writes to .automaker/features/ (agent output is stored there by the server).
        const isInsideProject = resolved.startsWith(resolvedProjectPath + '/');
        const isInsideWorktree = resolved.startsWith(resolvedWorkDir + '/');
        const isAutomakerFeatureDir = resolved.startsWith(
          path.join(resolvedProjectPath, '.automaker', 'features') + '/'
        );

        if (isInsideProject && !isInsideWorktree && !isAutomakerFeatureDir) {
          const relPath = path.relative(resolvedProjectPath, resolved);
          const worktreePath = path.join(resolvedWorkDir, relPath);
          logger.warn(
            `[WorktreeGuard] Blocked ${toolName} to main repo: ${resolved}. ` +
              `Agent should use worktree path: ${worktreePath}`
          );
          return {
            decision: 'block' as const,
            reason:
              `BLOCKED: You are writing to the main repository (${resolved}) instead of your worktree. ` +
              `Use the worktree path instead: ${worktreePath}. ` +
              `Your working directory is ${resolvedWorkDir} — use relative paths or paths under this directory.`,
          };
        }
      }
    }

    // Check Bash commands for writes to projectPath
    if (toolName === 'Bash' && toolInput) {
      const command = toolInput.command as string | undefined;
      if (command && !command.includes(resolvedWorkDir)) {
        // Only check commands that don't reference the worktree path.
        // The worktree is a subdir of projectPath (.worktrees/branch),
        // so regex matches on projectPath would false-positive on worktree paths.
        const writePatterns = [
          // Direct file writes via redirection
          new RegExp(`>\\s*${escapeRegExp(resolvedProjectPath)}/`),
          // git operations in projectPath (git -C projectPath ...)
          new RegExp(`git\\s+-C\\s+['"]?${escapeRegExp(resolvedProjectPath)}['"]?`),
          // cp/mv targeting projectPath
          new RegExp(`(?:cp|mv)\\s+.*${escapeRegExp(resolvedProjectPath)}/`),
        ];

        for (const pattern of writePatterns) {
          if (pattern.test(command)) {
            logger.warn(
              `[WorktreeGuard] Blocked Bash command targeting main repo: ${command.substring(0, 200)}`
            );
            return {
              decision: 'block' as const,
              reason:
                `BLOCKED: Your bash command targets the main repository (${resolvedProjectPath}). ` +
                `Use your worktree path instead: ${resolvedWorkDir}. ` +
                `Replace "${resolvedProjectPath}" with "${resolvedWorkDir}" in your command.`,
            };
          }
        }
      }
    }

    return {};
  };

  return hook;
}

/**
 * Escape special regex characters in a string
 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Tool presets for different use cases
 */
export const TOOL_PRESETS = {
  /** Read-only tools for analysis */
  readOnly: ['Read', 'Glob', 'Grep'] as const,

  /** Tools for spec generation that needs to read the codebase */
  specGeneration: ['Read', 'Glob', 'Grep'] as const,

  /** Full tool access for feature implementation */
  fullAccess: [
    'Read',
    'Write',
    'Edit',
    'Glob',
    'Grep',
    'Bash',
    'WebSearch',
    'WebFetch',
    'TodoWrite',
    'MultiEdit',
    'LS',
    'Task',
    'Skill',
  ] as const,

  /** Tools for chat/interactive mode */
  chat: [
    'Read',
    'Write',
    'Edit',
    'Glob',
    'Grep',
    'Bash',
    'WebSearch',
    'WebFetch',
    'TodoWrite',
    'MultiEdit',
    'LS',
    'Task',
    'Skill',
  ] as const,
} as const;

/**
 * Max turns presets for different use cases
 */
export const MAX_TURNS = {
  /** Quick operations that shouldn't need many iterations */
  quick: 50,

  /** Standard operations */
  standard: 100,

  /** Long-running operations like full spec generation */
  extended: 250,

  /** Very long operations that may require extensive exploration */
  maximum: 1000,
} as const;

/**
 * Model presets for different use cases
 *
 * These can be overridden via environment variables:
 * - AUTOMAKER_MODEL_SPEC: Model for spec generation
 * - AUTOMAKER_MODEL_FEATURES: Model for feature generation
 * - AUTOMAKER_MODEL_SUGGESTIONS: Model for suggestions
 * - AUTOMAKER_MODEL_CHAT: Model for chat
 * - AUTOMAKER_MODEL_DEFAULT: Fallback model for all operations
 */
export function getModelForUseCase(
  useCase: 'spec' | 'features' | 'suggestions' | 'chat' | 'auto' | 'default',
  explicitModel?: string
): string {
  // Explicit model takes precedence
  if (explicitModel) {
    return resolveModelString(explicitModel);
  }

  // Check environment variable override for this use case
  const envVarMap: Record<string, string | undefined> = {
    spec: process.env.AUTOMAKER_MODEL_SPEC,
    features: process.env.AUTOMAKER_MODEL_FEATURES,
    suggestions: process.env.AUTOMAKER_MODEL_SUGGESTIONS,
    chat: process.env.AUTOMAKER_MODEL_CHAT,
    auto: process.env.AUTOMAKER_MODEL_AUTO,
    default: process.env.AUTOMAKER_MODEL_DEFAULT,
  };

  const envModel = envVarMap[useCase] || envVarMap.default;
  if (envModel) {
    return resolveModelString(envModel);
  }

  const defaultModels: Record<string, string> = {
    spec: CLAUDE_MODEL_MAP['haiku'], // used to generate app specs
    features: CLAUDE_MODEL_MAP['haiku'], // used to generate features from app specs
    suggestions: CLAUDE_MODEL_MAP['haiku'], // used for suggestions
    chat: CLAUDE_MODEL_MAP['haiku'], // used for chat
    auto: CLAUDE_MODEL_MAP['opus'], // used to implement kanban cards
    default: CLAUDE_MODEL_MAP['opus'],
  };

  return resolveModelString(defaultModels[useCase] || DEFAULT_MODELS.claude);
}

/**
 * Base options that apply to all SDK calls
 * AUTONOMOUS MODE: Always bypass permissions for fully autonomous operation
 */
function getBaseOptions(): Partial<Options> {
  return {
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    pathToClaudeCodeExecutable: path.resolve(
      process.cwd(),
      'node_modules/@anthropic-ai/claude-agent-sdk/cli.js'
    ),
  };
}

/**
 * MCP options result
 */
interface McpOptions {
  /** Options to spread for MCP servers */
  mcpServerOptions: Partial<Options>;
}

/**
 * Build MCP-related options based on configuration.
 *
 * @param config - The SDK options config
 * @returns Object with MCP server settings to spread into final options
 */
function buildMcpOptions(config: CreateSdkOptionsConfig): McpOptions {
  return {
    // Include MCP servers if configured
    mcpServerOptions: config.mcpServers ? { mcpServers: config.mcpServers } : {},
  };
}

/**
 * Build thinking options for SDK configuration.
 * Converts ThinkingLevel to maxThinkingTokens for the Claude SDK.
 *
 * @param thinkingLevel - The thinking level to convert
 * @returns Object with maxThinkingTokens if thinking is enabled
 */
function buildThinkingOptions(thinkingLevel?: ThinkingLevel): Partial<Options> {
  const maxThinkingTokens = getThinkingTokenBudget(thinkingLevel);
  logger.debug(
    `buildThinkingOptions: thinkingLevel="${thinkingLevel}" -> maxThinkingTokens=${maxThinkingTokens}`
  );
  return maxThinkingTokens ? { maxThinkingTokens } : {};
}

/**
 * Build worktree write guard hooks for SDK options.
 * Returns a hooks object if projectPath is set and differs from cwd (worktree mode).
 */
function buildWorktreeGuardHooks(config: CreateSdkOptionsConfig): Partial<Options> {
  if (!config.projectPath) return {};

  const guard = createWorktreeWriteGuard(config.cwd, config.projectPath);
  if (!guard) return {};

  logger.info(
    `[WorktreeGuard] Enabled: writes blocked outside worktree ${config.cwd} (project: ${config.projectPath})`
  );

  return {
    hooks: {
      PreToolUse: [
        {
          hooks: [guard],
        },
      ],
    },
  };
}

/**
 * Build system prompt configuration based on autoLoadClaudeMd setting.
 * When autoLoadClaudeMd is true:
 * - Uses preset mode with 'claude_code' to enable CLAUDE.md auto-loading
 * - If there's a custom systemPrompt, appends it to the preset
 * - Sets settingSources to ['project'] for SDK to load CLAUDE.md files
 *
 * @param config - The SDK options config
 * @returns Object with systemPrompt and settingSources for SDK options
 */
function buildClaudeMdOptions(config: CreateSdkOptionsConfig): {
  systemPrompt?: string | SystemPromptConfig;
  settingSources?: Array<'user' | 'project' | 'local'>;
} {
  if (!config.autoLoadClaudeMd) {
    // Standard mode - just pass through the system prompt as-is
    return config.systemPrompt ? { systemPrompt: config.systemPrompt } : {};
  }

  // Auto-load CLAUDE.md mode - use preset with settingSources
  const result: {
    systemPrompt: SystemPromptConfig;
    settingSources: Array<'user' | 'project' | 'local'>;
  } = {
    systemPrompt: {
      type: 'preset',
      preset: 'claude_code',
    },
    // Load both user (~/.claude/CLAUDE.md) and project (.claude/CLAUDE.md) settings
    settingSources: ['user', 'project'],
  };

  // If there's a custom system prompt, append it to the preset
  if (config.systemPrompt) {
    result.systemPrompt.append = config.systemPrompt;
  }

  return result;
}

/**
 * System prompt configuration for SDK options
 * When using preset mode with claude_code, CLAUDE.md files are automatically loaded
 */
export interface SystemPromptConfig {
  /** Use preset mode with claude_code to enable CLAUDE.md auto-loading */
  type: 'preset';
  /** The preset to use - 'claude_code' enables CLAUDE.md loading */
  preset: 'claude_code';
  /** Optional additional prompt to append to the preset */
  append?: string;
}

/**
 * Options configuration for creating SDK options
 */
export interface CreateSdkOptionsConfig {
  /** Working directory for the agent */
  cwd: string;

  /** Optional explicit model override */
  model?: string;

  /** Optional session model (used as fallback if explicit model not provided) */
  sessionModel?: string;

  /** Optional system prompt */
  systemPrompt?: string;

  /** Optional abort controller for cancellation */
  abortController?: AbortController;

  /** Optional output format for structured outputs */
  outputFormat?: {
    type: 'json_schema';
    schema: Record<string, unknown>;
  };

  /** Enable auto-loading of CLAUDE.md files via SDK's settingSources */
  autoLoadClaudeMd?: boolean;

  /** MCP servers to make available to the agent */
  mcpServers?: Record<string, McpServerConfig>;

  /** Extended thinking level for Claude models */
  thinkingLevel?: ThinkingLevel;

  /** Maximum budget in USD. Query stops with error_max_budget_usd if exceeded. */
  maxBudgetUsd?: number;

  /** Override max turns for this invocation. If not set, uses preset default. */
  maxTurns?: number;

  /** Session ID to resume from. Loads conversation history from the specified session. */
  resume?: string;

  /**
   * Main repository path. When set alongside a worktree cwd, enables the
   * PreToolUse write guard that blocks agent file writes outside the worktree.
   */
  projectPath?: string;
}

// Re-export MCP types from @protolabsai/types for convenience
export type {
  McpServerConfig,
  McpStdioServerConfig,
  McpSSEServerConfig,
  McpHttpServerConfig,
} from '@protolabsai/types';

/**
 * Create SDK options for spec generation
 *
 * Configuration:
 * - Uses read-only tools for codebase analysis
 * - Extended turns for thorough exploration
 * - Opus model by default (can be overridden)
 * - When autoLoadClaudeMd is true, uses preset mode and settingSources for CLAUDE.md loading
 */
export function createSpecGenerationOptions(config: CreateSdkOptionsConfig): Options {
  // Validate working directory before creating options
  validateWorkingDirectory(config.cwd);

  // Build CLAUDE.md auto-loading options if enabled
  const claudeMdOptions = buildClaudeMdOptions(config);

  // Build thinking options
  const thinkingOptions = buildThinkingOptions(config.thinkingLevel);

  return {
    ...getBaseOptions(),
    // Override permissionMode - spec generation only needs read-only tools
    // Using "acceptEdits" can cause Claude to write files to unexpected locations
    // See: https://github.com/AutoMaker-Org/automaker/issues/149
    permissionMode: 'default',
    model: getModelForUseCase('spec', config.model),
    maxTurns: MAX_TURNS.maximum,
    cwd: config.cwd,
    allowedTools: [...TOOL_PRESETS.specGeneration],
    ...claudeMdOptions,
    ...thinkingOptions,
    ...(config.abortController && { abortController: config.abortController }),
    ...(config.outputFormat && { outputFormat: config.outputFormat }),
  };
}

/**
 * Create SDK options for feature generation from specs
 *
 * Configuration:
 * - Uses read-only tools (just needs to read the spec)
 * - Quick turns since it's mostly JSON generation
 * - Sonnet model by default for speed
 * - When autoLoadClaudeMd is true, uses preset mode and settingSources for CLAUDE.md loading
 */
export function createFeatureGenerationOptions(config: CreateSdkOptionsConfig): Options {
  // Validate working directory before creating options
  validateWorkingDirectory(config.cwd);

  // Build CLAUDE.md auto-loading options if enabled
  const claudeMdOptions = buildClaudeMdOptions(config);

  // Build thinking options
  const thinkingOptions = buildThinkingOptions(config.thinkingLevel);

  return {
    ...getBaseOptions(),
    // Override permissionMode - feature generation only needs read-only tools
    permissionMode: 'default',
    model: getModelForUseCase('features', config.model),
    maxTurns: MAX_TURNS.quick,
    cwd: config.cwd,
    allowedTools: [...TOOL_PRESETS.readOnly],
    ...claudeMdOptions,
    ...thinkingOptions,
    ...(config.abortController && { abortController: config.abortController }),
  };
}

/**
 * Create SDK options for generating suggestions
 *
 * Configuration:
 * - Uses read-only tools for analysis
 * - Standard turns to allow thorough codebase exploration and structured output generation
 * - Opus model by default for thorough analysis
 * - When autoLoadClaudeMd is true, uses preset mode and settingSources for CLAUDE.md loading
 */
export function createSuggestionsOptions(config: CreateSdkOptionsConfig): Options {
  // Validate working directory before creating options
  validateWorkingDirectory(config.cwd);

  // Build CLAUDE.md auto-loading options if enabled
  const claudeMdOptions = buildClaudeMdOptions(config);

  // Build thinking options
  const thinkingOptions = buildThinkingOptions(config.thinkingLevel);

  return {
    ...getBaseOptions(),
    model: getModelForUseCase('suggestions', config.model),
    maxTurns: MAX_TURNS.extended,
    cwd: config.cwd,
    allowedTools: [...TOOL_PRESETS.readOnly],
    ...claudeMdOptions,
    ...thinkingOptions,
    ...(config.abortController && { abortController: config.abortController }),
    ...(config.outputFormat && { outputFormat: config.outputFormat }),
  };
}

/**
 * Create SDK options for chat/interactive mode
 *
 * Configuration:
 * - Full tool access for code modification
 * - Standard turns for interactive sessions
 * - Model priority: explicit model > session model > chat default
 * - When autoLoadClaudeMd is true, uses preset mode and settingSources for CLAUDE.md loading
 */
export function createChatOptions(config: CreateSdkOptionsConfig): Options {
  // Validate working directory before creating options
  validateWorkingDirectory(config.cwd);

  // Model priority: explicit model > session model > chat default
  const effectiveModel = config.model || config.sessionModel;

  // Build CLAUDE.md auto-loading options if enabled
  const claudeMdOptions = buildClaudeMdOptions(config);

  // Build MCP-related options
  const mcpOptions = buildMcpOptions(config);

  // Build thinking options
  const thinkingOptions = buildThinkingOptions(config.thinkingLevel);

  // Build worktree write guard hook (blocks writes outside the worktree)
  const worktreeHooks = buildWorktreeGuardHooks(config);

  return {
    ...getBaseOptions(),
    model: getModelForUseCase('chat', effectiveModel),
    maxTurns: MAX_TURNS.standard,
    cwd: config.cwd,
    allowedTools: [...TOOL_PRESETS.chat],
    ...claudeMdOptions,
    ...thinkingOptions,
    ...worktreeHooks,
    ...(config.abortController && { abortController: config.abortController }),
    ...mcpOptions.mcpServerOptions,
  };
}

/**
 * Create SDK options for autonomous feature building/implementation
 *
 * Configuration:
 * - Full tool access for code modification and implementation
 * - Extended turns for thorough feature implementation
 * - Uses default model (can be overridden)
 * - When autoLoadClaudeMd is true, uses preset mode and settingSources for CLAUDE.md loading
 */
export function createAutoModeOptions(config: CreateSdkOptionsConfig): Options {
  // Validate working directory before creating options
  validateWorkingDirectory(config.cwd);

  // Build CLAUDE.md auto-loading options if enabled
  const claudeMdOptions = buildClaudeMdOptions(config);

  // Build MCP-related options
  const mcpOptions = buildMcpOptions(config);

  // Build thinking options
  const thinkingOptions = buildThinkingOptions(config.thinkingLevel);

  // Build worktree write guard hook (blocks writes outside the worktree)
  const worktreeHooks = buildWorktreeGuardHooks(config);

  return {
    ...getBaseOptions(),
    model: getModelForUseCase('auto', config.model),
    maxTurns: config.maxTurns ?? MAX_TURNS.maximum,
    cwd: config.cwd,
    allowedTools: [...TOOL_PRESETS.fullAccess],
    enableFileCheckpointing: true,
    ...claudeMdOptions,
    ...thinkingOptions,
    ...worktreeHooks,
    ...(config.abortController && { abortController: config.abortController }),
    ...(config.maxBudgetUsd != null && { maxBudgetUsd: config.maxBudgetUsd }),
    ...(config.resume && { resume: config.resume }),
    ...mcpOptions.mcpServerOptions,
  };
}

/**
 * Create custom SDK options with explicit configuration
 *
 * Use this when the preset options don't fit your use case.
 * When autoLoadClaudeMd is true, uses preset mode and settingSources for CLAUDE.md loading
 */
export function createCustomOptions(
  config: CreateSdkOptionsConfig & {
    maxTurns?: number;
    allowedTools?: readonly string[];
  }
): Options {
  // Validate working directory before creating options
  validateWorkingDirectory(config.cwd);

  // Build CLAUDE.md auto-loading options if enabled
  const claudeMdOptions = buildClaudeMdOptions(config);

  // Build MCP-related options
  const mcpOptions = buildMcpOptions(config);

  // Build thinking options
  const thinkingOptions = buildThinkingOptions(config.thinkingLevel);

  // For custom options: use explicit allowedTools if provided, otherwise default to readOnly
  const effectiveAllowedTools = config.allowedTools
    ? [...config.allowedTools]
    : [...TOOL_PRESETS.readOnly];

  // Build worktree write guard hook (blocks writes outside the worktree)
  const worktreeHooks = buildWorktreeGuardHooks(config);

  return {
    ...getBaseOptions(),
    model: getModelForUseCase('default', config.model),
    maxTurns: config.maxTurns ?? MAX_TURNS.maximum,
    cwd: config.cwd,
    allowedTools: effectiveAllowedTools,
    ...claudeMdOptions,
    ...thinkingOptions,
    ...worktreeHooks,
    ...(config.abortController && { abortController: config.abortController }),
    ...mcpOptions.mcpServerOptions,
  };
}
