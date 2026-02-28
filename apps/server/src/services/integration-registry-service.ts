/**
 * IntegrationRegistryService - In-memory registry for external integrations.
 *
 * Stores IntegrationDescriptor instances keyed by id. Validates all descriptors
 * against IntegrationDescriptorSchema on registration. Enforces tier restrictions:
 * tier 0 (built-in) integrations cannot be unregistered or overwritten.
 *
 * Health check functions are registered separately since async functions
 * are not serializable in descriptors.
 *
 * Pattern mirrors RoleRegistryService exactly.
 */

import {
  IntegrationDescriptorSchema,
  type IntegrationDescriptor,
  type IntegrationHealth,
  type IntegrationSummary,
  type DiscordChannelSignalConfig,
} from '@protolabs-ai/types';
import { createLogger } from '@protolabs-ai/utils';
import type { EventEmitter } from '../lib/events.js';

const logger = createLogger('IntegrationRegistry');

export type HealthCheckFn = () => Promise<IntegrationHealth>;

export class IntegrationRegistryService {
  private integrations = new Map<string, IntegrationDescriptor>();
  private healthCheckers = new Map<string, HealthCheckFn>();
  private events?: EventEmitter;

  /** Per-project Discord channel signal configs, keyed by project path */
  private channelConfigs = new Map<string, DiscordChannelSignalConfig[]>();

  constructor(events?: EventEmitter) {
    this.events = events;
  }

  /**
   * Register an integration descriptor. Validates against schema.
   * Rejects duplicates and refuses to overwrite tier 0 integrations.
   */
  register(descriptor: IntegrationDescriptor): { success: boolean; error?: string } {
    const result = IntegrationDescriptorSchema.safeParse(descriptor);
    if (!result.success) {
      const errors = result.error.issues.map((i) => i.message).join(', ');
      logger.warn(`Descriptor validation failed for "${descriptor.id}": ${errors}`);
      return { success: false, error: `Validation failed: ${errors}` };
    }

    const existing = this.integrations.get(descriptor.id);
    if (existing) {
      if (existing.tier === 0) {
        return {
          success: false,
          error: `Cannot overwrite protected integration "${descriptor.id}" (tier 0)`,
        };
      }
      logger.info(`Overwriting integration "${descriptor.id}"`);
    }

    this.integrations.set(descriptor.id, result.data as IntegrationDescriptor);
    logger.info(`Registered integration "${descriptor.id}" (${descriptor.category})`);

    this.events?.emit('integration:registered', {
      id: descriptor.id,
      category: descriptor.category,
      tier: descriptor.tier ?? 1,
    });

    return { success: true };
  }

  /**
   * Get a descriptor by id.
   */
  get(id: string): IntegrationDescriptor | undefined {
    return this.integrations.get(id);
  }

  /**
   * List all integrations. Optionally filter by category.
   */
  list(category?: string): IntegrationDescriptor[] {
    const all = Array.from(this.integrations.values());
    if (category) {
      return all.filter((d) => d.category === category);
    }
    return all;
  }

  /**
   * Unregister an integration by id.
   * Refuses to unregister tier 0 (built-in) integrations.
   */
  unregister(id: string): { success: boolean; error?: string } {
    const descriptor = this.integrations.get(id);
    if (!descriptor) {
      return { success: false, error: `Integration "${id}" not found` };
    }

    if (descriptor.tier === 0) {
      return {
        success: false,
        error: `Cannot unregister protected integration "${id}" (tier 0)`,
      };
    }

    this.integrations.delete(id);
    this.healthCheckers.delete(id);
    logger.info(`Unregistered integration "${id}"`);

    this.events?.emit('integration:unregistered', {
      id,
      category: descriptor.category,
    });

    return { success: true };
  }

