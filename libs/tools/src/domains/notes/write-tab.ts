/**
 * Write Note Tab Tool
 *
 * Updates the content of a single note tab.
 * Respects agentWrite permission — returns error if tab has agentWrite: false.
 * Supports full replace or append mode.
 */

import type { ToolContext, ToolResult } from '../../types.js';

export interface WriteTabInput {
  projectPath: string;
  tabId: string;
  content: string;
  mode?: 'replace' | 'append';
}

export interface WriteTabOutput {
  id: string;
  name: string;
  wordCount: number;
  characterCount: number;
  updatedAt: number;
}

function countWords(html: string): number {
  const text = html.replace(/<[^>]*>/g, ' ').trim();
  if (!text) return 0;
  return text.split(/\s+/).length;
}

function countCharacters(html: string): number {
  return html.replace(/<[^>]*>/g, '').length;
}

export async function writeTab(
  context: ToolContext,
  input: WriteTabInput
): Promise<ToolResult<WriteTabOutput>> {
  try {
    const { projectPath, tabId, content, mode = 'replace' } = input;

    if (!projectPath || !tabId) {
      return {
        success: false,
        error: 'projectPath and tabId are required',
        errorCode: 'MISSING_REQUIRED_FIELDS',
      };
    }

    if (content === undefined || content === null) {
      return {
        success: false,
        error: 'content is required',
        errorCode: 'MISSING_CONTENT',
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

    if (!tab.permissions.agentWrite) {
      return {
        success: false,
        error: 'Agent does not have write permission for this tab',
        errorCode: 'PERMISSION_DENIED',
      };
    }

    const now = Date.now();
    const newContent = mode === 'append' ? tab.content + content : content;

    tab.content = newContent;
    tab.metadata.updatedAt = now;
    tab.metadata.wordCount = countWords(newContent);
    tab.metadata.characterCount = countCharacters(newContent);

    await context.notesLoader.save(projectPath, workspace);

    if (context.events) {
      context.events.emit('notes:tab-updated', {
        projectPath,
        tabId,
        name: tab.name,
        source: 'agent',
      });
    }

    return {
      success: true,
      data: {
        id: tab.id,
        name: tab.name,
        wordCount: tab.metadata.wordCount,
        characterCount: tab.metadata.characterCount,
        updatedAt: now,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      errorCode: 'WRITE_TAB_FAILED',
    };
  }
}
