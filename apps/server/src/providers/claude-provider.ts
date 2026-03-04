/**
 * Claude Provider - Executes queries using Claude Agent SDK
 *
 * Wraps the @anthropic-ai/claude-agent-sdk for seamless integration
 * with the provider architecture.
 */

import {
  query,
  type Options,
  type SDKUserMessage,
  type HookCallback,
  type HookCallbackMatcher,
  type CanUseTool,
} from '@anthropic-ai/claude-agent-sdk';
import {
  getThinkingTokenBudget,
  validateBareModelId,
  type ClaudeApiProfile,
  type ClaudeCompatibleProvider,
  type Credentials,
} from '@protolabs-ai/types';
import { BaseProvider } from './base-provider.js';
import { classifyError, getUserFriendlyErrorMessage, createLogger } from '@protolabs-ai/utils';

const logger = createLogger('ClaudeProvider');

/**
 * ProviderConfig - Union type for provider configuration
 *
 * Accepts either the legacy ClaudeApiProfile or new ClaudeCompatibleProvider.
 * Both share the same connection settings structure.
 */
type ProviderConfig = ClaudeApiProfile | ClaudeCompatibleProvider;
import type {
  ExecuteOptions,
  ProviderMessage,
  InstallationStatus,
  ModelDefinition,
} from './types.js';

// Explicit allowlist of environment variables to pass to the SDK.
// Only these vars are passed - nothing else from process.env leaks through.
const _ALLOWED_ENV_VARS = [
  // Authentication
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  // Endpoint configuration
  'ANTHROPIC_BASE_URL',
  'API_TIMEOUT_MS',
  // Model mappings
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  // Traffic control
  'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
  // System vars (always from process.env)
  'PATH',
  'HOME',
  'SHELL',
  'TERM',
  'USER',
  'LANG',
  'LC_ALL',
];

// System vars are always passed from process.env regardless of profile
const SYSTEM_ENV_VARS = ['PATH', 'HOME', 'SHELL', 'TERM', 'USER', 'LANG', 'LC_ALL'];

/**
 * Check if the config is a ClaudeCompatibleProvider (new system)
 * by checking for the 'models' array property
 */
function isClaudeCompatibleProvider(config: ProviderConfig): config is ClaudeCompatibleProvider {
  return 'models' in config && Array.isArray(config.models);
}

/**
 * Build environment for the SDK with only explicitly allowed variables.
 * When a provider/profile is provided, uses its configuration (clean switch - don't inherit from process.env).
 * When no provider is provided, uses direct Anthropic API settings from process.env.
 *
 * Supports both:
 * - ClaudeCompatibleProvider (new system with models[] array)
 * - ClaudeApiProfile (legacy system with modelMappings)
 *
 * @param providerConfig - Optional provider configuration for alternative endpoint
 * @param credentials - Optional credentials object for resolving 'credentials' apiKeySource
 */
