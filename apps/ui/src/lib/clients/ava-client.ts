/**
 * Ava domain mixin for the HTTP API client.
 *
 * Provides: ava (getConfig, updateConfig), chat (fetchCommands)
 */
import { BaseHttpClient, type Constructor } from './base-http-client';
import type { MCPServerConfig, SlashCommandSummary } from '@protolabsai/types';

export type { MCPServerConfig };

export interface AvaToolGroups {
  boardRead: boolean;
  boardWrite: boolean;
  agentControl: boolean;
  autoMode: boolean;
  projectMgmt: boolean;
  orchestration: boolean;
  agentDelegation: boolean;
  notes: boolean;
  metrics: boolean;
  prWorkflow: boolean;
  promotion: boolean;
  contextFiles: boolean;
  projects: boolean;
  briefing: boolean;
  scheduling: boolean;
}

export interface AvaConfig {
  model: 'haiku' | 'sonnet' | 'opus';
  toolGroups: AvaToolGroups;
  sitrepInjection: boolean;
  contextInjection: boolean;
  systemPromptExtension: string;
  autoApproveTools: boolean;
  /** MCP servers available to Ava and delegated inner agents */
  mcpServers?: MCPServerConfig[];
  /**
   * Trust level for delegated sub-agents.
   * - 'full': Sub-agents run autonomously without human review gates.
   * - 'gated': Each sub-agent tool call is paused for human review before execution.
   * Defaults to 'full' when not set.
   */
  subagentTrust?: 'full' | 'gated';
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

    // Chat commands API
    chat = {
      /**
       * Fetch the list of registered slash commands for the autocomplete dropdown.
       * Returns SlashCommandSummary[] (body field excluded for payload efficiency).
       */
      fetchCommands: (): Promise<SlashCommandSummary[]> => this.get('/api/chat/commands'),
    };
  };
