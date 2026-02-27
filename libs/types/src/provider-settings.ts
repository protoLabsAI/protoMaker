/**
 * Provider Settings - Claude-compatible API provider configuration
 *
 * Covers API key sourcing strategies, Claude-compatible provider types,
 * provider model definitions, and provider templates (including deprecated types).
 */

import type { ThinkingLevel } from './agent-settings.js';

// ============================================================================
// Claude-Compatible Providers - Configuration for Claude-compatible API endpoints
// ============================================================================

/**
 * ApiKeySource - Strategy for sourcing API keys
 *
 * - 'inline': API key stored directly in the profile (legacy/default behavior)
 * - 'env': Use ANTHROPIC_API_KEY environment variable
 * - 'credentials': Use the Anthropic key from Settings → API Keys (credentials.json)
 */
export type ApiKeySource = 'inline' | 'env' | 'credentials';

/**
 * ClaudeCompatibleProviderType - Type of Claude-compatible provider
 *
 * Used to determine provider-specific UI screens and default configurations.
 */
export type ClaudeCompatibleProviderType =
  | 'anthropic' // Direct Anthropic API (built-in)
  | 'glm' // z.AI GLM
  | 'minimax' // MiniMax
  | 'openrouter' // OpenRouter proxy
  | 'custom'; // User-defined custom provider

/**
 * ClaudeModelAlias - The three main Claude model aliases for mapping
 */
export type ClaudeModelAlias = 'haiku' | 'sonnet' | 'opus';

/**
 * ProviderModel - A model exposed by a Claude-compatible provider
 *
 * Each provider configuration can expose multiple models that will appear
 * in all model dropdowns throughout the app. Models map directly to a
 * Claude model (haiku, sonnet, opus) for bulk replace and display.
 */
export interface ProviderModel {
  /** Model ID sent to the API (e.g., "GLM-4.7", "MiniMax-M2.1") */
  id: string;
  /** Display name shown in UI (e.g., "GLM 4.7", "MiniMax M2.1") */
  displayName: string;
  /** Which Claude model this maps to (for bulk replace and display) */
  mapsToClaudeModel?: ClaudeModelAlias;
  /** Model capabilities */
  capabilities?: {
    /** Whether model supports vision/image inputs */
    supportsVision?: boolean;
    /** Whether model supports extended thinking */
    supportsThinking?: boolean;
    /** Maximum thinking level if thinking is supported */
    maxThinkingLevel?: ThinkingLevel;
  };
}

/**
 * ClaudeCompatibleProvider - Configuration for a Claude-compatible API endpoint
 *
 * Providers expose their models to all model dropdowns in the app.
 * Each provider has its own API configuration (endpoint, credentials, etc.)
 */
export interface ClaudeCompatibleProvider {
  /** Unique identifier (uuid) */
  id: string;
  /** Display name (e.g., "z.AI GLM (Work)", "MiniMax") */
  name: string;
  /** Provider type determines UI screen and default settings */
  providerType: ClaudeCompatibleProviderType;
  /** Whether this provider is enabled (models appear in dropdowns) */
  enabled?: boolean;

  // Connection settings
  /** ANTHROPIC_BASE_URL - custom API endpoint */
  baseUrl: string;
  /** API key sourcing strategy */
  apiKeySource: ApiKeySource;
  /** API key value (only required when apiKeySource = 'inline') */
  apiKey?: string;
  /** If true, use ANTHROPIC_AUTH_TOKEN instead of ANTHROPIC_API_KEY */
  useAuthToken?: boolean;
  /** API_TIMEOUT_MS override in milliseconds */
  timeoutMs?: number;
  /** Set CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 */
  disableNonessentialTraffic?: boolean;

  /** Models exposed by this provider (appear in all dropdowns) */
  models: ProviderModel[];

  /** Provider-specific settings for future extensibility */
  providerSettings?: Record<string, unknown>;
}

/**
 * ClaudeCompatibleProviderTemplate - Template for quick provider setup
 *
 * Contains pre-configured settings for known Claude-compatible providers.
 */
export interface ClaudeCompatibleProviderTemplate {
  /** Template identifier for matching */
  templateId: ClaudeCompatibleProviderType;
  /** Display name for the template */
  name: string;
  /** Provider type */
  providerType: ClaudeCompatibleProviderType;
  /** API base URL */
  baseUrl: string;
  /** Default API key source for this template */
  defaultApiKeySource: ApiKeySource;
  /** Use auth token instead of API key */
  useAuthToken: boolean;
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Disable non-essential traffic */
  disableNonessentialTraffic?: boolean;
  /** Description shown in UI */
  description: string;
  /** URL to get API key */
  apiKeyUrl?: string;
  /** Default models for this provider */
  defaultModels: ProviderModel[];
}

