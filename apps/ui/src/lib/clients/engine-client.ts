/**
 * Engine client mixin: status, auto-mode, flows, signals, content drafts, pipeline state.
 *
 * Extracted from the monolithic http-api-client.ts — contains:
 *   - engine  (status, detail endpoints, events history, flows,
 *              pipeline state, signal submit, PRD approval,
 *              content drafts/review, pipeline checkpoints/status/gate/override)
 */
import type { PipelineState } from '@protolabs-ai/types';
import { BaseHttpClient, type Constructor } from './base-http-client';

export const withEngineClient = <TBase extends Constructor<BaseHttpClient>>(Base: TBase) =>
  class extends Base {
    // Engine API
    engine = {
      status: (projectPath?: string) => this.post('/api/engine/status', { projectPath }),
      autoModeDetail: () => this.post('/api/engine/auto-mode/detail', {}),
      prFeedbackDetail: () => this.post('/api/engine/pr-feedback/detail', {}),
      leadEngineerDetail: () => this.post('/api/engine/lead-engineer/detail', {}),
      eventsHistory: (filter?: {
        type?: string;
        service?: string;
        featureId?: string;
        since?: number;
        until?: number;
        limit?: number;
      }) => this.post('/api/engine/events/history', filter ?? {}),
      flows: (graphId?: string) => this.post('/api/engine/flows', { graphId }),
      pipelineState: (
        projectPath: string
      ): Promise<{
        success: boolean;
        countsByStatus?: Record<string, number>;
        featuresByStatus?: Record<
          string,
          Array<{
            id: string;
            title: string;
            status: string;
            branchName?: string;
            createdAt?: string;
            complexity?: string;
            lastTraceId?: string;
            costUsd?: number;
          }>
        >;
        totalFeatures?: number;
        timestamp?: string;
        error?: string;
      }> => this.post('/api/engine/pipeline-state', { projectPath }),
      signalSubmit: (params: {
        content: string;
        projectPath?: string;
        source?: string;
        images?: string[];
        files?: string[];
        autoApprove?: boolean;
        webResearch?: boolean;
        pipelineMode?: string;
      }): Promise<{ success: boolean; message?: string; error?: string }> =>
        this.post('/api/engine/signal/submit', params),
      approvePrd: (
        projectPath: string,
        featureId: string,
        decision: 'approve' | 'reject'
      ): Promise<{ success: boolean; decision?: string; error?: string }> =>
        this.post('/api/engine/signal/approve-prd', { projectPath, featureId, decision }),
      contentDrafts: (): Promise<{
        success: boolean;
        drafts: Array<{
          contentId: string;
          title: string;
          draft: string;
          strategy: Record<string, unknown>;
          source: string;
          projectPath: string;
          status: string;
          createdAt: string;
          version: number;
        }>;
      }> => this.get('/api/engine/content/drafts'),
      contentReview: (
        projectPath: string,
        contentId: string,
        decision: 'approve' | 'reject' | 'request_changes',
        editedContent?: string,
        tabName?: string,
        feedback?: string
      ): Promise<{ success: boolean; tabId?: string; error?: string }> =>
        this.post('/api/engine/content/review', {
          projectPath,
          contentId,
          decision,
          editedContent,
          tabName,
          feedback,
        }),
      pipelineCheckpoints: (
        projectPath: string,
        featureId?: string
      ): Promise<{
        success: boolean;
        checkpoints?: Array<{
          featureId: string;
          projectPath: string;
          currentState: string;
          completedStates: string[];
          goalGateResults: Array<{
            gateId: string;
            state: string;
            passed: boolean;
            reason: string;
          }>;
          timestamp: string;
        }>;
        checkpoint?: {
          featureId: string;
          projectPath: string;
          currentState: string;
          completedStates: string[];
          goalGateResults: Array<{
            gateId: string;
            state: string;
            passed: boolean;
            reason: string;
          }>;
          timestamp: string;
        } | null;
        total?: number;
        error?: string;
      }> => this.post('/api/engine/pipeline-checkpoints', { projectPath, featureId }),
      /** Get unified pipeline state for a feature */
      pipelineStatus: (
        projectPath: string,
        featureId: string
      ): Promise<{
        success: boolean;
        pipelineState?: PipelineState;
        error?: string;
      }> => this.post('/api/engine/pipeline/status', { projectPath, featureId }),
      /** Resolve a pipeline gate (advance or reject) */
      pipelineGateResolve: (
        projectPath: string,
        featureId: string,
        action: 'advance' | 'reject'
      ): Promise<{ success: boolean; error?: string }> =>
        this.post('/api/engine/pipeline/gate/resolve', { projectPath, featureId, action }),
      /** Override pipeline phase (jump to a specific phase) */
      pipelineOverride: (
        projectPath: string,
        featureId: string,
        targetPhase: string
      ): Promise<{ success: boolean; error?: string }> =>
        this.post('/api/engine/pipeline/override', { projectPath, featureId, targetPhase }),
    };
  };
