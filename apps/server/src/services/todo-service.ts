/**
 * TodoService - Manages per-project todo lists and items
 *
 * Storage: single JSON file at {projectPath}/.automaker/todos/workspace.json
 * Follows the same pattern as the Notes workspace service.
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
import { randomUUID } from 'crypto';

const logger = createLogger('TodoService');

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
  // ---------------------------------------------------------------------------
  // Workspace I/O
  // ---------------------------------------------------------------------------

  /** Load the workspace from disk, creating and persisting a default one on first access. */
  private async loadWorkspace(projectPath: string): Promise<TodoWorkspace> {
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

  /** Persist the workspace to disk atomically. */
  private async saveWorkspace(projectPath: string, workspace: TodoWorkspace): Promise<void> {
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
  async addItem(projectPath: string, listId: string, item: NewTodoItem): Promise<TodoItem> {
    const workspace = await this.loadWorkspace(projectPath);
    const list = workspace.lists[listId];

    if (!list) {
      throw new Error(`Todo list not found: ${listId}`);
    }

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
    updates: UpdateTodoItem
  ): Promise<TodoItem> {
    const workspace = await this.loadWorkspace(projectPath);
    const list = workspace.lists[listId];

    if (!list) {
      throw new Error(`Todo list not found: ${listId}`);
    }

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
  async deleteItem(projectPath: string, listId: string, itemId: string): Promise<void> {
    const workspace = await this.loadWorkspace(projectPath);
    const list = workspace.lists[listId];

    if (!list) {
      throw new Error(`Todo list not found: ${listId}`);
    }

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
  async completeItem(projectPath: string, listId: string, itemId: string): Promise<TodoItem> {
    const now = new Date().toISOString();
    const updated = await this.updateItem(projectPath, listId, itemId, {
      completed: true,
      completedAt: now,
    });

    logger.info(`Completed todo item ${itemId} in list ${listId}`);
    this.emit('todo:item-completed', { projectPath, listId, item: updated });

    return updated;
  }

  /**
   * Reorder items in a list.
   * @param itemIds - Full ordered list of item IDs (must contain all existing item IDs)
   */
  async reorderItems(projectPath: string, listId: string, itemIds: string[]): Promise<TodoList> {
    const workspace = await this.loadWorkspace(projectPath);
    const list = workspace.lists[listId];

    if (!list) {
      throw new Error(`Todo list not found: ${listId}`);
    }

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
