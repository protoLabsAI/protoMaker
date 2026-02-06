/**
 * GOAP Action Registry
 *
 * Decouples action declarations (pure data for the planner) from
 * action handlers (impure functions that interact with services).
 *
 * The planner operates on GOAPActionDefinition[] (pure data).
 * The loop service executes actions via handler functions from this registry.
 */

import type { GOAPActionDefinition } from '@automaker/types';
import { createLogger } from '@automaker/utils';

const logger = createLogger('GOAPActionRegistry');

/**
 * Handler function that executes a GOAP action.
 * Receives projectPath and optional branchName for scoping.
 */
export type GOAPActionHandler = (projectPath: string, branchName: string | null) => Promise<void>;

export class GOAPActionRegistry {
  private definitions = new Map<string, GOAPActionDefinition>();
  private handlers = new Map<string, GOAPActionHandler>();

  /**
   * Register an action definition with its handler.
   */
  register(definition: GOAPActionDefinition, handler: GOAPActionHandler): void {
    if (this.definitions.has(definition.id)) {
      logger.warn(`Overwriting existing action registration: ${definition.id}`);
    }
    this.definitions.set(definition.id, definition);
    this.handlers.set(definition.id, handler);
    logger.debug(`Registered GOAP action: ${definition.id} [${definition.category}]`);
  }

  /**
   * Get the action definition by ID (pure data for planner).
   */
  getDefinition(id: string): GOAPActionDefinition | undefined {
    return this.definitions.get(id);
  }

  /**
   * Get the handler function by action ID.
   */
  getHandler(id: string): GOAPActionHandler | undefined {
    return this.handlers.get(id);
  }

  /**
   * Get all registered action definitions (for planner input).
   */
  getAllDefinitions(): GOAPActionDefinition[] {
    return Array.from(this.definitions.values());
  }
}
