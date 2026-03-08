/**
 * TodoService - Manages per-project todo lists and items
 *
 * Storage: single JSON file at {projectPath}/.automaker/todos/workspace.json
 * Follows the same pattern as the Notes workspace service.
 *
 * When a CRDTStore is registered via setCrdtStore(), all read/write operations
 * are routed through the CRDT layer so todos sync across all hivemind instances.
 * Falls back to filesystem when CRDT is not active.
 *
 * Permission tiers (enforced by this service):
 *   (1) user lists (ownerType='user') — user read/write, all Avas read-only
 *   (2) ava-instance lists (ownerType='ava-instance') — writable by the owning
 *       instance's Ava + user; readable by all Avas on all instances
 *   (3) shared lists (ownerType='shared') — full read/write by anyone
 *
 * Emits events via EventEmitter:
 *  - todo:list-created
 *  - todo:item-added
 *  - todo:item-updated
 *  - todo:item-completed
 */

import { EventEmitter } from 'events';
import { createLogger, atomicWriteJson, readJsonFile } from '@protolabsai/utils';
import { getTodoWorkspacePath, ensureTodoDir } from '@protolabsai/platform';
import type { TodoItem, TodoList, TodoWorkspace } from '@protolabsai/types';
import type { CRDTStore, TodosDocument } from '@protolabsai/crdt';
import { randomUUID } from 'crypto';

const logger = createLogger('TodoService');

/** Document id used for the shared todos workspace in the CRDT store */
const TODOS_DOC_ID = 'workspace';

/**
 * Caller identity passed to write operations for permission enforcement.
 * When undefined, the operation is treated as a user-originated write.
 */
export interface TodoWriterIdentity {
  /** Whether the caller is an Ava instance (vs. the user) */
  isAva: boolean;
  /** instanceId of the calling Ava instance (required when isAva=true) */
  instanceId?: string;
}

/** Subset of TodoItem fields allowed when adding a new item */
export type NewTodoItem = Pick<TodoItem, 'title'> &
  Partial<
    Pick<TodoItem, 'description' | 'dueDate' | 'priority' | 'linkedFeatureId' | 'linkedProjectSlug'>
  >;

/** Subset of TodoItem fields allowed when updating an existing item */
export type UpdateTodoItem = Partial<
  Pick<
    TodoItem,
    | 'title'
    | 'description'
    | 'completed'
    | 'completedAt'
    | 'dueDate'
    | 'priority'
    | 'linkedFeatureId'
    | 'linkedProjectSlug'
  >
>;

export class TodoService extends EventEmitter {
  private crdtStore: CRDTStore | null = null;

  /**
   * Register a CRDTStore instance for syncing todos across instances.
   * When set, all read/write operations go through the CRDT layer.
   * Falls back to filesystem when not set.
   */
  setCrdtStore(store: CRDTStore): void {
    this.crdtStore = store;
    logger.info('[TodoService] CRDT store registered — todos will sync across instances');
  }

  // ---------------------------------------------------------------------------
  // Permission enforcement
  // ---------------------------------------------------------------------------

  /**
   * Check whether the given writer identity is allowed to mutate a list.
   *
   * Rules:
   *  - shared lists: anyone can write
   *  - user lists: only user (isAva=false) can write; Avas are read-only
   *  - ava-instance lists: owning instance's Ava + user can write; other Ava
   *    instances cannot write
   *
   * Throws an Error if the write is not permitted.
   */
  private assertWritePermission(list: TodoList, writer: TodoWriterIdentity | undefined): void {
    if (list.ownerType === 'shared') {
      // Everyone can write to shared lists
      return;
    }

    if (list.ownerType === 'user') {
      // Only the user (not Ava) can write to user-private lists
      if (writer?.isAva) {
        throw new Error(
          `Permission denied: Ava instances cannot write to user-private list "${list.name}" (${list.id})`
        );
      }
      return;
    }

    if (list.ownerType === 'ava-instance') {
      if (!writer?.isAva) {
        // User can always write to any ava-instance list
        return;
      }
      // Ava can only write to its own list
      if (writer.instanceId !== list.ownerInstanceId) {
        throw new Error(
          `Permission denied: Ava instance "${writer.instanceId}" cannot write to list owned by instance "${list.ownerInstanceId}" (list "${list.name}", id=${list.id})`
        );
      }
      return;
    }
  }

  // ---------------------------------------------------------------------------
  // Workspace I/O
  // ---------------------------------------------------------------------------

