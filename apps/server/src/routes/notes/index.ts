/**
 * Notes Routes — CRUD for per-project Tiptap notes workspace
 *
 * ## Storage Model
 *
 * **Primary:** CRDT (Automerge)
 *   - Domain: `notes`
 *   - Document ID: `workspace`
 *   - Full registry key: `notes:workspace`
 *   - Seeded on first startup via `hydrateNotesWorkspace()` in crdt-store.module.ts
 *   - Provides multi-instance eventual consistency via the CRDTStore sync mesh
 *
 * **Fallback (routes):** Disk — `.automaker/notes/workspace.json`
 *   - Routes read from and write to disk directly (synchronous, always available)
 *   - Disk writes fire-and-forget into the CRDT store for replication
 *   - When CRDT is unavailable, disk is the durable source of truth
 *
 * **Conflict semantics:** Last-write-wins (LWW) per tab field.
 *   Tab content, name, and permissions are independent Automerge fields — the
 *   last mutation to each field wins if two instances write concurrently.
 *
 * **TipTap CRDT binding (deferred):** Tab content is currently stored as a plain
 *   HTML string. Per-character collaborative editing via TipTap's Y.js integration
 *   is planned but not yet implemented — content fields remain LWW until then.
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from '@protolabsai/utils';
import {
  getNotesWorkspacePath,
  ensureNotesDir,
  secureFs,
  validatePath,
} from '@protolabsai/platform';
import type { NotesWorkspace, NoteTab, NoteTabPermissions } from '@protolabsai/types';
import type { EventEmitter } from '../../lib/events.js';
import type { CRDTStore, CRDTDocumentRoot, DomainName } from '@protolabsai/crdt';

const logger = createLogger('NotesRoutes');

// ---------------------------------------------------------------------------
// CRDT document type
// ---------------------------------------------------------------------------

/**
 * NotesWorkspaceDocument is the CRDT representation of the notes workspace.
 * Fields mirror NotesWorkspace but extend CRDTDocumentRoot for attribution.
 * Domain key: 'notes:workspace'
 */
interface NotesWorkspaceDocument extends CRDTDocumentRoot {
  version: 1;
  workspaceVersion?: number;
  activeTabId: string | null;
  tabOrder: string[];
  tabs: Record<string, NoteTab>;
}

// 'notes' is not yet in the DomainName union — cast until the types package is updated.
const NOTES_CRDT_DOMAIN = 'notes' as unknown as DomainName;
const NOTES_CRDT_ID = 'workspace';

// ---------------------------------------------------------------------------
// Disk helpers (unchanged from original)
// ---------------------------------------------------------------------------