function buildEnv(
  providerConfig?: ProviderConfig,
  credentials?: Credentials
): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {};

  if (providerConfig) {
    // Use provider configuration (clean switch - don't inherit non-system vars from process.env)
    logger.debug('[buildEnv] Using provider configuration:', {
      name: providerConfig.name,
      baseUrl: providerConfig.baseUrl,
      apiKeySource: providerConfig.apiKeySource ?? 'inline',
      isNewProvider: isClaudeCompatibleProvider(providerConfig),
    });

    // Resolve API key based on source strategy
    let apiKey: string | undefined;
    const source = providerConfig.apiKeySource ?? 'inline'; // Default to inline for backwards compat

    switch (source) {
      case 'inline':
        apiKey = providerConfig.apiKey;
        break;
      case 'env':
        apiKey = process.env.ANTHROPIC_API_KEY;
        break;
      case 'credentials':
        apiKey = credentials?.apiKeys?.anthropic;
        break;
    }

    // Warn if no API key found
    if (!apiKey) {
      logger.warn(`No API key found for provider "${providerConfig.name}" with source "${source}"`);
    }

    // Authentication
    if (providerConfig.useAuthToken) {
      env['ANTHROPIC_AUTH_TOKEN'] = apiKey;
    } else {
      env['ANTHROPIC_API_KEY'] = apiKey;
    }

    // Endpoint configuration
    env['ANTHROPIC_BASE_URL'] = providerConfig.baseUrl;
    logger.debug(`[buildEnv] Set ANTHROPIC_BASE_URL to: ${providerConfig.baseUrl}`);

    if (providerConfig.timeoutMs) {
      env['API_TIMEOUT_MS'] = String(providerConfig.timeoutMs);
    }

    // Model mappings - only for legacy ClaudeApiProfile
    // For ClaudeCompatibleProvider, the model is passed directly (no mapping needed)
    if (!isClaudeCompatibleProvider(providerConfig) && providerConfig.modelMappings) {
      if (providerConfig.modelMappings.haiku) {
        env['ANTHROPIC_DEFAULT_HAIKU_MODEL'] = providerConfig.modelMappings.haiku;
      }
      if (providerConfig.modelMappings.sonnet) {
        env['ANTHROPIC_DEFAULT_SONNET_MODEL'] = providerConfig.modelMappings.sonnet;
      }
      if (providerConfig.modelMappings.opus) {
        env['ANTHROPIC_DEFAULT_OPUS_MODEL'] = providerConfig.modelMappings.opus;
      }
    }

    // Traffic control
    if (providerConfig.disableNonessentialTraffic) {
      env['CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC'] = '1';
    }
  } else {
    // Use direct Anthropic API - pass through credentials or environment variables
    // This supports:
    // 1. API Key mode: ANTHROPIC_API_KEY from credentials (UI settings) or env
    // 2. Claude Max plan: Uses CLI OAuth auth (SDK handles this automatically)
    // 3. Custom endpoints via ANTHROPIC_BASE_URL env var (backward compatibility)
    //
    // Priority: credentials file (UI settings) -> environment variable
    // Note: Only auth and endpoint vars are passed. Model mappings and traffic
    // control are NOT passed (those require a profile for explicit configuration).
    if (credentials?.apiKeys?.anthropic) {
      env['ANTHROPIC_API_KEY'] = credentials.apiKeys.anthropic;
    } else if (process.env.ANTHROPIC_API_KEY) {
      env['ANTHROPIC_API_KEY'] = process.env.ANTHROPIC_API_KEY;
    }
    // If using Claude Max plan via CLI auth, the SDK handles auth automatically
    // when no API key is provided. We don't set ANTHROPIC_AUTH_TOKEN here
    // unless it was explicitly set in process.env (rare edge case).
    if (process.env.ANTHROPIC_AUTH_TOKEN) {
      env['ANTHROPIC_AUTH_TOKEN'] = process.env.ANTHROPIC_AUTH_TOKEN;
    }
    // Pass through ANTHROPIC_BASE_URL if set in environment (backward compatibility)
    if (process.env.ANTHROPIC_BASE_URL) {
      env['ANTHROPIC_BASE_URL'] = process.env.ANTHROPIC_BASE_URL;
    }
  }

  // Always add system vars from process.env
  for (const key of SYSTEM_ENV_VARS) {
    if (process.env[key]) {
      env[key] = process.env[key];
    }
  }

  // Pass OTel telemetry config to subprocess for per-turn trace visibility.
  // The Claude CLI emits claude_code.token.usage, claude_code.api_request,
  // claude_code.tool_result spans to the configured OTel endpoint.
  // These land as separate traces in Langfuse, correlated by featureId resource attribute.
  const langfusePublicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const langfuseSecretKey = process.env.LANGFUSE_SECRET_KEY;
  const langfuseBaseUrl = process.env.LANGFUSE_BASE_URL;
  if (langfusePublicKey && langfuseSecretKey && langfuseBaseUrl) {
    env['CLAUDE_CODE_ENABLE_TELEMETRY'] = '1';
    env['OTEL_EXPORTER_OTLP_ENDPOINT'] = `${langfuseBaseUrl}/api/public/otel`;
    env['OTEL_EXPORTER_OTLP_HEADERS'] =
      `Authorization=Basic ${Buffer.from(`${langfusePublicKey}:${langfuseSecretKey}`).toString('base64')}`;
  }

  return env;
}

