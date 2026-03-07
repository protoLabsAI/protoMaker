/**
 * Todo Paths - Utilities for managing todo data storage
 *
 * Provides functions to construct paths for:
 * - Project-level todo data stored in {projectPath}/.automaker/todos/
 *
 * All returned paths are absolute and ready to use with fs module.
 * Directory creation is handled separately by ensureTodoDir().
 */

import * as secureFs from './secure-fs.js';
import path from 'path';

/**
 * Get the todos directory for a project
 *
 * Stores workspace.json with all todo lists and items.
 *
 * @param projectPath - Absolute path to project directory
 * @returns Absolute path to {projectPath}/.automaker/todos
 */
export function getTodosDir(projectPath: string): string {
  return path.join(projectPath, '.automaker', 'todos');
}

/**
 * Get the todos workspace file path for a project
 *
 * @param projectPath - Absolute path to project directory
 * @returns Absolute path to {projectPath}/.automaker/todos/workspace.json
 */
export function getTodoWorkspacePath(projectPath: string): string {
  return path.join(getTodosDir(projectPath), 'workspace.json');
}

/**
 * Ensure the todos directory exists for a project
 *
 * @param projectPath - Absolute path to project directory
 * @returns Promise resolving to the created todos directory path
 */
export async function ensureTodoDir(projectPath: string): Promise<string> {
  const todosDir = getTodosDir(projectPath);
  await secureFs.mkdir(todosDir, { recursive: true });
  return todosDir;
}
