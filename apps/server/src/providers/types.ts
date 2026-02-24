/**
 * Shared types for AI model providers
 *
 * Re-exports types from @protolabs-ai/types for consistency across the codebase.
 * All provider types are defined in @protolabs-ai/types to avoid duplication.
 */

// Re-export all provider types from @protolabs-ai/types
export type {
  ProviderConfig,
  ConversationMessage,
  ExecuteOptions,
  McpServerConfig,
  McpStdioServerConfig,
  McpSSEServerConfig,
  McpHttpServerConfig,
  ContentBlock,
  ProviderMessage,
  InstallationStatus,
  ValidationResult,
  ModelDefinition,
} from '@protolabs-ai/types';
