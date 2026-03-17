/**
 * Engine client mixin: status, auto-mode, signals, content drafts.
 *
 * Extracted from the monolithic http-api-client.ts — contains:
 *   - engine  (status, detail endpoints, events history,
 *              signal submit, PRD approval, content drafts/review)
 */
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
    };
  };
