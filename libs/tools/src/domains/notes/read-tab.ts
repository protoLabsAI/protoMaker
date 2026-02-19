/**
 * Read Note Tab Tool
 *
 * Reads the content of a single note tab.
 * Respects agentRead permission — returns error if tab has agentRead: false.
 */

import type { ToolContext, ToolResult } from '../../types.js';

export interface ReadTabInput {
  projectPath: string;
  tabId: string;
}

export interface ReadTabOutput {
  id: string;
  name: string;
  content: string;
  wordCount: number;
  characterCount: number;
  updatedAt: number;
}

export async function readTab(
  context: ToolContext,
  input: ReadTabInput
): Promise<ToolResult<ReadTabOutput>> {
  try {
    const { projectPath, tabId } = input;

    if (!projectPath || !tabId) {
      return {
        success: false,
        error: 'projectPath and tabId are required',
        errorCode: 'MISSING_REQUIRED_FIELDS',
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
    const tab = workspace.tabs[tabId];

    if (!tab) {
      return {
        success: false,
        error: 'Tab not found',
        errorCode: 'TAB_NOT_FOUND',
      };
    }

    if (!tab.permissions.agentRead) {
      return {
        success: false,
        error: 'Agent does not have read permission for this tab',
        errorCode: 'PERMISSION_DENIED',
      };
    }

    return {
      success: true,
      data: {
        id: tab.id,
        name: tab.name,
        content: tab.content,
        wordCount: tab.metadata.wordCount ?? 0,
        characterCount: tab.metadata.characterCount ?? 0,
        updatedAt: tab.metadata.updatedAt,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      errorCode: 'READ_TAB_FAILED',
    };
  }
}