/** Predefined templates for known Claude-compatible providers */
export const CLAUDE_PROVIDER_TEMPLATES: ClaudeCompatibleProviderTemplate[] = [
  {
    templateId: 'anthropic',
    name: 'Direct Anthropic',
    providerType: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    defaultApiKeySource: 'credentials',
    useAuthToken: false,
    description: 'Standard Anthropic API with your API key',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
    defaultModels: [
      { id: 'claude-haiku', displayName: 'Claude Haiku', mapsToClaudeModel: 'haiku' },
      { id: 'claude-sonnet', displayName: 'Claude Sonnet', mapsToClaudeModel: 'sonnet' },
      { id: 'claude-opus', displayName: 'Claude Opus', mapsToClaudeModel: 'opus' },
    ],
  },
  {
    templateId: 'openrouter',
    name: 'OpenRouter',
    providerType: 'openrouter',
    baseUrl: 'https://openrouter.ai/api',
    defaultApiKeySource: 'inline',
    useAuthToken: true,
    description: 'Access Claude and 300+ models via OpenRouter',
    apiKeyUrl: 'https://openrouter.ai/keys',
    defaultModels: [
      // OpenRouter users manually add model IDs
      {
        id: 'anthropic/claude-3.5-haiku',
        displayName: 'Claude 3.5 Haiku',
        mapsToClaudeModel: 'haiku',
      },
      {
        id: 'anthropic/claude-3.5-sonnet',
        displayName: 'Claude 3.5 Sonnet',
        mapsToClaudeModel: 'sonnet',
      },
      { id: 'anthropic/claude-3-opus', displayName: 'Claude 3 Opus', mapsToClaudeModel: 'opus' },
    ],
  },
  {
    templateId: 'glm',
    name: 'z.AI GLM',
    providerType: 'glm',
    baseUrl: 'https://api.z.ai/api/anthropic',
    defaultApiKeySource: 'inline',
    useAuthToken: true,
    timeoutMs: 3000000,
    disableNonessentialTraffic: true,
    description: '3× usage at fraction of cost via GLM Coding Plan',
    apiKeyUrl: 'https://z.ai/manage-apikey/apikey-list',
    defaultModels: [
      { id: 'GLM-4.5-Air', displayName: 'GLM 4.5 Air', mapsToClaudeModel: 'haiku' },
      { id: 'GLM-4.7', displayName: 'GLM 4.7', mapsToClaudeModel: 'sonnet' },
      { id: 'GLM-4.7', displayName: 'GLM 4.7', mapsToClaudeModel: 'opus' },
    ],
  },
  {
    templateId: 'minimax',
    name: 'MiniMax',
    providerType: 'minimax',
    baseUrl: 'https://api.minimax.io/anthropic',
    defaultApiKeySource: 'inline',
    useAuthToken: true,
    timeoutMs: 3000000,
    disableNonessentialTraffic: true,
    description: 'MiniMax M2.1 coding model with extended context',
    apiKeyUrl: 'https://platform.minimax.io/user-center/basic-information/interface-key',
    defaultModels: [
      { id: 'MiniMax-M2.1', displayName: 'MiniMax M2.1', mapsToClaudeModel: 'haiku' },
      { id: 'MiniMax-M2.1', displayName: 'MiniMax M2.1', mapsToClaudeModel: 'sonnet' },
      { id: 'MiniMax-M2.1', displayName: 'MiniMax M2.1', mapsToClaudeModel: 'opus' },
    ],
  },
  {
    templateId: 'minimax',
    name: 'MiniMax (China)',
    providerType: 'minimax',
    baseUrl: 'https://api.minimaxi.com/anthropic',
    defaultApiKeySource: 'inline',
    useAuthToken: true,
    timeoutMs: 3000000,
    disableNonessentialTraffic: true,
    description: 'MiniMax M2.1 for users in China',
    apiKeyUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
    defaultModels: [
      { id: 'MiniMax-M2.1', displayName: 'MiniMax M2.1', mapsToClaudeModel: 'haiku' },
      { id: 'MiniMax-M2.1', displayName: 'MiniMax M2.1', mapsToClaudeModel: 'sonnet' },
      { id: 'MiniMax-M2.1', displayName: 'MiniMax M2.1', mapsToClaudeModel: 'opus' },
    ],
  },
];

// ============================================================================
// OpenAI-Compatible Providers - Configuration for OpenAI API-compatible endpoints
// ============================================================================