export class ClaudeProvider extends BaseProvider {
  getName(): string {
    return 'claude';
  }

  /**
   * Execute a query using Claude Agent SDK
   */
  async *executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage> {
    // Validate that model doesn't have a provider prefix
    // AgentService should strip prefixes before passing to providers
    validateBareModelId(options.model, 'ClaudeProvider');

    const {
      prompt,
      model,
      cwd,
      systemPrompt,
      maxTurns = 20,
      allowedTools,
      abortController,
      conversationHistory,
      sdkSessionId,
      thinkingLevel,
      claudeApiProfile,
      claudeCompatibleProvider,
      credentials,
    } = options;

    // Determine which provider config to use
    // claudeCompatibleProvider takes precedence over claudeApiProfile
    const providerConfig = claudeCompatibleProvider || claudeApiProfile;

    // Convert thinking level to token budget
    const maxThinkingTokens = getThinkingTokenBudget(thinkingLevel);

    // Build Claude SDK options
    const sdkOptions: Options = {
      model,
      systemPrompt,
      maxTurns,
      cwd,
      // Pass only explicitly allowed environment variables to SDK
      // When a provider is active, uses provider settings (clean switch)
      // When no provider, uses direct Anthropic API (from process.env or CLI OAuth)
      env: buildEnv(providerConfig, credentials),
      // Pass through allowedTools if provided by caller (decided by sdk-options.ts)
      ...(allowedTools && { allowedTools }),
      // Permission mode: use 'default' when a canUseTool gating callback is active
      // so the SDK respects the callback's decisions. Fall back to 'bypassPermissions'
      // for fully autonomous (full-trust) operation when no callback is provided.
      permissionMode: options.canUseTool ? 'default' : 'bypassPermissions',
      allowDangerouslySkipPermissions: !options.canUseTool,
      abortController,
      // Resume existing SDK session if we have a session ID
      ...(sdkSessionId && conversationHistory && conversationHistory.length > 0
        ? { resume: sdkSessionId }
        : {}),
      // Forward settingSources for CLAUDE.md file loading
      ...(options.settingSources && { settingSources: options.settingSources }),
      // Forward MCP servers configuration
      ...(options.mcpServers && { mcpServers: options.mcpServers }),
      // Extended thinking configuration
      ...(maxThinkingTokens && { maxThinkingTokens }),
      // Subagents configuration for specialized task delegation
      ...(options.agents && { agents: options.agents }),
      // Lifecycle hooks for the Claude Agent SDK
      ...(options.hooks && { hooks: options.hooks as Options['hooks'] }),
      // Tool permission callback
      ...(options.canUseTool && { canUseTool: options.canUseTool as CanUseTool }),
      // Explicitly disallowed tools
      ...(options.disallowedTools && { disallowedTools: options.disallowedTools }),
      // Pass through outputFormat for structured JSON outputs
      ...(options.outputFormat && { outputFormat: options.outputFormat }),
    };

    // Build prompt payload
    let promptPayload: string | AsyncIterable<SDKUserMessage>;

    if (Array.isArray(prompt)) {
      // Multi-part prompt (with images)
      promptPayload = (async function* () {
        yield {
          type: 'user',
          session_id: '',
          message: {
            role: 'user' as const,
            content: prompt,
          },
          parent_tool_use_id: null,
        } as SDKUserMessage;
      })();
    } else {
      // Simple text prompt
      promptPayload = prompt;
    }

    // Log the environment being passed to the SDK for debugging
    const envForSdk = sdkOptions.env as Record<string, string | undefined>;
    logger.debug('[ClaudeProvider] SDK Configuration:', {
      model: sdkOptions.model,
      baseUrl: envForSdk?.['ANTHROPIC_BASE_URL'] || '(default Anthropic API)',
      hasApiKey: !!envForSdk?.['ANTHROPIC_API_KEY'],
      hasAuthToken: !!envForSdk?.['ANTHROPIC_AUTH_TOKEN'],
      providerName: providerConfig?.name || '(direct Anthropic)',
      maxTurns: sdkOptions.maxTurns,
      maxThinkingTokens: sdkOptions.maxThinkingTokens,
    });

    // Execute via Claude Agent SDK
    try {
      const stream = query({ prompt: promptPayload, options: sdkOptions });

      // Stream messages directly - they're already in the correct format
      for await (const msg of stream) {
        yield msg as ProviderMessage;
      }
    } catch (error) {
      // Enhance error with user-friendly message and classification
      const errorInfo = classifyError(error);
      const userMessage = getUserFriendlyErrorMessage(error);

      logger.error('executeQuery() error during execution:', {
        type: errorInfo.type,
        message: errorInfo.message,
        isRateLimit: errorInfo.isRateLimit,
        retryAfter: errorInfo.retryAfter,
        stack: (error as Error).stack,
      });

      // Build enhanced error message with additional guidance for rate limits
      const message = errorInfo.isRateLimit
        ? `${userMessage}\n\nTip: If you're running multiple features in auto-mode, consider reducing concurrency (maxConcurrency setting) to avoid hitting rate limits.`
        : userMessage;

      const enhancedError = new Error(message);
      Object.assign(enhancedError, {
        originalError: error,
        type: errorInfo.type,
        ...(errorInfo.isRateLimit &&
          errorInfo.retryAfter !== undefined && { retryAfter: errorInfo.retryAfter }),
      });

      throw enhancedError;
    }
  }

