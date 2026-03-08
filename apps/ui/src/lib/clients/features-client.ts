/**
 * Features domain mixin for the HTTP API client.
 *
 * Provides: features, autoMode, enhancePrompt, suggestions, specRegeneration, backlogPlan
 */
import type {
  AutoModeAPI,
  AutoModeEvent,
  SuggestionsAPI,
  SpecRegenerationAPI,
  SuggestionsEvent,
  SpecRegenerationEvent,
  SuggestionType,
} from '../electron';
import type { Feature } from '@/store/types';
import type { EventCallback } from './base-http-client';
import { BaseHttpClient, type Constructor } from './base-http-client';

interface EnhancePromptResult {
  success: boolean;
  enhancedText?: string;
  error?: string;
}

export const withFeaturesClient = <TBase extends Constructor<BaseHttpClient>>(Base: TBase) =>
  class extends Base {
    // Features API
    features: FeaturesAPI & {
      bulkUpdate: (
        projectPath: string,
        featureIds: string[],
        updates: Partial<Feature>
      ) => Promise<{
        success: boolean;
        updatedCount?: number;
        failedCount?: number;
        results?: Array<{ featureId: string; success: boolean; error?: string }>;
        features?: Feature[];
        error?: string;
      }>;
      bulkDelete: (
        projectPath: string,
        featureIds: string[]
      ) => Promise<{
        success: boolean;
        deletedCount?: number;
        failedCount?: number;
        results?: Array<{ featureId: string; success: boolean; error?: string }>;
        error?: string;
      }>;
    } = {
      getAll: (projectPath: string) => this.post('/api/features/list', { projectPath }),
      get: (projectPath: string, featureId: string) =>
        this.post('/api/features/get', { projectPath, featureId }),
      create: (projectPath: string, feature: Feature) =>
        this.post('/api/features/create', { projectPath, feature }),
      update: (
        projectPath: string,
        featureId: string,
        updates: Partial<Feature>,
        descriptionHistorySource?: 'enhance' | 'edit',
        enhancementMode?: 'improve' | 'technical' | 'simplify' | 'acceptance' | 'ux-reviewer',
        preEnhancementDescription?: string
      ) =>
        this.post('/api/features/update', {
          projectPath,
          featureId,
          updates,
          descriptionHistorySource,
          enhancementMode,
          preEnhancementDescription,
        }),
      delete: (projectPath: string, featureId: string) =>
        this.post('/api/features/delete', { projectPath, featureId }),
      getAgentOutput: (projectPath: string, featureId: string) =>
        this.post('/api/features/agent-output', { projectPath, featureId }),
      generateTitle: (description: string, projectPath?: string) =>
        this.post('/api/features/generate-title', { description, projectPath }),
      bulkUpdate: (projectPath: string, featureIds: string[], updates: Partial<Feature>) =>
        this.post('/api/features/bulk-update', { projectPath, featureIds, updates }),
      bulkDelete: (projectPath: string, featureIds: string[]) =>
        this.post('/api/features/bulk-delete', { projectPath, featureIds }),
      onFeatureEvent: (callback: (event: { type: string; payload: unknown }) => void) => {
        const featureEvents = [
          'feature:created',
          'feature:updated',
          'feature:deleted',
          'feature:status-changed',
        ] as const;
        const unsubs = featureEvents.map((eventType) =>
          this.subscribeToEvent(eventType, ((payload: unknown) => {
            callback({ type: eventType, payload });
          }) as EventCallback)
        );
        return () => unsubs.forEach((unsub) => unsub());
      },
    };

    // Auto Mode API
    autoMode: AutoModeAPI = {
      start: (projectPath: string, branchName?: string | null, maxConcurrency?: number) =>
        this.post('/api/auto-mode/start', { projectPath, branchName, maxConcurrency }),
      stop: (projectPath: string, branchName?: string | null) =>
        this.post('/api/auto-mode/stop', { projectPath, branchName }),
      stopFeature: (featureId: string) => this.post('/api/auto-mode/stop-feature', { featureId }),
      status: (projectPath?: string, branchName?: string | null) =>
        this.post('/api/auto-mode/status', { projectPath, branchName }),
      runFeature: (
        projectPath: string,
        featureId: string,
        useWorktrees?: boolean,
        worktreePath?: string
      ) =>
        this.post('/api/auto-mode/run-feature', {
          projectPath,
          featureId,
          useWorktrees,
          worktreePath,
        }),
      verifyFeature: (projectPath: string, featureId: string) =>
        this.post('/api/auto-mode/verify-feature', { projectPath, featureId }),
      resumeFeature: (projectPath: string, featureId: string, useWorktrees?: boolean) =>
        this.post('/api/auto-mode/resume-feature', {
          projectPath,
          featureId,
          useWorktrees,
        }),
      contextExists: (projectPath: string, featureId: string) =>
        this.post('/api/auto-mode/context-exists', { projectPath, featureId }),
      analyzeProject: (projectPath: string) =>
        this.post('/api/auto-mode/analyze-project', { projectPath }),
      followUpFeature: (
        projectPath: string,
        featureId: string,
        prompt: string,
        imagePaths?: string[],
        useWorktrees?: boolean
      ) =>
        this.post('/api/auto-mode/follow-up-feature', {
          projectPath,
          featureId,
          prompt,
          imagePaths,
          useWorktrees,
        }),
      commitFeature: (projectPath: string, featureId: string, worktreePath?: string) =>
        this.post('/api/auto-mode/commit-feature', {
          projectPath,
          featureId,
          worktreePath,
        }),
      approvePlan: (
        projectPath: string,
        featureId: string,
        approved: boolean,
        editedPlan?: string,
        feedback?: string
      ) =>
        this.post('/api/auto-mode/approve-plan', {
          projectPath,
          featureId,
          approved,
          editedPlan,
          feedback,
        }),
      resumeInterrupted: (projectPath: string) =>
        this.post('/api/auto-mode/resume-interrupted', { projectPath }),
      onEvent: (callback: (event: AutoModeEvent) => void) => {
        return this.subscribeToEvent('auto-mode:event', callback as EventCallback);
      },
    };

    // Enhance Prompt API
    enhancePrompt = {
      enhance: (
        originalText: string,
        enhancementMode: string,
        model?: string,
        thinkingLevel?: string,
        projectPath?: string
      ): Promise<EnhancePromptResult> =>
        this.post('/api/enhance-prompt', {
          originalText,
          enhancementMode,
          model,
          thinkingLevel,
          projectPath,
        }),
    };

    // Suggestions API
    suggestions: SuggestionsAPI = {
      generate: (
        projectPath: string,
        suggestionType?: SuggestionType,
        model?: string,
        thinkingLevel?: string
      ) =>
        this.post('/api/suggestions/generate', {
          projectPath,
          suggestionType,
          model,
          thinkingLevel,
        }),
      stop: () => this.post('/api/suggestions/stop'),
      status: () => this.get('/api/suggestions/status'),
      onEvent: (callback: (event: SuggestionsEvent) => void) => {
        return this.subscribeToEvent('suggestions:event', callback as EventCallback);
      },
    };

    // Spec Regeneration API
    specRegeneration: SpecRegenerationAPI = {
      create: (
        projectPath: string,
        projectOverview: string,
        generateFeatures?: boolean,
        analyzeProject?: boolean,
        maxFeatures?: number
      ) =>
        this.post('/api/spec-regeneration/create', {
          projectPath,
          projectOverview,
          generateFeatures,
          analyzeProject,
          maxFeatures,
        }),
      generate: (
        projectPath: string,
        projectDefinition: string,
        generateFeatures?: boolean,
        analyzeProject?: boolean,
        maxFeatures?: number
      ) =>
        this.post('/api/spec-regeneration/generate', {
          projectPath,
          projectDefinition,
          generateFeatures,
          analyzeProject,
          maxFeatures,
        }),
      generateFeatures: (projectPath: string, maxFeatures?: number) =>
        this.post('/api/spec-regeneration/generate-features', {
          projectPath,
          maxFeatures,
        }),
      sync: (projectPath: string) => this.post('/api/spec-regeneration/sync', { projectPath }),
      stop: (projectPath?: string) => this.post('/api/spec-regeneration/stop', { projectPath }),
      status: (projectPath?: string) =>
        this.get(
          projectPath
            ? `/api/spec-regeneration/status?projectPath=${encodeURIComponent(projectPath)}`
            : '/api/spec-regeneration/status'
        ),
      onEvent: (callback: (event: SpecRegenerationEvent) => void) => {
        return this.subscribeToEvent('spec-regeneration:event', callback as EventCallback);
      },
    };

    // Backlog Plan API
    backlogPlan = {
      generate: (
        projectPath: string,
        prompt: string,
        model?: string
      ): Promise<{ success: boolean; error?: string }> =>
        this.post('/api/backlog-plan/generate', { projectPath, prompt, model }),

      stop: (): Promise<{ success: boolean; error?: string }> =>
        this.post('/api/backlog-plan/stop', {}),

      status: (
        projectPath: string
      ): Promise<{
        success: boolean;
        isRunning?: boolean;
        savedPlan?: {
          savedAt: string;
          prompt: string;
          model?: string;
          result: {
            changes: Array<{
              type: 'add' | 'update' | 'delete';
              featureId?: string;
              feature?: Record<string, unknown>;
              reason: string;
            }>;
            summary: string;
            dependencyUpdates: Array<{
              featureId: string;
              removedDependencies: string[];
              addedDependencies: string[];
            }>;
          };
        } | null;
        error?: string;
      }> => this.get(`/api/backlog-plan/status?projectPath=${encodeURIComponent(projectPath)}`),

      apply: (
        projectPath: string,
        plan: {
          changes: Array<{
            type: 'add' | 'update' | 'delete';
            featureId?: string;
            feature?: Record<string, unknown>;
            reason: string;
          }>;
          summary: string;
          dependencyUpdates: Array<{
            featureId: string;
            removedDependencies: string[];
            addedDependencies: string[];
          }>;
        },
        branchName?: string
      ): Promise<{ success: boolean; appliedChanges?: string[]; error?: string }> =>
        this.post('/api/backlog-plan/apply', { projectPath, plan, branchName }),

      clear: (projectPath: string): Promise<{ success: boolean; error?: string }> =>
        this.post('/api/backlog-plan/clear', { projectPath }),

      onEvent: (callback: (data: unknown) => void): (() => void) => {
        return this.subscribeToEvent('backlog-plan:event', callback as EventCallback);
      },
    };
  };

// Re-export the FeaturesAPI type reference so the original file's import still works
import type { FeaturesAPI } from '../electron';
export type { FeaturesAPI };