/**
 * OpenAICompatibleConfig - Configuration for an OpenAI-compatible API endpoint
 *
 * Providers expose their models via the standard OpenAI Chat Completions API.
 * Each config has its own baseUrl, apiKey, and models list.
 */
export interface OpenAICompatibleConfig {
  /** Unique identifier (uuid) */
  id: string;
  /** Display name (e.g., "Local Ollama", "LM Studio") */
  name: string;
  /** Whether this provider is enabled (models appear in dropdowns) */
  enabled?: boolean;

  // Connection settings
  /** Base URL for the OpenAI-compatible API endpoint */
  baseUrl: string;
  /** API key sourcing strategy */
  apiKeySource: ApiKeySource;
  /** API key value (only required when apiKeySource = 'inline') */
  apiKey?: string;
  /** API_TIMEOUT_MS override in milliseconds */
  timeoutMs?: number;

  /** Models exposed by this provider (appear in all dropdowns) */
  models: ProviderModel[];
}

/**
 * OpenAICompatibleTemplate - Template for quick provider setup
 *
 * Contains pre-configured settings for known OpenAI-compatible providers.
 */
export interface OpenAICompatibleTemplate {
  /** Template identifier */
  templateId: string;
  /** Display name for the template */
  name: string;
  /** Base URL for the API endpoint */
  baseUrl: string;
  /** Default API key source for this template */
  defaultApiKeySource: ApiKeySource;
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Description shown in UI */
  description: string;
  /** URL to get API key */
  apiKeyUrl?: string;
  /** Default models for this provider */
  defaultModels: ProviderModel[];
}

/** Predefined templates for known OpenAI-compatible providers */
export const OPENAI_COMPATIBLE_TEMPLATES: OpenAICompatibleTemplate[] = [
  {
    templateId: 'ollama',
    name: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
    defaultApiKeySource: 'inline',
    description: 'Run open-source LLMs locally with Ollama',
    defaultModels: [
      { id: 'llama3.2', displayName: 'Llama 3.2' },
      { id: 'mistral', displayName: 'Mistral' },
      { id: 'codellama', displayName: 'Code Llama' },
    ],
  },
  {
    templateId: 'lmstudio',
    name: 'LM Studio',
    baseUrl: 'http://localhost:1234/v1',
    defaultApiKeySource: 'inline',
    description: 'Run local LLMs with LM Studio',
    defaultModels: [{ id: 'local-model', displayName: 'Local Model' }],
  },
  {
    templateId: 'together',
    name: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    defaultApiKeySource: 'inline',
    description: 'Access 200+ open-source models via Together AI',
    apiKeyUrl: 'https://api.together.ai/settings/api-keys',
    defaultModels: [
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', displayName: 'Llama 3.3 70B Turbo' },
      { id: 'mistralai/Mixtral-8x7B-Instruct-v0.1', displayName: 'Mixtral 8x7B' },
    ],
  },
];

// ============================================================================
// Deprecated Claude API Profiles (kept for migration)
// ============================================================================

/**
 * ClaudeApiProfile - Configuration for a Claude-compatible API endpoint
 *
 * @deprecated Use ClaudeCompatibleProvider instead. This type is kept for
 * backward compatibility during migration.
 */
export interface ClaudeApiProfile {
  /** Unique identifier (uuid) */
  id: string;
  /** Display name (e.g., "z.AI GLM", "AWS Bedrock") */
  name: string;
  /** ANTHROPIC_BASE_URL - custom API endpoint */
  baseUrl: string;
  /**
   * API key sourcing strategy (default: 'inline' for backwards compatibility)
   * - 'inline': Use apiKey field value
   * - 'env': Use ANTHROPIC_API_KEY environment variable
   * - 'credentials': Use the Anthropic key from credentials.json
   */
  apiKeySource?: ApiKeySource;
  /** API key value (only required when apiKeySource = 'inline' or undefined) */
  apiKey?: string;
  /** If true, use ANTHROPIC_AUTH_TOKEN instead of ANTHROPIC_API_KEY */
  useAuthToken?: boolean;
  /** API_TIMEOUT_MS override in milliseconds */
  timeoutMs?: number;
  /** Optional model name mappings (deprecated - use ClaudeCompatibleProvider.models instead) */
  modelMappings?: {
    /** Maps to ANTHROPIC_DEFAULT_HAIKU_MODEL */
    haiku?: string;
    /** Maps to ANTHROPIC_DEFAULT_SONNET_MODEL */
    sonnet?: string;
    /** Maps to ANTHROPIC_DEFAULT_OPUS_MODEL */
    opus?: string;
  };
  /** Set CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 */
  disableNonessentialTraffic?: boolean;
}