function createDefaultWorkspace(): NotesWorkspace {
  const now = Date.now();
  const defaultTabId = crypto.randomUUID();
  return {
    version: 1,
    workspaceVersion: 0,
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

function bumpVersion(workspace: NotesWorkspace): void {
  workspace.workspaceVersion = (workspace.workspaceVersion ?? 0) + 1;
}

// ---------------------------------------------------------------------------
// CRDT helpers
// ---------------------------------------------------------------------------

/**
 * Convert an Automerge doc snapshot to a plain NotesWorkspace.
 * Spreads nested objects to produce plain JS values (not Automerge proxies).
 */
function docToWorkspace(doc: NotesWorkspaceDocument): NotesWorkspace {
  return {
    version: 1,
    workspaceVersion: doc.workspaceVersion,
    activeTabId: doc.activeTabId,
    tabOrder: Array.from(doc.tabOrder),
    tabs: Object.fromEntries(
      Object.entries(doc.tabs as Record<string, NoteTab>).map(([id, tab]) => [
        id,
        {
          id: tab.id,
          name: tab.name,
          content: tab.content,
          permissions: {
            agentRead: tab.permissions.agentRead,
            agentWrite: tab.permissions.agentWrite,
          },
          metadata: {
            createdAt: tab.metadata.createdAt,
            updatedAt: tab.metadata.updatedAt,
            wordCount: tab.metadata.wordCount,
            characterCount: tab.metadata.characterCount,
          },
        },
      ])
    ),
  };
}

/**
 * Load notes workspace: try CRDT first, fall back to disk.
 * CRDT data is considered valid only if tabOrder has been populated (i.e. at least
 * one write has occurred via saveWorkspaceWithCrdt).
 */
async function loadWorkspaceWithCrdt(
  projectPath: string,
  store?: CRDTStore
): Promise<NotesWorkspace> {
  if (store) {
    try {
      const handle = await store.getOrCreate<NotesWorkspaceDocument>(
        NOTES_CRDT_DOMAIN,
        NOTES_CRDT_ID
      );
      const doc = handle.doc();
      // Only use CRDT data if the workspace has been seeded (tabOrder present and non-empty)
      if (doc && Array.isArray(doc.tabOrder) && doc.tabOrder.length > 0 && doc.tabs) {
        return docToWorkspace(doc);
      }
    } catch (err) {
      logger.warn('[Notes CRDT] Read failed, falling back to disk:', err);
    }
  }
  return loadWorkspace(projectPath);
}

/**
 * Save notes workspace: always write to disk (primary store), then fire-and-forget
 * CRDT update for multi-instance propagation.
 */
async function saveWorkspaceWithCrdt(
  projectPath: string,
  workspace: NotesWorkspace,
  store?: CRDTStore
): Promise<void> {
  // Primary store: disk — always succeeds before CRDT
  await saveWorkspace(projectPath, workspace);

  // Secondary store: CRDT — fire-and-forget, disk write already succeeded
  if (store) {
    store
      .change<NotesWorkspaceDocument>(NOTES_CRDT_DOMAIN, NOTES_CRDT_ID, (doc) => {
        // Use Record cast to allow setting fields that may not exist in fresh doc
        const mutable = doc as unknown as Record<string, unknown>;
        mutable['version'] = 1;
        mutable['workspaceVersion'] = workspace.workspaceVersion;
        mutable['activeTabId'] = workspace.activeTabId;
        mutable['tabOrder'] = workspace.tabOrder.slice();
        // Copy plain objects into CRDT — Automerge converts them to tracked structures
        mutable['tabs'] = Object.fromEntries(
          Object.entries(workspace.tabs).map(([id, tab]) => [
            id,
            {
              id: tab.id,
              name: tab.name,
              content: tab.content,
              permissions: {
                agentRead: tab.permissions.agentRead,
                agentWrite: tab.permissions.agentWrite,
              },
              metadata: {
                createdAt: tab.metadata.createdAt,
                updatedAt: tab.metadata.updatedAt,
                wordCount: tab.metadata.wordCount,
                characterCount: tab.metadata.characterCount,
              },
            },
          ])
        );
      })
      .catch((err) => {
        logger.warn('[Notes CRDT] Write failed (disk write succeeded):', err);
      });
  }
}

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

export function createNotesRoutes(events?: EventEmitter, store?: CRDTStore): Router {
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
      const workspace = await loadWorkspaceWithCrdt(projectPath, store);
      res.json({ workspace });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to load notes workspace:', error);
      res.status(500).json({ error: message });
    }
  });

  /**
   * POST /api/notes/save
   * Save workspace (full replacement)
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
      await saveWorkspaceWithCrdt(projectPath, workspace, store);
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
      const workspace = await loadWorkspaceWithCrdt(projectPath, store);
      const tab = workspace.tabs[tabId];
      if (!tab) {
        res.status(404).json({ error: 'Tab not found' });
        return;
      }
      if (!tab.permissions.agentRead) {
        res.status(403).json({ error: 'Agent does not have read permission for this tab' });
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
      const { projectPath, includeRestricted } = req.body as {
        projectPath: string;
        includeRestricted?: boolean;
      };
      if (!projectPath) {
        res.status(400).json({ error: 'projectPath is required' });
        return;
      }
      validatePath(projectPath);
      const workspace = await loadWorkspaceWithCrdt(projectPath, store);
      const tabs: Array<{
        id: string;
        name: string;
        permissions: NoteTab['permissions'];
        wordCount: number;
      }> = workspace.tabOrder
        .map((id) => workspace.tabs[id])
        .filter(Boolean)
        .filter((tab) => includeRestricted || tab.permissions.agentRead)
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

  /**
   * POST /api/notes/write-tab
   * Agent-oriented write: checks agentWrite permission, supports replace/append
   */
  router.post('/write-tab', async (req: Request, res: Response) => {
    try {
      const {
        projectPath,
        tabId,
        content,
        mode = 'replace',
      } = req.body as {
        projectPath: string;
        tabId: string;
        content: string;
        mode?: 'replace' | 'append';
      };
      if (!projectPath || !tabId || content === undefined) {
        res.status(400).json({ error: 'projectPath, tabId, and content are required' });
        return;
      }
      validatePath(projectPath);
      const workspace = await loadWorkspaceWithCrdt(projectPath, store);
      const tab = workspace.tabs[tabId];
      if (!tab) {
        res.status(404).json({ error: 'Tab not found' });
        return;
      }
      if (!tab.permissions.agentWrite) {
        res.status(403).json({ error: 'Agent does not have write permission for this tab' });
        return;
      }

      const now = Date.now();
      const newContent = mode === 'append' ? tab.content + content : content;
      tab.content = newContent;
      tab.metadata.updatedAt = now;
      // Recalculate word/char counts
      const plainText = newContent.replace(/<[^>]*>/g, '');
      tab.metadata.wordCount = plainText.trim() ? plainText.trim().split(/\s+/).length : 0;
      tab.metadata.characterCount = plainText.length;

      bumpVersion(workspace);
      await saveWorkspaceWithCrdt(projectPath, workspace, store);

      if (events) {
        events.emit('notes:tab-updated', { projectPath, tabId, name: tab.name });
      }

      res.json({
        success: true,
        tab: {
          id: tab.id,
          name: tab.name,
          wordCount: tab.metadata.wordCount,
          characterCount: tab.metadata.characterCount,
          updatedAt: now,
        },
        workspaceVersion: workspace.workspaceVersion,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to write note tab:', error);
      res.status(500).json({ error: message });
    }
  });

  /**
   * POST /api/notes/create-tab
   * Create a new note tab in the workspace
   */
  router.post('/create-tab', async (req: Request, res: Response) => {
    try {
      const { projectPath, name, content, permissions } = req.body as {
        projectPath: string;
        name?: string;
        content?: string;
        permissions?: Partial<NoteTabPermissions>;
      };
      if (!projectPath) {
        res.status(400).json({ error: 'projectPath is required' });
        return;
      }
      validatePath(projectPath);
      const workspace = await loadWorkspaceWithCrdt(projectPath, store);

      const now = Date.now();
      const tabId = crypto.randomUUID();
      const tabName = name || `Tab ${Object.keys(workspace.tabs).length + 1}`;
      const tabContent = content ?? '';
      const plainText = tabContent.replace(/<[^>]*>/g, '');

      const newTab: NoteTab = {
        id: tabId,
        name: tabName,
        content: tabContent,
        permissions: {
          agentRead: permissions?.agentRead ?? true,
          agentWrite: permissions?.agentWrite ?? true,
        },
        metadata: {
          createdAt: now,
          updatedAt: now,
          wordCount: plainText.trim() ? plainText.trim().split(/\s+/).length : 0,
          characterCount: plainText.length,
        },
      };

      workspace.tabs[tabId] = newTab;
      workspace.tabOrder.push(tabId);
      bumpVersion(workspace);
      await saveWorkspaceWithCrdt(projectPath, workspace, store);

      if (events) {
        events.emit('notes:tab-created', { projectPath, tabId, name: tabName });
      }

      res.json({
        success: true,
        tab: {
          id: newTab.id,
          name: newTab.name,
          permissions: newTab.permissions,
          metadata: newTab.metadata,
        },
        workspaceVersion: workspace.workspaceVersion,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to create note tab:', error);
      res.status(500).json({ error: message });
    }
  });

  /**
   * POST /api/notes/delete-tab
   * Delete a note tab from the workspace
   */
  router.post('/delete-tab', async (req: Request, res: Response) => {
    try {
      const { projectPath, tabId } = req.body as { projectPath: string; tabId: string };
      if (!projectPath || !tabId) {
        res.status(400).json({ error: 'projectPath and tabId are required' });
        return;
      }
      validatePath(projectPath);
      const workspace = await loadWorkspaceWithCrdt(projectPath, store);

      if (!workspace.tabs[tabId]) {
        res.status(404).json({ error: 'Tab not found' });
        return;
      }
      if (workspace.tabOrder.length <= 1) {
        res.status(400).json({ error: 'Cannot delete the last remaining tab' });
        return;
      }

      delete workspace.tabs[tabId];
      workspace.tabOrder = workspace.tabOrder.filter((id) => id !== tabId);

      if (workspace.activeTabId === tabId) {
        workspace.activeTabId = workspace.tabOrder[workspace.tabOrder.length - 1] ?? null;
      }

      bumpVersion(workspace);
      await saveWorkspaceWithCrdt(projectPath, workspace, store);

      if (events) {
        events.emit('notes:tab-deleted', { projectPath, tabId });
      }

      res.json({
        success: true,
        deletedTabId: tabId,
        workspaceVersion: workspace.workspaceVersion,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to delete note tab:', error);
      res.status(500).json({ error: message });
    }
  });

  /**
   * POST /api/notes/rename-tab
   * Rename a note tab
   */
  router.post('/rename-tab', async (req: Request, res: Response) => {
    try {
      const { projectPath, tabId, name } = req.body as {
        projectPath: string;
        tabId: string;
        name: string;
      };
      if (!projectPath || !tabId || !name) {
        res.status(400).json({ error: 'projectPath, tabId, and name are required' });
        return;
      }
      validatePath(projectPath);
      const workspace = await loadWorkspaceWithCrdt(projectPath, store);
      const tab = workspace.tabs[tabId];
      if (!tab) {
        res.status(404).json({ error: 'Tab not found' });
        return;
      }

      tab.name = name;
      tab.metadata.updatedAt = Date.now();

      bumpVersion(workspace);
      await saveWorkspaceWithCrdt(projectPath, workspace, store);

      if (events) {
        events.emit('notes:tab-renamed', { projectPath, tabId, name });
      }

      res.json({
        success: true,
        tab: { id: tab.id, name: tab.name, updatedAt: tab.metadata.updatedAt },
        workspaceVersion: workspace.workspaceVersion,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to rename note tab:', error);
      res.status(500).json({ error: message });
    }
  });

  /**
   * POST /api/notes/update-tab-permissions
   * Update agent read/write permissions for a tab
   */
  router.post('/update-tab-permissions', async (req: Request, res: Response) => {
    try {
      const { projectPath, tabId, permissions } = req.body as {
        projectPath: string;
        tabId: string;
        permissions: Partial<NoteTabPermissions>;
      };
      if (!projectPath || !tabId || !permissions) {
        res.status(400).json({ error: 'projectPath, tabId, and permissions are required' });
        return;
      }
      validatePath(projectPath);
      const workspace = await loadWorkspaceWithCrdt(projectPath, store);
      const tab = workspace.tabs[tabId];
      if (!tab) {
        res.status(404).json({ error: 'Tab not found' });
        return;
      }

      if (permissions.agentRead !== undefined) {
        tab.permissions.agentRead = permissions.agentRead;
      }
      if (permissions.agentWrite !== undefined) {
        tab.permissions.agentWrite = permissions.agentWrite;
      }
      tab.metadata.updatedAt = Date.now();

      bumpVersion(workspace);
      await saveWorkspaceWithCrdt(projectPath, workspace, store);

      if (events) {
        events.emit('notes:tab-permissions-changed', {
          projectPath,
          tabId,
          permissions: tab.permissions,
        });
      }

      res.json({
        success: true,
        tab: { id: tab.id, name: tab.name, permissions: tab.permissions },
        workspaceVersion: workspace.workspaceVersion,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to update tab permissions:', error);
      res.status(500).json({ error: message });
    }
  });

  /**
   * POST /api/notes/reorder-tabs
   * Reorder note tabs in the workspace
   */
  router.post('/reorder-tabs', async (req: Request, res: Response) => {
    try {
      const { projectPath, tabOrder } = req.body as {
        projectPath: string;
        tabOrder: string[];
      };
      if (!projectPath || !tabOrder || !Array.isArray(tabOrder)) {
        res.status(400).json({ error: 'projectPath and tabOrder array are required' });
        return;
      }
      validatePath(projectPath);
      const workspace = await loadWorkspaceWithCrdt(projectPath, store);

      // Validate all IDs exist and no extra/missing IDs
      const existingIds = new Set(Object.keys(workspace.tabs));
      const newIds = new Set(tabOrder);
      if (newIds.size !== existingIds.size) {
        res.status(400).json({ error: 'tabOrder must contain exactly the same tab IDs' });
        return;
      }
      for (const id of tabOrder) {
        if (!existingIds.has(id)) {
          res.status(400).json({ error: `Unknown tab ID: ${id}` });
          return;
        }
      }

      workspace.tabOrder = tabOrder;
      bumpVersion(workspace);
      await saveWorkspaceWithCrdt(projectPath, workspace, store);

      res.json({
        success: true,
        tabOrder: workspace.tabOrder,
        workspaceVersion: workspace.workspaceVersion,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to reorder tabs:', error);
      res.status(500).json({ error: message });
    }
  });

  return router;
}
