import { create } from 'zustand';
import type {
  ModelAlias,
  ModelProvider,
  CursorModelId,
  CodexModelId,
  OpencodeModelId,
  PhaseModelConfig,
  PhaseModelKey,
  PhaseModelEntry,
  ModelDefinition,
  ClaudeCompatibleProvider,
  ClaudeApiProfile,
} from '@automaker/types';
import {
  getAllCursorModelIds,
  getAllCodexModelIds,
  getAllOpencodeModelIds,
  DEFAULT_PHASE_MODELS,
  DEFAULT_OPENCODE_MODEL,
} from '@automaker/types';
import { getElectronAPI } from '@/lib/electron';
import { createLogger } from '@automaker/utils/logger';
import type { ClaudeUsage, CodexUsage } from './types';

const logger = createLogger('AIModelsStore');
const OPENCODE_BEDROCK_PROVIDER_ID = 'amazon-bedrock';
const OPENCODE_BEDROCK_MODEL_PREFIX = `${OPENCODE_BEDROCK_PROVIDER_ID}/`;

interface AIModelsState {
  // Enhancement Model Settings
  enhancementModel: ModelAlias;
  // Validation Model Settings
  validationModel: ModelAlias;
  // Phase Model Settings
  phaseModels: PhaseModelConfig;
  favoriteModels: string[];
  // Cursor CLI Settings
  enabledCursorModels: CursorModelId[];
  cursorDefaultModel: CursorModelId;
  // Codex CLI Settings
  enabledCodexModels: CodexModelId[];
  codexDefaultModel: CodexModelId;
  codexAutoLoadAgents: boolean;
  codexSandboxMode: 'read-only' | 'workspace-write' | 'danger-full-access';
  codexApprovalPolicy: 'untrusted' | 'on-failure' | 'on-request' | 'never';
  codexEnableWebSearch: boolean;
  codexEnableImages: boolean;
  // OpenCode CLI Settings
  enabledOpencodeModels: OpencodeModelId[];
  opencodeDefaultModel: OpencodeModelId;
  dynamicOpencodeModels: ModelDefinition[];
  enabledDynamicModelIds: string[];
  cachedOpencodeProviders: Array<{
    id: string;
    name: string;
    authenticated: boolean;
    authMethod?: string;
  }>;
  opencodeModelsLoading: boolean;
  opencodeModelsError: string | null;
  opencodeModelsLastFetched: number | null;
  opencodeModelsLastFailedAt: number | null;
  // Provider Visibility Settings
  disabledProviders: ModelProvider[];
  // Claude Agent SDK Settings
  autoLoadClaudeMd: boolean;
  skipSandboxWarning: boolean;
  // Claude-Compatible Providers
  claudeCompatibleProviders: ClaudeCompatibleProvider[];
  // Claude API Profiles (deprecated)
  claudeApiProfiles: ClaudeApiProfile[];
  activeClaudeApiProfileId: string | null;
  // Claude Usage Tracking
  claudeRefreshInterval: number;
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

interface AIModelsActions {
  // Enhancement Model actions
  setEnhancementModel: (model: ModelAlias) => void;
  // Validation Model actions
  setValidationModel: (model: ModelAlias) => void;
  // Phase Model actions
  setPhaseModel: (phase: PhaseModelKey, entry: PhaseModelEntry) => Promise<void>;
  setPhaseModels: (models: Partial<PhaseModelConfig>) => Promise<void>;
  resetPhaseModels: () => Promise<void>;
  toggleFavoriteModel: (modelId: string) => void;
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
  // Claude Agent SDK Settings actions
  setAutoLoadClaudeMd: (enabled: boolean) => Promise<void>;
  setSkipSandboxWarning: (skip: boolean) => Promise<void>;
  // Claude-Compatible Provider actions
  addClaudeCompatibleProvider: (provider: ClaudeCompatibleProvider) => Promise<void>;
  updateClaudeCompatibleProvider: (
    id: string,
    updates: Partial<ClaudeCompatibleProvider>
  ) => Promise<void>;
  deleteClaudeCompatibleProvider: (id: string) => Promise<void>;
  setClaudeCompatibleProviders: (providers: ClaudeCompatibleProvider[]) => Promise<void>;
  toggleClaudeCompatibleProviderEnabled: (id: string) => Promise<void>;
  // Claude API Profile actions (deprecated)
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
}

const initialState: AIModelsState = {
  enhancementModel: 'claude-sonnet',
  validationModel: 'claude-opus',
  phaseModels: DEFAULT_PHASE_MODELS,
  favoriteModels: [],
  enabledCursorModels: getAllCursorModelIds(),
  cursorDefaultModel: 'cursor-auto',
  enabledCodexModels: getAllCodexModelIds(),
  codexDefaultModel: 'codex-gpt-5.2-codex',
  codexAutoLoadAgents: false,
  codexSandboxMode: 'workspace-write',
  codexApprovalPolicy: 'on-request',
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
  autoLoadClaudeMd: false,
  skipSandboxWarning: false,
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

export const useAIModelsStore = create<AIModelsState & AIModelsActions>()((set, get) => ({
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
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },
  resetPhaseModels: async () => {
    set({ phaseModels: DEFAULT_PHASE_MODELS });
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

  // Claude Agent SDK Settings actions
  setAutoLoadClaudeMd: async (enabled) => {
    const previous = get().autoLoadClaudeMd;
    set({ autoLoadClaudeMd: enabled });
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    const ok = await syncSettingsToServer();
    if (!ok) {
      logger.error('Failed to sync autoLoadClaudeMd setting to server - reverting');
      set({ autoLoadClaudeMd: previous });
    }
  },
  setSkipSandboxWarning: async (skip) => {
    const previous = get().skipSandboxWarning;
    set({ skipSandboxWarning: skip });
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    const ok = await syncSettingsToServer();
    if (!ok) {
      logger.error('Failed to sync skipSandboxWarning setting to server - reverting');
      set({ skipSandboxWarning: previous });
    }
  },

  // Claude-Compatible Provider actions
  addClaudeCompatibleProvider: async (provider) => {
    set({ claudeCompatibleProviders: [...get().claudeCompatibleProviders, provider] });
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },

  updateClaudeCompatibleProvider: async (id, updates) => {
    set({
      claudeCompatibleProviders: get().claudeCompatibleProviders.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      ),
    });
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },

  deleteClaudeCompatibleProvider: async (id) => {
    set({
      claudeCompatibleProviders: get().claudeCompatibleProviders.filter((p) => p.id !== id),
    });
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },

  setClaudeCompatibleProviders: async (providers) => {
    set({ claudeCompatibleProviders: providers });
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },

  toggleClaudeCompatibleProviderEnabled: async (id) => {
    set({
      claudeCompatibleProviders: get().claudeCompatibleProviders.map((p) =>
        p.id === id ? { ...p, enabled: p.enabled === false ? true : false } : p
      ),
    });
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },

  // Claude API Profile actions (deprecated)
  addClaudeApiProfile: async (profile) => {
    set({ claudeApiProfiles: [...get().claudeApiProfiles, profile] });
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },

  updateClaudeApiProfile: async (id, updates) => {
    set({
      claudeApiProfiles: get().claudeApiProfiles.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      ),
    });
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },

  // Profile-only deletion (removes profile state + syncs).
  // NOTE: The app-store version also handles project cleanup for per-project overrides.
  deleteClaudeApiProfile: async (id) => {
    const currentActiveId = get().activeClaudeApiProfileId;
    set({
      claudeApiProfiles: get().claudeApiProfiles.filter((p) => p.id !== id),
      activeClaudeApiProfileId: currentActiveId === id ? null : currentActiveId,
    });
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },

  setActiveClaudeApiProfile: async (id) => {
    set({ activeClaudeApiProfileId: id });
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },

  setClaudeApiProfiles: async (profiles) => {
    set({ claudeApiProfiles: profiles });
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

    if (codexModelsLoading) return;

    if (
      !forceRefresh &&
      codexModelsLastFailedAt &&
      Date.now() - codexModelsLastFailedAt < FAILURE_COOLDOWN_MS
    ) {
      return;
    }

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
        codexModelsLastFailedAt: null,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      set({
        codexModelsError: errorMessage,
        codexModelsLoading: false,
        codexModelsLastFailedAt: Date.now(),
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

    if (opencodeModelsLoading) return;

    if (
      !forceRefresh &&
      opencodeModelsLastFailedAt &&
      Date.now() - opencodeModelsLastFailedAt < FAILURE_COOLDOWN_MS
    ) {
      return;
    }

    if (
      !forceRefresh &&
      opencodeModelsLastFetched &&
      Date.now() - opencodeModelsLastFetched < SUCCESS_CACHE_MS
    ) {
      return;
    }

    set({ opencodeModelsLoading: true, opencodeModelsError: null });

    try {
      const api = getElectronAPI();
      if (!api.setup) {
        throw new Error('Setup API not available');
      }

      const result = await api.setup.getOpencodeModels(forceRefresh);

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch OpenCode models');
      }

      set({
        dynamicOpencodeModels: result.models || [],
        opencodeModelsLastFetched: Date.now(),
        opencodeModelsLoading: false,
        opencodeModelsError: null,
        opencodeModelsLastFailedAt: null,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      set({
        opencodeModelsError: errorMessage,
        opencodeModelsLoading: false,
        opencodeModelsLastFailedAt: Date.now(),
      });
    }
  },
}));
