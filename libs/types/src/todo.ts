/**
 * Todo types for AutoMaker
 *
 * Provides types for todo lists, items, and workspace storage.
 */

/**
 * A single todo item within a list
 */
export interface TodoItem {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  completedAt?: string; // ISO timestamp
  dueDate?: string; // ISO timestamp
  /** Priority 0-4, same scale as features (0=none, 1=low, 2=medium, 3=high, 4=urgent) */
  priority: 0 | 1 | 2 | 3 | 4;
  linkedFeatureId?: string;
  linkedProjectSlug?: string;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

/**
 * A named list of todo items with an owner
 */
export interface TodoList {
  id: string;
  name: string;
  ownerType: 'user' | 'ava-instance' | 'shared';
  ownerInstanceId?: string;
  items: TodoItem[];
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

/**
 * The top-level workspace that holds all todo lists for a project
 * Stored at {projectPath}/.automaker/todos/workspace.json
 */
export interface TodoWorkspace {
  version: 1;
  lists: Record<string, TodoList>;
  listOrder: string[];
}
