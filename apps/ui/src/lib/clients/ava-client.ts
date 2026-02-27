/**
 * Ava domain mixin for the HTTP API client.
 *
 * Provides: ava (getConfig, updateConfig)
 */
import { BaseHttpClient, type Constructor } from './base-http-client';

export interface AvaToolGroups {
  boardRead: boolean;
  boardWrite: boolean;
  agentControl: boolean;
  autoMode: boolean;
  projectMgmt: boolean;
  orchestration: boolean;
}

export interface AvaConfig {
  model: 'haiku' | 'sonnet' | 'opus';
  toolGroups: AvaToolGroups;
  sitrepInjection: boolean;
  contextInjection: boolean;
  systemPromptExtension: string;
}

export const withAvaClient = <TBase extends Constructor<BaseHttpClient>>(Base: TBase) =>
  class extends Base {
    // Ava config API
    ava = {
      getConfig: (
        projectPath: string
      ): Promise<{
        success: boolean;
        config?: AvaConfig;
        error?: string;
      }> => this.post('/api/ava/config/get', { projectPath }),

      updateConfig: (
        projectPath: string,
        config: Partial<AvaConfig>
      ): Promise<{
        success: boolean;
        config?: AvaConfig;
        error?: string;
      }> => this.post('/api/ava/config/update', { projectPath, config }),
    };
  };
