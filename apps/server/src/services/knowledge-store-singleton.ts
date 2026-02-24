/**
 * Knowledge Store Singleton
 *
 * Provides a singleton instance of KnowledgeStoreService for use across the application.
 * This allows context-loader and other utilities to access the knowledge store without
 * requiring dependency injection.
 */

import { KnowledgeStoreService } from './knowledge-store-service.js';

let instance: KnowledgeStoreService | null = null;

/**
 * Get the singleton instance of KnowledgeStoreService
 *
 * @returns KnowledgeStoreService instance or null if not initialized
 */
export function getKnowledgeStore(): KnowledgeStoreService | null {
  return instance;
}

/**
 * Set the singleton instance of KnowledgeStoreService
 *
 * @param store - KnowledgeStoreService instance to set as singleton
 */
export function setKnowledgeStore(store: KnowledgeStoreService | null): void {
  instance = store;
}

/**
 * Initialize the knowledge store singleton for a project
 *
 * @param projectPath - Absolute path to the project directory
 * @returns The initialized KnowledgeStoreService instance
 */
export function initializeKnowledgeStore(projectPath: string): KnowledgeStoreService {
  if (!instance) {
    instance = new KnowledgeStoreService();
  }
  instance.initialize(projectPath);
  return instance;
}

/**
 * Close the knowledge store singleton and clear the instance
 */
export function closeKnowledgeStore(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}
