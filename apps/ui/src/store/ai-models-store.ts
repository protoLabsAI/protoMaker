/**
 * AI Models Store - State management for all model-related configuration
 *
 * Manages:
 * - Phase models and enhancement/validation model selection
 * - Cursor, Codex, and OpenCode CLI model settings
 * - Claude-compatible providers and API profiles
 * - API keys and usage tracking
 * - Provider visibility settings
 */

import { create } from 'zustand';
import { createLogger } from '@automaker/utils/logger';
import { getElectronAPI } from '@/lib/electron';
import type {
  ModelAlias,
  PlanningMode,
  ModelProvider,
  CursorModelId,
  CodexModelId,
  OpencodeModelId,
  PhaseModelConfig,
  PhaseModelKey,
  PhaseModelEntry,
  ModelDefinition,
  ClaudeApiProfile,
  ClaudeCompatibleProvider,
} from '@automaker/types';
import {
  getAllCursorModelIds,
  getAllCodexModelIds,
  getAllOpencodeModelIds,
  DEFAULT_PHASE_MODELS,
  DEFAULT_OPENCODE_MODEL,
} from '@automaker/types';

const logger = createLogger('AiModelsStore');
const OPENCODE_BEDROCK_PROVIDER_ID = 'amazon-bedrock';
const OPENCODE_BEDROCK_MODEL_PREFIX = `${OPENCODE_BEDROCK_PROVIDER_ID}/`;

// ============================================================================
// Types
// ============================================================================

export interface ApiKeys {
  anthropic: string;
  google: string;
  openai: string;
}

// Claude Usage interface matching the server response
export type ClaudeUsage = {
  sessionTokensUsed: number;
  sessionLimit: number;
  sessionPercentage: number;
  sessionResetTime: string;
  sessionResetText: string;

  weeklyTokensUsed: number;
  weeklyLimit: number;
  weeklyPercentage: number;
  weeklyResetTime: string;
  weeklyResetText: string;

  sonnetWeeklyTokensUsed: number;
  sonnetWeeklyPercentage: number;
  sonnetResetText: string;

  costUsed: number | null;
  costLimit: number | null;
  costCurrency: string | null;

  lastUpdated: string;
  userTimezone: string;
};

// Response type for Claude usage API (can be success or error)
export type ClaudeUsageResponse = ClaudeUsage | { error: string; message?: string };

// Codex Usage types
export type CodexPlanType =
  | 'free'
  | 'plus'
  | 'pro'
  | 'team'
  | 'business'
  | 'enterprise'
  | 'edu'
  | 'unknown';

export interface CodexRateLimitWindow {
  limit: number;
  used: number;
  remaining: number;
  usedPercent: number; // Percentage used (0-100)
  windowDurationMins: number; // Duration in minutes
  resetsAt: number; // Unix timestamp in seconds
}

export interface CodexUsage {
  rateLimits: {
    primary?: CodexRateLimitWindow;
    secondary?: CodexRateLimitWindow;
    planType?: CodexPlanType;
  } | null;
  lastUpdated: string;
}

// Response type for Codex usage API (can be success or error)
export type CodexUsageResponse = CodexUsage | { error: string; message?: string };

/**
 * Check if Claude usage is at its limit (any of: session >= 100%, weekly >= 100%, OR cost >= limit)
 * Returns true if any limit is reached, meaning auto mode should pause feature pickup.
 */
export function isClaudeUsageAtLimit(claudeUsage: ClaudeUsage | null): boolean {
  if (!claudeUsage) {
    // No usage data available - don't block
    return false;
  }

  // Check session limit (5-hour window)
  if (claudeUsage.sessionPercentage >= 100) {
    return true;
  }

  // Check weekly limit
  if (claudeUsage.weeklyPercentage >= 100) {
    return true;
  }

  // Check cost limit (if configured)
  if (
    claudeUsage.costLimit !== null &&
    claudeUsage.costLimit > 0 &&
    claudeUsage.costUsed !== null &&
    claudeUsage.costUsed >= claudeUsage.costLimit
  ) {
    return true;
  }

  return false;
}

// ============================================================================
// State Interface
// ============================================================================

interface AiModelsStoreState {
  // API Keys
  apiKeys: ApiKeys;

  // Enhancement Model Settings
  enhancementModel: ModelAlias; // Model used for feature enhancement (default: sonnet)

  // Validation Model Settings
  validationModel: ModelAlias; // Model used for GitHub issue validation (default: opus)

