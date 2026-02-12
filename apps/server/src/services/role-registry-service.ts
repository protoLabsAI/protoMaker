/**
 * RoleRegistryService - In-memory registry for agent templates.
 *
 * Stores AgentTemplate instances keyed by name. Validates all templates
 * against AgentTemplateSchema on registration. Enforces tier restrictions:
 * tier 0 (protected/system) templates cannot be unregistered or overwritten.
 *
 * Singleton pattern — one registry per server instance.
 */

import { AgentTemplateSchema, type AgentTemplate, KNOWN_AGENT_ROLES } from '@automaker/types';
import { createLogger } from '@automaker/utils';
import type { EventEmitter } from '../lib/events.js';

const logger = createLogger('RoleRegistry');

export class RoleRegistryService {
  private templates = new Map<string, AgentTemplate>();
  private events?: EventEmitter;

  constructor(events?: EventEmitter) {
    this.events = events;
  }

  /**
   * Register an agent template. Validates against schema.
   * Rejects duplicates and refuses to overwrite tier 0 templates.
   */
  register(template: AgentTemplate): { success: boolean; error?: string } {
    // Validate against schema
    const result = AgentTemplateSchema.safeParse(template);
    if (!result.success) {
      const errors = result.error.issues.map((i) => i.message).join(', ');
      logger.warn(`Template validation failed for "${template.name}": ${errors}`);
      return { success: false, error: `Validation failed: ${errors}` };
    }

    // Check for existing template
    const existing = this.templates.get(template.name);
    if (existing) {
      if (existing.tier === 0) {
        return {
          success: false,
          error: `Cannot overwrite protected template "${template.name}" (tier 0)`,
        };
      }
      logger.info(`Overwriting template "${template.name}"`);
    }

    this.templates.set(template.name, result.data as AgentTemplate);
    logger.info(`Registered template "${template.name}" (role: ${template.role})`);

    this.events?.emit('authority:agent-registered', {
      name: template.name,
      role: template.role,
      tier: template.tier ?? 1,
    });

    return { success: true };
  }

  /**
   * Get a template by name.
   */
  get(name: string): AgentTemplate | undefined {
    return this.templates.get(name);
  }

  /**
   * Check if a template exists.
   */
  has(name: string): boolean {
    return this.templates.has(name);
  }

  /**
   * List all registered templates. Optionally filter by role.
   */
  list(role?: string): AgentTemplate[] {
    const all = Array.from(this.templates.values());
    if (role) {
      return all.filter((t) => t.role === role);
    }
    return all;
  }

  /**
   * Unregister a template by name.
   * Refuses to unregister tier 0 (protected) templates.
   */
  unregister(name: string): { success: boolean; error?: string } {
    const template = this.templates.get(name);
    if (!template) {
      return { success: false, error: `Template "${name}" not found` };
    }

    if (template.tier === 0) {
      return {
        success: false,
        error: `Cannot unregister protected template "${name}" (tier 0)`,
      };
    }

    this.templates.delete(name);
    logger.info(`Unregistered template "${name}"`);

    this.events?.emit('authority:trust-updated', {
      action: 'unregistered',
      name,
      role: template.role,
    });

    return { success: true };
  }

  /**
   * Get all known built-in role names.
   */
  getKnownRoles(): readonly string[] {
    return KNOWN_AGENT_ROLES;
  }

  /**
   * Get count of registered templates.
   */
  get size(): number {
    return this.templates.size;
  }
}
