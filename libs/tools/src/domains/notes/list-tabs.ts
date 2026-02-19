/**
 * List Notes Tabs Tool
 *
 * Lists all note tabs with their permissions and metadata.
 * Only returns tabs where agentRead is enabled.
 */

import type { ToolContext, ToolResult } from '../../types.js';

export interface ListTabsInput {
  projectPath: string;
  includeRestricted?: boolean;
}

export interface ListTabsOutput {
  tabs: Array<{
    id: string;
    name: string;
    agentRead: boolean;
    agentWrite: boolean;
    wordCount: number;
  }>;
}

export async function listTabs(
  context: ToolContext,
  input: ListTabsInput
): Promise<ToolResult<ListTabsOutput>> {
  try {
    const { projectPath, includeRestricted = false } = input;

    if (!projectPath) {
      return {
        success: false,
        error: 'projectPath is required',
        errorCode: 'MISSING_PROJECT_PATH',
      };
    }

    if (!context.notesLoader) {
      return {
        success: false,
        error: 'notesLoader not available in context',
        errorCode: 'MISSING_NOTES_LOADER',
      };
    }

    const workspace = await context.notesLoader.load(projectPath);

    const tabs = workspace.tabOrder
      .map((id) => workspace.tabs[id])
      .filter(Boolean)
      .filter((tab) => includeRestricted || tab.permissions.agentRead)
      .map((tab) => ({
        id: tab.id,
        name: tab.name,
        agentRead: tab.permissions.agentRead,
        agentWrite: tab.permissions.agentWrite,
        wordCount: tab.metadata.wordCount ?? 0,
      }));

    return {
      success: true,
      data: { tabs },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      errorCode: 'LIST_TABS_FAILED',
    };
  }
}