  // Phase Model Settings - per-phase AI model configuration
  phaseModels: PhaseModelConfig;
  favoriteModels: string[];

  // Default Planning Settings
  defaultPlanningMode: PlanningMode;
  defaultRequirePlanApproval: boolean;
  defaultFeatureModel: PhaseModelEntry;

  // Cursor CLI Settings (global)
  enabledCursorModels: CursorModelId[]; // Which Cursor models are available in feature modal
  cursorDefaultModel: CursorModelId; // Default Cursor model selection

  // Codex CLI Settings (global)
  enabledCodexModels: CodexModelId[]; // Which Codex models are available in feature modal
  codexDefaultModel: CodexModelId; // Default Codex model selection
  codexAutoLoadAgents: boolean; // Auto-load .codex/AGENTS.md files
  codexSandboxMode: 'read-only' | 'workspace-write' | 'danger-full-access'; // Sandbox policy
  codexApprovalPolicy: 'untrusted' | 'on-failure' | 'on-request' | 'never'; // Approval policy
  codexEnableWebSearch: boolean; // Enable web search capability
  codexEnableImages: boolean; // Enable image processing

  // OpenCode CLI Settings (global)
  // Static OpenCode settings are persisted via SETTINGS_FIELDS_TO_SYNC
  enabledOpencodeModels: OpencodeModelId[]; // Which static OpenCode models are available
  opencodeDefaultModel: OpencodeModelId; // Default OpenCode model selection
  // Dynamic models are session-only (not persisted) because they're discovered at runtime
  // from `opencode models` CLI and depend on current provider authentication state
  dynamicOpencodeModels: ModelDefinition[]; // Dynamically discovered models from OpenCode CLI
  enabledDynamicModelIds: string[]; // Which dynamic models are enabled
  cachedOpencodeProviders: Array<{
    id: string;
    name: string;
    authenticated: boolean;
    authMethod?: string;
  }>; // Cached providers
  opencodeModelsLoading: boolean; // Whether OpenCode models are being fetched
  opencodeModelsError: string | null; // Error message if fetch failed
  opencodeModelsLastFetched: number | null; // Timestamp of last successful fetch
  opencodeModelsLastFailedAt: number | null; // Timestamp of last failed fetch

  // Provider Visibility Settings
  disabledProviders: ModelProvider[]; // Providers that are disabled and hidden from dropdowns

  // Claude-Compatible Providers (new system)
  claudeCompatibleProviders: ClaudeCompatibleProvider[]; // Providers that expose models to dropdowns

  // Claude API Profiles (deprecated - kept for backward compatibility)
  claudeApiProfiles: ClaudeApiProfile[]; // Claude-compatible API endpoint profiles
  activeClaudeApiProfileId: string | null; // Active profile ID (null = use direct Anthropic API)

  // Claude Usage Tracking
  claudeRefreshInterval: number; // Refresh interval in seconds (default: 60)
  claudeUsage: ClaudeUsage | null;
  claudeUsageLastUpdated: number | null;

  // Codex Usage Tracking
  codexUsage: CodexUsage | null;
  codexUsageLastUpdated: number | null;

  // Codex Models (dynamically fetched)
  codexModels: Array<{
    id: string;
    label: string;
    description: string;
    hasThinking: boolean;
    supportsVision: boolean;
    tier: 'premium' | 'standard' | 'basic';
    isDefault: boolean;
  }>;
  codexModelsLoading: boolean;
  codexModelsError: string | null;
  codexModelsLastFetched: number | null;
  codexModelsLastFailedAt: number | null;
}

// ============================================================================
// Actions Interface
// ============================================================================

interface AiModelsActions {
  // Enhancement Model actions
  setEnhancementModel: (model: ModelAlias) => void;

  // Validation Model actions
  setValidationModel: (model: ModelAlias) => void;

  // Phase Model actions
  setPhaseModel: (phase: PhaseModelKey, entry: PhaseModelEntry) => Promise<void>;
  setPhaseModels: (models: Partial<PhaseModelConfig>) => Promise<void>;
  resetPhaseModels: () => Promise<void>;
  toggleFavoriteModel: (modelId: string) => void;

  // Default Planning actions
  setDefaultPlanningMode: (mode: PlanningMode) => void;
  setDefaultRequirePlanApproval: (require: boolean) => void;
  setDefaultFeatureModel: (entry: PhaseModelEntry) => void;

