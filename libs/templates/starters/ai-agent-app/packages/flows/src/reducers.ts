/**
 * File operation types for state management
 */
export interface FileOperation {
  path: string;
  content: string;
  operation: 'create' | 'update' | 'delete';
  timestamp?: number;
}

/**
 * Todo item for task tracking
 */
export interface TodoItem {
  id: string;
  title: string;
  completed: boolean;
  priority?: 'low' | 'medium' | 'high';
  createdAt?: number;
  completedAt?: number;
}

/**
 * Reducer for file operations - merges file arrays by path
 * Latest operation for each path wins
 */
export function fileReducer(
  left: FileOperation[] | undefined,
  right: FileOperation[] | undefined
): FileOperation[] {
  if (!left && !right) return [];
  if (!left) return right || [];
  if (!right) return left;

  const fileMap = new Map<string, FileOperation>();

  // Add all files from left
  for (const file of left) {
    fileMap.set(file.path, file);
  }

  // Override with files from right (right takes precedence)
  for (const file of right) {
    const existing = fileMap.get(file.path);

    // If there's an existing file and both have timestamps, keep the newer one
    if (existing?.timestamp && file.timestamp) {
      if (file.timestamp > existing.timestamp) {
        fileMap.set(file.path, file);
      }
    } else {
      // No timestamps, right takes precedence
      fileMap.set(file.path, file);
    }
  }

  return Array.from(fileMap.values());
}

/**
 * Reducer for todo items - merges todo arrays by id
 * Latest update for each id wins
 */
export function todoReducer(
  left: TodoItem[] | undefined,
  right: TodoItem[] | undefined
): TodoItem[] {
  if (!left && !right) return [];
  if (!left) return right || [];
  if (!right) return left;

  const todoMap = new Map<string, TodoItem>();

  // Add all todos from left
  for (const todo of left) {
    todoMap.set(todo.id, todo);
  }

  // Merge/override with todos from right
  for (const todo of right) {
    const existing = todoMap.get(todo.id);

    if (existing) {
      // Merge the todo, with right taking precedence
      todoMap.set(todo.id, {
        ...existing,
        ...todo,
        // Preserve createdAt from existing if not in right
        createdAt: todo.createdAt ?? existing.createdAt,
      });
    } else {
      todoMap.set(todo.id, todo);
    }
  }

  return Array.from(todoMap.values());
}

/**
 * Generic array append reducer - concatenates arrays
 */
export function appendReducer<T>(left: T[] | undefined, right: T[] | undefined): T[] {
  if (!left && !right) return [];
  if (!left) return right || [];
  if (!right) return left;
  return [...left, ...right];
}

/**
 * Generic array replace reducer - right replaces left
 */
export function replaceReducer<T>(left: T[] | undefined, right: T[] | undefined): T[] {
  return right || left || [];
}

/**
 * Set union reducer - merges two sets
 */
export function setUnionReducer<T>(left: Set<T> | undefined, right: Set<T> | undefined): Set<T> {
  if (!left && !right) return new Set<T>();
  if (!left) return right || new Set<T>();
  if (!right) return left;
  return new Set([...left, ...right]);
}

/**
 * Map merge reducer - merges two maps with right taking precedence
 */
export function mapMergeReducer<K, V>(
  left: Map<K, V> | undefined,
  right: Map<K, V> | undefined
): Map<K, V> {
  if (!left && !right) return new Map<K, V>();
  if (!left) return right || new Map<K, V>();
  if (!right) return left;

  const result = new Map(left);
  for (const [key, value] of Array.from(right.entries())) {
    result.set(key, value);
  }
  return result;
}

/**
 * Counter reducer - adds numeric values
 */
export function counterReducer(left: number | undefined, right: number | undefined): number {
  return (left ?? 0) + (right ?? 0);
}

/**
 * Max reducer - returns the maximum value
 */
export function maxReducer(left: number | undefined, right: number | undefined): number {
  if (left === undefined && right === undefined) return 0;
  if (left === undefined) return right!;
  if (right === undefined) return left;
  return Math.max(left, right);
}

/**
 * Min reducer - returns the minimum value
 */
export function minReducer(left: number | undefined, right: number | undefined): number {
  if (left === undefined && right === undefined) return 0;
  if (left === undefined) return right!;
  if (right === undefined) return left;
  return Math.min(left, right);
}

/**
 * ID-based deduplicating append reducer
 * Generic over T extends { id: string }
 * Merges left + right arrays, deduplicating by id field
 * Later entries (from right) win on conflict (update semantics)
 * Preserves insertion order
 */
export function idDedupAppendReducer<T extends { id: string }>(
  left: T[] | undefined,
  right: T[] | undefined
): T[] {
  if (!left && !right) return [];
  if (!left) return right || [];
  if (!right) return left;

  const idMap = new Map<string, T>();

  // Add all items from left, maintaining order
  for (const item of left) {
    idMap.set(item.id, item);
  }

  // Merge items from right, with right taking precedence
  for (const item of right) {
    idMap.set(item.id, item);
  }

  // Return in order: first left items (preserving order), then new right items
  const result: T[] = [];
  const seenIds = new Set<string>();

  // Add left items in original order
  for (const item of left) {
    result.push(idMap.get(item.id)!);
    seenIds.add(item.id);
  }

  // Add new items from right (those not in left)
  for (const item of right) {
    if (!seenIds.has(item.id)) {
      result.push(idMap.get(item.id)!);
    }
  }

  return result;
}

/**
 * LRU-evicting reducer factory
 * Creates a reducer that appends new items and evicts oldest when exceeding maxSize
 * Works with any array type (no ID requirement)
 * Useful for bounded event logs, recent findings, etc.
 */
export function createLruReducer<T>(maxSize: number) {
  return function lruReducer(left: T[] | undefined, right: T[] | undefined): T[] {
    if (!left && !right) return [];
    if (!left) {
      // Only right exists, trim to maxSize if needed
      return right ? right.slice(-maxSize) : [];
    }
    if (!right) return left;

    // Combine left and right
    const combined = [...left, ...right];

    // Keep only the last maxSize items
    return combined.slice(-maxSize);
  };
}