/**
 * @deprecated Use ClaudeCompatibleProviderTemplate instead
 */
export interface ClaudeApiProfileTemplate {
  name: string;
  baseUrl: string;
  defaultApiKeySource?: ApiKeySource;
  useAuthToken: boolean;
  timeoutMs?: number;
  modelMappings?: ClaudeApiProfile['modelMappings'];
  disableNonessentialTraffic?: boolean;
  description: string;
  apiKeyUrl?: string;
}

/**
 * @deprecated Use CLAUDE_PROVIDER_TEMPLATES instead
 */
export const CLAUDE_API_PROFILE_TEMPLATES: ClaudeApiProfileTemplate[] = [
  {
    name: 'Direct Anthropic',
    baseUrl: 'https://api.anthropic.com',
    defaultApiKeySource: 'credentials',
    useAuthToken: false,
    description: 'Standard Anthropic API with your API key',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api',
    defaultApiKeySource: 'inline',
    useAuthToken: true,
    description: 'Access Claude and 300+ models via OpenRouter',
    apiKeyUrl: 'https://openrouter.ai/keys',
  },
  {
    name: 'z.AI GLM',
    baseUrl: 'https://api.z.ai/api/anthropic',
    defaultApiKeySource: 'inline',
    useAuthToken: true,
    timeoutMs: 3000000,
    modelMappings: {
      haiku: 'GLM-4.5-Air',
      sonnet: 'GLM-4.7',
      opus: 'GLM-4.7',
    },
    disableNonessentialTraffic: true,
    description: '3× usage at fraction of cost via GLM Coding Plan',
    apiKeyUrl: 'https://z.ai/manage-apikey/apikey-list',
  },
  {
    name: 'MiniMax',
    baseUrl: 'https://api.minimax.io/anthropic',
    defaultApiKeySource: 'inline',
    useAuthToken: true,
    timeoutMs: 3000000,
    modelMappings: {
      haiku: 'MiniMax-M2.1',
      sonnet: 'MiniMax-M2.1',
      opus: 'MiniMax-M2.1',
    },
    disableNonessentialTraffic: true,
    description: 'MiniMax M2.1 coding model with extended context',
    apiKeyUrl: 'https://platform.minimax.io/user-center/basic-information/interface-key',
  },
  {
    name: 'MiniMax (China)',
    baseUrl: 'https://api.minimaxi.com/anthropic',
    defaultApiKeySource: 'inline',
    useAuthToken: true,
    timeoutMs: 3000000,
    modelMappings: {
      haiku: 'MiniMax-M2.1',
      sonnet: 'MiniMax-M2.1',
      opus: 'MiniMax-M2.1',
    },
    disableNonessentialTraffic: true,
    description: 'MiniMax M2.1 for users in China',
    apiKeyUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
  },
];

// ============================================================================
// MCP Server Configuration - Model Context Protocol server definitions
// ============================================================================

/**
 * MCPToolInfo - Information about a tool provided by an MCP server
 *
 * Contains the tool's name, description, and whether it's enabled for use.
 */
export interface MCPToolInfo {
  /** Tool name as exposed by the MCP server */
  name: string;
  /** Description of what the tool does */
  description?: string;
  /** JSON Schema for the tool's input parameters */
  inputSchema?: Record<string, unknown>;
  /** Whether this tool is enabled for use (defaults to true) */
  enabled: boolean;
}

/**
 * MCPServerConfig - Configuration for an MCP (Model Context Protocol) server
 *
 * MCP servers provide additional tools and capabilities to AI agents.
 * Supports stdio (subprocess), SSE, and HTTP transport types.
 */
export interface MCPServerConfig {
  /** Unique identifier for the server config */
  id: string;
  /** Display name for the server */
  name: string;
  /** User-friendly description of what this server provides */
  description?: string;
  /** Transport type: stdio (default), sse, or http */
  type?: 'stdio' | 'sse' | 'http';
  /** For stdio: command to execute (e.g., 'node', 'python', 'npx') */
  command?: string;
  /** For stdio: arguments to pass to the command */
  args?: string[];
  /** For stdio: environment variables to set */
  env?: Record<string, string>;
  /** For sse/http: URL endpoint */
  url?: string;
  /** For sse/http: headers to include in requests */
  headers?: Record<string, string>;
  /** Whether this server is enabled */
  enabled?: boolean;
  /** Tools discovered from this server with their enabled states */
  tools?: MCPToolInfo[];
  /** Timestamp when tools were last fetched */
  toolsLastFetched?: string;
}