  // Cursor CLI Settings actions
  setEnabledCursorModels: (models: CursorModelId[]) => void;
  setCursorDefaultModel: (model: CursorModelId) => void;
  toggleCursorModel: (model: CursorModelId, enabled: boolean) => void;

  // Codex CLI Settings actions
  setEnabledCodexModels: (models: CodexModelId[]) => void;
  setCodexDefaultModel: (model: CodexModelId) => void;
  toggleCodexModel: (model: CodexModelId, enabled: boolean) => void;
  setCodexAutoLoadAgents: (enabled: boolean) => Promise<void>;
  setCodexSandboxMode: (
    mode: 'read-only' | 'workspace-write' | 'danger-full-access'
  ) => Promise<void>;
  setCodexApprovalPolicy: (
    policy: 'untrusted' | 'on-failure' | 'on-request' | 'never'
  ) => Promise<void>;
  setCodexEnableWebSearch: (enabled: boolean) => Promise<void>;
  setCodexEnableImages: (enabled: boolean) => Promise<void>;

  // OpenCode CLI Settings actions
  setEnabledOpencodeModels: (models: OpencodeModelId[]) => void;
  setOpencodeDefaultModel: (model: OpencodeModelId) => void;
  toggleOpencodeModel: (model: OpencodeModelId, enabled: boolean) => void;
  setDynamicOpencodeModels: (models: ModelDefinition[]) => void;
  setEnabledDynamicModelIds: (ids: string[]) => void;
  toggleDynamicModel: (modelId: string, enabled: boolean) => void;
  setCachedOpencodeProviders: (
    providers: Array<{ id: string; name: string; authenticated: boolean; authMethod?: string }>
  ) => void;

  // Provider Visibility Settings actions
  setDisabledProviders: (providers: ModelProvider[]) => void;
  toggleProviderDisabled: (provider: ModelProvider, disabled: boolean) => void;
  isProviderDisabled: (provider: ModelProvider) => boolean;

  // Claude-Compatible Provider actions (new system)
  addClaudeCompatibleProvider: (provider: ClaudeCompatibleProvider) => Promise<void>;
  updateClaudeCompatibleProvider: (
    id: string,
    updates: Partial<ClaudeCompatibleProvider>
  ) => Promise<void>;
  deleteClaudeCompatibleProvider: (id: string) => Promise<void>;
  setClaudeCompatibleProviders: (providers: ClaudeCompatibleProvider[]) => Promise<void>;
  toggleClaudeCompatibleProviderEnabled: (id: string) => Promise<void>;

  // Claude API Profile actions (deprecated - kept for backward compatibility)
  addClaudeApiProfile: (profile: ClaudeApiProfile) => Promise<void>;
  updateClaudeApiProfile: (id: string, updates: Partial<ClaudeApiProfile>) => Promise<void>;
  deleteClaudeApiProfile: (id: string) => Promise<void>;
  setActiveClaudeApiProfile: (id: string | null) => Promise<void>;
  setClaudeApiProfiles: (profiles: ClaudeApiProfile[]) => Promise<void>;

  // Claude Usage Tracking actions
  setClaudeRefreshInterval: (interval: number) => void;
  setClaudeUsageLastUpdated: (timestamp: number) => void;
  setClaudeUsage: (usage: ClaudeUsage | null) => void;

  // Codex Usage Tracking actions
  setCodexUsage: (usage: CodexUsage | null) => void;

  // Codex Models actions
  fetchCodexModels: (forceRefresh?: boolean) => Promise<void>;
  setCodexModels: (
    models: Array<{
      id: string;
      label: string;
      description: string;
      hasThinking: boolean;
      supportsVision: boolean;
      tier: 'premium' | 'standard' | 'basic';
      isDefault: boolean;
    }>
  ) => void;

  // OpenCode Models actions
  fetchOpencodeModels: (forceRefresh?: boolean) => Promise<void>;