  /** Load the workspace — from CRDT if available, otherwise from disk. */
  private async loadWorkspace(projectPath: string): Promise<TodoWorkspace> {
    if (this.crdtStore) {
      try {
        const handle = await this.crdtStore.getOrCreate<TodosDocument>('todos', TODOS_DOC_ID, {
          lists: {},
          listOrder: [],
          updatedAt: new Date().toISOString(),
        });
        const doc = handle.docSync();
        if (doc) {
          return {
            version: 1,
            lists: doc.lists ?? {},
            listOrder: doc.listOrder ?? [],
          };
        }
      } catch (err) {
        logger.warn('[TodoService] CRDT read failed, falling back to filesystem:', err);
      }
    }

    const filePath = getTodoWorkspacePath(projectPath);
    const existing = await readJsonFile<TodoWorkspace | null>(filePath, null);

    if (existing) {
      return existing;
    }

    // First-access: create a default workspace with one shared "Todo" list
    const workspace = this.createDefaultWorkspace();
    // Persist immediately so subsequent reads return the same workspace
    await this.saveWorkspace(projectPath, workspace);
    return workspace;
  }

  /** Persist the workspace — to CRDT if available, otherwise to disk. */
  private async saveWorkspace(projectPath: string, workspace: TodoWorkspace): Promise<void> {
    if (this.crdtStore) {
      try {
        await this.crdtStore.change<TodosDocument>('todos', TODOS_DOC_ID, (doc) => {
          doc.lists = workspace.lists as TodosDocument['lists'];
          doc.listOrder = workspace.listOrder;
          doc.updatedAt = new Date().toISOString();
        });
        return;
      } catch (err) {
        logger.warn('[TodoService] CRDT write failed, falling back to filesystem:', err);
      }
    }

    await ensureTodoDir(projectPath);
    const filePath = getTodoWorkspacePath(projectPath);
    await atomicWriteJson(filePath, workspace, { indent: 2, createDirs: true });
  }

  /** Build the initial workspace with one shared "Todo" list. */
  private createDefaultWorkspace(): TodoWorkspace {
    const now = new Date().toISOString();
    const listId = randomUUID();
    const defaultList: TodoList = {
      id: listId,
      name: 'Todo',
      ownerType: 'shared',
      items: [],
      createdAt: now,
      updatedAt: now,
    };

    return {
      version: 1,
      lists: { [listId]: defaultList },
      listOrder: [listId],
    };
  }

  /**
   * Ensure an ava-instance list exists for the given instance, creating it
   * if it doesn't exist yet. Called automatically on first activation of each
   * Ava instance.
   *
   * The list is named after the instanceId and is only writable by that
   * instance's Ava (or the user).
   */
  async ensureAvaInstanceList(projectPath: string, instanceId: string): Promise<TodoList> {
    const workspace = await this.loadWorkspace(projectPath);

    // Check if a list for this instance already exists
    const existing = Object.values(workspace.lists).find(
      (list) => list.ownerType === 'ava-instance' && list.ownerInstanceId === instanceId
    );
    if (existing) {
      return existing;
    }

    // Create the ava-instance list
    const list = await this.createList(
      projectPath,
      `Ava (${instanceId})`,
      'ava-instance',
      instanceId
    );
    logger.info(`[TodoService] Auto-created ava-instance list for ${instanceId}`);
    return list;
  }

  // ---------------------------------------------------------------------------
  // List operations
  // ---------------------------------------------------------------------------

  /** Create a new todo list in the workspace. */
  async createList(
    projectPath: string,
    name: string,
    ownerType: TodoList['ownerType'] = 'shared',
    ownerInstanceId?: string
  ): Promise<TodoList> {
    const workspace = await this.loadWorkspace(projectPath);
    const now = new Date().toISOString();
    const listId = randomUUID();

    const list: TodoList = {
      id: listId,
      name,
      ownerType,
      ...(ownerInstanceId ? { ownerInstanceId } : {}),
      items: [],
      createdAt: now,
      updatedAt: now,
    };

    workspace.lists[listId] = list;
    workspace.listOrder.push(listId);

    await this.saveWorkspace(projectPath, workspace);

    logger.info(`Created todo list "${name}" (${listId})`);
    this.emit('todo:list-created', { projectPath, list });

    return list;
  }

  /** Delete a todo list from the workspace. */
  async deleteList(projectPath: string, listId: string): Promise<void> {
    const workspace = await this.loadWorkspace(projectPath);

    if (!workspace.lists[listId]) {
      throw new Error(`Todo list not found: ${listId}`);
    }

    delete workspace.lists[listId];
    workspace.listOrder = workspace.listOrder.filter((id) => id !== listId);

    await this.saveWorkspace(projectPath, workspace);
    logger.info(`Deleted todo list ${listId}`);
  }

  /** Get a single todo list by ID. */
  async getList(projectPath: string, listId: string): Promise<TodoList | null> {
    const workspace = await this.loadWorkspace(projectPath);
    return workspace.lists[listId] ?? null;
  }

  /** Get all todo lists in order. */
  async getAllLists(projectPath: string): Promise<TodoList[]> {
    const workspace = await this.loadWorkspace(projectPath);
    return workspace.listOrder
      .map((id) => workspace.lists[id])
      .filter((list): list is TodoList => Boolean(list));
  }

  // ---------------------------------------------------------------------------
  // Item operations
  // ---------------------------------------------------------------------------