  /**
   * Detect Claude SDK installation and auth status.
   * Checks API key, OAuth tokens, and CLI auth indicators.
   */
  async detectInstallation(): Promise<InstallationStatus> {
    const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
    let authenticated = hasApiKey;

    // If no API key, check for OAuth/CLI auth
    if (!authenticated) {
      try {
        const { getClaudeAuthIndicators } = await import('@protolabs-ai/platform');
        const indicators = await getClaudeAuthIndicators();
        authenticated =
          indicators.hasStatsCacheWithActivity ||
          (indicators.hasSettingsFile && indicators.hasProjectsSessions) ||
          !!indicators.credentials?.hasOAuthToken ||
          !!indicators.credentials?.hasApiKey;
      } catch {
        // Platform check unavailable, fall back to API key only
      }
    }

    return {
      installed: true,
      method: 'sdk',
      hasApiKey,
      authenticated,
    };
  }

  /**
   * Get available Claude models
   */
  getAvailableModels(): ModelDefinition[] {
    const models = [
      {
        id: 'claude-opus-4-5-20251101',
        name: 'Claude Opus 4.5',
        modelString: 'claude-opus-4-5-20251101',
        provider: 'anthropic',
        description: 'Most capable Claude model',
        contextWindow: 200000,
        maxOutputTokens: 16000,
        supportsVision: true,
        supportsTools: true,
        tier: 'premium' as const,
        default: true,
      },
      {
        id: 'claude-sonnet-4-20250514',
        name: 'Claude Sonnet 4',
        modelString: 'claude-sonnet-4-20250514',
        provider: 'anthropic',
        description: 'Balanced performance and cost',
        contextWindow: 200000,
        maxOutputTokens: 16000,
        supportsVision: true,
        supportsTools: true,
        tier: 'standard' as const,
      },
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        modelString: 'claude-3-5-sonnet-20241022',
        provider: 'anthropic',
        description: 'Fast and capable',
        contextWindow: 200000,
        maxOutputTokens: 8000,
        supportsVision: true,
        supportsTools: true,
        tier: 'standard' as const,
      },
      {
        id: 'claude-haiku-4-5-20251001',
        name: 'Claude Haiku 4.5',
        modelString: 'claude-haiku-4-5-20251001',
        provider: 'anthropic',
        description: 'Fastest Claude model',
        contextWindow: 200000,
        maxOutputTokens: 8000,
        supportsVision: true,
        supportsTools: true,
        tier: 'basic' as const,
      },
    ] satisfies ModelDefinition[];
    return models;
  }

  /**
   * Check if the provider supports a specific feature
   */
  supportsFeature(feature: string): boolean {
    const supportedFeatures = ['tools', 'text', 'vision', 'thinking'];
    return supportedFeatures.includes(feature);
  }
}