  /**
   * Register a health check function for an integration.
   * Kept separate from the descriptor since async functions are not serializable.
   */
  registerHealthCheck(id: string, fn: HealthCheckFn): void {
    if (!this.integrations.has(id)) {
      logger.warn(`Cannot register health check: integration "${id}" not found`);
      return;
    }
    this.healthCheckers.set(id, fn);
    logger.debug(`Registered health check for "${id}"`);
  }

  /**
   * Run health check for a single integration.
   */
  async checkHealth(id: string): Promise<IntegrationHealth> {
    const descriptor = this.integrations.get(id);
    if (!descriptor) {
      return {
        integrationId: id,
        status: 'disconnected',
        message: 'Integration not found',
        checkedAt: new Date().toISOString(),
      };
    }

    if (!descriptor.enabled) {
      return {
        integrationId: id,
        status: 'disabled',
        message: 'Integration is disabled',
        checkedAt: new Date().toISOString(),
      };
    }

    const checker = this.healthCheckers.get(id);
    if (!checker) {
      return {
        integrationId: id,
        status: 'unconfigured',
        message: 'No health check registered',
        checkedAt: new Date().toISOString(),
      };
    }

    try {
      return await checker();
    } catch (error) {
      return {
        integrationId: id,
        status: 'disconnected',
        message: error instanceof Error ? error.message : 'Health check failed',
        checkedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Run health checks for all integrations (or all in a category).
   */
  async checkAllHealth(category?: string): Promise<IntegrationHealth[]> {
    const descriptors = this.list(category);
    return Promise.all(descriptors.map((d) => this.checkHealth(d.id)));
  }

  /**
   * Toggle an integration's enabled state.
   */
  setEnabled(id: string, enabled: boolean): { success: boolean; error?: string } {
    const descriptor = this.integrations.get(id);
    if (!descriptor) {
      return { success: false, error: `Integration "${id}" not found` };
    }

    descriptor.enabled = enabled;
    logger.info(`Integration "${id}" ${enabled ? 'enabled' : 'disabled'}`);

    this.events?.emit('integration:toggled', { id, enabled });

    return { success: true };
  }

  /**
   * Build summary list (subset of descriptor + latest health) for API responses.
   */
  async listSummaries(category?: string): Promise<IntegrationSummary[]> {
    const descriptors = this.list(category);
    const healthResults = await this.checkAllHealth(category);
    const healthMap = new Map(healthResults.map((h) => [h.integrationId, h]));

    return descriptors.map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      category: d.category,
      scope: d.scope,
      iconName: d.iconName,
      brandColor: d.brandColor,
      enabled: d.enabled,
      hasHealthCheck: d.hasHealthCheck,
      health: healthMap.get(d.id),
    }));
  }

  /**
   * Check if an integration exists.
   */
  has(id: string): boolean {
    return this.integrations.has(id);
  }

  /**
   * Get count of registered integrations.
   */
  get size(): number {
    return this.integrations.size;
  }

  // ============================================================================
  // Discord Channel Signal Config — per-project channel monitoring registry
  // ============================================================================

  /**
   * Store channel signal configs for a project.
   * Replaces any previously stored configs for that project.
   */
  setChannelConfigs(projectPath: string, configs: DiscordChannelSignalConfig[]): void {
    this.channelConfigs.set(projectPath, configs);
    logger.info(`Stored ${configs.length} Discord channel config(s) for project "${projectPath}"`);
  }

  /**
   * Get channel signal configs for a specific project.
   */
  getChannelConfigs(projectPath: string): DiscordChannelSignalConfig[] {
    return this.channelConfigs.get(projectPath) ?? [];
  }

  /**
   * Get all channel configs across all projects as a flat array of enabled configs.
   * Used by the Discord monitor to determine which channels to poll.
   */
  getAllEnabledChannelConfigs(): DiscordChannelSignalConfig[] {
    const all: DiscordChannelSignalConfig[] = [];
    for (const configs of this.channelConfigs.values()) {
      all.push(...configs.filter((c) => c.enabled));
    }
    return all;
  }
}
