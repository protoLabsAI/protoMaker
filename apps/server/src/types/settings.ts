/**
 * Settings Types - Re-exported from @protolabsai/types
 *
 * This file now re-exports settings types from the shared @protolabsai/types package
 * to maintain backward compatibility with existing imports in the server codebase.
 */

export type {
  ThemeMode,
  ModelAlias,
  PlanningMode,
  ThinkingLevel,
  ModelProvider,
  KeyboardShortcuts,
  ProjectRef,
  TrashedProjectRef,
  ChatSessionRef,
  GlobalSettings,
  Credentials,
  BoardBackgroundSettings,
  WorktreeInfo,
  ProjectSettings,
  PhaseModelConfig,
  PhaseModelKey,
  PhaseModelEntry,
  // Claude-compatible provider types
  ApiKeySource,
  ClaudeCompatibleProviderType,
  ClaudeModelAlias,
  ProviderModel,
  ClaudeCompatibleProvider,
  ClaudeCompatibleProviderTemplate,
  // OpenAI-compatible provider types
  OpenAICompatibleConfig,
  OpenAICompatibleTemplate,
  // Legacy profile types (deprecated)
  ClaudeApiProfile,
  ClaudeApiProfileTemplate,
  // Trust boundary types
  TrustBoundaryConfig,
  PRDCategory,
  PRDComplexity,
  AutoApproveRule,
  RequireReviewRule,
} from '@protolabsai/types';

export {
  DEFAULT_KEYBOARD_SHORTCUTS,
  DEFAULT_GLOBAL_SETTINGS,
  DEFAULT_CREDENTIALS,
  DEFAULT_PROJECT_SETTINGS,
  DEFAULT_PHASE_MODELS,
  DEFAULT_TRUST_BOUNDARY_CONFIG,
  SETTINGS_VERSION,
  CREDENTIALS_VERSION,
  PROJECT_SETTINGS_VERSION,
  OPENAI_COMPATIBLE_TEMPLATES,
} from '@protolabsai/types';
