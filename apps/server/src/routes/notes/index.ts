/**
 * Notes Routes — CRUD for per-project Tiptap notes workspace
 *
 * Storage: .automaker/notes/workspace.json (single file per project)
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from '@automaker/utils';
import { getNotesWorkspacePath, ensureNotesDir, secureFs, validatePath } from '@automaker/platform';
import type { NotesWorkspace, NoteTab } from '@automaker/types';

const logger = createLogger('NotesRoutes');

function createDefaultWorkspace(): NotesWorkspace {
  const now = Date.now();
  const defaultTabId = crypto.randomUUID();
  return {
    version: 1,
    activeTabId: defaultTabId,
    tabOrder: [defaultTabId],
    tabs: {
      [defaultTabId]: {
        id: defaultTabId,
        name: 'Notes',
        content: '',
        permissions: { agentRead: true, agentWrite: true },
        metadata: { createdAt: now, updatedAt: now, wordCount: 0, characterCount: 0 },
      },
    },
  };
}

async function loadWorkspace(projectPath: string): Promise<NotesWorkspace> {
  const filePath = getNotesWorkspacePath(projectPath);
  try {
    const raw = await secureFs.readFile(filePath, 'utf-8');
    return JSON.parse(raw as string) as NotesWorkspace;
  } catch {
    return createDefaultWorkspace();
  }
}

async function saveWorkspace(projectPath: string, workspace: NotesWorkspace): Promise<void> {
  await ensureNotesDir(projectPath);
  const filePath = getNotesWorkspacePath(projectPath);
  await secureFs.writeFile(filePath, JSON.stringify(workspace, null, 2), 'utf-8');
}

export function createNotesRoutes(): Router {
  const router = Router();

  /**
   * POST /api/notes/get
   * Load workspace or return default
   */
  router.post('/get', async (req: Request, res: Response) => {
    try {
      const { projectPath } = req.body as { projectPath: string };
      if (!projectPath) {
        res.status(400).json({ error: 'projectPath is required' });
        return;
      }
      validatePath(projectPath);
      const workspace = await loadWorkspace(projectPath);
      res.json({ workspace });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to load notes workspace:', error);
      res.status(500).json({ error: message });
    }
  });

  /**
   * POST /api/notes/save
   * Save workspace
   */
  router.post('/save', async (req: Request, res: Response) => {
    try {
      const { projectPath, workspace } = req.body as {
        projectPath: string;
        workspace: NotesWorkspace;
      };
      if (!projectPath || !workspace) {
        res.status(400).json({ error: 'projectPath and workspace are required' });
        return;
      }
      validatePath(projectPath);
      await saveWorkspace(projectPath, workspace);
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to save notes workspace:', error);
      res.status(500).json({ error: message });
    }
  });

  /**
   * POST /api/notes/get-tab
   * Single tab content (for chat context)
   */
  router.post('/get-tab', async (req: Request, res: Response) => {
    try {
      const { projectPath, tabId } = req.body as { projectPath: string; tabId: string };
      if (!projectPath || !tabId) {
        res.status(400).json({ error: 'projectPath and tabId are required' });
        return;
      }
      validatePath(projectPath);
      const workspace = await loadWorkspace(projectPath);
      const tab = workspace.tabs[tabId];
      if (!tab) {
        res.status(404).json({ error: 'Tab not found' });
        return;
      }
      res.json({ tab });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to get note tab:', error);
      res.status(500).json({ error: message });
    }
  });

  /**
   * POST /api/notes/list-tabs
   * Tab list with permissions (for chat context)
   */
  router.post('/list-tabs', async (req: Request, res: Response) => {
    try {
      const { projectPath } = req.body as { projectPath: string };
      if (!projectPath) {
        res.status(400).json({ error: 'projectPath is required' });
        return;
      }
      validatePath(projectPath);
      const workspace = await loadWorkspace(projectPath);
      const tabs: Array<{
        id: string;
        name: string;
        permissions: NoteTab['permissions'];
        wordCount: number;
      }> = workspace.tabOrder
        .map((id) => workspace.tabs[id])
        .filter(Boolean)
        .map((tab) => ({
          id: tab.id,
          name: tab.name,
          permissions: tab.permissions,
          wordCount: tab.metadata.wordCount ?? 0,
        }));
      res.json({ tabs });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to list note tabs:', error);
      res.status(500).json({ error: message });
    }
  });

  return router;
}