  // API Keys actions
  setApiKeys: (keys: ApiKeys) => void;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: AiModelsStoreState = {
  apiKeys: {
    anthropic: '',
    google: '',
    openai: '',
  },

  enhancementModel: 'sonnet' as ModelAlias,
  validationModel: 'opus' as ModelAlias,

  phaseModels: DEFAULT_PHASE_MODELS,
  favoriteModels: [],

  defaultPlanningMode: 'spec' as PlanningMode,
  defaultRequirePlanApproval: false,
  defaultFeatureModel: DEFAULT_PHASE_MODELS.featureGenerationModel,

  enabledCursorModels: getAllCursorModelIds(),
  cursorDefaultModel: 'claude-3-5-sonnet' as CursorModelId,

  enabledCodexModels: getAllCodexModelIds(),
  codexDefaultModel: 'claude-3-5-sonnet' as CodexModelId,
  codexAutoLoadAgents: false,
  codexSandboxMode: 'read-only',
  codexApprovalPolicy: 'on-failure',
  codexEnableWebSearch: false,
  codexEnableImages: false,

  enabledOpencodeModels: getAllOpencodeModelIds(),
  opencodeDefaultModel: DEFAULT_OPENCODE_MODEL,
  dynamicOpencodeModels: [],
  enabledDynamicModelIds: [],
  cachedOpencodeProviders: [],
  opencodeModelsLoading: false,
  opencodeModelsError: null,
  opencodeModelsLastFetched: null,
  opencodeModelsLastFailedAt: null,

  disabledProviders: [],

  claudeCompatibleProviders: [],
  claudeApiProfiles: [],
  activeClaudeApiProfileId: null,

  claudeRefreshInterval: 60,
  claudeUsage: null,
  claudeUsageLastUpdated: null,

  codexUsage: null,
  codexUsageLastUpdated: null,

  codexModels: [],
  codexModelsLoading: false,
  codexModelsError: null,
  codexModelsLastFetched: null,
  codexModelsLastFailedAt: null,
};

// ============================================================================
// Store
// ============================================================================

export const useAiModelsStore = create<AiModelsStoreState & AiModelsActions>((set, get) => ({
  ...initialState,

  // Enhancement Model actions
  setEnhancementModel: (model) => set({ enhancementModel: model }),

  // Validation Model actions
  setValidationModel: (model) => set({ validationModel: model }),

  // Phase Model actions
  setPhaseModel: async (phase, entry) => {
    set((state) => ({
      phaseModels: {
        ...state.phaseModels,
        [phase]: entry,
      },
    }));
    // Sync to server settings file
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },

  setPhaseModels: async (models) => {
    set((state) => ({
      phaseModels: {
        ...state.phaseModels,
        ...models,
      },
    }));
    // Sync to server settings file
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },

  resetPhaseModels: async () => {
    set({ phaseModels: DEFAULT_PHASE_MODELS });
    // Sync to server settings file
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },

  toggleFavoriteModel: (modelId) => {
    const current = get().favoriteModels;
    if (current.includes(modelId)) {
      set({ favoriteModels: current.filter((id) => id !== modelId) });
    } else {
      set({ favoriteModels: [...current, modelId] });
    }
  },

  // Default Planning actions
  setDefaultPlanningMode: (mode) => set({ defaultPlanningMode: mode }),
  setDefaultRequirePlanApproval: (require) => set({ defaultRequirePlanApproval: require }),
  setDefaultFeatureModel: (entry) => set({ defaultFeatureModel: entry }),

  // Cursor CLI Settings actions
  setEnabledCursorModels: (models) => set({ enabledCursorModels: models }),
  setCursorDefaultModel: (model) => set({ cursorDefaultModel: model }),
  toggleCursorModel: (model, enabled) =>
    set((state) => ({
      enabledCursorModels: enabled
        ? [...state.enabledCursorModels, model]
        : state.enabledCursorModels.filter((m) => m !== model),
    })),

  // Codex CLI Settings actions
  setEnabledCodexModels: (models) => set({ enabledCodexModels: models }),
  setCodexDefaultModel: (model) => set({ codexDefaultModel: model }),
  toggleCodexModel: (model, enabled) =>
    set((state) => ({
      enabledCodexModels: enabled
        ? [...state.enabledCodexModels, model]
        : state.enabledCodexModels.filter((m) => m !== model),
    })),

  setCodexAutoLoadAgents: async (enabled) => {
    set({ codexAutoLoadAgents: enabled });
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },

  setCodexSandboxMode: async (mode) => {
    set({ codexSandboxMode: mode });
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },

  setCodexApprovalPolicy: async (policy) => {
    set({ codexApprovalPolicy: policy });
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },

  setCodexEnableWebSearch: async (enabled) => {
    set({ codexEnableWebSearch: enabled });
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },

  setCodexEnableImages: async (enabled) => {
    set({ codexEnableImages: enabled });
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },

  // OpenCode CLI Settings actions
  setEnabledOpencodeModels: (models) => set({ enabledOpencodeModels: models }),
  setOpencodeDefaultModel: (model) => set({ opencodeDefaultModel: model }),
  toggleOpencodeModel: (model, enabled) =>
    set((state) => ({
      enabledOpencodeModels: enabled
        ? [...state.enabledOpencodeModels, model]
        : state.enabledOpencodeModels.filter((m) => m !== model),
    })),

  setDynamicOpencodeModels: (models) => {
    // Dynamic models depend on CLI authentication state and are re-discovered each session.
    // Persist enabled model IDs, but do not auto-enable new models.
    const filteredModels = models.filter(
      (model) =>
        model.provider !== OPENCODE_BEDROCK_PROVIDER_ID &&
        !model.id.startsWith(OPENCODE_BEDROCK_MODEL_PREFIX)
    );
    const currentEnabled = get().enabledDynamicModelIds;
    const newModelIds = filteredModels.map((m) => m.id);
    const filteredEnabled = currentEnabled.filter((modelId) => newModelIds.includes(modelId));

    const nextEnabled = currentEnabled.length === 0 ? [] : filteredEnabled;
    set({ dynamicOpencodeModels: filteredModels, enabledDynamicModelIds: nextEnabled });
  },

  setEnabledDynamicModelIds: (ids) => set({ enabledDynamicModelIds: ids }),

  toggleDynamicModel: (modelId, enabled) =>
    set((state) => ({
      enabledDynamicModelIds: enabled
        ? [...state.enabledDynamicModelIds, modelId]
        : state.enabledDynamicModelIds.filter((id) => id !== modelId),
    })),

  setCachedOpencodeProviders: (providers) =>
    set({
      cachedOpencodeProviders: providers.filter(
        (provider) => provider.id !== OPENCODE_BEDROCK_PROVIDER_ID
      ),
    }),

  // Provider Visibility Settings actions
  setDisabledProviders: (providers) => set({ disabledProviders: providers }),

  toggleProviderDisabled: (provider, disabled) =>
    set((state) => ({
      disabledProviders: disabled
        ? [...state.disabledProviders, provider]
        : state.disabledProviders.filter((p) => p !== provider),
    })),

  isProviderDisabled: (provider) => get().disabledProviders.includes(provider),

  // Claude-Compatible Provider actions (new system)
  addClaudeCompatibleProvider: async (provider) => {
    set({ claudeCompatibleProviders: [...get().claudeCompatibleProviders, provider] });
    // Sync immediately to persist provider
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },

  updateClaudeCompatibleProvider: async (id, updates) => {
    set({
      claudeCompatibleProviders: get().claudeCompatibleProviders.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      ),
    });
    // Sync immediately to persist changes
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },

  deleteClaudeCompatibleProvider: async (id) => {
    set({
      claudeCompatibleProviders: get().claudeCompatibleProviders.filter((p) => p.id !== id),
    });
    // Sync immediately to persist deletion
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },

  setClaudeCompatibleProviders: async (providers) => {
    set({ claudeCompatibleProviders: providers });
    // Sync immediately to persist providers
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },

  toggleClaudeCompatibleProviderEnabled: async (id) => {
    set({
      claudeCompatibleProviders: get().claudeCompatibleProviders.map((p) =>
        p.id === id ? { ...p, enabled: p.enabled === false ? true : false } : p
      ),
    });
    // Sync immediately to persist change
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },

  // Claude API Profile actions (deprecated - kept for backward compatibility)
  addClaudeApiProfile: async (profile) => {
    set({ claudeApiProfiles: [...get().claudeApiProfiles, profile] });
    // Sync immediately to persist profile
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },

  updateClaudeApiProfile: async (id, updates) => {
    set({
      claudeApiProfiles: get().claudeApiProfiles.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      ),
    });
    // Sync immediately to persist changes
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },

  deleteClaudeApiProfile: async (id) => {
    const currentActiveId = get().activeClaudeApiProfileId;

    // Update state: remove profile and clear references
    set({
      claudeApiProfiles: get().claudeApiProfiles.filter((p) => p.id !== id),
      // Clear global active if the deleted profile was active
      activeClaudeApiProfileId: currentActiveId === id ? null : currentActiveId,
    });

    // Sync global settings to persist deletion
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },

  setActiveClaudeApiProfile: async (id) => {
    set({ activeClaudeApiProfileId: id });
    // Sync immediately to persist active profile change
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },

  setClaudeApiProfiles: async (profiles) => {
    set({ claudeApiProfiles: profiles });
    // Sync immediately to persist profiles
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },

  // Claude Usage Tracking actions
  setClaudeRefreshInterval: (interval: number) => set({ claudeRefreshInterval: interval }),
  setClaudeUsageLastUpdated: (timestamp: number) => set({ claudeUsageLastUpdated: timestamp }),
  setClaudeUsage: (usage: ClaudeUsage | null) =>
    set({
      claudeUsage: usage,
      claudeUsageLastUpdated: usage ? Date.now() : null,
    }),

  // Codex Usage Tracking actions
  setCodexUsage: (usage: CodexUsage | null) =>
    set({
      codexUsage: usage,
      codexUsageLastUpdated: usage ? Date.now() : null,
    }),

  // Codex Models actions
  fetchCodexModels: async (forceRefresh = false) => {
    const FAILURE_COOLDOWN_MS = 30 * 1000; // 30 seconds
    const SUCCESS_CACHE_MS = 5 * 60 * 1000; // 5 minutes

    const { codexModelsLastFetched, codexModelsLoading, codexModelsLastFailedAt } = get();

    // Skip if already loading
    if (codexModelsLoading) return;

    // Skip if recently failed and not forcing refresh
    if (
      !forceRefresh &&
      codexModelsLastFailedAt &&
      Date.now() - codexModelsLastFailedAt < FAILURE_COOLDOWN_MS
    ) {
      return;
    }

    // Skip if recently fetched successfully and not forcing refresh
    if (
      !forceRefresh &&
      codexModelsLastFetched &&
      Date.now() - codexModelsLastFetched < SUCCESS_CACHE_MS
    ) {
      return;
    }

    set({ codexModelsLoading: true, codexModelsError: null });

    try {
      const api = getElectronAPI();
      if (!api.codex) {
        throw new Error('Codex API not available');
      }

      const result = await api.codex.getModels(forceRefresh);

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch Codex models');
      }

      set({
        codexModels: result.models || [],
        codexModelsLastFetched: Date.now(),
        codexModelsLoading: false,
        codexModelsError: null,
        codexModelsLastFailedAt: null, // Clear failure on success
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      set({
        codexModelsError: errorMessage,
        codexModelsLoading: false,
        codexModelsLastFailedAt: Date.now(), // Record failure time for cooldown
      });
    }
  },

  setCodexModels: (models) =>
    set({
      codexModels: models,
      codexModelsLastFetched: Date.now(),
    }),

  // OpenCode Models actions
  fetchOpencodeModels: async (forceRefresh = false) => {
    const FAILURE_COOLDOWN_MS = 30 * 1000; // 30 seconds
    const SUCCESS_CACHE_MS = 5 * 60 * 1000; // 5 minutes

    const { opencodeModelsLastFetched, opencodeModelsLoading, opencodeModelsLastFailedAt } = get();

    // Skip if already loading
    if (opencodeModelsLoading) return;

    // Skip if recently failed and not forcing refresh
    if (
      !forceRefresh &&
      opencodeModelsLastFailedAt &&
      Date.now() - opencodeModelsLastFailedAt < FAILURE_COOLDOWN_MS
    ) {
      return;
    }

    // Skip if recently fetched successfully and not forcing refresh
    if (
      !forceRefresh &&
      opencodeModelsLastFetched &&
      Date.now() - opencodeModelsLastFetched < SUCCESS_CACHE_MS
    ) {
      return;
    }

    set({ opencodeModelsLoading: true, opencodeModelsError: null });

    try {
      const api = getElectronAPI() as Record<string, any>;
      if (!api.opencode) {
        throw new Error('OpenCode API not available');
      }

      const result = await api.opencode.getModels(forceRefresh);

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch OpenCode models');
      }

      // Call setDynamicOpencodeModels which filters Bedrock models and handles enabled state
      get().setDynamicOpencodeModels(result.models || []);

      set({
        opencodeModelsLastFetched: Date.now(),
        opencodeModelsLoading: false,
        opencodeModelsError: null,
        opencodeModelsLastFailedAt: null, // Clear failure on success
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      set({
        opencodeModelsError: errorMessage,
        opencodeModelsLoading: false,
        opencodeModelsLastFailedAt: Date.now(), // Record failure time for cooldown
      });
    }
  },

  // API Keys actions
  setApiKeys: (keys) => set({ apiKeys: keys }),
}));