  /** Add a new item to a list. */
  async addItem(
    projectPath: string,
    listId: string,
    item: NewTodoItem,
    writer?: TodoWriterIdentity
  ): Promise<TodoItem> {
    const workspace = await this.loadWorkspace(projectPath);
    const list = workspace.lists[listId];

    if (!list) {
      throw new Error(`Todo list not found: ${listId}`);
    }

    this.assertWritePermission(list, writer);

    const now = new Date().toISOString();
    const newItem: TodoItem = {
      id: randomUUID(),
      title: item.title,
      ...(item.description !== undefined ? { description: item.description } : {}),
      completed: false,
      ...(item.dueDate !== undefined ? { dueDate: item.dueDate } : {}),
      priority: item.priority ?? 0,
      ...(item.linkedFeatureId !== undefined ? { linkedFeatureId: item.linkedFeatureId } : {}),
      ...(item.linkedProjectSlug !== undefined
        ? { linkedProjectSlug: item.linkedProjectSlug }
        : {}),
      createdAt: now,
      updatedAt: now,
    };

    list.items.push(newItem);
    list.updatedAt = now;

    await this.saveWorkspace(projectPath, workspace);

    logger.info(`Added todo item "${item.title}" to list ${listId}`);
    this.emit('todo:item-added', { projectPath, listId, item: newItem });

    return newItem;
  }

  /** Update fields on an existing item. */
  async updateItem(
    projectPath: string,
    listId: string,
    itemId: string,
    updates: UpdateTodoItem,
    writer?: TodoWriterIdentity
  ): Promise<TodoItem> {
    const workspace = await this.loadWorkspace(projectPath);
    const list = workspace.lists[listId];

    if (!list) {
      throw new Error(`Todo list not found: ${listId}`);
    }

    this.assertWritePermission(list, writer);

    const itemIndex = list.items.findIndex((i) => i.id === itemId);
    if (itemIndex === -1) {
      throw new Error(`Todo item not found: ${itemId}`);
    }

    const now = new Date().toISOString();
    const updated: TodoItem = {
      ...list.items[itemIndex],
      ...updates,
      updatedAt: now,
    };

    list.items[itemIndex] = updated;
    list.updatedAt = now;

    await this.saveWorkspace(projectPath, workspace);

    logger.info(`Updated todo item ${itemId} in list ${listId}`);
    this.emit('todo:item-updated', { projectPath, listId, item: updated });

    return updated;
  }

  /** Delete an item from a list. */
  async deleteItem(
    projectPath: string,
    listId: string,
    itemId: string,
    writer?: TodoWriterIdentity
  ): Promise<void> {
    const workspace = await this.loadWorkspace(projectPath);
    const list = workspace.lists[listId];

    if (!list) {
      throw new Error(`Todo list not found: ${listId}`);
    }

    this.assertWritePermission(list, writer);

    const before = list.items.length;
    list.items = list.items.filter((i) => i.id !== itemId);

    if (list.items.length === before) {
      throw new Error(`Todo item not found: ${itemId}`);
    }

    list.updatedAt = new Date().toISOString();

    await this.saveWorkspace(projectPath, workspace);
    logger.info(`Deleted todo item ${itemId} from list ${listId}`);
  }

  /** Mark an item as completed and set completedAt timestamp. */
  async completeItem(
    projectPath: string,
    listId: string,
    itemId: string,
    writer?: TodoWriterIdentity
  ): Promise<TodoItem> {
    const now = new Date().toISOString();
    const updated = await this.updateItem(
      projectPath,
      listId,
      itemId,
      {
        completed: true,
        completedAt: now,
      },
      writer
    );

    logger.info(`Completed todo item ${itemId} in list ${listId}`);
    this.emit('todo:item-completed', { projectPath, listId, item: updated });

    return updated;
  }

  /**
   * Reorder items in a list.
   * @param itemIds - Full ordered list of item IDs (must contain all existing item IDs)
   */
  async reorderItems(
    projectPath: string,
    listId: string,
    itemIds: string[],
    writer?: TodoWriterIdentity
  ): Promise<TodoList> {
    const workspace = await this.loadWorkspace(projectPath);
    const list = workspace.lists[listId];

    if (!list) {
      throw new Error(`Todo list not found: ${listId}`);
    }

    this.assertWritePermission(list, writer);

    // Build a map for O(1) lookup
    const itemMap = new Map(list.items.map((item) => [item.id, item]));

    // Reorder — preserve all items even if some IDs are missing from itemIds
    const reordered: TodoItem[] = [];
    for (const id of itemIds) {
      const item = itemMap.get(id);
      if (item) {
        reordered.push(item);
        itemMap.delete(id);
      }
    }
    // Append any items not referenced in itemIds (safety net)
    for (const item of itemMap.values()) {
      reordered.push(item);
    }

    list.items = reordered;
    list.updatedAt = new Date().toISOString();

    await this.saveWorkspace(projectPath, workspace);
    logger.info(`Reordered items in todo list ${listId}`);

    return list;
  }
}
